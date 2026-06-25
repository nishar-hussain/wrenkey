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
  encryptSeedWithPassphrase,
  getGasPrice,
} from "../../utils/enclave.js";
import { getChainByName, getDefaultChain } from "../../services/chain.js";
import { getTokenBalances } from "../../services/tokens.js";
import { triggerWebhookEvents } from "../webhook/routes.js";

export async function walletRoutes(app: FastifyInstance) {
  app.post("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, ownerType, ownerId, tags, chain } = request.body as {
        name: string; ownerType?: string; ownerId?: string; tags?: string[]; chain?: string;
      };
      if (!name) throw new ValidationError("Wallet name is required");

      const chainInfo = chain ? (await getChainByName(chain).catch(() => null)) || await getDefaultChain() : await getDefaultChain();
      if (!chainInfo) throw new ValidationError("Invalid or no active chain found");

      const { mnemonic } = generateHdWallet();
      const encryptedSeed = encryptSeedForStorage(mnemonic);
      const fullPath = `${chainInfo.derivationPath}/0`;
      const hdNode = deriveAccount(mnemonic, 0, chainInfo.derivationPath);

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
              chainId: chainInfo.id,
              address: hdNode.address,
              derivationPath: fullPath,
              index: 0,
            },
          },
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_CREATE", { walletId: wallet.id, name, address: hdNode.address, chain: chainInfo.name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.created", { walletId: wallet.id, name, address: hdNode.address, chain: chainInfo.name, ownerType: wallet.ownerType, ownerId: wallet.ownerId });

      return sendSuccess(reply, {
        walletId: wallet.id, name: wallet.name, ownerType: wallet.ownerType, ownerId: wallet.ownerId,
        addresses: wallet.accounts.map((a: any) => ({ chainId: a.chainId, address: a.address, derivationPath: a.derivationPath, index: a.index })),
      }, 201);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[wallet.create] Error:", (err as any)?.message, (err as any)?.stack);
      }
      return sendError(reply, err);
    }
  });

  app.post("/wallets/import", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, mnemonic, ownerType, ownerId, chain } = request.body as {
        name: string; mnemonic: string; ownerType?: string; ownerId?: string; chain?: string;
      };
      if (!name || !mnemonic) throw new ValidationError("Name and mnemonic required");

      const words = mnemonic.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        throw new ValidationError(`Invalid mnemonic: expected 12 or 24 words, got ${words.length}`);
      }

      try {
        generateHdWalletFromMnemonic(mnemonic);
      } catch (mnemErr: any) {
        throw new ValidationError(`Invalid recovery phrase: ${mnemErr.shortMessage || mnemErr.message}`);
      }

      const chainInfo = chain ? (await getChainByName(chain).catch(() => null)) || await getDefaultChain() : await getDefaultChain();
      if (!chainInfo) throw new ValidationError("Invalid or no active chain found");

      const encryptedSeed = encryptSeedForStorage(mnemonic);
      const fullPath = `${chainInfo.derivationPath}/0`;
      const hdNode = deriveAccount(mnemonic, 0, chainInfo.derivationPath);

      const wallet = await prisma.wallet.create({
        data: {
          orgId: request.orgId, ownerType: ownerType || "USER",
          ownerId: ownerId || request.userId!, userId: request.userId, name, encryptedSeed,
          accounts: { create: { chainId: chainInfo.id, address: hdNode.address, derivationPath: fullPath, index: 0 } },
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_IMPORT", { walletId: wallet.id, name, chain: chainInfo.name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.imported", { walletId: wallet.id, name, address: hdNode.address, chain: chainInfo.name });

      return sendSuccess(reply, {
        walletId: wallet.id, name: wallet.name,
        addresses: wallet.accounts.map((a: any) => ({ chainId: a.chainId, address: a.address, derivationPath: a.derivationPath, index: a.index })),
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { status, search } = request.query as { status?: string; search?: string };

      const where: any = { orgId: request.orgId };
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { accounts: { some: { address: { contains: search } } } },
        ];
      }

      const [data, total] = await Promise.all([
        prisma.wallet.findMany({
          where,
          include: { accounts: { select: { id: true, chainId: true, address: true, derivationPath: true, index: true } } },
          orderBy: { createdAt: "desc" }, take: limit, skip: offset,
        }),
        prisma.wallet.count({ where }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/wallets/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: { include: { chain: true } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      return sendSuccess(reply, wallet);
    } catch (err) {
      return sendError(reply, err);
    }
  });

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

  app.post("/wallets/:id/accounts", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { chain: chainName } = request.body as { chain?: string };

      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      const chainInfo = chainName ? await getChainByName(chainName).catch(() => null) : await getDefaultChain();
      if (!chainInfo) throw new ValidationError("Invalid or no active chain found");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const count = await prisma.walletAccount.count({ where: { walletId: id } });
      const fullPath = `${chainInfo.derivationPath}/${count}`;
      const hdNode = deriveAccount(mnemonic, count, chainInfo.derivationPath);

      const account = await prisma.walletAccount.create({
        data: {
          walletId: id, chainId: chainInfo.id, address: hdNode.address,
          derivationPath: fullPath, index: count,
        },
      });

      await createAuditLog(request.orgId, "ACCOUNT_CREATE", { walletId: id, accountId: account.id, address: account.address, chain: chainInfo.name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "account.created", { walletId: id, accountId: account.id, address: account.address, chain: chainInfo.name });

      return sendSuccess(reply, account, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/wallets/:id/accounts", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const accounts = await prisma.walletAccount.findMany({
        where: { walletId: id },
        include: { chain: { select: { name: true, chainId: true, symbol: true } } },
        orderBy: { index: "asc" },
      });
      return sendSuccess(reply, accounts);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/wallets/:id/export", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { passphrase?: string };
      const passphrase = body.passphrase;

      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      if (wallet.status === "FROZEN") throw new ValidationError("Cannot export a frozen wallet");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);

      const exportPayload: any = {
        walletId: wallet.id,
        accounts: await prisma.walletAccount.findMany({
          where: { walletId: id },
          select: { chainId: true, address: true, derivationPath: true, index: true },
          orderBy: { index: "asc" },
        }),
      };

      if (passphrase) {
        exportPayload.encryptedMnemonic = encryptSeedWithPassphrase(mnemonic, passphrase);
      } else {
        exportPayload.mnemonic = mnemonic;
      }

      await createAuditLog(request.orgId, "WALLET_EXPORT", { walletId: id, encrypted: !!passphrase }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.exported", { walletId: id });

      return sendSuccess(reply, exportPayload);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/wallets/:id/freeze", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      await prisma.wallet.update({
        where: { id },
        data: { status: "FROZEN" },
      });

      await createAuditLog(request.orgId, "WALLET_FREEZE", { walletId: id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.frozen", { walletId: id });

      return sendSuccess(reply, { walletId: id, status: "FROZEN" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/wallets/:id/unfreeze", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      await prisma.wallet.update({
        where: { id },
        data: { status: "ACTIVE" },
      });

      await createAuditLog(request.orgId, "WALLET_UNFREEZE", { walletId: id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.unfrozen", { walletId: id });

      return sendSuccess(reply, { walletId: id, status: "ACTIVE" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/wallets/:id/rotate", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: true },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.status !== "ACTIVE") throw new ValidationError("Only active wallets can be rotated");

      const { mnemonic } = generateHdWallet();
      const newEncryptedSeed = encryptSeedForStorage(mnemonic);

      const newAccounts = [];
      for (const account of wallet.accounts) {
        const chainInfo = await prisma.chain.findUnique({ where: { id: account.chainId } });
        const derivationPath = chainInfo?.derivationPath || "m/44'/60'/0'/0";
        const hdNode = deriveAccount(mnemonic, account.index, derivationPath);
        newAccounts.push({
          chainId: account.chainId,
          address: hdNode.address,
          derivationPath: `${derivationPath}/${account.index}`,
          index: account.index,
        });
      }

      const rotatedWallet = await prisma.wallet.update({
        where: { id },
        data: {
          encryptedSeed: newEncryptedSeed,
          accounts: {
            deleteMany: {},
            create: newAccounts,
          },
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_ROTATE", { walletId: id }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.rotated", { walletId: id });

      return sendSuccess(reply, rotatedWallet);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/wallets/:id/balance", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { chain: chainName } = request.query as { chain?: string };

      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: { include: { chain: true } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const targetAccounts = chainName
        ? wallet.accounts.filter((a) => a.chain.name === chainName)
        : wallet.accounts;

      if (targetAccounts.length === 0) throw new NotFoundError("Account");

      const { ethers } = await import("ethers");
      const balances = await Promise.all(
        targetAccounts.map(async (account) => {
          const provider = new ethers.JsonRpcProvider(account.chain.rpcUrl);
          const balance = await provider.getBalance(account.address);
          return {
            chainId: account.chainId,
            chain: account.chain.name,
            address: account.address,
            balance: ethers.formatEther(balance),
            balanceWei: balance.toString(),
            symbol: account.chain.symbol,
          };
        })
      );

      return sendSuccess(reply, {
        walletId: id,
        balances,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/wallets/:id/tokens", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { chain: chainName } = request.query as { chain?: string };

      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: { include: { chain: true } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const targetAccounts = chainName
        ? wallet.accounts.filter((a) => a.chain.name === chainName)
        : wallet.accounts;

      if (targetAccounts.length === 0) throw new NotFoundError("Account");

      const tokenBalances = await Promise.all(
        targetAccounts.map(async (account) => {
          const knownBalances = await getTokenBalances(account.address, account.chain.rpcUrl, account.chain.chainId);
          
          const customTokens = (wallet.tags || [])
            .filter((tag) => tag.startsWith(`custom-token:${account.chain.chainId}:`))
            .map((tag) => tag.split(":")[2]);

          const customBalances = customTokens.length > 0
            ? await getTokenBalances(account.address, account.chain.rpcUrl, account.chain.chainId, customTokens)
            : [];

          const knownAddresses = new Set(knownBalances.map((tb) => tb.token.address.toLowerCase()));
          const filteredCustomBalances = customBalances.filter(
            (cb) => !knownAddresses.has(cb.token.address.toLowerCase())
          );

          const tokens = [...knownBalances, ...filteredCustomBalances];

          return {
            address: account.address,
            chain: account.chain.name,
            chainId: account.chain.chainId,
            tokens,
          };
        })
      );

      return sendSuccess(reply, { walletId: id, tokenBalances });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/wallets/:id/gas-price", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { chain: chainName } = request.query as { chain?: string };

      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: { include: { chain: true } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const targetAccount = chainName
        ? wallet.accounts.find((a) => a.chain.name === chainName)
        : wallet.accounts[0];

      if (!targetAccount) throw new NotFoundError("Account");

      const gasPrices = await getGasPrice(targetAccount.chain.rpcUrl);

      return sendSuccess(reply, {
        chain: targetAccount.chain.name,
        ...gasPrices,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
