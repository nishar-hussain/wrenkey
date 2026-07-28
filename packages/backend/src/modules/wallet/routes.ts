import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { quorumMiddleware } from "../../middleware/quorum.js";
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
import { getChainByName, getDefaultChain, isStellarChain } from "../../services/chain.js";
import { getTokenBalances } from "../../services/tokens.js";
import {
  deriveStellarAccount,
  getStellarBalance,
  getStellarFeeEstimate,
  STROOPS_PER_XLM,
} from "../../utils/stellar.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { notifyWalletCreated } from "../../services/notifications.js";
import { isWvcWalletSigningEnabled, isWvcWallet, wvcGenerateSeed } from "../../services/wvc-wallet-integration.js";
import { config } from "../../config.js";
import { getUserSubOrgId } from "../../utils/sub-org.js";

export async function walletRoutes(app: FastifyInstance) {
  /**
   * Derive the first address for a wallet account, branching on chain family.
   * Stellar keys are ed25519 (SLIP-0010, hardened index); EVM keys are
   * secp256k1 (BIP-44). Both share the same BIP-39 mnemonic stored on the wallet.
   */
  function deriveWalletAccountAddress(
    mnemonic: string,
    index: number,
    chainInfo: { derivationPath: string; family: string },
  ): { address: string; derivationPath: string } {
    const fullPath = isStellarChain(chainInfo)
      ? `${chainInfo.derivationPath}/${index}'`
      : `${chainInfo.derivationPath}/${index}`;
    const address = isStellarChain(chainInfo)
      ? deriveStellarAccount(mnemonic, index, chainInfo.derivationPath).address
      : deriveAccount(mnemonic, index, chainInfo.derivationPath).address;
    return { address, derivationPath: fullPath };
  }

  app.post("/wallets", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { name, ownerType, ownerId, tags, chain, skipInitialAccount } = request.body as {
        name: string; ownerType?: string; ownerId?: string; tags?: string[]; chain?: string; skipInitialAccount?: boolean;
      };
      if (!name) throw new ValidationError("Wallet name is required");

      // Resolve the effective orgId: USER wallets go into the user's sub-org;
      // ORG wallets stay in the current (parent) org.
      const resolvedOrgId = ownerType === "ORG"
        ? request.orgId!
        : (await getUserSubOrgId(request.userId!, request.orgId!)) || request.orgId!;

      // ─── WVC path: seed generation through the enclave (PRD §25.1) ──────────
      if (isWvcWalletSigningEnabled()) {
        const { seedId, derivedAddress, appProof, devMode } = await wvcGenerateSeed(resolvedOrgId);
        const encryptedSeed = `wvc:${seedId}`;

        const accountsCreate: any[] = [];
        if (!skipInitialAccount) {
          const chainInfo = chain ? (await getChainByName(chain).catch(() => null)) || await getDefaultChain() : await getDefaultChain();
          if (!chainInfo) throw new ValidationError("Invalid or no active chain found");
          if (isStellarChain(chainInfo)) {
            throw new ValidationError("WVC enclave signing is not supported for Stellar chains — unset WVC_WALLET_SIGNER_DEPLOYMENT_ID or use an EVM chain");
          }
          accountsCreate.push({
            chainId: chainInfo.id,
            address: derivedAddress || `0x${seedId.slice(0, 40)}`,
            derivationPath: `${chainInfo.derivationPath}/0`,
            index: 0,
          });
        }

        const wallet = await prisma.wallet.create({
          data: {
            orgId: resolvedOrgId,
            ownerType: ownerType || "USER",
            ownerId: ownerId || request.userId!,
            userId: request.userId,
            name,
            tags: [...(tags || []), "wvc-managed"],
            encryptedSeed,
            accounts: accountsCreate.length > 0 ? { create: accountsCreate } : undefined,
          },
          include: { accounts: true },
        });

        await createAuditLog(request.orgId, "WALLET_CREATE_WVC", {
          walletId: wallet.id, name, seedId,
          deploymentId: config.wvc.walletSignerDeploymentId,
        }, request.userId, request);
        triggerWebhookEvents(request.orgId, "wallet.created", {
          walletId: wallet.id, name, ownerType: wallet.ownerType, ownerId: wallet.ownerId, wvcManaged: true,
        });
        notifyWalletCreated(request.orgId, name, wallet.id).catch(() => {});

        return sendSuccess(reply, {
          walletId: wallet.id, name: wallet.name, ownerType: wallet.ownerType, ownerId: wallet.ownerId,
          addresses: wallet.accounts.map((a: any) => ({ chainId: a.chainId, address: a.address, derivationPath: a.derivationPath, index: a.index })),
          wvcManaged: true,
          devMode,
          appProof,
        }, 201);
      }

      // ─── Legacy path: in-process seed generation ────────────────────────────
      const { mnemonic } = generateHdWallet();
      const encryptedSeed = encryptSeedForStorage(mnemonic);

      const accountsCreate: any[] = [];
      if (!skipInitialAccount) {
        const chainInfo = chain ? (await getChainByName(chain).catch(() => null)) || await getDefaultChain() : await getDefaultChain();
        if (!chainInfo) throw new ValidationError("Invalid or no active chain found");
        const { address, derivationPath: fullPath } = deriveWalletAccountAddress(mnemonic, 0, chainInfo);
        accountsCreate.push({
          chainId: chainInfo.id,
          address,
          derivationPath: fullPath,
          index: 0,
        });
      }

      const wallet = await prisma.wallet.create({
        data: {
          orgId: resolvedOrgId,
          ownerType: ownerType || "USER",
          ownerId: ownerId || request.userId!,
          userId: request.userId,
          name,
          tags: tags || [],
          encryptedSeed,
          accounts: accountsCreate.length > 0 ? { create: accountsCreate } : undefined,
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_CREATE", { walletId: wallet.id, name, ...(accountsCreate.length > 0 ? { address: accountsCreate[0].address, chain: chain || "default" } : {}) }, request.userId, request);
      triggerWebhookEvents(resolvedOrgId, "wallet.created", { walletId: wallet.id, name, ownerType: wallet.ownerType, ownerId: wallet.ownerId });
      notifyWalletCreated(request.orgId, name, wallet.id).catch(() => {});

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
      const { address: derivedAddress, derivationPath: fullPath } = deriveWalletAccountAddress(mnemonic, 0, chainInfo);

      const wallet = await prisma.wallet.create({
        data: {
          orgId: request.orgId, ownerType: ownerType || "USER",
          ownerId: ownerId || request.userId!, userId: request.userId, name, encryptedSeed,
          accounts: { create: { chainId: chainInfo.id, address: derivedAddress, derivationPath: fullPath, index: 0 } },
        },
        include: { accounts: true },
      });

      await createAuditLog(request.orgId, "WALLET_IMPORT", { walletId: wallet.id, name, chain: chainInfo.name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.imported", { walletId: wallet.id, name, address: derivedAddress, chain: chainInfo.name });
      notifyWalletCreated(request.orgId, name, wallet.id).catch(() => {});

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
      const { status, search, ownerType } = request.query as { status?: string; search?: string; ownerType?: string };

      // USER wallets only appear when explicitly requested or when inside their sub-org.
      // ORG wallets belong to the current org.
      // Default (no ownerType): show all wallets in the current org scope.
      const where: any = {};
      if (ownerType === "USER") {
        const subOrgId = await getUserSubOrgId(request.userId!, request.orgId!);
        where.orgId = subOrgId || request.orgId;
        where.ownerType = "USER";
      } else if (ownerType === "ORG") {
        where.orgId = request.orgId;
        where.ownerType = "ORG";
      } else {
        where.orgId = request.orgId;
      }

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
          include: { accounts: { include: { chain: { select: { name: true, symbol: true, chainId: true } } } } },
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

      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        select: { id: true, name: true },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const accountCount = await prisma.walletAccount.count({ where: { walletId: id } });
      await prisma.$transaction(async (tx) => {
        if (accountCount > 0) {
          await tx.$executeRaw`DELETE FROM transactions WHERE account_id IN (SELECT id FROM wallet_accounts WHERE wallet_id = ${id})`;
        }
        await tx.spendingLimit.deleteMany({ where: { walletId: id } });
        await tx.privateKey.deleteMany({ where: { walletId: id } });
        await tx.walletAccount.deleteMany({ where: { walletId: id } });
        await tx.wallet.deleteMany({ where: { id, orgId: request.orgId } });
      });

      await createAuditLog(request.orgId, "WALLET_DELETE", { walletId: id, name: wallet.name }, request.userId, request);
      triggerWebhookEvents(request.orgId, "wallet.deleted", { walletId: id });
      return sendSuccess(reply, { message: "Wallet deleted" });
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[wallet.delete] Error:", (err as any)?.message, (err as any)?.stack);
      }
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
      const { chain: chainName, derivationPath: customPath } = request.body as { chain?: string; derivationPath?: string };

      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");
      if (isWvcWallet(wallet.encryptedSeed)) {
        throw new ValidationError("Cannot derive additional accounts for a WVC-managed wallet — the seed is held in the enclave and never exposed to the backend");
      }

      const chainInfo = chainName ? await getChainByName(chainName).catch(() => null) : await getDefaultChain();
      if (!chainInfo) throw new ValidationError("Invalid or no active chain found");

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);

      let derivationPath: string;
      let accountIndex: number;

      if (customPath) {
        const segments = customPath.split("/");
        const lastSegment = segments[segments.length - 1];
        accountIndex = parseInt(lastSegment.replace(/'/g, ""), 10);
        if (isNaN(accountIndex)) accountIndex = 0;
        derivationPath = segments.slice(0, -1).join("/");
        if (!derivationPath.startsWith("m")) derivationPath = "m";
      } else {
        accountIndex = await prisma.walletAccount.count({ where: { walletId: id } });
        derivationPath = chainInfo.derivationPath;
      }

      const isStellar = isStellarChain(chainInfo);
      const fullPath = isStellar ? `${derivationPath}/${accountIndex}'` : `${derivationPath}/${accountIndex}`;
      const address = isStellar
        ? deriveStellarAccount(mnemonic, accountIndex, derivationPath).address
        : deriveAccount(mnemonic, accountIndex, derivationPath).address;

      const account = await prisma.walletAccount.create({
        data: {
          walletId: id, chainId: chainInfo.id, address,
          derivationPath: fullPath, index: accountIndex,
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

  app.delete("/wallets/:id/accounts/:accountId", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id, accountId } = request.params as { id: string; accountId: string };

      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      const result = await prisma.walletAccount.deleteMany({
        where: { id: accountId, walletId: id },
      });
      if (result.count === 0) throw new NotFoundError("Account");

      await createAuditLog(request.orgId, "ACCOUNT_DELETE", { walletId: id, accountId }, request.userId, request);
      triggerWebhookEvents(request.orgId, "account.deleted", { walletId: id, accountId });

      return sendSuccess(reply, { message: "Account deleted" });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/wallets/:id/export", { preHandler: [authMiddleware, quorumMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as { passphrase?: string };
      const passphrase = body.passphrase;

      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      if (wallet.status === "FROZEN") throw new ValidationError("Cannot export a frozen wallet");
      if (isWvcWallet(wallet.encryptedSeed)) {
        throw new ValidationError("Cannot export a WVC-managed wallet — the seed is generated and held inside the enclave and never leaves it");
      }

      if (request.quorumRequired) {
        const approval = await prisma.approvalRequest.create({
          data: {
            orgId: request.orgId,
            actionType: "WALLET_EXPORT",
            targetId: id,
            actionPayload: passphrase ? { passphrase } : undefined,
            requestedBy: request.userId!,
            requiredApprovals: request.quorumThreshold!,
          },
        });
        triggerWebhookEvents(request.orgId, "approval.requested", {
          approvalId: approval.id, actionType: "WALLET_EXPORT", walletId: id, requestedBy: request.userId, requiredApprovals: approval.requiredApprovals,
        });
        await createAuditLog(request.orgId, "APPROVAL_REQUEST", { approvalId: approval.id, actionType: "WALLET_EXPORT", walletId: id }, request.userId, request);
        return sendSuccess(reply, {
          status: "AWAITING_APPROVAL",
          approvalId: approval.id,
          approvedBy: approval.approvedBy,
          requiredApprovals: approval.requiredApprovals,
        }, 201);
      }

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

  app.post("/wallets/:id/freeze", { preHandler: [authMiddleware, quorumMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      if (request.quorumRequired) {
        const approval = await prisma.approvalRequest.create({
          data: {
            orgId: request.orgId,
            actionType: "WALLET_FREEZE",
            targetId: id,
            requestedBy: request.userId!,
            requiredApprovals: request.quorumThreshold!,
          },
        });
        triggerWebhookEvents(request.orgId, "approval.requested", {
          approvalId: approval.id, actionType: "WALLET_FREEZE", walletId: id, requestedBy: request.userId, requiredApprovals: approval.requiredApprovals,
        });
        await createAuditLog(request.orgId, "APPROVAL_REQUEST", { approvalId: approval.id, actionType: "WALLET_FREEZE", walletId: id }, request.userId, request);
        return sendSuccess(reply, {
          status: "AWAITING_APPROVAL",
          approvalId: approval.id,
          approvedBy: approval.approvedBy,
          requiredApprovals: approval.requiredApprovals,
        }, 201);
      }

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

  app.post("/wallets/:id/unfreeze", { preHandler: [authMiddleware, quorumMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({ where: { id, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      if (request.quorumRequired) {
        const approval = await prisma.approvalRequest.create({
          data: {
            orgId: request.orgId,
            actionType: "WALLET_UNFREEZE",
            targetId: id,
            requestedBy: request.userId!,
            requiredApprovals: request.quorumThreshold!,
          },
        });
        triggerWebhookEvents(request.orgId, "approval.requested", {
          approvalId: approval.id, actionType: "WALLET_UNFREEZE", walletId: id, requestedBy: request.userId, requiredApprovals: approval.requiredApprovals,
        });
        await createAuditLog(request.orgId, "APPROVAL_REQUEST", { approvalId: approval.id, actionType: "WALLET_UNFREEZE", walletId: id }, request.userId, request);
        return sendSuccess(reply, {
          status: "AWAITING_APPROVAL",
          approvalId: approval.id,
          approvedBy: approval.approvedBy,
          requiredApprovals: approval.requiredApprovals,
        }, 201);
      }

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

  app.post("/wallets/:id/rotate", { preHandler: [authMiddleware, quorumMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: true },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.status !== "ACTIVE") throw new ValidationError("Only active wallets can be rotated");

      if (request.quorumRequired) {
        if (isWvcWallet(wallet.encryptedSeed) && wallet.accounts.length > 1) {
          throw new ValidationError(
            "Cannot rotate a multi-account WVC-managed wallet — the enclave exposes only the primary derived address. Remove extra accounts before rotating.",
          );
        }
        const approval = await prisma.approvalRequest.create({
          data: {
            orgId: request.orgId,
            actionType: "WALLET_ROTATE",
            targetId: id,
            requestedBy: request.userId!,
            requiredApprovals: request.quorumThreshold!,
          },
        });
        triggerWebhookEvents(request.orgId, "approval.requested", {
          approvalId: approval.id, actionType: "WALLET_ROTATE", walletId: id, requestedBy: request.userId, requiredApprovals: approval.requiredApprovals,
        });
        await createAuditLog(request.orgId, "APPROVAL_REQUEST", { approvalId: approval.id, actionType: "WALLET_ROTATE", walletId: id }, request.userId, request);
        return sendSuccess(reply, {
          status: "AWAITING_APPROVAL",
          approvalId: approval.id,
          approvedBy: approval.approvedBy,
          requiredApprovals: approval.requiredApprovals,
        }, 201);
      }

      // ─── WVC path: rotate the seed through the enclave (PRD §25.1) ──────────
      // The backend never sees the plaintext seed; it only gets a new seed handle
      // + a freshly derived address. Rotating in-process would silently downgrade
      // a WVC-managed wallet to a locally-held seed, breaking the enclave model.
      if (isWvcWallet(wallet.encryptedSeed)) {
        // The enclave only produces EVM (secp256k1) keys — refuse Stellar accounts.
        for (const a of wallet.accounts) {
          const accChain = await prisma.chain.findUnique({ where: { id: a.chainId } });
          if (isStellarChain(accChain)) {
            throw new ValidationError("WVC enclave signing is not supported for Stellar chains — remove the Stellar account or disable WVC_WALLET_SIGNER_DEPLOYMENT_ID");
          }
        }
        if (wallet.accounts.length > 1) {
          throw new ValidationError(
            "Cannot rotate a multi-account WVC-managed wallet — the enclave exposes only the primary derived address. Remove extra accounts before rotating.",
          );
        }
        const { seedId, derivedAddress, appProof, devMode } = await wvcGenerateSeed(request.orgId!);
        const primary = wallet.accounts[0];
        const rotatedWallet = await prisma.wallet.update({
          where: { id },
          data: {
            encryptedSeed: `wvc:${seedId}`,
            accounts: {
              deleteMany: {},
              create: [{
                chainId: primary.chainId,
                address: derivedAddress || `0x${seedId.slice(0, 40)}`,
                derivationPath: primary.derivationPath,
                index: primary.index,
              }],
            },
          },
          include: { accounts: true },
        });

        await createAuditLog(request.orgId, "WALLET_ROTATE_WVC", { walletId: id, seedId, deploymentId: config.wvc.walletSignerDeploymentId }, request.userId, request);
        triggerWebhookEvents(request.orgId, "wallet.rotated", { walletId: id, wvcManaged: true });

        return sendSuccess(reply, { ...rotatedWallet, wvcManaged: true, devMode, appProof });
      }

      // ─── Legacy path: in-process seed rotation ──────────────────────────────
      const { mnemonic } = generateHdWallet();
      const newEncryptedSeed = encryptSeedForStorage(mnemonic);

      const newAccounts = [];
      for (const account of wallet.accounts) {
        const chainInfo = await prisma.chain.findUnique({ where: { id: account.chainId } });
        const derivationPath = chainInfo?.derivationPath || "m/44'/60'/0'/0";
        const isStellar = isStellarChain(chainInfo);
        const address = isStellar
          ? deriveStellarAccount(mnemonic, account.index, derivationPath).address
          : deriveAccount(mnemonic, account.index, derivationPath).address;
        newAccounts.push({
          chainId: account.chainId,
          address,
          derivationPath: isStellar ? `${derivationPath}/${account.index}'` : `${derivationPath}/${account.index}`,
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
          if (isStellarChain(account.chain)) {
            const stellarBal = await getStellarBalance(account.address, account.chain.horizonUrl || account.chain.rpcUrl);
            const stroops = Math.round(parseFloat(stellarBal.nativeBalance) * STROOPS_PER_XLM);
            return {
              chainId: account.chainId,
              chain: account.chain.name,
              address: account.address,
              balance: stellarBal.nativeBalance,
              balanceWei: String(stroops),
              balanceStroops: String(stroops),
              symbol: account.chain.symbol,
              trustlines: stellarBal.trustlines,
            };
          }
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
          // Stellar has no ERC-20 contracts; trustlines to issued assets are the
          // equivalent. Present them in the same token-balance shape.
          if (isStellarChain(account.chain)) {
            const stellarBal = await getStellarBalance(account.address, account.chain.horizonUrl || account.chain.rpcUrl);
            const tokens = stellarBal.trustlines.map((tl) => ({
              token: { address: `${tl.code}:${tl.issuer}`, name: tl.code, symbol: tl.code, decimals: 7 },
              balance: tl.balance,
              balanceFormatted: tl.balance,
            }));
            return {
              address: account.address,
              chain: account.chain.name,
              chainId: account.chain.chainId,
              tokens,
            };
          }

          const knownBalances = await getTokenBalances(account.address, account.chain.rpcUrl, account.chain.chainId ?? undefined);

          const customTokens = (wallet.tags || [])
            .filter((tag) => tag.startsWith(`custom-token:${account.chain.chainId}:`))
            .map((tag) => tag.split(":")[2]);

          const customBalances = customTokens.length > 0
            ? await getTokenBalances(account.address, account.chain.rpcUrl, account.chain.chainId ?? undefined, customTokens)
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

      if (isStellarChain(targetAccount.chain)) {
        const fee = await getStellarFeeEstimate(targetAccount.chain.horizonUrl || targetAccount.chain.rpcUrl);
        return sendSuccess(reply, {
          chain: targetAccount.chain.name,
          slow: fee.suggestedFeeStroops,
          standard: fee.suggestedFeeStroops,
          fast: fee.suggestedFeeStroops,
          feeStroops: fee.suggestedFeeStroops,
          estimatedFeeXlm: fee.estimatedFeeXlm,
          currency: "XLM",
        });
      }

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
