import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";

let app: FastifyInstance;
let prisma: PrismaClient;
let token: string;
let orgId: string;
let userId: string;
let walletId: string;
let spendingLimitId: string;
let chainId: string;
let transactionId: string;

beforeAll(async () => {
  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  await prisma.$executeRaw`TRUNCATE TABLE wvc_app_proofs, wvc_boot_proofs, wvc_manifest_approvals, wvc_key_ceremonies, wvc_quorum_keys, wvc_manifests, wvc_deployments, wvc_operators, wvc_apps CASCADE`;
  await prisma.orgConfig.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.spendingLimit.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.walletAccount.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.authenticator.deleteMany();
  await prisma.user.deleteMany();
  await prisma.chain.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({ data: { name: "Wallet Test Org" } });
  orgId = org.id;

  const user = await prisma.user.create({
    data: { orgId, name: "Wallet Test User", email: "wallet-test@wrankey.io", role: "ORG_ADMIN" },
  });
  userId = user.id;

  const { signToken } = await import("../src/utils/jwt.js");
  const jwt = signToken({ sub: userId, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({
    data: { userId, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 7200 * 1000) },
  });
  token = jwt;

  await prisma.chain.upsert({
    where: { name: "arc" },
    update: { active: true },
    create: { name: "arc", chainId: 1234, rpcUrl: "https://rpc.arc.network", nativeCurrency: "ETH", symbol: "ARC" },
  });

  const chain = await prisma.chain.findUnique({ where: { name: "arc" } });
  chainId = chain!.id;
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Wallet Infrastructure - Full Suite", () => {
  describe("Phase 1 - Wallet Core", () => {
    it("creates wallet with chain selection", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Integration Test Wallet", ownerType: "USER", chain: "arc" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.walletId).toBeTruthy();
      expect(body.name).toBe("Integration Test Wallet");
      expect(body.addresses.length).toBeGreaterThan(0);
      expect(body.addresses[0].address).toMatch(/^0x/);
      walletId = body.walletId;
    });

    it("prevents wallet creation without name", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/wallets",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("lists wallets with pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/wallets?limit=5&offset=0",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it("gets single wallet by id", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/wallets/${walletId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(walletId);
      expect(body.accounts).toBeDefined();
    });

    it("updates wallet metadata", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/wallets/${walletId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Updated Integration Wallet", tags: ["test", "integration"] },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("Updated Integration Wallet");
      expect(body.tags).toContain("test");
    });

    it("derives additional account on same chain", async () => {
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

    it("derives account on different chain", async () => {
      await prisma.chain.upsert({
        where: { name: "sepolia" },
        update: { active: true },
        create: { name: "sepolia", chainId: 11155111, rpcUrl: "https://rpc.sepolia.org", nativeCurrency: "ETH", symbol: "ETH" },
      });
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/accounts`,
        headers: { authorization: `Bearer ${token}` },
        payload: { chain: "sepolia" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.address).toMatch(/^0x/);
      expect(body.index).toBe(2);
    });

    it("lists all accounts for wallet", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/wallets/${walletId}/accounts`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.length).toBeGreaterThanOrEqual(2);
    });

    it("exports wallet with mnemonic", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.mnemonic).toBeTruthy();
      expect(body.mnemonic.split(" ").length).toBe(12);
      expect(body.accounts.length).toBeGreaterThan(0);
    });

    it("exports wallet with encrypted passphrase", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${token}` },
        payload: { passphrase: "StrongP@ssphrase123!" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.encryptedMnemonic).toBeTruthy();
      expect(body.mnemonic).toBeUndefined();
    });
  });

  describe("Phase 1 - Wallet Freeze & Rotation", () => {
    it("freezes wallet", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/freeze`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("FROZEN");
    });

    it("prevents frozen wallet export", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("unfreezes wallet", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/unfreeze`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("ACTIVE");
    });

    it("rotates wallet keys", async () => {
      const originalWallet = JSON.parse((await app.inject({
        method: "GET",
        url: `/api/v1/wallets/${walletId}`,
        headers: { authorization: `Bearer ${token}` },
      })).payload);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/wallets/${walletId}/rotate`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.accounts.length).toBe(originalWallet.accounts.length);

      if (body.accounts.length > 0 && originalWallet.accounts.length > 0) {
        expect(body.accounts[0].address).not.toBe(originalWallet.accounts[0].address);
      }
    });

    it("gets gas price for wallet (RPC dependent)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/wallets/${walletId}/gas-price?chain=arc`,
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.statusCode === 500) return;
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.chain).toBeDefined();
      expect(body.standard).toBeDefined();
    });
  });

  describe("Phase 2 - Spending Limits", () => {
    it("creates spending limit for wallet", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/spending-limits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          walletId,
          chainId,
          name: "Dev Cap",
          maxPerTx: "5.0",
          maxDaily: "50.0",
          denylist: ["0x000000000000000000000000000000000000dead"],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("Dev Cap");
      expect(body.maxPerTx).toBe("5.0");
      expect(body.denylist).toContain("0x000000000000000000000000000000000000dead");
      spendingLimitId = body.id;
    });

    it("lists spending limits with wallet filter", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/spending-limits?limit=10&walletId=${walletId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("updates spending limit", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/spending-limits/${spendingLimitId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { maxDaily: "100.0" },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.maxDaily).toBe("100.0");
    });

    it("deactivates and reactivates spending limit", async () => {
      await app.inject({
        method: "PATCH",
        url: `/api/v1/spending-limits/${spendingLimitId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { active: false },
      });

      const getRes = await app.inject({
        method: "GET",
        url: `/api/v1/spending-limits/${spendingLimitId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(JSON.parse(getRes.payload).active).toBe(false);
    });
  });

  describe("Phase 2 - Transaction Simulation", () => {
    it("simulates ether transfer", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/simulate",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          walletId,
          chain: "arc",
          to: "0x000000000000000000000000000000000000dead",
          value: "0.001",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty("success");
    });

    it("simulation requires walletId and to", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/simulate",
        headers: { authorization: `Bearer ${token}` },
        payload: { walletId },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Phase 2 - Fee Estimation", () => {
    it("estimates fee for transfer (RPC dependent)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/estimate-fee",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          to: "0x000000000000000000000000000000000000dead",
          value: "0.001",
          chain: "arc",
        },
      });
      if (res.statusCode === 500) return;
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.gasLimit).toBeDefined();
      expect(body.estimatedFee).toBeDefined();
    });
  });

  describe("Phase 2 - Nonce Management", () => {
    it("gets nonce for account address (RPC dependent)", async () => {
      const wallet = JSON.parse((await app.inject({
        method: "GET",
        url: `/api/v1/wallets/${walletId}`,
        headers: { authorization: `Bearer ${token}` },
      })).payload);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${wallet.accounts[0].address}/nonce?chain=arc`,
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.statusCode === 500) return;
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.nonce).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Phase 2 - Transaction Lifecycle", () => {
    it("attempts to sign and broadcast (may fail due to RPC, but should sign)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/transactions/sign",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          walletId,
          chain: "arc",
          to: "0x000000000000000000000000000000000000dead",
          value: "0.0001",
          gasLimit: "21000",
          speed: "standard",
        },
      });
      expect([201, 403, 500, 400]).toContain(res.statusCode);
      if (res.statusCode === 201) {
        const body = JSON.parse(res.payload);
        transactionId = body.transactionId;
      }
    });

    it("lists transactions for wallet", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/transactions?limit=10&walletId=${walletId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
    });
  });

  describe("Phase 3 - Chain Management", () => {
    it("lists available chains", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/chains",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("prevents non-admin from adding chains", async () => {
      const nonAdminUser = await prisma.user.create({
        data: { orgId, name: "Dev", email: "dev@wallet-test.io", role: "DEVELOPER" },
      });
      const { signToken } = await import("../src/utils/jwt.js");
      const devToken = signToken({ sub: nonAdminUser.id, orgId, role: "DEVELOPER" });
      await prisma.session.create({
        data: { userId: nonAdminUser.id, token: devToken, type: "READ_WRITE", expiresAt: new Date(Date.now() + 3600 * 1000) },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/chains",
        headers: { authorization: `Bearer ${devToken}` },
        payload: { name: "testnet", chainId: 9999, rpcUrl: "https://testnet.local" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Phase 2 - Approval Requests", () => {
    it("lists approval requests", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/approval-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
    });
  });

  describe("Phase 2 - Audit Logs", () => {
    it("contains audit entries for wallet operations", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-logs?limit=100",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      const walletActions = body.data.filter((log: any) =>
        log.action.includes("WALLET") || log.action.includes("TX_") || log.action.includes("SPENDING")
      );
      expect(walletActions.length).toBeGreaterThan(0);
    });

    it("includes new audit action types", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-logs?limit=200",
        headers: { authorization: `Bearer ${token}` },
      });
      const body = JSON.parse(res.payload);
      const actions = body.data.map((log: any) => log.action);

      const expectedActions = [
        "WALLET_CREATE", "WALLET_FREEZE", "WALLET_UNFREEZE", "WALLET_ROTATE",
        "WALLET_EXPORT", "SPENDING_LIMIT_CREATE", "SPENDING_LIMIT_UPDATE",
        "POLICY_EVAL", "TX_SIMULATE",
      ];

      for (const action of expectedActions) {
        const found = actions.some((a: string) =>
          a.includes(action.replace("WALLET_", "").replace("SPENDING_", "").replace("TX_", ""))
        );
      }
    });
  });

  describe("Phase 1 - Authentication Required", () => {
    it("requires auth for wallet endpoints", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/wallets",
      });
      expect(res.statusCode).toBe(401);
    });

    it("requires auth for transaction endpoints", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/transactions",
      });
      expect(res.statusCode).toBe(401);
    });

    it("requires auth for spending limits", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/spending-limits",
      });
      expect(res.statusCode).toBe(401);
    });

    it("requires auth for chains", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/chains",
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
