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
        walletId: string; chain?: string; to: string; value: string; gasLimit?: string; maxFeePerGas?: string; data?: string;
      };
      if (!walletId || !to || value === undefined) throw new ValidationError("walletId, to, and value required");

      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: { accounts: { where: { chain: chain || "arc" }, take: 1 } },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.accounts.length === 0) throw new NotFoundError("Account for chain");

      const account = wallet.accounts[0];

      // Evaluate policies
      const policies = await prisma.policy.findMany({ where: { orgId: request.orgId, active: true } });

      const context: EvaluationContext = {
        params: { walletId, accountId: account.id, to, value: parseFloat(value), chain: chain || "arc", gasLimit: gasLimit || "21000" },
        user: request.userId ? { id: request.userId, role: request.auth.role, tags: [] } : undefined,
        wallet: { id: walletId, ownerId: wallet.ownerId, ownerType: wallet.ownerType },
        timestamp: Date.now(),
      };

      const isRootUser = request.auth.role === "ORG_ADMIN";
      const policyResult = evaluatePolicies(
        policies.map((p) => ({ effect: p.effect as any, conditions: p.conditions as any, consensus: p.consensus as any })),
        context, isRootUser
      );

      await createAuditLog(request.orgId, "POLICY_EVAL", { walletId, to, value, allowed: policyResult.allowed, reason: policyResult.reason }, request.userId, request);

      if (!policyResult.allowed) {
        await createAuditLog(request.orgId, "POLICY_DENY", { walletId, to, value, reason: policyResult.reason }, request.userId, request);
        triggerWebhookEvents(request.orgId, "policy.triggered", { walletId, to, value, allowed: false, reason: policyResult.reason });
        return sendSuccess(reply, { allowed: false, requiresConsensus: policyResult.requiresConsensus, reason: policyResult.reason }, 403);
      }

      // Sign in enclave
      const seed = decryptSeedFromStorage(wallet.encryptedSeed);
      const tx: ethers.TransactionRequest = {
        to, value: ethers.parseEther(value), chainId: config.arcChainId,
        gasLimit: gasLimit ? BigInt(gasLimit) : undefined,
        maxFeePerGas: maxFeePerGas ? BigInt(maxFeePerGas) : undefined,
        data: data || undefined,
      };

      const signedTx = await signTransaction(seed, tx);

      const transaction = await prisma.transaction.create({
        data: {
          accountId: account.id, orgId: request.orgId, chain: chain || "arc",
          to, value, gasLimit, maxFeePerGas, data, status: "SIGNED", signedTx,
        },
      });

      await createAuditLog(request.orgId, "TX_SIGN", { transactionId: transaction.id, walletId, to, value }, request.userId, request);

      // Broadcast
      try {
        const { hash } = await broadcastTransaction(signedTx, config.arcRpcUrl);
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { txHash: hash, status: "BROADCAST" },
        });

        await createAuditLog(request.orgId, "TX_BROADCAST", { transactionId: transaction.id, txHash: hash }, request.userId, request);
        triggerWebhookEvents(request.orgId, "transaction.submitted", { transactionId: transaction.id, txHash: hash, walletId, to, value });

        return sendSuccess(reply, {
          transactionId: transaction.id, txHash: hash, status: "BROADCAST",
          to, value, chain: chain || "arc",
        }, 201);
      } catch (broadcastErr: any) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED", error: broadcastErr.message },
        });
        triggerWebhookEvents(request.orgId, "transaction.failed", { transactionId: transaction.id, error: broadcastErr.message });
        throw broadcastErr;
      }
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get transaction status
  app.get("/transactions/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const transaction = await prisma.transaction.findFirst({ where: { id, orgId: request.orgId } });
      if (!transaction) throw new NotFoundError("Transaction");

      if (transaction.txHash && (transaction.status === "BROADCAST" || transaction.status === "SIGNED")) {
        try {
          const { status } = await getTransactionStatus(transaction.txHash, config.arcRpcUrl);
          const txStatus = transaction.status as string;
          if (status === "CONFIRMED" && txStatus !== "CONFIRMED") {
            await prisma.transaction.update({
              where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() } as any,
            });
            triggerWebhookEvents(request.orgId, "transaction.confirmed", { transactionId: id, txHash: transaction.txHash });
          } else if (status === "FAILED" && txStatus !== "FAILED") {
            await prisma.transaction.update({ where: { id }, data: { status: "FAILED" } as any });
          }
        } catch {}
      }

      const updated = await prisma.transaction.findUnique({ where: { id } });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // List transactions with filters
  app.get("/transactions", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { status, chain, walletId, search } = request.query as { status?: string; chain?: string; walletId?: string; search?: string };

      let where: any = { orgId: request.orgId };
      if (status) where.status = status;
      if (chain) where.chain = chain;
      if (walletId) {
        const account = await prisma.walletAccount.findFirst({ where: { walletId } });
        if (account) where.accountId = account.id;
      }
      if (search) {
        where.OR = [
          { txHash: { contains: search } },
          { to: { contains: search } },
        ];
      }

      const [data, total] = await Promise.all([
        prisma.transaction.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
        prisma.transaction.count({ where }),
      ]);
      return sendSuccess(reply, { data, total, limit, offset });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get nonce
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

  // Fee estimation
  app.post("/transactions/estimate-fee", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { to, value, data } = request.body as { to: string; value: string; data?: string };
      if (!to) throw new ValidationError("to is required");

      const { estimateGas } = await import("../../utils/enclave.js");
      const tx: ethers.TransactionRequest = {
        to, value: value ? ethers.parseEther(value) : 0n, data: data || undefined,
      };
      const gasLimit = await estimateGas(tx, config.arcRpcUrl);
      // Fee estimation using Arc's stable USDC gas (default ~1 gwei)
      const baseFee = 1_000_000_000n; // 1 gwei in wei
      const estimatedFee = gasLimit * baseFee;

      return sendSuccess(reply, {
        gasLimit: gasLimit.toString(),
        baseFeePerGas: baseFee.toString(),
        estimatedFee: ethers.formatEther(estimatedFee),
        estimatedFeeWei: estimatedFee.toString(),
        chain: "arc",
        currency: "USDC",
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Get wallet balance
  app.get("/wallets/:id/balance", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const wallet = await prisma.wallet.findFirst({
        where: { id, orgId: request.orgId },
        include: { accounts: { take: 1, where: { chain: "arc" } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.accounts.length === 0) throw new NotFoundError("Account");

      const provider = new ethers.JsonRpcProvider(config.arcRpcUrl);
      const balance = await provider.getBalance(wallet.accounts[0].address);
      return sendSuccess(reply, {
        walletId: id,
        address: wallet.accounts[0].address,
        balance: ethers.formatEther(balance),
        balanceWei: balance.toString(),
        chain: "arc",
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
