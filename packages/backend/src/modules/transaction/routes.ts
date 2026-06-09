import { FastifyInstance } from "fastify";
import { ethers } from "ethers";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import { decryptSeedFromStorage, signTransaction, broadcastTransaction, getTransactionStatus } from "../../utils/enclave.js";
import { evaluatePolicies, EvaluationContext } from "../policy/engine.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { parsePagination } from "../../utils/pagination.js";

export async function transactionRoutes(app: FastifyInstance) {
  // Sign and send transaction
  app.post("/transactions/sign", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId, chain, to, value, gasLimit, maxFeePerGas, data } = request.body as {
        walletId: string;
        chain?: string;
        to: string;
        value: string;
        gasLimit?: string;
        maxFeePerGas?: string;
        data?: string;
      };
      if (!walletId || !to || value === undefined) {
        throw new ValidationError("walletId, to, and value are required");
      }

      // Get wallet and account
      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: { accounts: { where: { chain: chain || "arc" }, take: 1 } },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.accounts.length === 0) throw new NotFoundError("Account for chain");

      const account = wallet.accounts[0];

      // Evaluate policies
      const policies = await prisma.policy.findMany({
        where: { orgId: request.orgId, active: true },
      });

      const context: EvaluationContext = {
        params: {
          walletId,
          accountId: account.id,
          to,
          value: parseFloat(value),
          chain: chain || "arc",
          gasLimit: gasLimit || "21000",
        },
        user: request.userId
          ? {
              id: request.userId,
              role: request.auth.role,
              tags: [],
            }
          : undefined,
        wallet: { id: walletId, ownerId: wallet.ownerId, ownerType: wallet.ownerType },
      };

      const isRootUser = request.auth.role === "ORG_ADMIN";
      const policyResult = evaluatePolicies(
        policies.map((p) => ({ effect: p.effect as any, conditions: p.conditions as any, consensus: p.consensus as any })),
        context,
        isRootUser
      );

      await createAuditLog(
        request.orgId,
        "POLICY_EVAL",
        {
          walletId,
          to,
          value,
          allowed: policyResult.allowed,
          reason: policyResult.reason,
        },
        request.userId,
        request
      );

      if (!policyResult.allowed) {
        await createAuditLog(request.orgId, "POLICY_DENY", { walletId, to, value, reason: policyResult.reason }, request.userId, request);
        triggerWebhookEvents(request.orgId, "policy.triggered", {
          walletId,
          to,
          value,
          allowed: false,
          reason: policyResult.reason,
        });
        throw new ValidationError("Transaction denied by policy: " + (policyResult.reason || "Not allowed"));
      }

      // Sign inside enclave
      const seed = decryptSeedFromStorage(wallet.encryptedSeed);
      const tx: ethers.TransactionRequest = {
        to,
        value: ethers.parseUnits(value, 0), // Using wei-like units
        chainId: config.arcChainId,
        gasLimit: gasLimit ? BigInt(gasLimit) : undefined,
        maxFeePerGas: maxFeePerGas ? BigInt(maxFeePerGas) : undefined,
        data: data || "0x",
      };

      const signedTx = await signTransaction(seed, tx);

      // Broadcast to Arc
      const broadcastResult = await broadcastTransaction(signedTx, config.arcRpcUrl);

      // Record transaction
      const transaction = await prisma.transaction.create({
        data: {
          accountId: account.id,
          orgId: request.orgId,
          txHash: broadcastResult.hash,
          chain: chain || "arc",
          to,
          value,
          gasLimit,
          maxFeePerGas,
          data: data || "0x",
          status: "BROADCAST",
          signedTx,
        },
      });

      await createAuditLog(
        request.orgId,
        "TX_SIGN",
        {
          transactionId: transaction.id,
          txHash: broadcastResult.hash,
          walletId,
          to,
          value,
        },
        request.userId,
        request
      );

      triggerWebhookEvents(request.orgId, "transaction.submitted", {
        transactionId: transaction.id,
        txHash: broadcastResult.hash,
        walletId,
        to,
        value,
        chain: chain || "arc",
      });

      return sendSuccess(reply, {
        id: transaction.id,
        txHash: broadcastResult.hash,
        status: transaction.status,
        chain: transaction.chain,
        to: transaction.to,
        value: transaction.value,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get transaction status
  app.get("/transactions/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const tx = await prisma.transaction.findFirst({
        where: { id, orgId: request.orgId },
      });
      if (!tx) throw new NotFoundError("Transaction");

      if (tx.txHash && tx.status === "BROADCAST") {
        const status = await getTransactionStatus(tx.txHash, config.arcRpcUrl);
        if (status.status === "CONFIRMED") {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { status: "CONFIRMED", confirmedAt: new Date() },
          });
          tx.status = "CONFIRMED";
          await createAuditLog(request.orgId, "TX_CONFIRMED", { txHash: tx.txHash }, request.userId, request);
          triggerWebhookEvents(request.orgId, "transaction.confirmed", {
            txHash: tx.txHash,
            transactionId: tx.id,
          });
        } else if (status.status === "FAILED") {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { status: "FAILED", error: "Transaction reverted" },
          });
          tx.status = "FAILED";
          await createAuditLog(request.orgId, "TX_FAILED", { txHash: tx.txHash }, request.userId, request);
          triggerWebhookEvents(request.orgId, "transaction.failed", {
            txHash: tx.txHash,
            transactionId: tx.id,
          });
        }
      }

      return sendSuccess(reply, tx);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List transactions for an account
  app.get("/accounts/:accountId/transactions", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { accountId } = request.params as { accountId: string };
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where: { accountId, orgId: request.orgId },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.transaction.count({ where: { accountId, orgId: request.orgId } }),
      ]);
      return sendSuccess(reply, { transactions, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Estimate gas for a transaction
  app.post("/transactions/estimate", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { to, value, data } = request.body as {
        to: string;
        value?: string;
        data?: string;
      };
      if (!to) throw new ValidationError("to address is required");

      const provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
      const feeData = await provider.getFeeData();

      const tx: ethers.TransactionRequest = {
        to,
        value: value ? ethers.parseUnits(value, 0) : undefined,
        data: data || "0x",
      };

      const gasLimit = await provider.estimateGas(tx);

      return sendSuccess(reply, {
        gasLimit: gasLimit.toString(),
        maxFeePerGas: feeData.maxFeePerGas?.toString() || "0",
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() || "0",
        estimatedTotalGas: (gasLimit * (feeData.maxFeePerGas || 0n)).toString(),
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
