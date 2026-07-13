/**
 * End-to-end test: Local simulated WVC enclave flow with cryptographic verification.
 *
 * This test exercises the FULL WVC lifecycle:
 *   1. Create app → add operator → create deployment + manifest
 *   2. Approve manifest → provision → set-live
 *   3. Invoke (generate_seed) → fetch proof
 *   4. Cryptographically verify the proof using @wrankey/wvc-verify's verifyLocalAppProof()
 *
 * The proof verification is REAL — it checks:
 *   - The attestation document's self-signature (P-256 ECDSA)
 *   - The ephemeral key's payload signature over the raw 32-byte hash
 *   - The PCRs match expected values
 *   - The freshness (timestamp within max age)
 *
 * This proves the local simulated enclave works end-to-end, not just
 * "accepted" but cryptographically verified.
 */

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
let operatorId: string;
let deploymentId: string;
let manifestId: string;
let manifestHash: string;
let operatorKeys: { publicKeyPem: string; privateKeyPem: string };
let appProofId: string;
let bootProofId: string;

// Store the last proof from the invoke test for the verification tests
let lastProof: {
  ephemeralPubkey: string;
  payloadHash: string;
  payloadType: string;
  signature: string;
  attestationDoc: string;
};

const EXPECTED_PCRS = {
  pcr0: "0000000000000000000000000000000000000000000000000000000000000000",
  pcr1: "0000000000000000000000000000000000000000000000000000000000000001",
  pcr2: "0000000000000000000000000000000000000000000000000000000000000002",
};

beforeAll(async () => {
  process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  // Test-scoped: create a fresh org instead of wiping all data
  const org = await prisma.organization.create({ data: { name: `E2E Verify Test Org ${Date.now()}` } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "E2E Admin", email: "e2e-verify@test.local", role: "ORG_ADMIN" },
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
  await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  await app.close();
  await prisma.$disconnect();
});

describe("WVC End-to-End with Cryptographic Verification", () => {
  it("creates a WVC app", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/wvc/apps",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "e2e-signer", description: "E2E test signer", requiredApprovals: 1 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    appId = body.id;
    expect(appId).toBeTruthy();
  });

  it("adds an operator", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/operators`,
      headers: { authorization: `Bearer ${token}` },
      payload: { alias: "e2e-operator", publicKey: operatorKeys.publicKeyPem },
    });
    expect(res.statusCode).toBe(201);
    operatorId = JSON.parse(res.payload).id;
  });

  it("creates a deployment + manifest", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/deployments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        imageUrl: "ghcr.io/wrankey/signer:v1",
        executablePath: "/app/signer",
        executableArgs: ["--port", "3000"],
        executableDigest: "sha256:e2e1234567890abcdef",
        expectedPcr0: EXPECTED_PCRS.pcr0,
        expectedPcr1: EXPECTED_PCRS.pcr1,
        expectedPcr2: EXPECTED_PCRS.pcr2,
        ingressPort: 3000,
        healthPort: 3000,
        cpuCount: 2,
        memoryMib: 1024,
        replicaCount: 1,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    deploymentId = body.deploymentId;
    manifestId = body.manifestId;
    manifestHash = body.manifestHash;
    expect(deploymentId).toBeTruthy();
    expect(manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("approves the manifest with a valid operator signature", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${manifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        operatorId,
        signature: signWithOperatorKey(operatorKeys.privateKeyPem, manifestHash),
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("approved");
    expect(body.approvalsCount).toBe(1);
  });

  it("provisions the deployment and gets boot proofs", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/provision`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("inactive");
    expect(body.bootProofs).toHaveLength(1);
    bootProofId = body.bootProofs[0].id;
    expect(bootProofId).toBeTruthy();
  });

  it("sets the deployment live", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/set-live`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe("live");
  });

  it("invokes the deployment (generate_seed) and gets a proof", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
      headers: { authorization: `Bearer ${token}` },
      payload: { payloadType: "generate_seed" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.result).toBeTruthy();
    expect(body.result.seedId).toBeTruthy();
    expect(body.appProof).toBeTruthy();
    expect(body.appProof.proofFormatVersion).toBe("local-dev-v1");
    expect(body.appProof.ephemeralPubkey).toMatch(/^04[0-9a-f]+$/);
    expect(body.appProof.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(body.appProof.signature).toMatch(/^[0-9a-f]+$/);
    expect(body.appProof.attestationDoc).toBeTruthy();
    appProofId = body.appProof.id;

    // Store for cryptographic verification tests
    lastProof = {
      ephemeralPubkey: body.appProof.ephemeralPubkey,
      payloadHash: body.appProof.payloadHash,
      payloadType: body.appProof.payloadType,
      signature: body.appProof.signature,
      attestationDoc: body.appProof.attestationDoc,
    };
  });

  it("fetches the stored proof by ID", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/app-proofs/${appProofId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(appProofId);
    expect(body.proofFormatVersion).toBe("local-dev-v1");
    expect(body.ephemeralPubkey).toMatch(/^04[0-9a-f]+$/);
  });

  it("CRYPTOGRAPHICALLY VERIFIES the app proof", () => {
    // This is the critical test — it calls the real verification library
    // and checks the P-256 signatures, PCRs, and freshness.
    //
    // We can't use the async app.inject here because we need the proof data
    // from the previous test. Let's fetch it synchronously.
    // Actually, vitest runs tests sequentially within a describe block,
    // so appProofId is available.

    // Build the proof bundle for verification
    const proofBundle = {
      proofFormatVersion: "local-dev-v1",
      deploymentId,
      ephemeralPubkey: lastProof.ephemeralPubkey,
      payloadHash: lastProof.payloadHash,
      payloadType: "generate_seed" as const,
      signature: lastProof.signature,
      attestationDoc: lastProof.attestationDoc,
      issuedAt: new Date().toISOString(),
    };

    const result = verifyLocalAppProof(proofBundle, EXPECTED_PCRS, { maxAgeMs: 60 * 60 * 1000 });

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.pcrs).toEqual(EXPECTED_PCRS);
    expect(result.enclavePublicKey).toMatch(/^04[0-9a-f]+$/);
    expect(result.signedAt).toBeGreaterThan(0);
  });

  it("fetches and verifies a boot proof", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/boot-proofs/${bootProofId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    const result = verifyLocalBootProof(
      {
        deploymentId: body.deploymentId,
        manifestId: body.manifestId,
        manifestHash: body.manifestHash,
        attestationDoc: body.attestationDoc,
        bootedAt: body.bootedAt,
      },
      EXPECTED_PCRS,
      { maxAgeMs: 60 * 60 * 1000 },
    );

    expect(result.valid).toBe(true);
    expect(result.pcrs).toEqual(EXPECTED_PCRS);
  });

  it("rejects a tampered proof (wrong PCRs)", () => {
    const proofBundle = {
      proofFormatVersion: "local-dev-v1",
      deploymentId,
      ephemeralPubkey: lastProof.ephemeralPubkey,
      payloadHash: lastProof.payloadHash,
      payloadType: "generate_seed" as const,
      signature: lastProof.signature,
      attestationDoc: lastProof.attestationDoc,
      issuedAt: new Date().toISOString(),
    };

    const wrongPcrs = {
      pcr0: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      pcr1: EXPECTED_PCRS.pcr1,
      pcr2: EXPECTED_PCRS.pcr2,
    };

    const result = verifyLocalAppProof(proofBundle, wrongPcrs, { maxAgeMs: 60 * 60 * 1000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("pcr0 mismatch");
  });

  it("rejects a tampered proof (wrong signature)", () => {
    const proofBundle = {
      proofFormatVersion: "local-dev-v1",
      deploymentId,
      ephemeralPubkey: lastProof.ephemeralPubkey,
      payloadHash: lastProof.payloadHash,
      payloadType: "generate_seed" as const,
      signature: "00".repeat(64), // Invalid signature
      attestationDoc: lastProof.attestationDoc,
      issuedAt: new Date().toISOString(),
    };

    const result = verifyLocalAppProof(proofBundle, EXPECTED_PCRS, { maxAgeMs: 60 * 60 * 1000 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("payload signature invalid");
  });
});
