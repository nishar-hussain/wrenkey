import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { generateOperatorKeyPair, signWithOperatorKey } from "../../src/modules/wvc/operator.js";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let appId: string;
let operatorId: string;
let deploymentId: string;
let manifestId: string;
let manifestHash: string;
let operatorKeys: { publicKeyPem: string; privateKeyPem: string };

beforeAll(async () => {
  process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: "WVC Test Org" } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "WVC Admin", email: "wvc@test.local", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;

  operatorKeys = generateOperatorKeyPair();
});

afterAll(async () => {
  // Clean up test data — cascade deletes from org
  await prisma.wvcApp.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.session.deleteMany().catch(() => {});
  await prisma.user.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  await app.close();
  await prisma.$disconnect();
});

describe("WVC Routes (PRD §9)", () => {
  it("POST /wvc/apps creates an app", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/wvc/apps",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "wallet-signer", description: "Test signer", requiredApprovals: 1 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("wallet-signer");
    expect(body.requiredApprovals).toBe(1);
    appId = body.id;
  });

  it("GET /wvc/apps lists apps", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/wvc/apps",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThan(0);
  });

  it("POST /wvc/apps/:appId/operators adds an operator", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/operators`,
      headers: { authorization: `Bearer ${token}` },
      payload: { alias: "alice", publicKey: operatorKeys.publicKeyPem },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.alias).toBe("alice");
    expect(body.status).toBe("active");
    operatorId = body.id;
  });

  it("POST /wvc/apps/:appId/deployments creates a deployment + manifest", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/deployments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        imageUrl: "ghcr.io/wrankey/signer:v1@sha256:abc",
        executablePath: "/app/signer",
        executableArgs: ["--port", "3000"],
        executableDigest: "sha256:def",
        expectedPcr0: "a".repeat(64),
        expectedPcr1: "b".repeat(64),
        expectedPcr2: "c".repeat(64),
        ingressPort: 3000,
        healthPort: 3000,
        cpuCount: 2,
        memoryMib: 1024,
        replicaCount: 3,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.deploymentId).toBeTruthy();
    expect(body.manifestId).toBeTruthy();
    expect(body.manifestHash).toMatch(/^sha256:/);
    expect(body.status).toBe("pending_manifest");
    deploymentId = body.deploymentId;
    manifestId = body.manifestId;
    manifestHash = body.manifestHash;
  });

  it("GET /wvc/manifests/:manifestId shows the manifest", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/manifests/${manifestId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.manifestHash).toBe(manifestHash);
    expect(body.approvalsCount).toBe(0);
    expect(body.requiredApprovals).toBe(1);
    expect(body.status).toBe("pending_manifest");
  });

  it("POST /wvc/manifests/:manifestId/approve with a valid signature transitions to approved", async () => {
    const signature = signWithOperatorKey(operatorKeys.privateKeyPem, manifestHash);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${manifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { operatorId, signature },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.approvalsCount).toBe(1);
    expect(body.status).toBe("approved");
  });

  it("POST /wvc/manifests/:manifestId/approve rejects a double-approval", async () => {
    const signature = signWithOperatorKey(operatorKeys.privateKeyPem, manifestHash);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${manifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { operatorId, signature },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /wvc/manifests/:manifestId/approve rejects an invalid signature", async () => {
    // Try approving with a different operator whose signature won't match
    const op2Keys = generateOperatorKeyPair();
    const res2 = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/operators`,
      headers: { authorization: `Bearer ${token}` },
      payload: { alias: "bob", publicKey: op2Keys.publicKeyPem },
    });
    const op2Id = JSON.parse(res2.payload).id;
    const badSignature = signWithOperatorKey(op2Keys.privateKeyPem, manifestHash);
    // This manifest already has enough approvals; test invalid sig on a fresh manifest.
    const deployRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/deployments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        imageUrl: "ghcr.io/wrankey/signer:v2@sha256:xyz",
        executablePath: "/app/signer",
        executableArgs: [],
        executableDigest: "sha256:diff",
        expectedPcr0: "d".repeat(64), expectedPcr1: "e".repeat(64), expectedPcr2: "f".repeat(64),
        ingressPort: 3000, healthPort: 3000, cpuCount: 2, memoryMib: 1024, replicaCount: 2,
      },
    });
    const newManifestId = JSON.parse(deployRes.payload).manifestId;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${newManifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { operatorId: op2Id, signature: badSignature + "tampered" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST /wvc/deployments/:id/provision provisions an approved deployment", async () => {
    process.env.WVC_ALLOW_LOCAL_PROOFS = "false";
    const blocked = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/provision`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(blocked.statusCode).toBe(403);

    process.env.WVC_ALLOW_LOCAL_PROOFS = "true";
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/provision`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("inactive");
    expect(body.runtime).toBe("local");
    expect(body.healthyReplicas).toBe(3);
    expect(body.bootProofs.length).toBe(3);

    const bootProofs = await prisma.wvcBootProof.findMany({ where: { deploymentId } });
    expect(bootProofs).toHaveLength(3);
  });

  it("POST /wvc/deployments/:id/set-live sets it live", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/set-live`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("live");
    expect(body.isLive).toBe(true);
  });

  it("GET /wvc/deployments/:id shows live status", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/deployments/${deploymentId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("live");
    expect(body.isLive).toBe(true);
    expect(body.healthyReplicas).toBe(body.totalReplicas);
    expect(body.bootProofs.length).toBeGreaterThan(0);
    expect(body.bootProofs[0].proofFormatVersion).toBe("local-dev-v1");
  });

  it("POST /wvc/deployments/:id/invoke persists a local app proof", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed", walletName: "Local Demo" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result.seedId).toMatch(/^local-seed-/);
    expect(body.appProof.id).toBeTruthy();
    expect(body.appProof.proofFormatVersion).toBe("local-dev-v1");

    const proofRes = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/app-proofs/${body.appProof.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(proofRes.statusCode).toBe(200);
    const proof = JSON.parse(proofRes.payload);
    expect(proof.id).toBe(body.appProof.id);
    expect(proof.proofFormatVersion).toBe("local-dev-v1");
    expect(proof.payloadType).toBe("generate_seed");
  });

  it("POST /wvc/deployments/:id/delete soft-deletes", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/delete`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("marked_for_deletion");
    expect(body.restorable).toBe(true);
  });

  it("POST /wvc/deployments/:id/restore restores", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("inactive");
  });

  it("POST /wvc/deployments/:id/invoke rejects inactive deployments", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "signature", unsignedTx: "0x02f8..." },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error.message).toContain("not live");
  });

  it("GET /wvc/apps/:appId shows full detail", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/apps/${appId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(appId);
    expect(body.operators.length).toBeGreaterThan(0);
    expect(body.deployments.length).toBeGreaterThan(0);
  });
});
