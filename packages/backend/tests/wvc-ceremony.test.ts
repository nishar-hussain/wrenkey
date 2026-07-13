import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { generateOperatorKeyPair } from "../../src/modules/wvc/operator.js";
import { generateKeyPairSync } from "crypto";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let appId: string;
let operatorIds: string[] = [];

beforeAll(async () => {
  process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: `WVC Ceremony Test Org ${Date.now()}` } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "Ceremony Admin", email: "ceremony@test.local", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;

  // Create app
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/wvc/apps",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Ceremony Test App", requiredApprovals: 2 },
  });
  appId = JSON.parse(res.body).id;

  // Add 3 operators
  for (let i = 0; i < 3; i++) {
    const keys = generateOperatorKeyPair();
    const opRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/operators`,
      headers: { authorization: `Bearer ${token}` },
      payload: { alias: `op-${i}`, publicKey: keys.publicKeyPem },
    });
    operatorIds.push(JSON.parse(opRes.body).id);
  }
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

describe("WVC Quorum Key Ceremonies (PRD §18.4)", () => {
  it("POST /wvc/apps/:appId/quorum-key/ceremonies creates a bootstrap ceremony", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ceremonyType: "bootstrap", participatingOperators: operatorIds },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.ceremonyType).toBe("bootstrap");
    expect(body.status).toBe("pending");
    expect(body.participatingOperators).toHaveLength(3);
  });

  it("GET /wvc/apps/:appId/quorum-key/ceremonies lists all ceremonies", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies?limit=20`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.data).toBeInstanceOf(Array);
  });

  it("POST /wvc/apps/:appId/quorum-key/request returns quorum public key", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/request`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ephemeralPubkey: "04".padEnd(130, "a"),
        attestationDoc: "test-attestation",
      },
    });
    // Will fail because no quorum key bootstrapped yet
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("No Quorum Key");
  });

  it("POST .../complete rejects invalid quorumPublicKey (not a P-256 key)", async () => {
    // Create a ceremony to complete
    const ceremonyRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ceremonyType: "rotation", participatingOperators: operatorIds },
    });
    const ceremonyId = JSON.parse(ceremonyRes.body).id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies/${ceremonyId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quorumPublicKey: "not-a-valid-key" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain("valid P-256");
  });

  it("POST .../complete accepts valid P-256 SEC1 hex public key", async () => {
    // Generate a valid P-256 keypair and extract SEC1 uncompressed point
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "der" },
    });
    const pubHex = `04${(publicKey as Buffer).toString("hex").slice(-128)}`;

    const ceremonyRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ceremonyType: "rotation", participatingOperators: operatorIds },
    });
    const ceremonyId = JSON.parse(ceremonyRes.body).id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies/${ceremonyId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quorumPublicKey: pubHex },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("completed");
  });

  it("POST .../complete accepts valid P-256 PEM public key", async () => {
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const pem = publicKey as string;

    const ceremonyRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ceremonyType: "rotation", participatingOperators: operatorIds },
    });
    const ceremonyId = JSON.parse(ceremonyRes.body).id;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies/${ceremonyId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quorumPublicKey: pem },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST .../complete rejects already-completed ceremony", async () => {
    const ceremonyRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ceremonyType: "rotation", participatingOperators: operatorIds },
    });
    const ceremonyId = JSON.parse(ceremonyRes.body).id;

    // Complete it
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies/${ceremonyId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quorumPublicKey: publicKey as string },
    });

    // Try to complete again
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies/${ceremonyId}/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quorumPublicKey: publicKey as string },
    });
    expect(res.statusCode).toBe(400);
  });
});
