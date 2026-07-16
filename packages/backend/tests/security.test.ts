import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { signToken } from "../../src/utils/jwt.js";
import { cleanupOrg, runSuffix } from "./helpers";

let app: FastifyInstance;
let prisma: PrismaClient;
let adminToken: string;
let devToken: string;
let orgId: string;
let adminUserId: string;
let devUserId: string;
const suffix = runSuffix();

beforeAll(async () => {
  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: `Security Test Org ${suffix}` } });
  orgId = org.id;

  const admin = await prisma.user.create({
    data: { orgId, name: "Admin", email: `admin-${suffix}@sec.test`, role: "ORG_ADMIN" },
  });
  adminUserId = admin.id;

  const dev = await prisma.user.create({
    data: { orgId, name: "Dev", email: `dev-${suffix}@sec.test`, role: "DEVELOPER" },
  });
  devUserId = dev.id;

  adminToken = signToken({ sub: adminUserId, orgId, role: "ORG_ADMIN" });
  devToken = signToken({ sub: devUserId, orgId, role: "DEVELOPER" });

  await prisma.session.create({
    data: { userId: adminUserId, token: adminToken, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  await prisma.session.create({
    data: { userId: devUserId, token: devToken, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
});

afterAll(async () => {
  await cleanupOrg(prisma, orgId);
  await app.close();
  await prisma.$disconnect();
});

describe("Security — Config role check + secret redaction (S2)", () => {
  it("PATCH /configuration requires ORG_ADMIN (DEVELOPER gets 403)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${devToken}` },
      payload: { appName: "Hacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH /configuration succeeds for ORG_ADMIN", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { appName: "My Org" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.appName).toBe("My Org");
  });

  it("GET /configuration redacts OAuth client secrets", async () => {
    // First, set an OAuth credential with a secret
    await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        oauthCredentials: [{ provider: "google", clientId: "abc", clientSecret: "super-secret-value", credentialId: "cred1" }],
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${devToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const cred = body.oauthCredentials?.[0];
    expect(cred).toBeDefined();
    expect(cred.clientSecret).toBe("***REDACTED***");
    expect(cred.clientSecret).not.toBe("super-secret-value");
  });

  it("GET /configuration redacts on-ramp private keys", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        onRampProviders: [{ provider: "stripe", publishableKey: "pk_test", secretKey: "sk_secret", privateKey: "priv_key", projectId: "proj1", environment: "test", credentialId: "cred2" }],
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/configuration",
      headers: { authorization: `Bearer ${devToken}` },
    });
    const body = JSON.parse(res.payload);
    const provider = body.onRampProviders?.[0];
    expect(provider).toBeDefined();
    expect(provider.secretKey).toBe("***REDACTED***");
    expect(provider.privateKey).toBe("***REDACTED***");
  });
});

describe("Security — Quorum role check (S3)", () => {
  it("PUT /quorum requires ORG_ADMIN (DEVELOPER gets 403)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/quorum",
      headers: { authorization: `Bearer ${devToken}` },
      payload: { memberIds: [], threshold: 1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PUT /quorum succeeds for ORG_ADMIN", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/quorum",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { memberIds: [adminUserId], threshold: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.threshold).toBe(1);
  });
});

describe("Security — Agent revocation kills sessions (S5)", () => {
  it("revoking an agent deletes its user's active sessions", async () => {
    // Create an agent
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Test Agent" },
    });
    expect(createRes.statusCode).toBe(201);
    const agentBody = JSON.parse(createRes.payload);
    const agentId = agentBody.agent.id;
    const agentUserId = agentBody.credentials.userId;

    // Create a session for the agent's user
    const agentSessionToken = signToken({ sub: agentUserId, orgId, role: "AGENT" });
    await prisma.session.create({
      data: { userId: agentUserId, token: agentSessionToken, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
    });

    // Verify session exists
    const beforeSessions = await prisma.session.findMany({ where: { userId: agentUserId, expiresAt: { gt: new Date() } } });
    expect(beforeSessions.length).toBeGreaterThan(0);

    // Revoke the agent
    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/api/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    // Verify sessions are deleted
    const afterSessions = await prisma.session.findMany({ where: { userId: agentUserId, expiresAt: { gt: new Date() } } });
    expect(afterSessions.length).toBe(0);
  });
});

describe("Security — Sub-org impersonation (S4)", () => {
  it("impersonating a sub-org with no users returns an error (no phantom admin)", async () => {
    // Create a sub-org
    const subOrgRes = await app.inject({
      method: "POST",
      url: "/api/v1/sub-orgs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: `Empty Sub-Org ${suffix}` },
    });
    expect(subOrgRes.statusCode).toBe(201);
    const subOrgId = JSON.parse(subOrgRes.payload).id;

    // Try to impersonate — should fail because no users exist
    const impersonateRes = await app.inject({
      method: "POST",
      url: `/api/v1/sub-orgs/${subOrgId}/impersonate`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(impersonateRes.statusCode).toBe(400);
    const body = JSON.parse(impersonateRes.payload);
    expect(body.error.message).toMatch(/no users/i);
  });
});
