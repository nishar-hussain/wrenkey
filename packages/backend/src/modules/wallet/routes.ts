import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
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
import { ethers } from "ethers";

export async function walletRoutes(app: FastifyInstance) {
  // Create wallet
  app.post("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, ownerType, ownerId, tags } = request.body as {
        name: string;
        ownerType?: string;
        ownerId?: string;
        tags?: string[];
      };
      if (!name) throw new ValidationError("Wallet name is required");

      // Generate HD wallet inside enclave
      const { mnemonic } = generateHdWallet();
      const encryptedSeed = encryptSeedForStorage(mnemonic);

      // Derive first address
      const hdNode = deriveAccount(mnemonic, 0);
      const derivationPath = "m/44'/60'/0'/0/0";

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
              derivationPath,
              index: 0,
            },
          },
        },
        include: { accounts: true },
      });

      await createAuditLog(
        request.orgId,
        "WALLET_CREATE",
        { walletId: wallet.id, name, address: hdNode.address },
        request.userId,
        request
      );

      triggerWebhookEvents(request.orgId, "wallet.created", {
        walletId: wallet.id,
        name,
        address: hdNode.address,
        ownerType: wallet.ownerType,
        ownerId: wallet.ownerId,
      });

      return sendSuccess(reply, {
        walletId: wallet.id,
        name: wallet.name,
        ownerType: wallet.ownerType,
        ownerId: wallet.ownerId,
        addresses: wallet.accounts.map((a) => ({
          chain: a.chain,
          address: a.address,
          derivationPath: a.derivationPath,
          index: a.index,
        })),
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Import wallet
  app.post("/wallets/import", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, mnemonic, ownerType, ownerId } = request.body as {
        name: string;
        mnemonic: string;
        ownerType?: string;
        ownerId?: string;
      };
      if (!name || !mnemonic) throw new ValidationError("Name and mnemonic are required");

      const { seed } = generateHdWalletFromMnemonic(mnemonic);
      const encryptedSeed = encryptSeedForStorage(mnemonic);
      const hdNode = deriveAccount(mnemonic, 0);

      const wallet = await prisma.wallet.create({
        data: {
          orgId: request.orgId,
          ownerType: ownerType || "USER",
          ownerId: ownerId || request.userId!,
          userId: request.userId,
          name,
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

      await createAuditLog(request.orgId, "WALLET_IMPORT", { walletId: wallet.id, name }, request.userId, request);

      triggerWebhookEvents(request.orgId, "wallet.imported", {
        walletId: wallet.id,
        name,
        address: hdNode.address,
      });

      return sendSuccess(reply, {
        walletId: wallet.id,
        name: wallet.name,
        addresses: wallet.accounts.map((a) => ({
          chain: a.chain,
          address: a.address,
          derivationPath: a.derivationPath,
          index: a.index,
        })),
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List wallets
  app.get("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [wallets, total] = await Promise.all([
        prisma.wallet.findMany({
          where: { orgId: request.orgId, status: "ACTIVE" },
          include: {
            accounts: { select: { id: true, chain: true, address: true, derivationPath: true, index: true } },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.wallet.count({ where: { orgId: request.orgId, status: "ACTIVE" } }),
      ]);
      return sendSuccess(reply, { wallets, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get wallet details
  app.get("/wallets/:walletId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId } = request.params as { walletId: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: {
          accounts: { select: { id: true, chain: true, address: true, derivationPath: true, index: true } },
        },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      return sendSuccess(reply, wallet);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Delete wallet
  app.delete("/wallets/:walletId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId } = request.params as { walletId: string };
      await prisma.wallet.updateMany({
        where: { id: walletId, orgId: request.orgId },
        data: { status: "DELETED" },
      });
      await createAuditLog(request.orgId, "WALLET_DELETE", { walletId }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.deleted", { walletId });
      return sendSuccess(reply, { message: "Wallet deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Export wallet (High-risk, requires policy approval in production)
  app.post("/wallets/:walletId/export", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId } = request.params as { walletId: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.userId !== request.userId && request.auth.role !== "ORG_ADMIN") {
        throw new ForbiddenError("Only wallet owner or admin can export");
      }
      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      await createAuditLog(request.orgId, "WALLET_EXPORT", { walletId }, request.userId, request);
      return sendSuccess(reply, { mnemonic });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Derive new account for wallet
  app.post("/wallets/:walletId/accounts", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId } = request.params as { walletId: string };
      const { chain } = request.body as { chain?: string };

      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: { accounts: true },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const nextIndex = wallet.accounts.length;
      const hdNode = deriveAccount(mnemonic, nextIndex);
      const derivationPath = `m/44'/60'/0'/0/${nextIndex}`;

      const account = await prisma.walletAccount.create({
        data: {
          walletId,
          chain: chain || "arc",
          address: hdNode.address,
          derivationPath,
          index: nextIndex,
        },
      });

      await createAuditLog(request.orgId, "ACCOUNT_CREATE", { walletId, accountId: account.id, address: account.address }, request.userId, request);

      triggerWebhookEvents(request.orgId, "account.created", {
        walletId,
        accountId: account.id,
        chain: account.chain,
        address: account.address,
        derivationPath: account.derivationPath,
        index: account.index,
      });

      return sendSuccess(reply, account, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List accounts for wallet
  app.get("/wallets/:walletId/accounts", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId } = request.params as { walletId: string };
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [accounts, total] = await Promise.all([
        prisma.walletAccount.findMany({
          where: { walletId },
          orderBy: { index: "asc" },
          take: limit,
          skip: offset,
        }),
        prisma.walletAccount.count({ where: { walletId } }),
      ]);
      return sendSuccess(reply, { accounts, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get nonce for account
  app.get("/accounts/:address/nonce", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { address } = request.params as { address: string };
      const { getNonce } = await import("../../utils/enclave.js");
      const nonce = await getNonce(address, config.arcRpcUrl);
      return sendSuccess(reply, { address, nonce });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get balance for account
  app.get("/accounts/:address/balance", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { address } = request.params as { address: string };
      const provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
      const balance = await provider.getBalance(address);
      return sendSuccess(reply, {
        address,
        balance: balance.toString(),
        balanceFormatted: ethers.formatEther(balance),
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
