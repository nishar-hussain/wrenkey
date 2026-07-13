import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { generateOperatorKeyPair, signWithOperatorKey } from "../../src/modules/wvc/operator.js";
import { verifyLocalAppProof, verifyLocalBootProof } from "@wrankey/wvc-verify";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let appId: string;
let deploymentId: string;
let manifestId: string;
let manifestHash: string;
let operatorId: string;
let operatorKeys: { publicKeyPem: string; privateKeyPem: string };

beforeAll(async () => {
  process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: `WVC Adversarial Test Org ${Date.now()}` } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "Adv Admin", email: "adv@test.local", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;

  operatorKeys = generateOperatorKeyPair();

  // Create app with 1 required approval
  const appRes = await app.inject({
    method: "POST",
    url: "/api/v1/wvc/apps",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Adversarial Test App", requiredApprovals: 1 },
  });
  appId = JSON.parse(appRes.body).id;

  // Add operator
  const opRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/operators`,
    headers: { authorization: `Bearer ${token}` },
    payload: { alias: "adv-op", publicKey: operatorKeys.publicKeyPem },
  });
  operatorId = JSON.parse(opRes.body).id;

  // Create deployment with specific PCRs
  const deployRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/deployments`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      imageUrl: "ghcr.io/test/app:v1@sha256:abcd",
      executablePath: "/app/main",
      executableDigest: "sha256:abcdef1234567890",
      expectedPcr0: "0".repeat(64),
      expectedPcr1: "0".repeat(63) + "1",
      expectedPcr2: "0".repeat(63) + "2",
      ingressPort: 3000,
      healthPort: 3000,
      cpuCount: 2,
      memoryMib: 1024,
      replicaCount: 1,
    },
  });
  const deployBody = JSON.parse(deployRes.body);
  deploymentId = deployBody.deploymentId;
  manifestId = deployBody.manifestId;
  manifestHash = deployBody.manifestHash;

  // Approve and provision
  const signature = signWithOperatorKey(operatorKeys.privateKeyPem, manifestHash);
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/manifests/${manifestId}/approve`,
    headers: { authorization: `Bearer ${token}` },
    payload: { operatorId, signature },
  });

  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/deployments/${deploymentId}/provision`,
    headers: { authorization: `Bearer ${token}` },
  });
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/deployments/${deploymentId}/set-live`,
    headers: { authorization: `Bearer ${token}` },
  });
});

afterAll(async () => {
  await prisma.wvcApp.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.session.deleteMany().catch(() => {});
  await prisma.user.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  await app.close();
  await prisma.$disconnect();
});

describe("WVC Adversarial Tests (PRD §27)", () => {
  it("rejects manifest approval with wrong signature", async () => {
    // Create another deployment
    const deployRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/deployments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        imageUrl: "ghcr.io/test/app:v2@sha256:efgh",
        executablePath: "/app/main",
        executableDigest: "sha256:different",
        expectedPcr0: "0".repeat(64),
        expectedPcr1: "0".repeat(63) + "1",
        expectedPcr2: "0".repeat(63) + "2",
        ingressPort: 3000,
        healthPort: 3000,
        replicaCount: 1,
      },
    });
    const newManifestId = JSON.parse(deployRes.body).manifestId;

    // Try to approve with a signature over a DIFFERENT hash
    const wrongSig = signWithOperatorKey(operatorKeys.privateKeyPem, "sha256:deadbeef00000000000000000000000000000000000000000000000000000000");
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${newManifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { operatorId, signature: wrongSig },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects proof with tampered PCRs (PCR mismatch)", async () => {
    // Fetch a valid app proof
    const invokeRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed" },
    });
    const proof = JSON.parse(invokeRes.body).appProof;

    // Tamper with PCRs in the attestation document
    const attestationDoc = Buffer.from(proof.attestationDoc, "base64").toString("utf8");
    const tampered = JSON.parse(attestationDoc);
    tampered.pcrs.pcr0 = "f".repeat(64); // wrong PCR
    const tamperedDoc = Buffer.from(JSON.stringify(tampered)).toString("base64");

    const tamperedProof = { ...proof, attestationDoc: tamperedDoc };

    // Verification should fail — tampering with PCRs breaks the self-signature
    const result = verifyLocalAppProof(tamperedProof, {
      pcr0: "0".repeat(64),
      pcr1: "0".repeat(63) + "1",
      pcr2: "0".repeat(63) + "2",
    }, { maxAgeMs: 60 * 60 * 1000 });

    expect(result.valid).toBe(false);
    // Reason will be "self-signature invalid" since we changed PCRs without re-signing
    expect(result.reason).toBeTruthy();
  });

  it("rejects proof with tampered signature (signature mismatch)", async () => {
    const invokeRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed" },
    });
    const proof = JSON.parse(invokeRes.body).appProof;

    // Tamper with the signature
    const tamperedProof = { ...proof, signature: "0".repeat(128) };

    const result = verifyLocalAppProof(tamperedProof, {
      pcr0: "0".repeat(64),
      pcr1: "0".repeat(63) + "1",
      pcr2: "0".repeat(63) + "2",
    }, { maxAgeMs: 60 * 60 * 1000 });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("signature");
  });

  it("rejects proof with stale attestation (replay attack)", async () => {
    const invokeRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed" },
    });
    const proof = JSON.parse(invokeRes.body).appProof;

    // Verify with a very short max age (1ms) — should fail because the attestation is already older
    const result = verifyLocalAppProof(proof, {
      pcr0: "0".repeat(64),
      pcr1: "0".repeat(63) + "1",
      pcr2: "0".repeat(63) + "2",
    }, { maxAgeMs: 1 });

    expect(result.valid).toBe(false);
    // Either "stale"/"too old" or "PCR" depending on timing — just verify it's invalid
    expect(result.reason).toBeTruthy();
  });

  it("rejects invocation of non-live deployment (rollback attack)", async () => {
    // Create + approve + provision a deployment but DON'T set it live
    const deployRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/deployments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        imageUrl: "ghcr.io/test/app:v3@sha256:ijkl",
        executablePath: "/app/main",
        executableDigest: "sha256:another",
        expectedPcr0: "0".repeat(64),
        expectedPcr1: "0".repeat(63) + "1",
        expectedPcr2: "0".repeat(63) + "2",
        ingressPort: 3000,
        healthPort: 3000,
        replicaCount: 1,
      },
    });
    const newDeploymentId = JSON.parse(deployRes.body).deploymentId;
    const newManifestId = JSON.parse(deployRes.body).manifestId;

    const manifestRes = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/manifests/${newManifestId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const hash = JSON.parse(manifestRes.body).manifestHash;
    const sig = signWithOperatorKey(operatorKeys.privateKeyPem, hash);
    await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${newManifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { operatorId, signature: sig },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${newDeploymentId}/provision`,
      headers: { authorization: `Bearer ${token}` },
    });

    // Try to invoke without set-live
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${newDeploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed" },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("not live");
  });

  it("rejects invocation of deleted deployment (rollback)", async () => {
    // Soft-delete the deployment
    await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/delete`,
      headers: { authorization: `Bearer ${token}` },
    });

    // Try to invoke
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed" },
    });
    expect(res.statusCode).toBe(403);

    // Restore for cleanup
    await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/restore`,
      headers: { authorization: `Bearer ${token}` },
    });
  });

  it("rejects provisioning an unapproved deployment", async () => {
    const deployRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/deployments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        imageUrl: "ghcr.io/test/app:v4@sha256:mnop",
        executablePath: "/app/main",
        executableDigest: "sha256:unapproved",
        expectedPcr0: "0".repeat(64),
        expectedPcr1: "0".repeat(63) + "1",
        expectedPcr2: "0".repeat(63) + "2",
        ingressPort: 3000,
        healthPort: 3000,
        replicaCount: 1,
      },
    });
    const newDeploymentId = JSON.parse(deployRes.body).deploymentId;

    // Try to provision without approval
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${newDeploymentId}/provision`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.message).toContain("approved");
  });
});
