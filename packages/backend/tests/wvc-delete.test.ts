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

  const org = await prisma.organization.create({ data: { name: "WVC Delete Test Org" } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "Delete Admin", email: "delete@test.local", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;

  operatorKeys = generateOperatorKeyPair();

  // Create app with 1 required approval for speed
  const appRes = await app.inject({
    method: "POST",
    url: "/api/v1/wvc/apps",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Delete Test App", requiredApprovals: 1 },
  });
  appId = JSON.parse(appRes.body).id;

  // Add operator
  const opRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/operators`,
    headers: { authorization: `Bearer ${token}` },
    payload: { alias: "del-op", publicKey: operatorKeys.publicKeyPem },
  });
  operatorId = JSON.parse(opRes.body).id;

  // Create deployment
  const deployRes = await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/deployments`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      imageUrl: "ghcr.io/test/app:v1@sha256:abcd",
      executablePath: "/app/main",
      executableDigest: "sha256:1234",
      expectedPcr0: "0".repeat(64),
      expectedPcr1: "0".repeat(63) + "1",
      expectedPcr2: "0".repeat(63) + "2",
      ingressPort: 3000,
      healthPort: 3000,
      cpuCount: 2,
      memoryMib: 1024,
      replicaCount: 2,
    },
  });
  const deployBody = JSON.parse(deployRes.body);
  deploymentId = deployBody.deploymentId;
  manifestId = deployBody.manifestId;

  // Approve manifest
  const manifestRes = await app.inject({
    method: "GET",
    url: `/api/v1/wvc/manifests/${manifestId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  const manifestHash = JSON.parse(manifestRes.body).manifestHash;
  const signature = signWithOperatorKey(operatorKeys.privateKeyPem, manifestHash);
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/manifests/${manifestId}/approve`,
    headers: { authorization: `Bearer ${token}` },
    payload: { operatorId, signature },
  });

  // Provision to create boot proofs + quorum key
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/deployments/${deploymentId}/provision`,
    headers: { authorization: `Bearer ${token}` },
  });

  // Set live and invoke to create app proofs
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/deployments/${deploymentId}/set-live`,
    headers: { authorization: `Bearer ${token}` },
  });
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/deployments/${deploymentId}/invoke`,
    headers: { authorization: `Bearer ${token}` },
    payload: { payloadType: "generate_seed" },
  });

  // Create a ceremony
  await app.inject({
    method: "POST",
    url: `/api/v1/wvc/apps/${appId}/quorum-key/ceremonies`,
    headers: { authorization: `Bearer ${token}` },
    payload: { ceremonyType: "bootstrap", participatingOperators: [operatorId] },
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

describe("WVC App Deletion Cascade (PRD §9.2)", () => {
  it("verifies child records exist before deletion", async () => {
    const app = await prisma.wvcApp.findFirst({
      where: { id: appId },
      include: {
        deployments: true,
        operators: true,
        keyCeremonies: true,
        _count: { select: { deployments: true, operators: true } },
      },
    });
    expect(app).toBeTruthy();
    expect(app!.deployments.length).toBeGreaterThanOrEqual(1);
    expect(app!.operators.length).toBe(1);
    expect(app!.keyCeremonies.length).toBeGreaterThanOrEqual(1);
  });

  it("verifies proofs exist before deletion", async () => {
    const bootProofs = await prisma.wvcBootProof.count({
      where: { deployment: { appId } },
    });
    expect(bootProofs).toBeGreaterThanOrEqual(2); // replicaCount=2

    const appProofs = await prisma.wvcAppProof.count({
      where: { deployment: { appId } },
    });
    expect(appProofs).toBeGreaterThanOrEqual(1); // from invoke
  });

  it("DELETE /wvc/apps/:appId removes all child records atomically", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/wvc/apps/${appId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);
  });

  it("verifies no orphaned records remain after deletion", async () => {
    const deployments = await prisma.wvcDeployment.count({ where: { appId } });
    const manifests = await prisma.wvcManifest.count({ where: { appId } });
    const operators = await prisma.wvcOperator.count({ where: { appId } });
    const ceremonies = await prisma.wvcKeyCeremony.count({ where: { appId } });
    const quorumKeys = await prisma.wvcQuorumKey.count({ where: { appId } });
    const appProofs = await prisma.wvcAppProof.count({
      where: { deployment: { appId } },
    });
    const bootProofs = await prisma.wvcBootProof.count({
      where: { deployment: { appId } },
    });
    const approvals = await prisma.wvcManifestApproval.count({
      where: { manifest: { appId } },
    });

    expect(deployments).toBe(0);
    expect(manifests).toBe(0);
    expect(operators).toBe(0);
    expect(ceremonies).toBe(0);
    expect(quorumKeys).toBe(0);
    expect(appProofs).toBe(0);
    expect(bootProofs).toBe(0);
    expect(approvals).toBe(0);
  });

  it("verifies the app itself is gone", async () => {
    const appRecord = await prisma.wvcApp.findFirst({ where: { id: appId } });
    expect(appRecord).toBeNull();
  });
});
