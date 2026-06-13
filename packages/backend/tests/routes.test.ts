import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../../src/app";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let walletId: string;

beforeAll(async () => {
  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  // Clean up any test leftovers
  await prisma.auditLog.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.walletAccount.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authenticator.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // Create test org + user + session
  const org = await prisma.organization.create({ data: { name: "Test Org" } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "Test User", email: "test@route.test", role: "ORG_ADMIN" },
  });
  userId = user.id;

  // Create session directly
  const { signToken } = await import("../../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
  });
  token = jwt;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Wallet Routes", () => {
  it("POST /wallets creates a wallet", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/wallets",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Test Wallet" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.walletId).toBeTruthy();
    expect(body.name).toBe("Test Wallet");
    expect(body.addresses.length).toBeGreaterThan(0);
    expect(body.addresses[0].address).toMatch(/^0x/);
    walletId = body.walletId;
  });

  it("POST /wallets validates name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/wallets",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /wallets lists wallets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/wallets",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThan(0);
  });

  it("GET /wallets/:id returns wallet", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wallets/${walletId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe(walletId);
  });

  it("PATCH /wallets/:id updates wallet", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/wallets/${walletId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Updated Wallet" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe("Updated Wallet");
  });

  it("POST /wallets/:id/accounts derives new account", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wallets/${walletId}/accounts`,
      headers: { authorization: `Bearer ${token}` },
      payload: { chain: "arc" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.address).toMatch(/^0x/);
    expect(body.index).toBe(1);
  });

  it("GET /wallets/:id/accounts lists accounts", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/wallets/${walletId}/accounts`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  it("POST /wallets/:id/export reveals mnemonic", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/wallets/${walletId}/export`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.mnemonic).toBeTruthy();
    expect(body.mnemonic.split(" ").length).toBe(12);
    expect(body.accounts.length).toBeGreaterThan(0);
  });

  it("DELETE /wallets/:id deletes wallet", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/wallets/${walletId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("Organization Routes", () => {
  it("GET /orgs returns user's org only", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/orgs",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(orgId);
  });

  it("GET /orgs/:orgId returns org", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/orgs/${orgId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe("Test Org");
  });
});

describe("User Routes", () => {
  it("POST /users creates user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Dev User", email: "dev@route.test", role: "DEVELOPER" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe("Dev User");
    expect(body.role).toBe("DEVELOPER");
  });

  it("GET /users lists users", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/users",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("PATCH /users/:id updates user", async () => {
    const users = JSON.parse((
      await app.inject({
        method: "GET",
        url: "/api/v1/users?limit=50",
        headers: { authorization: `Bearer ${token}` },
      })
    ).payload).data;
    const devUser = users.find((u: any) => u.email === "dev@route.test");
    expect(devUser).toBeTruthy();

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${devUser.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Updated Dev" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /users/:id deletes user", async () => {
    const users = JSON.parse((
      await app.inject({
        method: "GET",
        url: "/api/v1/users?limit=50",
        headers: { authorization: `Bearer ${token}` },
      })
    ).payload).data;
    const devUser = users.find((u: any) => u.email === "dev@route.test");
    if (devUser) {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/users/${devUser.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe("Agent Routes", () => {
  let agentId: string;

  it("POST /agents creates agent with credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Test Agent", permissions: ["wallet:sign"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.agent.name).toBe("Test Agent");
    expect(body.credentials.apiKey).toBeTruthy();
    expect(body.credentials.apiKey.startsWith("wrankey_")).toBe(true);
    agentId = body.agent.id;
  });

  it("GET /agents lists agents", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/agents",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("GET /agents/:id returns agent", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.name).toBe("Test Agent");
  });

  it("DELETE /agents/:id revokes agent", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("validates agent name required", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/agents",
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Webhook Routes", () => {
  let webhookId: string;

  it("POST /webhooks creates webhook", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: "https://example.com/webhook", events: ["user.login", "wallet.created"] },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.url).toBe("https://example.com/webhook");
    expect(body.hmacSecret).toBeTruthy();
    webhookId = body.id;
  });

  it("GET /webhooks lists webhooks", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/webhooks",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("PATCH /webhooks/:id updates webhook", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/webhooks/${webhookId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { active: false },
    });
    expect(res.statusCode).toBe(200);
  });

  it("validates webhook url required", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: { events: ["user.login"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("validates webhook events required", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks",
      headers: { authorization: `Bearer ${token}` },
      payload: { url: "https://example.com" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /webhooks/:id deletes webhook", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/webhooks/${webhookId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("Audit Log Routes", () => {
  it("GET /audit-logs returns paginated logs", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs?limit=10&offset=0",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.total).toBeGreaterThan(0);
    expect(body.limit).toBe(10);
  });
});
