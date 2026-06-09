import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";

vi.mock("@prisma/client", () => {
  const fn = () => vi.fn();
  return {
    PrismaClient: vi.fn(() => ({
      organization: { findUnique: fn(), create: fn(), findFirst: fn(), count: fn() },
      user: { findFirst: fn(), findUnique: fn(), create: fn(), update: fn(), updateMany: fn(), deleteMany: fn(), findMany: fn(), count: fn() },
      session: { create: fn(), findMany: fn(), deleteMany: fn(), count: fn() },
      authenticator: { findFirst: fn(), create: fn(), update: fn(), findMany: fn(), count: fn() },
      apiKey: { findFirst: fn(), create: fn(), findMany: fn(), deleteMany: fn(), count: fn() },
      wallet: { create: fn(), findMany: fn(), findFirst: fn(), updateMany: fn(), count: fn() },
      walletAccount: { findMany: fn(), create: fn(), count: fn() },
      transaction: { create: fn(), findFirst: fn(), findMany: fn(), update: fn(), count: fn() },
      policy: { create: fn(), findMany: fn(), deleteMany: fn(), count: fn() },
      agent: { create: fn(), findMany: fn(), findFirst: fn(), update: fn(), count: fn() },
      webhook: { create: fn(), findMany: fn(), deleteMany: fn(), count: fn() },
      auditLog: { create: fn(), findMany: fn(), count: fn() },
    })),
  };
});

const mockRedisInstance = {
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
};

vi.mock("../../src/redis.js", () => ({
  getRedis: vi.fn(() => mockRedisInstance),
  connectRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/utils/enclave.js", () => ({
  generateHdWallet: vi.fn(() => ({ mnemonic: "test test test test test test test test test test test junk", seed: "0xmockseed" })),
  generateHdWalletFromMnemonic: vi.fn(() => ({ seed: "0xmockseed" })),
  encryptSeedForStorage: vi.fn((s: string) => `enc:${s}`),
  decryptSeedFromStorage: vi.fn(() => "test test test test test test test test test test test junk"),
  deriveAccount: vi.fn(() => ({ address: "0x1234567890123456789012345678901234567890", privateKey: "0xmockprivkey" })),
  signTransaction: vi.fn().mockResolvedValue("0xsignedtx"),
  broadcastTransaction: vi.fn().mockResolvedValue({ hash: "0xabc123" }),
  getTransactionStatus: vi.fn().mockResolvedValue({ status: "CONFIRMED", confirmations: 5 }),
  getNonce: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../src/utils/audit.js", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/modules/webhook/routes.js", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return { ...actual, triggerWebhookEvents: vi.fn().mockResolvedValue(undefined) };
});

import { buildApp } from "../../src/app.js";
import { authHeader, TEST_ORG_ID, TEST_USER_ID, TEST_WALLET_ID, TEST_ADDRESS, mockPrismaData } from "../helpers.js";
import prisma from "../../src/db.js";

let app: Awaited<ReturnType<typeof buildApp>>;

describe("API Integration Tests", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = "test-jwt-secret-32chars-longxx";
    process.env.ENCRYPTION_KEY = "test-encryption-key-32chars-xx";
    app = await buildApp({ disableRateLimit: true });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("ok");
    });
  });

  describe("POST /api/v1/auth/email/send", () => {
    it("returns OTP in dev mode", async () => {
      process.env.NODE_ENV = "development";
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/email/send", payload: { email: "test@test.com" } });
      expect(res.statusCode).toBe(200);
      expect(res.json().otp).toBeDefined();
    });

    it("rejects missing email", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/email/send", payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/auth/email/verify", () => {
    it("creates user and returns session on valid OTP", async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(null);
      (prisma.organization.create as any).mockResolvedValue(mockPrismaData.organization);
      (prisma.user.findFirst as any).mockResolvedValue(mockPrismaData.user);
      (prisma.user.create as any).mockResolvedValue(mockPrismaData.user);
      (prisma.authenticator.findFirst as any).mockResolvedValue(null);
      (prisma.authenticator.create as any).mockResolvedValue({ id: "auth-1" });
      (prisma.session.create as any).mockResolvedValue(mockPrismaData.session);

      mockRedisInstance.get.mockResolvedValue("123456");

      const res = await app.inject({ method: "POST", url: "/api/v1/auth/email/verify", payload: { email: "test@test.com", otp: "123456" } });
      expect(res.statusCode).toBe(201);
      expect(res.json().sessionToken).toBeDefined();
    });

    it("rejects invalid OTP", async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const res = await app.inject({ method: "POST", url: "/api/v1/auth/email/verify", payload: { email: "test@test.com", otp: "000000" } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/auth/password/signup", () => {
    it("creates user with password", async () => {
      (prisma.user.findFirst as any).mockResolvedValue(null);
      (prisma.organization.create as any).mockResolvedValue(mockPrismaData.organization);
      (prisma.user.create as any).mockResolvedValue(mockPrismaData.user);
      (prisma.authenticator.create as any).mockResolvedValue({ id: "auth-1" });
      (prisma.session.create as any).mockResolvedValue(mockPrismaData.session);

      const res = await app.inject({ method: "POST", url: "/api/v1/auth/password/signup", payload: { email: "test@test.com", password: "password123" } });
      expect(res.statusCode).toBe(201);
      expect(res.json().sessionToken).toBeDefined();
    });

    it("rejects short password", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/password/signup", payload: { email: "test@test.com", password: "short" } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Protected routes", () => {
    it("rejects unauthenticated requests", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/wallets" });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("Wallet CRUD", () => {
    it("GET /api/v1/wallets lists wallets", async () => {
      (prisma.wallet.findMany as any).mockResolvedValue([mockPrismaData.wallet]);
      (prisma.wallet.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/wallets", headers: authHeader() });
      expect(res.statusCode).toBe(200);
      expect(res.json().wallets).toHaveLength(1);
    });

    it("POST /api/v1/wallets creates a wallet", async () => {
      (prisma.wallet.create as any).mockResolvedValue(mockPrismaData.wallet);
      const res = await app.inject({ method: "POST", url: "/api/v1/wallets", headers: authHeader(), payload: { name: "Test Wallet" } });
      expect(res.statusCode).toBe(201);
      expect(res.json().walletId).toBe(TEST_WALLET_ID);
    });

    it("GET /api/v1/wallets/:walletId returns wallet details", async () => {
      (prisma.wallet.findFirst as any).mockResolvedValue(mockPrismaData.wallet);
      const res = await app.inject({ method: "GET", url: `/api/v1/wallets/${TEST_WALLET_ID}`, headers: authHeader() });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(TEST_WALLET_ID);
    });

    it("DELETE /api/v1/wallets/:walletId soft-deletes wallet", async () => {
      (prisma.wallet.updateMany as any).mockResolvedValue({ count: 1 });
      const res = await app.inject({ method: "DELETE", url: `/api/v1/wallets/${TEST_WALLET_ID}`, headers: authHeader() });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("Policy CRUD", () => {
    it("POST /api/v1/policies creates a policy", async () => {
      (prisma.policy.create as any).mockResolvedValue(mockPrismaData.policy);
      const res = await app.inject({ method: "POST", url: "/api/v1/policies", headers: authHeader(), payload: { name: "Allow under 1000", effect: "EFFECT_ALLOW", conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }] } });
      expect(res.statusCode).toBe(201);
    });

    it("GET /api/v1/policies lists policies", async () => {
      (prisma.policy.findMany as any).mockResolvedValue([mockPrismaData.policy]);
      (prisma.policy.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/policies", headers: authHeader() });
      expect(res.statusCode).toBe(200);
      expect(res.json().policies).toHaveLength(1);
    });
  });

  describe("Agent CRUD", () => {
    it("POST /api/v1/agents creates an agent", async () => {
      (prisma.user.create as any).mockResolvedValue({ ...mockPrismaData.user, role: "AGENT" });
      (prisma.apiKey.create as any).mockResolvedValue({ id: "apikey-1", keyHash: "hash", keyPrefix: "arkey_abc" });
      (prisma.agent.create as any).mockResolvedValue(mockPrismaData.agent);
      const res = await app.inject({ method: "POST", url: "/api/v1/agents", headers: authHeader(), payload: { name: "Test Agent", permissions: ["wallet:sign"] } });
      expect(res.statusCode).toBe(201);
    });

    it("GET /api/v1/agents lists agents", async () => {
      (prisma.agent.findMany as any).mockResolvedValue([mockPrismaData.agent]);
      (prisma.agent.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/agents", headers: authHeader() });
      expect(res.statusCode).toBe(200);
      expect(res.json().agents).toHaveLength(1);
    });
  });

  describe("Webhook CRUD", () => {
    it("POST /api/v1/webhooks creates a webhook", async () => {
      (prisma.webhook.create as any).mockResolvedValue(mockPrismaData.webhook);
      const res = await app.inject({ method: "POST", url: "/api/v1/webhooks", headers: authHeader(), payload: { url: "https://example.com/webhook", events: ["wallet.created"] } });
      expect(res.statusCode).toBe(201);
    });

    it("rejects invalid events", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/webhooks", headers: authHeader(), payload: { url: "https://example.com/webhook", events: ["invalid.event"] } });
      expect(res.statusCode).toBe(400);
    });

    it("GET /api/v1/webhooks lists webhooks", async () => {
      (prisma.webhook.findMany as any).mockResolvedValue([mockPrismaData.webhook]);
      (prisma.webhook.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/webhooks", headers: authHeader() });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("User management", () => {
    it("GET /api/v1/users lists users", async () => {
      (prisma.user.findMany as any).mockResolvedValue([mockPrismaData.user]);
      (prisma.user.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/users", headers: authHeader() });
      expect(res.statusCode).toBe(200);
      expect(res.json().users).toHaveLength(1);
    });

    it("POST /api/v1/users creates a user", async () => {
      (prisma.user.create as any).mockResolvedValue(mockPrismaData.user);
      const res = await app.inject({ method: "POST", url: "/api/v1/users", headers: authHeader(), payload: { email: "new@test.com", role: "DEVELOPER" } });
      expect(res.statusCode).toBe(201);
    });
  });

  describe("Transaction signing", () => {
    it("POST /api/v1/transactions/sign signs and broadcasts", async () => {
      (prisma.wallet.findFirst as any).mockResolvedValue(mockPrismaData.wallet);
      (prisma.policy.findMany as any).mockResolvedValue([mockPrismaData.policy]);
      (prisma.transaction.create as any).mockResolvedValue(mockPrismaData.transaction);

      const res = await app.inject({ method: "POST", url: "/api/v1/transactions/sign", headers: authHeader(), payload: { walletId: TEST_WALLET_ID, to: TEST_ADDRESS, value: "500" } });
      expect(res.statusCode).toBe(201);
      expect(res.json().txHash).toBe("0xabc123");
    });

    it("rejects missing fields", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/transactions/sign", headers: authHeader(), payload: { walletId: TEST_WALLET_ID } });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Sessions and API Keys", () => {
    it("GET /api/v1/sessions lists active sessions", async () => {
      (prisma.session.findMany as any).mockResolvedValue([mockPrismaData.session]);
      (prisma.session.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/sessions", headers: authHeader() });
      expect(res.statusCode).toBe(200);
    });

    it("POST /api/v1/api-keys creates an API key", async () => {
      (prisma.apiKey.create as any).mockResolvedValue({ id: "k1", name: "Key", keyPrefix: "arkey_abc", permissions: ["*"], expiresAt: new Date() });
      const res = await app.inject({ method: "POST", url: "/api/v1/api-keys", headers: authHeader(), payload: { name: "Key" } });
      expect(res.statusCode).toBe(201);
    });

    it("GET /api/v1/api-keys lists API keys", async () => {
      (prisma.apiKey.findMany as any).mockResolvedValue([{ id: "k1", name: "Key", keyPrefix: "arkey_abc", permissions: ["*"], allowedIps: [], createdAt: new Date(), expiresAt: new Date() }]);
      (prisma.apiKey.count as any).mockResolvedValue(1);
      const res = await app.inject({ method: "GET", url: "/api/v1/api-keys", headers: authHeader() });
      expect(res.statusCode).toBe(200);
    });
  });
});
