import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { generateOperatorKeyPair, signWithOperatorKey } from "../../src/modules/wvc/operator.js";
import { isWvcWalletSigningEnabled } from "../../src/services/wvc-wallet-integration.js";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let appId: string;
let deploymentId: string;
let manifestId: string;
let operatorId: string;
let operatorKeys: { publicKeyPem: string; privateKeyPem: string };

beforeAll(async () => {
  process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: `WVC Wallet Test Org ${Date.now()}` } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "Wallet Admin", email: "wallet@test.local", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;

  operatorKeys = generateOperatorKeyPair();

  // Create WVC app + operator + deployment + provision + set-live
  const appRes = await app.inject({
    method: "POST",
    url: "/api/v1/wvc/apps",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Wallet Signer App", requiredApprovals: 1 },
  });
  appId = JSON.parse(appRes.body).id;

  const opRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/operators`,
    headers: { authorization: `Bearer ${token}` },
    payload: { alias: "wallet-op", publicKey: operatorKeys.publicKeyPem },
  });
  operatorId = JSON.parse(opRes.body).id;

  const deployRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/deployments`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      imageUrl: "ghcr.io/wrankey/signer:v1@sha256:abcd",
      executablePath: "/app/wvc-app",
      executableDigest: "sha256:abcdef",
      expectedPcr0: "0".repeat(64),
      expectedPcr1: "0".repeat(63) + "1",
      expectedPcr2: "0".repeat(63) + "2",
      ingressPort: 3000,
      healthPort: 3000,
      replicaCount: 1,
    },
  });
  const deployBody = JSON.parse(deployRes.body);
  deploymentId = deployBody.deploymentId;
  manifestId = deployBody.manifestId;

  // Approve
  const manifestRes = await app.inject({
    method: "GET",
    url: `/api/v1/wvc/manifests/${manifestId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  const hash = JSON.parse(manifestRes.body).manifestHash;
  const sig = signWithOperatorKey(operatorKeys.privateKeyPem, hash);
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/manifests/${manifestId}/approve`,
    headers: { authorization: `Bearer ${token}` },
    payload: { operatorId, signature: sig },
  });

  // Provision + set live
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

  // Set the deployment as the wallet signer
  process.env.WVC_WALLET_SIGNER_DEPLOYMENT_ID = deploymentId;
});

afterAll(async () => {
  delete process.env.WVC_WALLET_SIGNER_DEPLOYMENT_ID;
  await prisma.wvcApp.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.wallet.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.auditLog.deleteMany().catch(() => {});
  await prisma.session.deleteMany().catch(() => {});
  await prisma.user.deleteMany({ where: { orgId } }).catch(() => {});
  await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
  await app.close();
  await prisma.$disconnect();
});

describe("WVC Wallet Integration (PRD §25)", () => {
  it("isWvcWalletSigningEnabled returns true when deployment ID is set", () => {
    expect(isWvcWalletSigningEnabled()).toBe(true);
  });

  it("POST /wallets creates a WVC-managed wallet with app proof", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/wallets",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "WVC Test Wallet" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.wvcManaged).toBe(true);
    expect(body.devMode).toBe(true); // local sim
    expect(body.appProof).toBeTruthy();
    expect(body.appProof.proofFormatVersion).toBe("local-dev-v1");
    expect(body.appProof.payloadType).toBe("generate_seed");
  });

  it("WVC-managed wallet stores seed handle, not raw seed", async () => {
    const wallet = await prisma.wallet.findFirst({
      where: { orgId, name: "WVC Test Wallet" },
    });
    expect(wallet).toBeTruthy();
    expect(wallet!.encryptedSeed.startsWith("wvc:")).toBe(true);
  });

  it("WVC-managed wallet has wvc-managed tag", async () => {
    const wallet = await prisma.wallet.findFirst({
      where: { orgId, name: "WVC Test Wallet" },
    });
    expect(wallet!.tags).toContain("wvc-managed");
  });

  it("WVC-managed wallet has a derived address", async () => {
    const wallet = await prisma.wallet.findFirst({
      where: { orgId, name: "WVC Test Wallet" },
      include: { accounts: true },
    });
    expect(wallet!.accounts.length).toBeGreaterThan(0);
    expect(wallet!.accounts[0].address.startsWith("0x")).toBe(true);
    expect(wallet!.accounts[0].address.length).toBe(42);
  });
});
