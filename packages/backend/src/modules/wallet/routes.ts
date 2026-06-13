import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import {
  generateHdWallet,
  generateHdWalletFromMnemonic,
  encryptSeedForStorage,
  decryptSeedFromStorage,
  deriveAccount,
} from "../../utils/enclave.js";
import { triggerWebhookEvents } from "../webhook/routes.js";

export async function walletRoutes(app: FastifyInstance) {
  // Create wallet
  app.post("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, ownerType, ownerId, tags } = request.body as {
        name: string; ownerType?: string; ownerId?: string; tags?: string[];
      };
      if (!name) throw new ValidationError("Wallet name is required");

      const { mnemonic } = generateHdWallet();
      const encryptedSeed = encryptSeedForStorage(mnemonic);
      const hdNode = deriveAccount(mnemonic, 0);

      const wallet = await prisma.wallet.create({
        data: {
          orgId: request.orgId,
          ownerType: ownerType || "USER",
          ownerId: ownerId || request.userId!,
          userId: request.userId,
          name,
          tags: tags || [],
          encryptedSeed,
          accounts: {
            create: {
              chain: "arc",
              address: hdNode.address,
              derivationPath: "m/44'/60'/0'/0/0",
              index: 0,
            },
          },
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_CREATE", { walletId: wallet.id, name, address: hdNode.address }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.created", { walletId: wallet.id, name, address: hdNode.address, ownerType: wallet.ownerType, ownerId: wallet.ownerId });

      return sendSuccess(reply, {
        walletId: wallet.id, name: wallet.name, ownerType: wallet.ownerType, ownerId: wallet.ownerId,
        addresses: wallet.accounts.map((a) => ({ chain: a.chain, address: a.address, derivationPath: a.derivationPath, index: a.index })),
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Import wallet
  app.post("/wallets/import", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, mnemonic, ownerType, ownerId } = request.body as {
        name: string; mnemonic: string; ownerType?: string; ownerId?: string;
      };
      if (!name || !mnemonic) throw new ValidationError("Name and mnemonic required");

      generateHdWalletFromMnemonic(mnemonic);
      const encryptedSeed = encryptSeedForStorage(mnemonic);
      const hdNode = deriveAccount(mnemonic, 0);

      const wallet = await prisma.wallet.create({
        data: {
          orgId: request.orgId, ownerType: ownerType || "USER",
          ownerId: ownerId || request.userId!, userId: request.userId, name, encryptedSeed,
          accounts: { create: { chain: "arc", address: hdNode.address, derivationPath: "m/44'/60'/0'/0/0", index: 0 } },
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_IMPORT", { walletId: wallet.id, name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.imported", { walletId: wallet.id, name, address: hdNode.address });

      return sendSuccess(reply, {
        walletId: wallet.id, name: wallet.name,
        addresses: wallet.accounts.map((a) => ({ chain: a.chain, address: a.address, derivationPath: a.derivationPath, index: a.index })),
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List wallets
  app.get("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [data, total] = await Promise.all([
        prisma.wallet.findMany({
          where: { orgId: request.orgId },
          include: { accounts: { select: { id: true, chain: true, address: true, derivationPath: true, index: true } } },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.wallet.count({ where: { orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get wallet
  app.get("/wallets/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: true },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      return sendSuccess(reply, wallet);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Delete wallet
  app.delete("/wallets/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await prisma.wallet.deleteMany({ where: { id, orgId: request.orgId } });
      await createAuditLog(request.orgId, "WALLET_DELETE", { walletId: id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.deleted", { walletId: id });
      return sendSuccess(reply, { message: "Wallet deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Derive new account
  app.post("/wallets/:id/accounts", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { chain } = request.body as { chain?: string };

      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      const { decryptSeedFromStorage, deriveAccount } = await import("../../utils/enclave.js");
      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const count = await prisma.walletAccount.count({ where: { walletId: id } });
      const hdNode = deriveAccount(mnemonic, count);

      const account = await prisma.walletAccount.create({
        data: {
          walletId: id, chain: chain || "arc", address: hdNode.address,
          derivationPath: `m/44'/60'/0'/0/${count}`, index: count,
        },
      });

      await createAuditLog(request.orgId, "ACCOUNT_CREATE", { walletId: id, accountId: account.id, address: account.address }, request.userId, request);
      triggerWebhookEvents(request.orgId, "account.created", { walletId: id, accountId: account.id, address: account.address, chain: account.chain });

      return sendSuccess(reply, account, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Update wallet
  app.patch("/wallets/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, tags, status } = request.body as { name?: string; tags?: string[]; status?: string };
      if (!name && !tags && !status) throw new ValidationError("No fields to update");

      const result = await prisma.wallet.updateMany({
        where: { id, orgId: request.orgId },
        data: { ...(name && { name }), ...(tags && { tags }), ...(status && { status }) },
      });
      if (result.count === 0) throw new NotFoundError("Wallet");
      const wallet = await prisma.wallet.findFirst({ where: { id }, include: { accounts: true } });
      return sendSuccess(reply, wallet);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List accounts
  app.get("/wallets/:id/accounts", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const accounts = await prisma.walletAccount.findMany({ where: { walletId: id }, orderBy: { index: "asc" } });
      return sendSuccess(reply, accounts);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Export wallet (reveal mnemonic)
  app.post("/wallets/:id/export", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);

      await createAuditLog(request.orgId, "WALLET_EXPORT", { walletId: id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.exported", { walletId: id });

      return sendSuccess(reply, {
        walletId: wallet.id,
        mnemonic,
        accounts: await prisma.walletAccount.findMany({
          where: { walletId: id },
          select: { chain: true, address: true, derivationPath: true, index: true },
          orderBy: { index: "asc" },
        }),
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
