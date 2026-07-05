import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { computeManifestHash, buildManifestObject } from "./manifest.js";
import { verifyOperatorSignature, normalizePublicKey } from "./operator.js";
import { invokeDeployment, type InvokeRequest } from "../../services/wvc-relay.js";

// Deployment status constants (PRD §11)
const STATUS = {
  PENDING_MANIFEST: "pending_manifest",
  APPROVED: "approved",
  PROVISIONING: "provisioning",
  INACTIVE: "inactive",
  LIVE: "live",
  MARKED_FOR_DELETION: "marked_for_deletion",
  DELETED: "deleted",
} as const;

export async function wvcRoutes(app: FastifyInstance) {
  // ─── Apps ───────────────────────────────────────────────────────────────

  // POST /wvc/apps — create a WVC app (PRD §9.2)
  app.post("/wvc/apps", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, description, requiredApprovals } = request.body as {
        name: string; description?: string; requiredApprovals?: number;
      };
      if (!name) throw new ValidationError("App name is required");

      const app = await prisma.wvcApp.create({
        data: {
          orgId: request.orgId,
          name,
          description: description || "",
          requiredApprovals: requiredApprovals ?? 2,
        },
      });

      await createAuditLog(request.orgId, "WVC_APP_CREATE", { appId: app.id, name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wvc.manifest.approval_needed", { appId: app.id, name });

      return sendSuccess(reply, {
        id: app.id, name: app.name, description: app.description,
        quorumKeyId: app.quorumKeyId, liveDeploymentId: app.liveDeploymentId,
        requiredApprovals: app.requiredApprovals, createdAt: app.createdAt,
      }, 201);
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/apps — list apps (paginated)
  app.get("/wvc/apps", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as any);
      const [apps, total] = await Promise.all([
        prisma.wvcApp.findMany({
          where: { orgId: request.orgId },
          orderBy: { createdAt: "desc" },
          take: limit, skip: offset,
          include: { _count: { select: { deployments: true, operators: true } } },
        }),
        prisma.wvcApp.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data: apps, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/apps/:appId — full app detail (PRD §9.2)
  app.get("/wvc/apps/:appId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId } = request.params as { appId: string };
      const app = await prisma.wvcApp.findFirst({
        where: { id: appId, orgId: request.orgId },
        include: {
          liveDeployment: true,
          quorumKey: true,
          deployments: { orderBy: { createdAt: "desc" }, take: 10 },
          operators: { where: { status: "active" } },
          keyCeremonies: { orderBy: { startedAt: "desc" }, take: 5 },
        },
      });
      if (!app) throw new NotFoundError("WVC app");
      return sendSuccess(reply, app);
    } catch (err) { return sendError(reply, err); }
  });

  // ─── Operators ──────────────────────────────────────────────────────────

  // POST /wvc/apps/:appId/operators — add an operator (PRD §13)
  app.post("/wvc/apps/:appId/operators", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId } = request.params as { appId: string };
      const { alias, publicKey } = request.body as { alias: string; publicKey: string };
      if (!alias || !publicKey) throw new ValidationError("alias and publicKey are required");

      const app = await prisma.wvcApp.findFirst({ where: { id: appId, orgId: request.orgId } });
      if (!app) throw new NotFoundError("WVC app");

      const normalizedKey = normalizePublicKey(publicKey);
      const operator = await prisma.wvcOperator.create({
        data: { orgId: request.orgId, appId, alias, publicKey: normalizedKey },
      });

      await createAuditLog(request.orgId, "WVC_OPERATOR_ADD", { appId, operatorId: operator.id, alias }, request.userId, request);
      return sendSuccess(reply, {
        id: operator.id, alias: operator.alias, publicKey: operator.publicKey,
        status: operator.status, createdAt: operator.createdAt,
      }, 201);
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/apps/:appId/operators — list operators
  app.get("/wvc/apps/:appId/operators", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId } = request.params as { appId: string };
      const operators = await prisma.wvcOperator.findMany({
        where: { appId, orgId: request.orgId },
        orderBy: { createdAt: "desc" },
      });
      return sendSuccess(reply, { data: operators, total: operators.length });
    } catch (err) { return sendError(reply, err); }
  });

  // DELETE /wvc/apps/:appId/operators/:operatorId — revoke operator
  app.delete("/wvc/apps/:appId/operators/:operatorId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId, operatorId } = request.params as { appId: string; operatorId: string };
      const result = await prisma.wvcOperator.updateMany({
        where: { id: operatorId, appId, orgId: request.orgId },
        data: { status: "revoked" },
      });
      if (result.count === 0) throw new NotFoundError("Operator");
      await createAuditLog(request.orgId, "WVC_OPERATOR_REVOKE", { appId, operatorId }, request.userId, request);
      return sendSuccess(reply, { revoked: true });
    } catch (err) { return sendError(reply, err); }
  });

  // ─── Deployments + Manifests ────────────────────────────────────────────

  // POST /wvc/apps/:appId/deployments — create deployment + manifest in one tx (PRD §9.2, §12.3)
  app.post("/wvc/apps/:appId/deployments", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId } = request.params as { appId: string };
      const body = request.body as any;
      const app = await prisma.wvcApp.findFirst({ where: { id: appId, orgId: request.orgId }, include: { operators: { where: { status: "active" } } } });
      if (!app) throw new NotFoundError("WVC app");

      const approvers = app.operators.map((o) => o.id);
      if (approvers.length < app.requiredApprovals) {
        throw new ValidationError(`Cannot create deployment: ${approvers.length} active operator(s), need ${app.requiredApprovals} for approval`);
      }

      const manifestInput = {
        appId,
        imageUrl: body.imageUrl,
        executablePath: body.executablePath,
        executableArgs: body.executableArgs || [],
        executableDigest: body.executableDigest,
        expectedPcr0: body.expectedPcr0,
        expectedPcr1: body.expectedPcr1,
        expectedPcr2: body.expectedPcr2,
        ingressPort: body.ingressPort,
        healthPort: body.healthPort,
        cpuCount: body.cpuCount ?? 2,
        memoryMib: body.memoryMib ?? 1024,
        replicaCount: body.replicaCount ?? 3,
        requiredApprovals: app.requiredApprovals,
        approvers,
        allowedUpgradeFrom: body.allowedUpgradeFrom || [],
      };
      const manifestObj = buildManifestObject(manifestInput);
      const manifestHash = computeManifestHash(manifestObj);

      // Single transaction: create manifest first, then deployment pointing to it (PRD §12.3).
      const result = await prisma.$transaction(async (tx) => {
        const manifest = await tx.wvcManifest.create({
          data: {
            appId,
            manifestJson: manifestObj as any,
            manifestHash,
            requiredApprovals: app.requiredApprovals,
          },
        });
        const deployment = await tx.wvcDeployment.create({
          data: {
            appId,
            imageUrl: body.imageUrl,
            executablePath: body.executablePath,
            executableArgs: body.executableArgs || [],
            executableDigest: body.executableDigest,
            expectedPcr0: body.expectedPcr0,
            expectedPcr1: body.expectedPcr1,
            expectedPcr2: body.expectedPcr2,
            ingressPort: body.ingressPort,
            healthPort: body.healthPort,
            cpuCount: body.cpuCount ?? 2,
            memoryMib: body.memoryMib ?? 1024,
            replicaCount: body.replicaCount ?? 3,
            status: STATUS.PENDING_MANIFEST,
            manifestId: manifest.id,
            allowedUpgradeFrom: body.allowedUpgradeFrom || [],
          },
        });
        return { manifest, deployment };
      });

      await createAuditLog(request.orgId, "WVC_DEPLOYMENT_CREATE", { appId, deploymentId: result.deployment.id, manifestId: result.manifest.id, manifestHash }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wvc.manifest.approval_needed", { appId, deploymentId: result.deployment.id, manifestId: result.manifest.id, manifestHash });

      return sendSuccess(reply, {
        deploymentId: result.deployment.id,
        manifestId: result.manifest.id,
        manifestHash,
        status: STATUS.PENDING_MANIFEST,
      }, 201);
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/manifests/:manifestId — canonical manifest + approval progress (PRD §9.2)
  app.get("/wvc/manifests/:manifestId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { manifestId } = request.params as { manifestId: string };
      const manifest = await prisma.wvcManifest.findFirst({
        where: { id: manifestId, app: { orgId: request.orgId } },
        include: { approvals: { include: { operator: true } }, deployment: true },
      });
      if (!manifest) throw new NotFoundError("Manifest");
      return sendSuccess(reply, {
        id: manifest.id,
        manifestJson: manifest.manifestJson,
        manifestHash: manifest.manifestHash,
        requiredApprovals: manifest.requiredApprovals,
        approvalsCount: manifest.approvals.length,
        approvals: manifest.approvals.map((a) => ({ operatorId: a.operatorId, alias: a.operator.alias, approvedAt: a.approvedAt })),
        status: manifest.deployment?.status ?? STATUS.PENDING_MANIFEST,
        deploymentId: manifest.deployment?.id,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // POST /wvc/manifests/:manifestId/approve — operator approval (PRD §9.2, §13)
  app.post("/wvc/manifests/:manifestId/approve", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { manifestId } = request.params as { manifestId: string };
      const { operatorId, signature } = request.body as { operatorId: string; signature: string };
      if (!operatorId || !signature) throw new ValidationError("operatorId and signature are required");

      const manifest = await prisma.wvcManifest.findFirst({
        where: { id: manifestId, app: { orgId: request.orgId } },
        include: { deployment: true, app: true },
      });
      if (!manifest) throw new NotFoundError("Manifest");

      const operator = await prisma.wvcOperator.findFirst({
        where: { id: operatorId, appId: manifest.appId, orgId: request.orgId, status: "active" },
      });
      if (!operator) throw new NotFoundError("Operator");

      // Verify the signature locally — never trust a server-supplied hash (PRD §13.2).
      const valid = verifyOperatorSignature(operator.publicKey, manifest.manifestHash, signature);
      if (!valid) throw new ForbiddenError("Signature verification failed");

      // Record the approval (unique constraint prevents double-approval).
      try {
        await prisma.wvcManifestApproval.create({
          data: { manifestId, operatorId, signature },
        });
      } catch (e: any) {
        if (e?.code === "P2002") throw new ValidationError("Operator has already approved this manifest");
        throw e;
      }

      const approvalsCount = await prisma.wvcManifestApproval.count({ where: { manifestId } });
      const requiredApprovals = manifest.requiredApprovals;

      // Auto-transition to approved once threshold is met (PRD §13.2).
      if (approvalsCount >= requiredApprovals && manifest.deployment && manifest.deployment.status === STATUS.PENDING_MANIFEST) {
        await prisma.wvcDeployment.update({
          where: { id: manifest.deployment.id },
          data: { status: STATUS.APPROVED },
        });
        triggerWebhookEvents(request.orgId, "wvc.manifest.approved", { manifestId, deploymentId: manifest.deployment.id, approvalsCount });
      }

      await createAuditLog(request.orgId, "WVC_MANIFEST_APPROVE", { manifestId, operatorId, approvalsCount, requiredApprovals }, request.userId, request);

      return sendSuccess(reply, {
        approvalsCount, requiredApprovals,
        status: approvalsCount >= requiredApprovals ? STATUS.APPROVED : STATUS.PENDING_MANIFEST,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // POST /wvc/deployments/:deploymentId/provision — idempotent; trigger orchestrator (PRD §9.2)
  app.post("/wvc/deployments/:deploymentId/provision", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const deployment = await prisma.wvcDeployment.findFirst({
        where: { id: deploymentId, app: { orgId: request.orgId } },
      });
      if (!deployment) throw new NotFoundError("Deployment");

      if (deployment.status === STATUS.LIVE || deployment.status === STATUS.INACTIVE) {
        return sendSuccess(reply, { deploymentId, status: deployment.status, message: "Already provisioned" });
      }
      if (deployment.status !== STATUS.APPROVED) {
        throw new ForbiddenError(`Cannot provision: deployment status is ${deployment.status}, must be ${STATUS.APPROVED}`);
      }

      // Transition to provisioning. A real orchestrator would boot the Nitro parent
      // instance here; in this environment we mark it provisioning then inactive
      // (no replicas without AWS hardware). The Host Agent + Nitro CLI hook here.
      const updated = await prisma.wvcDeployment.update({
        where: { id: deploymentId },
        data: { status: STATUS.INACTIVE },
      });

      await createAuditLog(request.orgId, "WVC_DEPLOYMENT_PROVISION", { deploymentId, status: updated.status }, request.userId, request);
      return sendSuccess(reply, { deploymentId, status: updated.status, healthyReplicas: 0, totalReplicas: deployment.replicaCount });
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/deployments/:deploymentId — status + health (PRD §9.2)
  app.get("/wvc/deployments/:deploymentId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const deployment = await prisma.wvcDeployment.findFirst({
        where: { id: deploymentId, app: { orgId: request.orgId } },
        include: { manifest: true, bootProofs: { orderBy: { bootedAt: "desc" }, take: 5 } },
      });
      if (!deployment) throw new NotFoundError("Deployment");
      return sendSuccess(reply, {
        id: deployment.id, appId: deployment.appId, status: deployment.status,
        imageUrl: deployment.imageUrl, executableDigest: deployment.executableDigest,
        expectedPcrs: { pcr0: deployment.expectedPcr0, pcr1: deployment.expectedPcr1, pcr2: deployment.expectedPcr2 },
        ingressPort: deployment.ingressPort, healthPort: deployment.healthPort,
        cpuCount: deployment.cpuCount, memoryMib: deployment.memoryMib, replicaCount: deployment.replicaCount,
        healthyReplicas: deployment.status === STATUS.LIVE ? deployment.replicaCount : 0,
        totalReplicas: deployment.replicaCount,
        isLive: deployment.status === STATUS.LIVE,
        bootProofs: deployment.bootProofs.map((b) => ({ id: b.id, bootedAt: b.bootedAt })),
        createdAt: deployment.createdAt, updatedAt: deployment.updatedAt,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // POST /wvc/deployments/:deploymentId/set-live — explicit traffic cutover (PRD §9.2, §11)
  app.post("/wvc/deployments/:deploymentId/set-live", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const deployment = await prisma.wvcDeployment.findFirst({
        where: { id: deploymentId, app: { orgId: request.orgId } },
        include: { app: true },
      });
      if (!deployment) throw new NotFoundError("Deployment");
      if (deployment.status !== STATUS.INACTIVE && deployment.status !== STATUS.LIVE) {
        throw new ForbiddenError(`Cannot set live: deployment status is ${deployment.status}, must be ${STATUS.INACTIVE}`);
      }

      // Only one live deployment per app — demote any previous live deployment.
      await prisma.$transaction(async (tx) => {
        if (deployment.app.liveDeploymentId && deployment.app.liveDeploymentId !== deploymentId) {
          await tx.wvcDeployment.update({
            where: { id: deployment.app.liveDeploymentId },
            data: { status: STATUS.INACTIVE },
          });
        }
        await tx.wvcDeployment.update({ where: { id: deploymentId }, data: { status: STATUS.LIVE } });
        await tx.wvcApp.update({ where: { id: deployment.appId }, data: { liveDeploymentId: deploymentId } });
      });

      await createAuditLog(request.orgId, "WVC_DEPLOYMENT_SET_LIVE", { deploymentId, appId: deployment.appId }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wvc.deployment.live", { deploymentId, appId: deployment.appId });

      return sendSuccess(reply, { deploymentId, status: STATUS.LIVE, isLive: true });
    } catch (err) { return sendError(reply, err); }
  });

  // POST /wvc/deployments/:deploymentId/delete — soft-delete (PRD §9.2, §11)
  app.post("/wvc/deployments/:deploymentId/delete", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const deployment = await prisma.wvcDeployment.findFirst({
        where: { id: deploymentId, app: { orgId: request.orgId } },
      });
      if (!deployment) throw new NotFoundError("Deployment");
      if (deployment.status === STATUS.DELETED) throw new ValidationError("Deployment already deleted");

      const updated = await prisma.wvcDeployment.update({
        where: { id: deploymentId },
        data: { status: STATUS.MARKED_FOR_DELETION },
      });

      // If this was the live deployment, clear the app's live pointer.
      await prisma.wvcApp.updateMany({
        where: { liveDeploymentId: deploymentId, orgId: request.orgId },
        data: { liveDeploymentId: null },
      });

      await createAuditLog(request.orgId, "WVC_DEPLOYMENT_DELETE", { deploymentId, status: updated.status }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wvc.deployment.unhealthy", { deploymentId, status: updated.status });

      return sendSuccess(reply, { deploymentId, status: updated.status, restorable: true });
    } catch (err) { return sendError(reply, err); }
  });

  // POST /wvc/deployments/:deploymentId/restore — restore from marked_for_deletion (PRD §9.2, §11)
  app.post("/wvc/deployments/:deploymentId/restore", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const deployment = await prisma.wvcDeployment.findFirst({
        where: { id: deploymentId, app: { orgId: request.orgId } },
      });
      if (!deployment) throw new NotFoundError("Deployment");
      if (deployment.status !== STATUS.MARKED_FOR_DELETION) {
        throw new ForbiddenError(`Cannot restore: deployment status is ${deployment.status}, must be ${STATUS.MARKED_FOR_DELETION}`);
      }

      const updated = await prisma.wvcDeployment.update({
        where: { id: deploymentId },
        data: { status: STATUS.INACTIVE },
      });

      await createAuditLog(request.orgId, "WVC_DEPLOYMENT_RESTORE", { deploymentId, status: updated.status }, request.userId, request);
      return sendSuccess(reply, { deploymentId, status: updated.status });
    } catch (err) { return sendError(reply, err); }
  });

  // POST /wvc/deployments/:deploymentId/invoke — invoke the live enclave (PRD §9.2, §7)
  app.post("/wvc/deployments/:deploymentId/invoke", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const body = request.body as InvokeRequest;
      if (!body?.payloadType) throw new ValidationError("payloadType is required");

      const result = await invokeDeployment(deploymentId, request.orgId, body);

      await createAuditLog(request.orgId, "WVC_DEPLOYMENT_INVOKE", { deploymentId, payloadType: body.payloadType, proofId: result.appProof?.id }, request.userId, request);
      return sendSuccess(reply, result);
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/app-proofs/:proofId — fetch a stored proof for offline verification (PRD §9.2)
  app.get("/wvc/app-proofs/:proofId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { proofId } = request.params as { proofId: string };
      const proof = await prisma.wvcAppProof.findFirst({
        where: { id: proofId, deployment: { app: { orgId: request.orgId } } },
      });
      if (!proof) throw new NotFoundError("App proof");
      return sendSuccess(reply, {
        id: proof.id,
        deploymentId: proof.deploymentId,
        ephemeralPubkey: proof.ephemeralPubkey,
        payloadHash: proof.payloadHash,
        payloadType: proof.payloadType,
        signature: proof.signature,
        attestationDoc: Buffer.from(proof.attestationDoc).toString("base64"),
        proofFormatVersion: proof.proofFormatVersion,
        issuedAt: proof.issuedAt,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // ─── Quorum Key Ceremonies (PRD §9.2, §18.4) ────────────────────────────

  // POST /wvc/apps/:appId/quorum-key/ceremonies — initiate a ceremony
  app.post("/wvc/apps/:appId/quorum-key/ceremonies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId } = request.params as { appId: string };
      const { ceremonyType, participatingOperators } = request.body as {
        ceremonyType: "bootstrap" | "rotation" | "recovery"; participatingOperators: string[];
      };
      if (!ceremonyType || !participatingOperators?.length) throw new ValidationError("ceremonyType and participatingOperators are required");

      const app = await prisma.wvcApp.findFirst({ where: { id: appId, orgId: request.orgId } });
      if (!app) throw new NotFoundError("WVC app");

      const ceremony = await prisma.wvcKeyCeremony.create({
        data: {
          appId,
          ceremonyType,
          participatingOperators,
          status: "pending",
          initiatedBy: request.userId,
        },
      });

      await createAuditLog(request.orgId, "WVC_CEREMONY_START", { appId, ceremonyId: ceremony.id, ceremonyType }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wvc.key_ceremony.started", { appId, ceremonyId: ceremony.id, ceremonyType });

      return sendSuccess(reply, ceremony, 201);
    } catch (err) { return sendError(reply, err); }
  });

  // GET /wvc/apps/:appId/quorum-key/ceremonies/:ceremonyId — ceremony status
  app.get("/wvc/apps/:appId/quorum-key/ceremonies/:ceremonyId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { appId, ceremonyId } = request.params as { appId: string; ceremonyId: string };
      const ceremony = await prisma.wvcKeyCeremony.findFirst({
        where: { id: ceremonyId, appId, app: { orgId: request.orgId } },
        include: { newQuorumKey: true, initiator: true },
      });
      if (!ceremony) throw new NotFoundError("Ceremony");
      return sendSuccess(reply, ceremony);
    } catch (err) { return sendError(reply, err); }
  });
}
