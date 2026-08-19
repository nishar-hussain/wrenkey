import { FastifyInstance } from "fastify";
import prisma from "../../db.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { parsePagination } from "../../utils/pagination.js";
import {
  broadcastTransaction,
  decryptSeedFromStorage,
  encryptSeedWithPassphrase,
  generateHdWallet,
  encryptSeedForStorage,
  deriveAccount,
} from "../../utils/enclave.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { isWvcWallet, isWvcWalletSigningEnabled, wvcGenerateSeed } from "../../services/wvc-wallet-integration.js";
import { config as appConfig } from "../../config.js";

export async function approvalRoutes(app: FastifyInstance) {
  app.get("/approval-requests", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { status } = request.query as { status?: string };
      const { targetId } = request.query as { targetId?: string };

      const where: any = { orgId: request.orgId };
      if (status) where.status = status;
      if (targetId) where.targetId = targetId;

      const [data, total] = await Promise.all([
        prisma.approvalRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
        prisma.approvalRequest.count({ where }),
      ]);

      const enrichedData = await Promise.all(
        data.map(async (r) => {
          let wallet: any = null;
          let transaction: any = null;
          if (r.actionType !== "TRANSACTION" && r.targetId) {
            wallet = await prisma.wallet.findFirst({
              where: { id: r.targetId },
              select: { id: true, name: true, status: true, tags: true },
            });
          } else if (r.transactionId) {
            transaction = await prisma.transaction.findUnique({
              where: { id: r.transactionId },
              include: { account: { include: { chain: { select: { name: true, chainId: true } } } } },
            });
          }
          return { ...r, transaction, wallet };
        })
      );

      return sendSuccess(reply, { data: enrichedData, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/approval-requests/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const req = await prisma.approvalRequest.findFirst({
        where: { id, orgId: request.orgId },
      });
      if (!req) throw new NotFoundError("Approval request");

      let transaction: any = null;
      if (req.transactionId) {
        transaction = await prisma.transaction.findUnique({
          where: { id: req.transactionId },
          include: { account: { include: { chain: { select: { name: true, chainId: true } } } } },
        });
      }

      let wallet: any = null;
      if (req.actionType !== "TRANSACTION" && req.targetId) {
        wallet = await prisma.wallet.findFirst({
          where: { id: req.targetId },
          select: { id: true, name: true, status: true, tags: true },
        });
      }

      return sendSuccess(reply, { ...req, transaction, wallet });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/approval-requests/:id/approve", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const approvalReq = await prisma.approvalRequest.findFirst({ where: { id, orgId: request.orgId } });
      if (!approvalReq) throw new NotFoundError("Approval request");
      if (approvalReq.status !== "PENDING") throw new ValidationError("Approval request already resolved");

      if (approvalReq.approvedBy.includes(request.userId!)) {
        throw new ValidationError("You have already approved this request");
      }

      const approvedBy = [...approvalReq.approvedBy, request.userId!];
      const isFullyApproved = approvedBy.length >= approvalReq.requiredApprovals;

      await prisma.approvalRequest.update({
        where: { id },
        data: {
          approvedBy,
          status: isFullyApproved ? "APPROVED" : "PENDING",
        },
      });

      await createAuditLog(request.orgId, "APPROVAL_GRANT", { approvalId: id, approvedBy: request.userId, fullyApproved: isFullyApproved }, request.userId, request);

      if (isFullyApproved) {
        const actionType = approvalReq.actionType || "TRANSACTION";

        if (actionType === "TRANSACTION") {
          const transaction = await prisma.transaction.findUnique({
            where: { id: approvalReq.transactionId! },
            include: { account: { include: { chain: true } } },
          });
          if (transaction && transaction.signedTx) {
            try {
              const { hash } = await broadcastTransaction(transaction.signedTx, transaction.account.chain.rpcUrl);
              await prisma.transaction.update({
                where: { id: transaction.id },
                data: { txHash: hash, status: "BROADCAST" },
              });
              await createAuditLog(request.orgId, "TX_BROADCAST", { transactionId: transaction.id, txHash: hash }, request.userId, request);
              triggerWebhookEvents(request.orgId, "transaction.submitted", { transactionId: transaction.id, txHash: hash });
            } catch (broadcastErr: any) {
              await prisma.transaction.update({
                where: { id: transaction.id },
                data: { status: "FAILED", error: broadcastErr.message },
              });
            }
          }
          triggerWebhookEvents(request.orgId, "approval.executed", { approvalId: id, actionType, targetId: approvalReq.targetId || approvalReq.transactionId });
        } else if (actionType === "WALLET_EXPORT") {
          const wallet = await prisma.wallet.findFirst({ where: { id: approvalReq.targetId, orgId: request.orgId } });
          if (!wallet) {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Wallet deleted while approval was pending" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }
          if (wallet.status === "FROZEN") {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Cannot export a frozen wallet" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }
          if (isWvcWallet(wallet.encryptedSeed)) {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Cannot export a WVC-managed wallet" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }

          const passphrase = (approvalReq.actionPayload as any)?.passphrase;
          const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
          const accounts = await prisma.walletAccount.findMany({
            where: { walletId: wallet.id },
            select: { chainId: true, address: true, derivationPath: true, index: true },
            orderBy: { index: "asc" },
          });
          const exportResult: any = { walletId: wallet.id, accounts };
          if (passphrase) {
            exportResult.encryptedMnemonic = encryptSeedWithPassphrase(mnemonic, passphrase);
          } else {
            exportResult.mnemonic = mnemonic;
          }

          await prisma.approvalRequest.update({ where: { id }, data: { result: exportResult } });
          await createAuditLog(request.orgId, "WALLET_EXPORT", { walletId: wallet.id, encrypted: !!passphrase, viaApproval: id }, request.userId, request);
          triggerWebhookEvents(request.orgId, "wallet.exported", { walletId: wallet.id });
          triggerWebhookEvents(request.orgId, "approval.executed", { approvalId: id, actionType, targetId: approvalReq.targetId });
        } else if (actionType === "WALLET_FREEZE") {
          const wallet = await prisma.wallet.findFirst({ where: { id: approvalReq.targetId, orgId: request.orgId } });
          if (!wallet) {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Wallet deleted while approval was pending" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }

          await prisma.wallet.update({ where: { id: wallet.id }, data: { status: "FROZEN" } });
          await prisma.approvalRequest.update({ where: { id }, data: { result: { walletId: wallet.id, status: "FROZEN" } } });
          await createAuditLog(request.orgId, "WALLET_FREEZE", { walletId: wallet.id, viaApproval: id }, request.userId, request);
          triggerWebhookEvents(request.orgId, "wallet.frozen", { walletId: wallet.id });
          triggerWebhookEvents(request.orgId, "approval.executed", { approvalId: id, actionType, targetId: approvalReq.targetId });
        } else if (actionType === "WALLET_UNFREEZE") {
          const wallet = await prisma.wallet.findFirst({ where: { id: approvalReq.targetId, orgId: request.orgId } });
          if (!wallet) {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Wallet deleted while approval was pending" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }

          await prisma.wallet.update({ where: { id: wallet.id }, data: { status: "ACTIVE" } });
          await prisma.approvalRequest.update({ where: { id }, data: { result: { walletId: wallet.id, status: "ACTIVE" } } });
          await createAuditLog(request.orgId, "WALLET_UNFREEZE", { walletId: wallet.id, viaApproval: id }, request.userId, request);
          triggerWebhookEvents(request.orgId, "wallet.unfrozen", { walletId: wallet.id });
          triggerWebhookEvents(request.orgId, "approval.executed", { approvalId: id, actionType, targetId: approvalReq.targetId });
        } else if (actionType === "WALLET_ROTATE") {
          const wallet = await prisma.wallet.findFirst({
            where: { id: approvalReq.targetId, orgId: request.orgId },
            include: { accounts: true },
          });
          if (!wallet) {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Wallet deleted while approval was pending" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }
          if (wallet.status !== "ACTIVE") {
            await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Only active wallets can be rotated" } } });
            return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
          }

          let rotatedWallet: any;
          if (isWvcWallet(wallet.encryptedSeed) && isWvcWalletSigningEnabled()) {
            if (wallet.accounts.length > 1) {
              await prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", result: { error: "Cannot rotate a multi-account WVC-managed wallet" } } });
              return sendSuccess(reply, { id, status: "APPROVED", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
            }
            const { seedId, derivedAddress } = await wvcGenerateSeed(request.orgId!);
            const primary = wallet.accounts[0];
            rotatedWallet = await prisma.wallet.update({
              where: { id: wallet.id },
              data: {
                encryptedSeed: `wvc:${seedId}`,
                accounts: {
                  deleteMany: {},
                  create: [{ chainId: primary.chainId, address: derivedAddress || `0x${seedId.slice(0, 40)}`, derivationPath: primary.derivationPath, index: primary.index }],
                },
              },
              include: { accounts: true },
            });
            await createAuditLog(request.orgId, "WALLET_ROTATE_WVC", { walletId: wallet.id, seedId, viaApproval: id }, request.userId, request);
          } else {
            const { mnemonic } = generateHdWallet();
            const newEncryptedSeed = encryptSeedForStorage(mnemonic);
            const newAccounts: Array<{ chainId: string; address: string; derivationPath: string; index: number }> = [];
            for (const account of wallet.accounts) {
              const chainInfo = await prisma.chain.findUnique({ where: { id: account.chainId } });
              const dp = chainInfo?.derivationPath || "m/44'/60'/0'/0";
              const hdNode = deriveAccount(mnemonic, account.index, dp);
              newAccounts.push({ chainId: account.chainId, address: hdNode.address, derivationPath: `${dp}/${account.index}`, index: account.index });
            }
            rotatedWallet = await prisma.wallet.update({
              where: { id: wallet.id },
              data: { encryptedSeed: newEncryptedSeed, accounts: { deleteMany: {}, create: newAccounts } },
              include: { accounts: true },
            });
            await createAuditLog(request.orgId, "WALLET_ROTATE", { walletId: wallet.id, viaApproval: id }, request.userId, request);
          }

          await prisma.approvalRequest.update({ where: { id }, data: { result: { walletId: wallet.id, rotated: true } } });
          triggerWebhookEvents(request.orgId, "wallet.rotated", { walletId: wallet.id });
          triggerWebhookEvents(request.orgId, "approval.executed", { approvalId: id, actionType, targetId: approvalReq.targetId });
        }
      }

      return sendSuccess(reply, { id, status: isFullyApproved ? "APPROVED" : "PENDING", approvedCount: approvedBy.length, requiredApprovals: approvalReq.requiredApprovals });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/approval-requests/:id/reject", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const approvalReq = await prisma.approvalRequest.findFirst({ where: { id, orgId: request.orgId } });
      if (!approvalReq) throw new NotFoundError("Approval request");
      if (approvalReq.status !== "PENDING") throw new ValidationError("Approval request already resolved");

      const rejectedBy = [...approvalReq.rejectedBy, request.userId!];

      await prisma.approvalRequest.update({
        where: { id },
        data: { rejectedBy, status: "REJECTED" },
      });

      if (approvalReq.transactionId) {
        await prisma.transaction.update({
          where: { id: approvalReq.transactionId },
          data: { status: "FAILED", error: "Consensus rejected" },
        });
      }

      await createAuditLog(request.orgId, "APPROVAL_REJECT", { approvalId: id, rejectedBy: request.userId }, request.userId, request);
      triggerWebhookEvents(request.orgId, "approval.rejected", { approvalId: id, actionType: approvalReq.actionType, targetId: approvalReq.targetId });

      return sendSuccess(reply, { id, status: "REJECTED" });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
