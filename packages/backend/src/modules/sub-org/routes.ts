import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware, adminMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import { signToken } from "../../utils/jwt.js";
import { config } from "../../config.js";
import { provisionSubOrgWallet, provisionSubOrgStandaloneKey } from "../../services/sub-org-wallet.js";
import { PolicyRuleSchema, evaluatePolicies, type EvaluationContext } from "../policy/engine.js";

async function verifyParentOrg(request: any, subOrgId: string): Promise<any> {
  const subOrg = await prisma.organization.findFirst({ where: { id: subOrgId, parentOrgId: request.orgId } });
  if (!subOrg) throw new NotFoundError("Sub-organization not found or not a child of your organization");
  return subOrg;
}

export async function subOrgRoutes(app: FastifyInstance) {
  // List sub-orgs
  app.get("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.organization.findMany({
          where: { parentOrgId: request.orgId },
          include: { _count: { select: { users: true, wallets: true } } },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.organization.count({ where: { parentOrgId: request.orgId } }),
      ]);

      const result = await Promise.all(data.map(async org => ({
        id: org.id, name: org.name,
        rootUserId: "", rootUserEmail: "",
        userCount: org._count.users, walletCount: org._count.wallets,
        createdAt: org.createdAt,
      })));

      if (data.length > 0) {
        const rootUsers = await prisma.user.findMany({
          where: { orgId: { in: data.map(o => o.id) }, role: "ORG_ADMIN" },
          select: { id: true, email: true, orgId: true },
        });
        const rootMap: Map<string, any> = new Map(rootUsers.map(u => [u.orgId, u] as [string, any]));
        for (const org of result) {
          const root = rootMap.get(org.id);
          if (root) { org.rootUserId = root.id; org.rootUserEmail = root.email || ""; }
        }
      }

      return sendSuccess(reply, { data: result, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Create sub-org
  app.post("/sub-orgs", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, rootUserEmail } = request.body as { name: string; rootUserEmail?: string };
      if (!name || !name.trim()) throw new ValidationError("Sub-organization name required");
      const isApiKey = request.auth.type === "api_key";
      if (request.auth.role !== "ORG_ADMIN" && !isApiKey) throw new ForbiddenError("Only org admins can create sub-organizations");

      const subOrg = await prisma.organization.create({
        data: { name: name.trim(), parentOrgId: request.orgId },
      });

      let rootUser: any = null;
      if (rootUserEmail) {
        // If a user with this email already exists anywhere (unique constraint),
        // append a suffix so sub-org provisioning doesn't fail on duplicates.
        const existing = await prisma.user.findUnique({
          where: { email: rootUserEmail },
          select: { id: true },
        });
        const email = existing
          ? `${rootUserEmail.split("@")[0]}+${subOrg.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}@${rootUserEmail.split("@")[1]}`
          : rootUserEmail;

        rootUser = await prisma.user.create({
          data: { orgId: subOrg.id, email, role: "ORG_ADMIN", name: rootUserEmail.split("@")[0] },
        });
        // Send invitation if SMTP configured
        if (config.smtp.host && config.smtp.user && config.smtp.pass) {
          try {
            const { randomBytes } = await import("crypto");
            const { getRedis } = await import("../../redis.js");
            const { createTransport } = await import("nodemailer");
            const redis = getRedis();
            const inviteToken = randomBytes(32).toString("hex");
            await redis.setex(`invite:${inviteToken}`, 7 * 24 * 3600, JSON.stringify({ userId: rootUser.id, email: rootUserEmail, orgId: subOrg.id, orgName: subOrg.name }));
            const baseUrl = config.corsOrigin[0] || "http://localhost:5173";
            const transport = createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass }, tls: { rejectUnauthorized: !config.isDev } });
            await transport.sendMail({
              from: config.smtp.from, to: rootUserEmail,
              subject: `You've been invited to ${subOrg.name}`,
              text: `Accept: ${baseUrl}/accept-invitation?token=${inviteToken}`,
              html: `<p>You've been invited to join <strong>${subOrg.name}</strong>.</p><p><a href="${baseUrl}/accept-invitation?token=${inviteToken}">Accept Invitation</a></p>`,
            });
          } catch { /* email optional */ }
        }

        // Auto-provision an embedded wallet for the sub-org's root user.
        // keyType: "hd" = BIP-39 mnemonic (default), "standalone" = single keypair.
        const keyType = (request.body as any).keyType === "standalone" ? "standalone" : "hd";
        let provisionedWallet: any = null;
        try {
          if (keyType === "standalone") {
            provisionedWallet = await provisionSubOrgStandaloneKey(subOrg.id, rootUser.id, "ED25519", `${name.trim()} Key`);
          } else {
            provisionedWallet = await provisionSubOrgWallet(subOrg.id, rootUser.id, `${name.trim()} Wallet`);
          }
        } catch (e) {
          console.error("[SubOrg] Wallet provisioning failed:", e instanceof Error ? e.message : e);
        }

        await createAuditLog(request.orgId, "SUBORG_CREATE", { subOrgId: subOrg.id, name, parentOrgId: request.orgId, walletId: provisionedWallet?.walletId, walletAddresses: provisionedWallet?.accounts?.map((a: any) => ({ chainId: a.chainId, address: a.address })) }, request.userId, request);
        return sendSuccess(reply, {
          ...subOrg,
          rootUserId: rootUser?.id,
          rootUserEmail: rootUser?.email,
          wallet: provisionedWallet ? {
            walletId: provisionedWallet.walletId,
            name: provisionedWallet.name,
            accounts: provisionedWallet.accounts,
          } : null,
        }, 201);
      }

      await createAuditLog(request.orgId, "SUBORG_CREATE", { subOrgId: subOrg.id, name, parentOrgId: request.orgId }, request.userId, request);
      return sendSuccess(reply, { ...subOrg, rootUserId: null, rootUserEmail: null, wallet: null }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Sub-org settings/detail
  app.get("/sub-orgs/:id/settings", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const subOrg = await verifyParentOrg(request, id);
      const [rootUser, userCount, walletCount, policyCount, privateKeyCount, activityCount, wallets] = await Promise.all([
        prisma.user.findFirst({ where: { orgId: id, role: "ORG_ADMIN" }, select: { id: true, email: true, name: true } }),
        prisma.user.count({ where: { orgId: id } }),
        prisma.wallet.count({ where: { orgId: id } }),
        prisma.policy.count({ where: { orgId: id } }),
        prisma.privateKey.count({ where: { orgId: id } }),
        prisma.auditLog.count({ where: { orgId: id } }),
        prisma.wallet.findMany({
          where: { orgId: id },
          include: { accounts: { select: { id: true, chainId: true, address: true, derivationPath: true, index: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return sendSuccess(reply, {
        id: subOrg.id, name: subOrg.name, createdAt: subOrg.createdAt,
        rootUser: rootUser || null,
        userCount, walletCount, policyCount, privateKeyCount, activityCount,
        parentOrgId: subOrg.parentOrgId,
        wallets: wallets.map(w => ({
          walletId: w.id,
          name: w.name,
          status: w.status,
          tags: w.tags,
          accounts: w.accounts,
        })),
      });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's wallets
  app.get("/sub-orgs/:id/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.wallet.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, name: true, ownerType: true, status: true, tags: true, createdAt: true, _count: { select: { accounts: true } } } }),
        prisma.wallet.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's users
  app.get("/sub-orgs/:id/users", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.user.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: limit, skip: offset, select: { id: true, name: true, email: true, role: true, tags: true, createdAt: true, _count: { select: { sessions: true } } } }),
        prisma.user.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's policies
  app.get("/sub-orgs/:id/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.policy.findMany({ where: { orgId: id }, orderBy: { priority: "desc" }, take: limit, skip: offset }),
        prisma.policy.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // Create a policy on a sub-org
  app.post("/sub-orgs/:id/policies", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { name, effect, conditions, consensus, priority, active, description } = request.body as {
        name: string; effect: string; conditions?: unknown; consensus?: string; priority?: number; active?: boolean; description?: string;
      };
      if (!name || !effect) throw new ValidationError("Name and effect are required");

      const parsed = PolicyRuleSchema.safeParse({
        effect,
        conditions: conditions ?? [],
        consensus: consensus ?? "ANY",
      });
      if (!parsed.success) throw new ValidationError("Invalid policy format: " + parsed.error.message);

      // If description provided, wrap conditions into Turnkey-style object
      let conditionsData: any = conditions ?? [];
      if (description !== undefined && !Array.isArray(conditions)) {
        conditionsData = { condition: (conditions as any)?.condition || "", isTurnkey: true, description: description.trim() };
      }

      const policy = await prisma.policy.create({
        data: {
          orgId: id,
          name,
          effect,
          conditions: conditionsData as any,
          consensus: consensus || "ANY",
          priority: priority || 0,
          active: active !== false,
        },
      });

      await createAuditLog(request.orgId, "POLICY_CREATE", { subOrgId: id, policyId: policy.id, name }, request.userId, request);
      return sendSuccess(reply, policy, 201);
    } catch (err) { return sendError(reply, err); }
  });

  // Update a policy on a sub-org
  app.patch("/sub-orgs/:id/policies/:policyId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id, policyId } = request.params as { id: string; policyId: string };
      await verifyParentOrg(request, id);
      const { name, effect, conditions, consensus, priority, active, description } = request.body as any;

      if (effect || conditions || consensus) {
        const validated = PolicyRuleSchema.safeParse({
          effect: effect ?? "EFFECT_ALLOW",
          conditions: conditions ?? [],
          consensus: consensus ?? "ANY",
        });
        if (!validated.success) throw new ValidationError(`Invalid policy: ${validated.error.errors.map((e: any) => e.message).join(", ")}`);
      }

      let conditionsData: any = conditions;
      if (description !== undefined && conditions && !Array.isArray(conditions)) {
        conditionsData = { ...(conditions as any), description: description.trim() };
      }

      const result = await prisma.policy.updateMany({
        where: { id: policyId, orgId: id },
        data: { active, name, effect, conditions: conditionsData, consensus, priority },
      });
      if (result.count === 0) throw new NotFoundError("Policy not found in this sub-organization");
      const updated = await prisma.policy.findUnique({ where: { id: policyId } });
      await createAuditLog(request.orgId, "POLICY_UPDATE", { subOrgId: id, policyId, name }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) { return sendError(reply, err); }
  });

  // Delete a policy on a sub-org
  app.delete("/sub-orgs/:id/policies/:policyId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id, policyId } = request.params as { id: string; policyId: string };
      await verifyParentOrg(request, id);
      const result = await prisma.policy.deleteMany({ where: { id: policyId, orgId: id } });
      if (result.count === 0) throw new NotFoundError("Policy not found in this sub-organization");
      await createAuditLog(request.orgId, "POLICY_DELETE", { subOrgId: id, policyId }, request.userId, request);
      return sendSuccess(reply, { message: "Policy deleted" });
    } catch (err) { return sendError(reply, err); }
  });
  app.get("/sub-orgs/:id/private-keys", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.privateKey.findMany({
          where: { orgId: id },
          orderBy: { createdAt: "desc" },
          take: limit, skip: offset,
          select: {
            id: true, name: true, curve: true, tags: true, exported: true,
            publicKey: true, derivationIndex: true, status: true,
            walletId: true, createdAt: true,
            addresses: { select: { chainId: true, address: true } },
          },
        }),
        prisma.privateKey.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // List sub-org's activities (audit logs)
  app.get("/sub-orgs/:id/activities", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: { orgId: id },
          orderBy: { createdAt: "desc" },
          take: limit, skip: offset,
          select: {
            id: true, action: true, resource: true, details: true,
            userId: true, ip: true, createdAt: true,
            user: { select: { id: true, email: true, name: true } },
          },
        }),
        prisma.auditLog.count({ where: { orgId: id } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) { return sendError(reply, err); }
  });

  // Get single activity detail
  app.get("/sub-orgs/:id/activities/:activityId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id, activityId } = request.params as { id: string; activityId: string };
      await verifyParentOrg(request, id);
      const activity = await prisma.auditLog.findFirst({
        where: { id: activityId, orgId: id },
        select: {
          id: true, action: true, resource: true, details: true,
          userId: true, ip: true, createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      });
      if (!activity) throw new NotFoundError("Activity not found");
      return sendSuccess(reply, activity);
    } catch (err) { return sendError(reply, err); }
  });

  // Impersonate — generate session token for sub-org
  app.post("/sub-orgs/:id/impersonate", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);

      let rootUser = await prisma.user.findFirst({ where: { orgId: id, role: "ORG_ADMIN" } });
      if (!rootUser) {
        rootUser = await prisma.user.findFirst({ where: { orgId: id } });
      }
      if (!rootUser) {
        throw new ValidationError("Sub-org has no users — cannot impersonate. Invite a user to the sub-org first.");
      }

      const token = signToken({ sub: rootUser.id, orgId: id, role: "ORG_ADMIN" });
      const session = await prisma.session.create({
        data: { userId: rootUser.id, token, type: "READ_WRITE", expiresAt: new Date(Date.now() + config.sessionExpirySeconds * 1000) },
      });

      await createAuditLog(request.orgId, "SUBORG_IMPERSONATE", { subOrgId: id }, request.userId, request);

      return sendSuccess(reply, {
        sessionToken: token,
        user: { id: rootUser.id, email: rootUser.email, role: rootUser.role },
        org: { id, name: (await prisma.organization.findUnique({ where: { id }, select: { name: true } }))?.name || "" },
        impersonating: true,
        expiresAt: session.expiresAt,
      });
    } catch (err) { return sendError(reply, err); }
  });

  // Rename sub-org
  app.patch("/sub-orgs/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name } = request.body as { name?: string };
      if (!name) throw new ValidationError("Name required");
      await verifyParentOrg(request, id);
      const updated = await prisma.organization.update({ where: { id }, data: { name } });
      await createAuditLog(request.orgId, "SUBORG_UPDATE", { subOrgId: id, name }, request.userId, request);
      return sendSuccess(reply, updated);
    } catch (err) { return sendError(reply, err); }
  });

  // Delete sub-org
  app.delete("/sub-orgs/:id", { preHandler: [authMiddleware, adminMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await verifyParentOrg(request, id);

      // Prevent orphaning: check if this sub-org has its own children
      const childCount = await prisma.organization.count({ where: { parentOrgId: id } });
      if (childCount > 0) {
        throw new ValidationError(`Cannot delete a sub-organization that has ${childCount} child organization(s). Delete those first.`);
      }

      await prisma.organization.delete({ where: { id } });
      await createAuditLog(request.orgId, "SUBORG_DELETE", { subOrgId: id }, request.userId, request);
      return sendSuccess(reply, { message: "Sub-organization deleted" });
    } catch (err) { return sendError(reply, err); }
  });

  // Sign a message using a sub-org's wallet or standalone key (for embedded wallet flows).
  // Accepts X-Api-Key auth (API keys from the parent org can sign for sub-orgs).
  app.post("/sub-orgs/:id/sign-message", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { message, chain, format } = request.body as { message: string; chain?: string; format?: string };

      if (!message) throw new ValidationError("Message required");

      const isHex = format === "hex";
      const signPayload = isHex ? Buffer.from(message, "hex") : Buffer.from(message, "utf8");

      const subOrg = request.auth.type === "api_key"
        ? await prisma.organization.findFirst({ where: { id, parentOrgId: request.orgId } })
        : await verifyParentOrg(request, id);

      if (!subOrg) throw new NotFoundError("Sub-organization not found");

      // ─── Policy enforcement ───
      // Load the sub-org's active policies (ordered by priority desc) and evaluate
      // against the current request. We always pass isRootUser=false so that the
      // parent backend / API-key caller cannot bypass sub-org rules.
      const subOrgPolicies = await prisma.policy.findMany({
        where: { orgId: id, active: true },
        orderBy: { priority: "desc" },
      });

      if (subOrgPolicies.length > 0) {
        const policyContext: EvaluationContext = {
          params: { subOrgId: id, message, chain: chain || "", activityType: "SIGN_RAW_PAYLOAD" },
          activity: { resource: "WALLET", action: "SIGN", type: "SIGN_RAW_PAYLOAD" },
          credential: { type: request.auth?.type === "api_key" ? "API_KEY" : "EMAIL" },
          timestamp: Date.now(),
        } as any;

        const policyResult = evaluatePolicies(
          subOrgPolicies.map((p: any) => ({
            effect: p.effect as any,
            conditions: p.conditions as any,
            consensus: p.consensus as any,
          })),
          policyContext,
          false,
        );

        await createAuditLog(
          request.orgId,
          "POLICY_EVAL",
          { subOrgId: id, message, allowed: policyResult.allowed, reason: policyResult.reason },
          request.userId,
          request,
        );

        if (!policyResult.allowed) {
          await createAuditLog(
            request.orgId,
            "POLICY_DENY",
            { subOrgId: id, message, reason: policyResult.reason },
            request.userId,
            request,
          );
          return sendSuccess(reply, {
            allowed: false,
            requiresConsensus: policyResult.requiresConsensus,
            reason: policyResult.reason || "Policy denied",
          }, 200);
        }

        // Consensus required — caller must resolve approvals before signing.
        if (policyResult.requiresConsensus) {
          return sendSuccess(reply, {
            allowed: true,
            requiresConsensus: true,
            reason: policyResult.reason || "Policy requires consensus approval",
          }, 200);
        }
      }

      // ─── End policy enforcement ───

      // Check for standalone private key first
      const standaloneKey = await prisma.privateKey.findFirst({
        where: { orgId: id, tags: { has: "standalone-key" } },
        orderBy: { createdAt: "desc" },
      });

      let signature: string;
      let address: string;

      if (standaloneKey) {
        // Standalone key — sign directly with the stored key
        const { decrypt } = await import("../../utils/crypto.js");
        const secret = decrypt(standaloneKey.encryptedPrivateKey);

        if (standaloneKey.curve === "ED25519") {
          const { Keypair: StellarKeypair } = await import("@stellar/stellar-sdk");
          const kp = StellarKeypair.fromSecret(secret);
          signature = Buffer.from(kp.sign(signPayload)).toString("hex");
          address = kp.publicKey();
        } else {
          const { ethers } = await import("ethers");
          const wallet = new ethers.Wallet(secret);
          signature = isHex
            ? await wallet.signMessage(new Uint8Array(signPayload))
            : await wallet.signMessage(message);
          address = wallet.address;
        }
      } else {
        // HD wallet — find the wallet and sign through the mnemonic
        const wallet = await prisma.wallet.findFirst({
          where: { orgId: id, tags: { has: "sub-org-managed" } },
          orderBy: { createdAt: "asc" },
        });
        if (!wallet) throw new NotFoundError("No wallet found in sub-organization");

        const isStellar = chain === "stellar-testnet" || chain === "stellar-pubnet";
        const account = await prisma.walletAccount.findFirst({
          where: {
            walletId: wallet.id,
            ...(isStellar
              ? { address: { startsWith: "G" } }
              : { address: { startsWith: "0x" } }),
          },
        });
        if (!account) throw new NotFoundError("No account found in sub-org wallet");

        const { decryptSeedFromStorage } = await import("../../utils/enclave.js");
        const { deriveStellarAccount } = await import("../../utils/stellar.js");
        const { getChainByName } = await import("../../services/chain.js");
        const { signMessage } = await import("../../utils/enclave.js");

        const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);

        if (isStellar) {
          const chainInfo = await getChainByName(chain || "stellar-testnet");
          const stellarAccount = deriveStellarAccount(mnemonic, 0, chainInfo.derivationPath);
          const { Keypair: StellarKeypair } = await import("@stellar/stellar-sdk");
          const kp = StellarKeypair.fromSecret(stellarAccount.secret);
          signature = Buffer.from(kp.sign(signPayload)).toString("hex");
        } else {
          if (isHex) {
            const { ethers } = await import("ethers");
            const wallet = ethers.Wallet.fromPhrase(mnemonic);
            signature = await wallet.signMessage(new Uint8Array(signPayload));
          } else {
            signature = await signMessage(mnemonic, message);
          }
        }
        address = account.address;
      }

      await createAuditLog(
        request.orgId,
        "WALLET_SIGN_MESSAGE",
        { subOrgId: id, address },
        request.userId,
        request,
      );

      return sendSuccess(reply, { signature, address });
    } catch (err) { return sendError(reply, err); }
  });

  // ─── Sign full transaction (Stellar XDR) ────────────────────────────
  // Unlike sign-message (raw payload), this endpoint parses the
  // transaction XDR, derives the correct keypair, and uses the SDK's
  // built-in Transaction.sign() which correctly handles FeeBump,
  // Soroban resource data, and all envelope types.
  app.post("/sub-orgs/:id/sign-transaction", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { unsignedXdr, chain, networkPassphrase, amount, tokenId } = request.body as {
        unsignedXdr: string;
        chain?: string;
        networkPassphrase?: string;
        amount?: string;
        tokenId?: number;
      };

      if (!unsignedXdr) throw new ValidationError("unsignedXdr required");

      const subOrg = request.auth.type === "api_key"
        ? await prisma.organization.findFirst({ where: { id, parentOrgId: request.orgId } })
        : await verifyParentOrg(request, id);

      if (!subOrg) throw new NotFoundError("Sub-organization not found");

      // ─── Policy enforcement ───
      const subOrgPolicies = await prisma.policy.findMany({
        where: { orgId: id, active: true },
        orderBy: { priority: "desc" },
      });

      if (subOrgPolicies.length > 0) {
        const policyContext: EvaluationContext = {
          params: {
            subOrgId: id,
            chain: chain || "",
            ...(amount !== undefined ? { amount: Number(amount) } : {}),
            ...(tokenId !== undefined ? { tokenId } : {}),
            activityType: "SIGN_TRANSACTION",
          },
          activity: { resource: "WALLET", action: "SIGN", type: "SIGN_TRANSACTION" },
          credential: { type: request.auth?.type === "api_key" ? "API_KEY" : "EMAIL" },
          timestamp: Date.now(),
        } as any;

        const policyResult = evaluatePolicies(
          subOrgPolicies.map((p: any) => ({
            effect: p.effect as any,
            conditions: p.conditions as any,
            consensus: p.consensus as any,
          })),
          policyContext,
          false,
        );

        await createAuditLog(
          request.orgId,
          "POLICY_EVAL",
          { subOrgId: id, amount, tokenId, allowed: policyResult.allowed, reason: policyResult.reason },
          request.userId,
          request,
        );

        if (!policyResult.allowed) {
          await createAuditLog(
            request.orgId,
            "POLICY_DENY",
            { subOrgId: id, amount, tokenId, reason: policyResult.reason },
            request.userId,
            request,
          );
          return sendSuccess(reply, {
            allowed: false,
            requiresConsensus: policyResult.requiresConsensus,
            reason: policyResult.reason || "Policy denied",
          }, 200);
        }

        if (policyResult.requiresConsensus) {
          return sendSuccess(reply, {
            allowed: true,
            requiresConsensus: true,
            reason: policyResult.reason || "Policy requires consensus approval",
          }, 200);
        }
      }

      // ─── End policy enforcement ───

      const netPassphrase = networkPassphrase || "Test SDF Network ; September 2015";

      // Find the wallet
      const wallet = await prisma.wallet.findFirst({
        where: { orgId: id, tags: { has: "sub-org-managed" } },
        orderBy: { createdAt: "asc" },
      });
      if (!wallet) throw new NotFoundError("No wallet found in sub-organization");

      const { decryptSeedFromStorage } = await import("../../utils/enclave.js");
      const { deriveStellarAccount } = await import("../../utils/stellar.js");
      const { getChainByName } = await import("../../services/chain.js");
      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);

      // Parse the transaction envelope
      const {
        TransactionBuilder,
        Keypair: StellarKeypair,
      } = await import("@stellar/stellar-sdk");

      const envelope = TransactionBuilder.fromXDR(unsignedXdr, netPassphrase);

      // Derive the signing keypair
      const chainInfo = await getChainByName(chain || "stellar-testnet");
      const stellarAccount = deriveStellarAccount(mnemonic, 0, chainInfo.derivationPath);
      const kp = StellarKeypair.fromSecret(stellarAccount.secret);

      // Use the SDK's native sign() which handles all edge cases
      envelope.sign(kp);
      const signedXdr = envelope.toXDR();

      await createAuditLog(
        request.orgId,
        "TX_SIGN",
        { subOrgId: id, address: stellarAccount.address },
        request.userId,
        request,
      );

      return sendSuccess(reply, { signedXdr, address: stellarAccount.address });
    } catch (err) { return sendError(reply, err); }
  });
}
