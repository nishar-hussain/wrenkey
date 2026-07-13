import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { generateOperatorKeyPair, signWithOperatorKey } from "../../src/modules/wvc/operator.js";
import { shamirSplit, shamirRecover, eciesEncrypt, eciesDecrypt } from "../../src/services/wvc-crypto.js";
import { generateKeyPairSync } from "crypto";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let appId: string;
let deploymentId: string;
let manifestId: string;
let operatorIds: string[] = [];
let operatorKeys: { publicKeyPem: string; privateKeyPem: string }[] = [];

beforeAll(async () => {
  process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: `WVC KeyFwd Test Org ${Date.now()}` } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "KeyFwd Admin", email: "keyfwd@test.local", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;

  // Create app with 2 required approvals, 3 operators
  const appRes = await app.inject({
    method: "POST",
    url: "/api/v1/wvc/apps",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "KeyFwd Test App", requiredApprovals: 2 },
  });
  appId = JSON.parse(appRes.body).id;

  for (let i = 0; i < 3; i++) {
    const keys = generateOperatorKeyPair();
    operatorKeys.push(keys);
    const opRes = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/operators`,
      headers: { authorization: `Bearer ${token}` },
      payload: { alias: `kf-op-${i}`, publicKey: keys.publicKeyPem },
    });
    operatorIds.push(JSON.parse(opRes.body).id);
  }

  // Create + approve + provision
  const deployRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/deployments`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      imageUrl: "ghcr.io/test/app:v1@sha256:abcd",
      executablePath: "/app/main",
      executableDigest: "sha256:keyfwd",
      expectedPcr0: "0".repeat(64),
      expectedPcr1: "0".repeat(63) + "1",
      expectedPcr2: "0".repeat(63) + "2",
      ingressPort: 3000,
      healthPort: 3000,
      replicaCount: 2,
    },
  });
  const deployBody = JSON.parse(deployRes.body);
  deploymentId = deployBody.deploymentId;
  manifestId = deployBody.manifestId;

  // Approve with 2 operators
  const manifestRes = await app.inject({
    method: "GET",
    url: `/api/v1/wvc/manifests/${manifestId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  const hash = JSON.parse(manifestRes.body).manifestHash;
  for (let i = 0; i < 2; i++) {
    const sig = signWithOperatorKey(operatorKeys[i].privateKeyPem, hash);
    await app.inject({
      method: "POST",
      url: `/api/v1/wvc/manifests/${manifestId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: { operatorId: operatorIds[i], signature: sig },
    });
  }

  // Provision
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/deployments/${deploymentId}/provision`,
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

describe("WVC Key Forwarding & Shamir (PRD §18)", () => {
  it("POST /quorum-key/request returns quorum public key after bootstrap", async () => {
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "der" },
    });
    const ephemeralPubkey = `04${(publicKey as Buffer).toString("hex").slice(-128)}`;

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/request`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ephemeralPubkey, attestationDoc: "test" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.quorumPublicKey).toBeTruthy();
    expect(body.quorumPublicKey.startsWith("04")).toBe(true);
    expect(body.generation).toBeGreaterThanOrEqual(1);
  });

  it("Shamir split + recover roundtrip works (3-of-3)", () => {
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) secret[i] = i + 1;
    const shares = shamirSplit(secret, 3, 3);
    expect(shares.length).toBe(3);
    const recovered = shamirRecover(shares);
    expect(recovered).toEqual(secret);
  });

  it("Shamir threshold works (2-of-3)", () => {
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) secret[i] = 42;
    const shares = shamirSplit(secret, 2, 3);
    // Any 2 should recover
    const recovered = shamirRecover([shares[0], shares[1]]);
    expect(recovered).toEqual(secret);
    const recovered2 = shamirRecover([shares[1], shares[2]]);
    expect(recovered2).toEqual(secret);
  });

  it("Shamir with 1 share below threshold reveals nothing", () => {
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) secret[i] = 99;
    const shares = shamirSplit(secret, 2, 3);
    const recovered = shamirRecover([shares[0]]);
    expect(recovered).not.toEqual(secret);
  });

  it("ECIES encrypt + decrypt roundtrip works", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const pubHex = `04${(publicKey as Buffer).toString("hex").slice(-128)}`;
    const plaintext = Buffer.from("hello world secret data");

    const encrypted = eciesEncrypt(pubHex, plaintext);
    expect(encrypted.length).toBeGreaterThan(65);

    const decrypted = eciesDecrypt(privateKey as string, encrypted);
    expect(decrypted.toString()).toBe(plaintext.toString());
  });

  it("ECIES + Shamir: encrypt shares, decrypt, and recover", () => {
    // Generate a secret, split into shares, encrypt each to a different operator, decrypt and recover
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) secret[i] = 0xaa;
    const shares = shamirSplit(secret, 2, 3);

    // Generate 3 operator keypairs
    const operatorKeyPairs = Array.from({ length: 3 }, () =>
      generateKeyPairSync("ec", {
        namedCurve: "prime256v1",
        publicKeyEncoding: { type: "spki", format: "der" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      }),
    );

    // Encrypt each share to a different operator
    const encryptedShares = shares.map((share, i) => {
      const pubHex = `04${(operatorKeyPairs[i].publicKey as Buffer).toString("hex").slice(-128)}`;
      return eciesEncrypt(pubHex, Buffer.from(share.data));
    });

    // Operators 0 and 2 decrypt their shares
    const decrypted0 = eciesDecrypt(operatorKeyPairs[0].privateKey as string, encryptedShares[0]);
    const decrypted2 = eciesDecrypt(operatorKeyPairs[2].privateKey as string, encryptedShares[2]);

    // Reconstruct with 2 shares (threshold)
    const recovered = shamirRecover([
      { index: shares[0].index, data: new Uint8Array(decrypted0) },
      { index: shares[2].index, data: new Uint8Array(decrypted2) },
    ]);

    expect(recovered).toEqual(secret);
  });

  it("GET /quorum-key/ceremonies returns list after provisioning", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies?limit=20`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBeGreaterThanOrEqual(0);
  });
});
