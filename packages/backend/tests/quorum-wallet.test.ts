import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { cleanupOrg, runSuffix } from "./helpers";
import { signToken } from "../src/utils/jwt.js";

let app: FastifyInstance;
let prisma: PrismaClient;
let orgId = "";
let adminId = "";
let adminToken = "";
let admin2Id = "";
let admin2Token = "";
let admin3Id = "";
let admin3Token = "";
let walletId = "";
const suffix = runSuffix();

beforeAll(async () => {
  delete process.env.WVC_WALLET_SIGNER_DEPLOYMENT_ID;

  app = await buildApp({ disableRateLimit: true });
  await app.ready();

  prisma = new PrismaClient();
  await prisma.$connect();

  const org = await prisma.organization.create({ data: { name: `Quorum Test Org ${suffix}` } });
  orgId = org.id;

  const createUser = async (name: string, email: string, role = "ORG_ADMIN") => {
    const user = await prisma.user.create({ data: { orgId, name, email, role } });
    const jwt = signToken({ sub: user.id, orgId, role });
    await prisma.session.create({
      data: { userId: user.id, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 7200 * 1000) },
    });
    return { userId: user.id, token: jwt };
  };

  const u1 = await createUser("Quorum Admin 1", `quorum-admin1-${suffix}@wrankey.io`);
  adminId = u1.userId; adminToken = u1.token;

  const u2 = await createUser("Quorum Admin 2", `quorum-admin2-${suffix}@wrankey.io`);
  admin2Id = u2.userId; admin2Token = u2.token;

  const u3 = await createUser("Quorum Admin 3", `quorum-admin3-${suffix}@wrankey.io`);
  admin3Id = u3.userId; admin3Token = u3.token;

  await prisma.chain.upsert({
    where: { name: "arc" },
    update: { active: true },
    create: { name: "arc", chainId: 1234, rpcUrl: "https://rpc.arc.network", nativeCurrency: "ETH", symbol: "ARC" },
  });

  const walletRes = await app.inject({
    method: "POST",
    url: "/api/v1/wallets",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: `Quorum Test Wallet ${suffix}`, ownerType: "USER" },
  });
  walletId = JSON.parse(walletRes.payload).walletId;
});

afterAll(async () => {
  await cleanupOrg(prisma, orgId);
  await app.close();
  await prisma.$disconnect();
});

const setQuorum = async (memberIds: string[], threshold: number) => {
  await prisma.orgConfig.upsert({
    where: { orgId },
    update: { config: { rootQuorumMembers: memberIds, rootQuorumThreshold: threshold } },
    create: { orgId, config: { rootQuorumMembers: memberIds, rootQuorumThreshold: threshold } },
  });
};

const createNonQuorumAdmin = async () => {
  const user = await prisma.user.create({ data: { orgId, name: `Non Quorum ${suffix}`, email: `nonquorum-${suffix}@wrankey.io`, role: "ORG_ADMIN" } });
  const jwt = signToken({ sub: user.id, orgId, role: "ORG_ADMIN" });
  await prisma.session.create({ data: { userId: user.id, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 7200 * 1000) } });
  return jwt;
};

const createBasicUser = async () => {
  const user = await prisma.user.create({ data: { orgId, name: `Basic User ${suffix}`, email: `basic-${suffix}@wrankey.io`, role: "BASIC" } });
  const jwt = signToken({ sub: user.id, orgId, role: "BASIC" });
  await prisma.session.create({ data: { userId: user.id, token: jwt, type: "READ_WRITE", expiresAt: new Date(Date.now() + 7200 * 1000) } });
  return jwt;
};

describe("Wallet Quorum - Security Gate", () => {
  describe("No quorum configured (default-deny)", () => {
    it("blocks export when quorum is not configured", async () => {
      await setQuorum([], 1);
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${adminToken}` }, payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error.message).toContain("Root Quorum not configured");
    });

    it("blocks freeze when quorum is not configured", async () => {
      await setQuorum([], 1);
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/freeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error.message).toContain("Root Quorum not configured");
    });

    it("blocks unfreeze when quorum is not configured", async () => {
      await setQuorum([], 1);
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/unfreeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error.message).toContain("Root Quorum not configured");
    });

    it("blocks rotate when quorum is not configured", async () => {
      await setQuorum([], 1);
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/rotate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error.message).toContain("Root Quorum not configured");
    });
  });

  describe("Single-member quorum (threshold 1) — auto-approve", () => {
    beforeAll(async () => {
      await setQuorum([adminId], 1);
    });

    it("allows export with single-member quorum", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${adminToken}` }, payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.mnemonic).toBeTruthy();
      expect(body.mnemonic.split(/\s+/).length).toBeGreaterThanOrEqual(12);
    });

    it("allows freeze with single-member quorum", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/freeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).status).toBe("FROZEN");
    });

    it("allows unfreeze with single-member quorum", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/unfreeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).status).toBe("ACTIVE");
    });

    it("allows rotate with single-member quorum", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/rotate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("Multi-member quorum (2-of-3) — requires approval", () => {
    beforeAll(async () => {
      await setQuorum([adminId, admin2Id, admin3Id], 2);
    });

    it("returns AWAITING_APPROVAL for export", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${adminToken}` }, payload: {},
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("AWAITING_APPROVAL");
      expect(body.approvalId).toBeTruthy();
      expect(body.requiredApprovals).toBe(2);
    });

    it("returns AWAITING_APPROVAL for freeze", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/freeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).status).toBe("AWAITING_APPROVAL");
    });

    it("rejects non-quorum admin", async () => {
      const token = await createNonQuorumAdmin();
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${token}` }, payload: {},
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).error.message).toContain("not a Root Quorum member");
    });

    it("rejects non-admin user", async () => {
      const token = await createBasicUser();
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${token}` }, payload: {},
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("Full approval flow: request → approve → execute → retrieve", () => {
    let approvalId = "";

    beforeAll(async () => {
      await setQuorum([adminId, admin2Id, admin3Id], 2);
    });

    it("creates approval request for export", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { passphrase: "strong-passphrase-123" },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("AWAITING_APPROVAL");
      approvalId = body.approvalId;
    });

    it("shows approval in list with wallet info and correct action type", async () => {
      const res = await app.inject({
        method: "GET", url: `/api/v1/approval-requests?targetId=${walletId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const matching = body.data.filter((r: any) => r.id === approvalId);
      expect(matching.length).toBe(1);
      expect(matching[0].actionType).toBe("WALLET_EXPORT");
      expect(matching[0].wallet).toBeTruthy();
      expect(matching[0].status).toBe("PENDING");
    });

    it("first approval moves progress without executing", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${approvalId}/approve`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("PENDING");
      expect(body.approvedCount).toBe(1);
    });

    it("prevents duplicate approval", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${approvalId}/approve`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it("second approval executes export and stores result", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${approvalId}/approve`,
        headers: { authorization: `Bearer ${admin3Token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("APPROVED");
      expect(body.approvedCount).toBe(2);
    });

    it("result contains exported seed encrypted with passphrase", async () => {
      const res = await app.inject({
        method: "GET", url: `/api/v1/approval-requests/${approvalId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("APPROVED");
      expect(body.result).toBeTruthy();
      expect(body.result.walletId).toBe(walletId);
      expect(body.result.accounts).toBeTruthy();
      expect(body.result.encryptedMnemonic).toBeTruthy();
    });
  });

  describe("Approval — reject flow", () => {
    let approvalId = "";

    beforeAll(async () => {
      await setQuorum([adminId, admin2Id, admin3Id], 2);
      const res = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/export`,
        headers: { authorization: `Bearer ${adminToken}` }, payload: {},
      });
      approvalId = JSON.parse(res.payload).approvalId;
    });

    it("rejects approval request", async () => {
      const res = await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${approvalId}/reject`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).status).toBe("REJECTED");
    });

    it("approval shows as REJECTED in list", async () => {
      const res = await app.inject({
        method: "GET", url: `/api/v1/approval-requests/${approvalId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const body = JSON.parse(res.payload);
      expect(body.status).toBe("REJECTED");
      expect(body.rejectedBy).toContain(admin2Id);
    });
  });

  describe("Approval execution — freeze/unfreeze by approval", () => {
    beforeAll(async () => {
      await setQuorum([adminId, admin2Id, admin3Id], 2);
    });

    it("executes freeze via approval and verifies wallet status", async () => {
      const req = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/freeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const aid = JSON.parse(req.payload).approvalId;

      await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${aid}/approve`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });
      const a2 = await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${aid}/approve`,
        headers: { authorization: `Bearer ${admin3Token}` },
      });
      expect(JSON.parse(a2.payload).status).toBe("APPROVED");

      const wRes = await app.inject({
        method: "GET", url: `/api/v1/wallets/${walletId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(JSON.parse(wRes.payload).status).toBe("FROZEN");
    });

    it("executes unfreeze via approval and verifies wallet status", async () => {
      const req = await app.inject({
        method: "POST", url: `/api/v1/wallets/${walletId}/unfreeze`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const aid = JSON.parse(req.payload).approvalId;

      await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${aid}/approve`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });
      await app.inject({
        method: "POST", url: `/api/v1/approval-requests/${aid}/approve`,
        headers: { authorization: `Bearer ${admin3Token}` },
      });

      const wRes = await app.inject({
        method: "GET", url: `/api/v1/wallets/${walletId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(JSON.parse(wRes.payload).status).toBe("ACTIVE");
    });
  });
});
