import { FastifyInstance } from "fastify";
import { ethers } from "ethers";
import prisma from "../../db.js";
import { config } from "../../config.js";
import { authMiddleware } from "../../middleware/auth.js";
import { sendSuccess, sendError, ValidationError, NotFoundError, ForbiddenError, AppError } from "../../utils/errors.js";
import { createAuditLog } from "../../utils/audit.js";
import {
  decryptSeedFromStorage,
  broadcastTransaction,
  getTransactionStatus,
  simulateTransaction,
  signMessage,
  deriveAccount,
  getGasPrice,
} from "../../utils/enclave.js";
import { evaluatePolicies, EvaluationContext } from "../policy/engine.js";
import { getChainById } from "../../services/chain.js";
import { acquireNonceLock, releaseNonceLock, getNextNonce } from "../../services/nonce.js";
import { assessTransactionRisk, validateSpendingLimits } from "../../services/risk.js";
import { triggerWebhookEvents } from "../webhook/routes.js";
import { notifyLargeTransaction, notifyTransactionFailed, notifyPolicyDenial } from "../../services/notifications.js";
import { parsePagination } from "../../utils/pagination.js";
import { isWvcWallet, signTxForWallet } from "../../services/wvc-wallet-integration.js";

function parseTxStatus(txStatus: string): "PENDING" | "SIGNED" | "BROADCAST" | "CONFIRMED" | "FAILED" | "CANCELLED" | "REPLACED" | "RETRY" {
  return txStatus as any;
}

export async function transactionRoutes(app: FastifyInstance) {
  app.post("/transactions/sign", { preHandler: [authMiddleware] }, async (request, reply) => {
    let lockId: string | null = null;
    let lockedAddress: string | null = null;

    try {
      const { walletId, chain: chainName, to, value, gasLimit, maxFeePerGas, maxPriorityFeePerGas, data, speed, sponsored } = request.body as {
        walletId: string; chain?: string; to: string; value: string; gasLimit?: string;
        maxFeePerGas?: string; maxPriorityFeePerGas?: string; data?: string; speed?: "slow" | "standard" | "fast";
        sponsored?: boolean;
      };
      if (!walletId || !to || value === undefined) throw new ValidationError("walletId, to, and value required");

      const isSponsored = sponsored === true && config.gasSponsorship.enabled;
      if (isSponsored) {
        const sponsoredValue = parseFloat(value);
        if (isNaN(sponsoredValue)) throw new ValidationError("Invalid transaction value");
        if (sponsoredValue > parseFloat(config.gasSponsorship.maxSponsorAmount)) {
          throw new ValidationError(`Sponsored amount exceeds maximum ${config.gasSponsorship.maxSponsorAmount}`);
        }
        if (!config.gasSponsorship.sponsorWalletId) {
          throw new ValidationError("Gas sponsorship wallet not configured");
        }
      }

      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: {
          accounts: {
            include: { chain: true },
          },
        },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.status === "FROZEN") throw new ForbiddenError("Wallet is frozen — transactions are blocked");

      const targetAccount = chainName
        ? wallet.accounts.find((a) => a.chain.name === chainName)
        : wallet.accounts[0];

      if (!targetAccount) throw new NotFoundError("Account for chain");

      const chainInfo = await getChainById(targetAccount.chainId);
      const numericValue = parseFloat(value);

      // ─── Resolve gas params (EIP-1559) ───────────────────────────────────
      // Always fetch fresh fee data from the RPC. Never sign with zero gas.
      let resolvedMaxFeePerGas = maxFeePerGas;
      let resolvedMaxPriorityFeePerGas = maxPriorityFeePerGas;

      if (!resolvedMaxFeePerGas) {
        try {
          const feeProvider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
          const feeData = await Promise.race([
            feeProvider.getFeeData(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("RPC timeout fetching fee data")), 15000)),
          ]) as any;

          const baseFee = feeData.gasPrice || feeData.maxFeePerGas;
          if (!baseFee) {
            throw new AppError(502, "RPC returned no gas price data — cannot sign transaction without gas parameters");
          }

          // Apply speed multiplier
          const speedMultiplier: Record<string, bigint> = {
            slow: 9n,
            standard: 12n,
            fast: 15n,
          };
          const mult = speedMultiplier[speed || "standard"] || 12n;
          resolvedMaxFeePerGas = (BigInt(baseFee) * mult / 10n).toString();

          if (!resolvedMaxPriorityFeePerGas) {
            // Priority fee = 10% of max fee, min 1 gwei
            const priorityFee = BigInt(baseFee) / 10n;
            const minPriority = ethers.parseUnits("1", "gwei");
            resolvedMaxPriorityFeePerGas = (priorityFee > minPriority ? priorityFee : minPriority).toString();
          }
        } catch (feeErr: any) {
          if (feeErr instanceof AppError) throw feeErr;
          throw new AppError(502, `Could not fetch gas price from RPC: ${feeErr.message}. Check your chain's RPC URL.`);
        }
      }

      if (!resolvedMaxPriorityFeePerGas) {
        resolvedMaxPriorityFeePerGas = ethers.parseUnits("1", "gwei").toString();
      }

      // ─── Resolve gas limit ────────────────────────────────────────────────
      let resolvedGasLimit = gasLimit;
      if (!resolvedGasLimit) {
        try {
          const estProvider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
          const estimated = await Promise.race([
            estProvider.estimateGas({
              to, value: ethers.parseEther(value), data: data || undefined,
              from: targetAccount.address,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 15000)),
          ]) as bigint;
          // Add 20% buffer
          resolvedGasLimit = (estimated * 120n / 100n).toString();
        } catch {
          resolvedGasLimit = "21000";
        }
      }

      // Contract Interface ABI decoding
      let decodedFunction: { functionName: string; signature: string; args: Record<string, string> } | null = null;
      if (data && to) {
        try {
          const contractIface = await prisma.contractInterface.findFirst({
            where: { orgId: request.orgId, address: to },
            select: { id: true, abi: true },
          });
          if (contractIface?.abi) {
            const abi = contractIface.abi as any;
            const ethIface = new ethers.Interface(abi);
            const decoded = ethIface.parseTransaction({ data });
            if (decoded) {
              const args: Record<string, string> = {};
              if (decoded.fragment && "inputs" in decoded.fragment) {
                for (let i = 0; i < decoded.fragment.inputs.length; i++) {
                  args[decoded.fragment.inputs[i].name || `arg${i}`] = String(decoded.args[i]);
                }
              }
              decodedFunction = {
                functionName: decoded.name,
                signature: decoded.signature,
                args,
              };
            }
          }
        } catch { /* ABI decode is best-effort, don't block the transaction */ }
      }

      const spendingCheck = await validateSpendingLimits(request.orgId, walletId, chainInfo.id, numericValue, to);
      if (!spendingCheck.allowed) {
        throw new ForbiddenError(spendingCheck.reason || "Transaction blocked by spending limits");
      }

      const risk = await assessTransactionRisk(
        {
          params: { walletId, accountId: targetAccount.id, to, value: numericValue, chain: chainInfo.name, gasLimit: gasLimit || "21000" },
          user: request.userId ? { id: request.userId, role: request.auth.role, tags: [] } : undefined,
          wallet: { id: walletId, ownerId: wallet.ownerId, ownerType: wallet.ownerType },
          timestamp: Date.now(),
        },
        walletId
      );

      const policies = await prisma.policy.findMany({ where: { orgId: request.orgId, active: true }, orderBy: { priority: "desc" } });
      const context: EvaluationContext = {
        params: {
          walletId, accountId: targetAccount.id, to, value: numericValue,
          chain: chainInfo.name, gasLimit: gasLimit || "21000",
          ...(decodedFunction ? { contractFunction: decodedFunction.functionName, contractSignature: decodedFunction.signature } : {}),
        },
        user: request.userId ? { id: request.userId, role: request.auth.role, tags: [] } : undefined,
        wallet: { id: walletId, ownerId: wallet.ownerId, ownerType: wallet.ownerType },
        timestamp: Date.now(),
      };

      const isRootUser = request.auth.role === "ORG_ADMIN";
      const policyResult = evaluatePolicies(
        policies.map((p: any) => ({ effect: p.effect as any, conditions: p.conditions as any, consensus: p.consensus as any })),
        context, isRootUser
      );

      await createAuditLog(request.orgId, "POLICY_EVAL", { walletId, to, value, allowed: policyResult.allowed, reason: policyResult.reason, riskScore: risk.score }, request.userId, request);

      if (!policyResult.allowed) {
        await createAuditLog(request.orgId, "POLICY_DENY", { walletId, to, value, reason: policyResult.reason }, request.userId, request);
        triggerWebhookEvents(request.orgId, "policy.triggered", { walletId, to, value, allowed: false, reason: policyResult.reason });
        notifyPolicyDenial(request.orgId, policyResult.reason || "Policy denied", to, value, chainInfo.name).catch(() => {});
        return sendSuccess(reply, { allowed: false, requiresConsensus: policyResult.requiresConsensus, reason: policyResult.reason, riskScore: risk.score, riskFlags: risk.flags }, 200);
      }

      if (policyResult.requiresConsensus && !isRootUser) {
        const consensusLockId = await acquireNonceLock(targetAccount.address);
        let consensusNonce: number | undefined;
        try {
          consensusNonce = await getNextNonce(targetAccount.address, chainInfo.rpcUrl);
        } finally {
          if (consensusLockId) await releaseNonceLock(targetAccount.address, consensusLockId).catch(() => {});
        }

        const tx: ethers.TransactionRequest = {
          to, value: ethers.parseEther(value), chainId: chainInfo.chainId,
          nonce: consensusNonce,
          gasLimit: BigInt(resolvedGasLimit),
          maxFeePerGas: BigInt(resolvedMaxFeePerGas),
          maxPriorityFeePerGas: BigInt(resolvedMaxPriorityFeePerGas),
          data: data || undefined,
          type: 2,
        };

        const signResult = await signTxForWallet(request.orgId!, wallet.encryptedSeed, targetAccount.index, targetAccount.chain.derivationPath, tx);
        const signedTx = signResult.signedTx;
        const wvcAppProof = signResult.appProof ?? null;
        const wvcDevMode = signResult.devMode ?? false;

        const transaction = await prisma.transaction.create({
          data: {
            accountId: targetAccount.id, orgId: request.orgId, chain: chainInfo.name,
            to, value, nonce: consensusNonce, gasLimit: resolvedGasLimit, maxFeePerGas: resolvedMaxFeePerGas, maxPriorityFeePerGas: resolvedMaxPriorityFeePerGas, data, status: "SIGNED", signedTx, riskScore: risk.score,
            sponsored: isSponsored,
          },
        });

        const orgConfig = await prisma.orgConfig.findUnique({ where: { orgId: request.orgId } });
        const quorumThreshold = (orgConfig?.config as any)?.rootQuorumThreshold || 2;

        const approval = await prisma.approvalRequest.create({
          data: {
            orgId: request.orgId,
            actionType: "TRANSACTION",
            targetId: transaction.id,
            transactionId: transaction.id,
            requestedBy: request.userId!,
            requiredApprovals: quorumThreshold,
          },
        });

        await createAuditLog(request.orgId, "APPROVAL_REQUEST", { transactionId: transaction.id, approvalId: approval.id }, request.userId, request);
        triggerWebhookEvents(request.orgId, "transaction.submitted", { transactionId: transaction.id, requiresConsensus: true, approvalId: approval.id, walletId, to, value });
        triggerWebhookEvents(request.orgId, "approval.requested", { approvalId: approval.id, actionType: "TRANSACTION", transactionId: transaction.id, requestedBy: request.userId, requiredApprovals: approval.requiredApprovals });

        return sendSuccess(reply, {
          transactionId: transaction.id,
          status: "AWAITING_APPROVAL",
          requiresConsensus: true,
          approvalId: approval.id,
          riskScore: risk.score,
          riskFlags: risk.flags,
        }, 201);
      }

      lockId = await acquireNonceLock(targetAccount.address);
      lockedAddress = targetAccount.address;

      // Pre-send balance check
      try {
        const balProvider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
        const senderBalance = await Promise.race([
          balProvider.getBalance(targetAccount.address),
          new Promise<bigint>((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 15000)),
        ]);
        const requiredValue = ethers.parseEther(value);
        const requiredGas = BigInt(resolvedGasLimit) * BigInt(resolvedMaxFeePerGas);
        if (senderBalance < requiredValue + requiredGas) {
          throw new AppError(402, `Insufficient funds. Balance: ${ethers.formatEther(senderBalance)} ETH. Required: ${ethers.formatEther(requiredValue + requiredGas)} ETH (value + gas). Get test ETH from https://sepoliafaucet.com`);
        }
      } catch (balanceErr: any) {
        if (balanceErr instanceof AppError) throw balanceErr;
        console.warn("[tx.sign] Balance check failed:", balanceErr.message);
      }

      // Clean up stale SIGNED transactions from previous failed attempts
      // so they don't block the nonce sequence
      await prisma.transaction.updateMany({
        where: {
          accountId: targetAccount.id,
          status: "SIGNED",
          txHash: null,
        },
        data: { status: "FAILED", error: "Cleaned up before new transaction" },
      }).catch(() => {});

      // Use "latest" nonce — this gets the actual mined transaction count,
      // NOT "pending" which includes stuck mempool transactions that will
      // never confirm. This ensures we use the correct next nonce.
      const nonceProvider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
      const nonce = await Promise.race([
        nonceProvider.getTransactionCount(targetAccount.address, "latest"),
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error("RPC timeout fetching nonce")), 15000)),
      ]);

      const tx: ethers.TransactionRequest = {
        to, value: ethers.parseEther(value), chainId: chainInfo.chainId,
        nonce,
        gasLimit: BigInt(resolvedGasLimit),
        maxFeePerGas: BigInt(resolvedMaxFeePerGas),
        maxPriorityFeePerGas: BigInt(resolvedMaxPriorityFeePerGas),
        data: data || undefined,
        type: 2, // EIP-1559 transaction
      };

      const signResult = await signTxForWallet(request.orgId!, wallet.encryptedSeed, targetAccount.index, targetAccount.chain.derivationPath, tx);
      const signedTx = signResult.signedTx;
      const wvcAppProof = signResult.appProof ?? null;
      const wvcDevMode = signResult.devMode ?? false;

      const transaction = await prisma.transaction.create({
        data: {
          accountId: targetAccount.id, orgId: request.orgId, chain: chainInfo.name,
          to, value, nonce, gasLimit: resolvedGasLimit, maxFeePerGas: resolvedMaxFeePerGas, maxPriorityFeePerGas: resolvedMaxPriorityFeePerGas, data, status: "SIGNED", signedTx, riskScore: risk.score,
          sponsored: isSponsored,
        },
      });

      await createAuditLog(request.orgId, "TX_SIGN", { transactionId: transaction.id, walletId, to, value, nonce, riskScore: risk.score }, request.userId, request);

      if (lockId) {
        await releaseNonceLock(lockedAddress, lockId);
        lockId = null;
      }

      try {
        const { hash } = await broadcastTransaction(signedTx, chainInfo.rpcUrl);
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { txHash: hash, status: "BROADCAST" },
        });

        await createAuditLog(request.orgId, "TX_BROADCAST", { transactionId: transaction.id, txHash: hash }, request.userId, request);
        triggerWebhookEvents(request.orgId, "transaction.submitted", { transactionId: transaction.id, txHash: hash, walletId, to, value, nonce });

        if (risk.flags.length > 0 || numericValue > parseFloat(config.gasSponsorship.maxSponsorAmount || "1.0")) {
          notifyLargeTransaction(request.orgId, hash, value, chainInfo.name, to).catch(() => {});
        }

        // Wait up to 60 seconds for on-chain confirmation
        let confirmed = false;
        try {
          const confProvider = new ethers.JsonRpcProvider(chainInfo.rpcUrl);
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const receipt = await Promise.race([
              confProvider.getTransactionReceipt(hash),
              new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
            ]) as any;
            if (receipt) {
              confirmed = receipt.status === 1;
              if (confirmed) {
                await prisma.transaction.update({ where: { id: transaction.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
                triggerWebhookEvents(request.orgId, "transaction.confirmed", { transactionId: transaction.id, txHash: hash });
              } else {
                await prisma.transaction.update({ where: { id: transaction.id }, data: { status: "FAILED", error: "Transaction reverted on-chain" } });
                return sendError(reply, new AppError(400, `Transaction reverted on-chain. Check: ${chainInfo.blockExplorerUrl}/tx/${hash}`));
              }
              break;
            }
          }
        } catch { /* confirmation wait failed — tx still in mempool */ }

        return sendSuccess(reply, {
          transactionId: transaction.id, txHash: hash,
          status: confirmed ? "CONFIRMED" : "BROADCAST",
          confirmed,
          to, value, nonce, chain: chainInfo.name, riskScore: risk.score, riskFlags: risk.flags,
          explorerUrl: chainInfo.blockExplorerUrl ? `${chainInfo.blockExplorerUrl}/tx/${hash}` : undefined,
          ...(wvcAppProof ? { wvcManaged: true, devMode: wvcDevMode, appProof: wvcAppProof } : {}),
        }, 201);
      } catch (broadcastErr: any) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED", error: broadcastErr.message },
        });
        triggerWebhookEvents(request.orgId, "transaction.failed", { transactionId: transaction.id, error: broadcastErr.message });
        notifyTransactionFailed(request.orgId, transaction.id, broadcastErr.message, chainInfo.name).catch(() => {});
        throw broadcastErr;
      }
    } catch (err) {
      return sendError(reply, err);
    } finally {
      if (lockId && lockedAddress) {
        await releaseNonceLock(lockedAddress, lockId).catch(() => {});
      }
    }
  });

  app.post("/transactions/simulate", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId, chain: chainName, to, value, gasLimit, maxFeePerGas, data } = request.body as {
        walletId: string; chain?: string; to: string; value?: string; gasLimit?: string; maxFeePerGas?: string; data?: string;
      };
      if (!walletId || !to) throw new ValidationError("walletId and to required");

      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: { accounts: { include: { chain: true } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");

      const targetAccount = chainName
        ? wallet.accounts.find((a) => a.chain.name === chainName)
        : wallet.accounts[0];
      if (!targetAccount) throw new NotFoundError("Account");

      const chainInfo = await getChainById(targetAccount.chainId);

      const tx: ethers.TransactionRequest = {
        to,
        from: targetAccount.address,
        value: value ? ethers.parseEther(value) : 0n,
        gasLimit: gasLimit ? BigInt(gasLimit) : undefined,
        maxFeePerGas: maxFeePerGas ? BigInt(maxFeePerGas) : undefined,
        data: data || "0x",
      };

      const result = await simulateTransaction(tx, chainInfo.rpcUrl, targetAccount.address);
      await createAuditLog(request.orgId, "TX_SIMULATE", { walletId, to, value, success: result.success }, request.userId, request);

      return sendSuccess(reply, result);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/transactions/:id", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const tx = await prisma.transaction.findFirst({
        where: { id, orgId: request.orgId },
        include: { account: { include: { chain: { select: { name: true, chainId: true } } } } },
      });
      if (!tx) throw new NotFoundError("Transaction");

      if (tx.txHash && (tx.status === "BROADCAST" || tx.status === "SIGNED")) {
        try {
          const account = await prisma.walletAccount.findUnique({ where: { id: tx.accountId }, include: { chain: true } });
          if (account) {
            const { status } = await getTransactionStatus(tx.txHash, account.chain.rpcUrl);
            if (status === "CONFIRMED" && String(tx.status) !== "CONFIRMED") {
              await prisma.transaction.update({
                where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() },
              });
              triggerWebhookEvents(request.orgId, "transaction.confirmed", { transactionId: id, txHash: tx.txHash });
            } else if (status === "FAILED" && String(tx.status) !== "FAILED") {
              await prisma.transaction.update({ where: { id }, data: { status: "FAILED" } });
            }
          }
        } catch {}
      }

      const updated = await prisma.transaction.findUnique({
        where: { id },
        include: { account: { include: { chain: { select: { name: true, chainId: true } } } } },
      });
      return sendSuccess(reply, updated);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get("/transactions", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { limit, offset } = parsePagination(request.query as { limit?: string; offset?: string });
      const { status, chain, walletId, search } = request.query as { status?: string; chain?: string; walletId?: string; search?: string };

      const where: any = { orgId: request.orgId };
      if (status) where.status = status;
      if (chain) where.chain = chain;
      if (walletId) {
        const accounts = await prisma.walletAccount.findMany({ where: { walletId }, select: { id: true } });
        if (accounts.length > 0) where.accountId = { in: accounts.map((a) => a.id) };
      }
      if (search) {
        where.OR = [
          { txHash: { contains: search, mode: "insensitive" } },
          { to: { contains: search, mode: "insensitive" } },
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

  app.post("/transactions/:id/retry", { preHandler: [authMiddleware] }, async (request, reply) => {
    let lockId: string | null = null;
    let account: any = null;
    try {
      const { id } = request.params as { id: string };
      const tx = await prisma.transaction.findFirst({ where: { id, orgId: request.orgId } });
      if (!tx) throw new NotFoundError("Transaction");
      if (!["FAILED", "PENDING"].includes(tx.status)) throw new ValidationError("Can only retry failed or pending transactions");

      account = await prisma.walletAccount.findUnique({ where: { id: tx.accountId }, include: { chain: true } });
      if (!account) throw new NotFoundError("Account");

      const retryCount = await prisma.transaction.count({ where: { replacementFor: id } });
      if (retryCount >= config.txRetry.maxRetries) throw new ValidationError("Max retries exceeded");

      const wallet = await prisma.wallet.findFirst({ where: { id: account.walletId, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.status === "FROZEN") throw new ForbiddenError("Wallet is frozen");

      lockId = await acquireNonceLock(account.address);
      const nonce = await getNextNonce(account.address, account.chain.rpcUrl);

      const txData: ethers.TransactionRequest = {
        to: tx.to,
        value: ethers.parseEther(tx.value),
        chainId: account.chain.chainId,
        nonce: tx.nonce ?? nonce,
        gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
        maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
        data: tx.data || undefined,
      };

      const { signedTx } = await signTxForWallet(request.orgId!, wallet.encryptedSeed, account.index, account.chain.derivationPath, txData);

      const retryTx = await prisma.transaction.create({
        data: {
          accountId: tx.accountId, orgId: tx.orgId, chain: tx.chain,
          to: tx.to, value: tx.value, nonce: tx.nonce ?? nonce,
          gasLimit: tx.gasLimit, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
          data: tx.data, status: "SIGNED", signedTx, replacementFor: id,
        },
      });

      await createAuditLog(request.orgId, "TX_RETRY", { transactionId: retryTx.id, originalTxId: id, retryCount: retryCount + 1 }, request.userId, request);

      try {
        const { hash } = await broadcastTransaction(signedTx, account.chain.rpcUrl);
        await prisma.transaction.update({ where: { id: retryTx.id }, data: { txHash: hash, status: "BROADCAST" } });
        await prisma.transaction.update({ where: { id }, data: { status: "REPLACED" } });

        return sendSuccess(reply, { transactionId: retryTx.id, txHash: hash, status: "BROADCAST", replaced: id }, 201);
      } catch (broadcastErr: any) {
        await prisma.transaction.update({ where: { id: retryTx.id }, data: { status: "FAILED", error: broadcastErr.message } });
        throw broadcastErr;
      }
    } catch (err) {
      return sendError(reply, err);
    } finally {
      if (lockId && account) await releaseNonceLock(account.address, lockId).catch(() => {});
    }
  });

  app.post("/transactions/:id/cancel", { preHandler: [authMiddleware] }, async (request, reply) => {
    let lockId: string | null = null;
    let lockedAccount: { address: string } | null = null;
    try {
      const { id } = request.params as { id: string };
      const tx = await prisma.transaction.findFirst({ where: { id, orgId: request.orgId } });
      if (!tx) throw new NotFoundError("Transaction");
      if (!["PENDING", "SIGNED", "BROADCAST"].includes(tx.status)) throw new ValidationError("Transaction cannot be cancelled in current state");

      const account = await prisma.walletAccount.findUnique({ where: { id: tx.accountId }, include: { chain: true } });
      if (!account) throw new NotFoundError("Account");
      lockedAccount = account;

      const wallet = await prisma.wallet.findFirst({ where: { id: account.walletId, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      lockId = await acquireNonceLock(account.address);
      const cancelNonce = tx.nonce || await getNextNonce(account.address, account.chain.rpcUrl);

      const cancelTx: ethers.TransactionRequest = {
        to: account.address,
        value: 0n,
        chainId: account.chain.chainId,
        nonce: cancelNonce,
      };

      const { signedTx: signedCancel } = await signTxForWallet(request.orgId!, wallet.encryptedSeed, account.index, account.chain.derivationPath, cancelTx);

      const cancelTransaction = await prisma.transaction.create({
        data: {
          accountId: tx.accountId, orgId: tx.orgId, chain: tx.chain,
          to: account.address, value: "0", nonce: cancelTx.nonce,
          status: "SIGNED", signedTx: signedCancel,
        },
      });

      await createAuditLog(request.orgId, "TX_CANCEL", { transactionId: cancelTransaction.id, cancelledTxId: id }, request.userId, request);

      try {
        const { hash } = await broadcastTransaction(signedCancel, account.chain.rpcUrl);
        await prisma.transaction.update({ where: { id: cancelTransaction.id }, data: { txHash: hash, status: "BROADCAST" } });
        await prisma.transaction.update({ where: { id }, data: { status: "CANCELLED" } });

        return sendSuccess(reply, { transactionId: cancelTransaction.id, txHash: hash, status: "BROADCAST", cancelled: id }, 201);
      } catch (broadcastErr: any) {
        await prisma.transaction.update({ where: { id: cancelTransaction.id }, data: { status: "FAILED", error: broadcastErr.message } });
        throw broadcastErr;
      }
    } catch (err) {
      return sendError(reply, err);
    } finally {
      if (lockId && lockedAccount) await releaseNonceLock(lockedAccount.address, lockId).catch(() => {});
    }
  });

  app.post("/transactions/:id/speed-up", { preHandler: [authMiddleware] }, async (request, reply) => {
    let lockId: string | null = null;
    let lockedAddress: string | null = null;
    try {
      const { id } = request.params as { id: string };
      const { gasMultiplier } = request.body as { gasMultiplier?: number };
      const multiplier = gasMultiplier || 1.2;

      const tx = await prisma.transaction.findFirst({ where: { id, orgId: request.orgId } });
      if (!tx) throw new NotFoundError("Transaction");
      if (!["PENDING", "SIGNED", "BROADCAST"].includes(tx.status)) throw new ValidationError("Can only speed up pending transactions");

      const account = await prisma.walletAccount.findUnique({ where: { id: tx.accountId }, include: { chain: true } });
      if (!account) throw new NotFoundError("Account");

      const wallet = await prisma.wallet.findFirst({ where: { id: account.walletId, orgId: request.orgId } });
      if (!wallet) throw new NotFoundError("Wallet");

      lockId = await acquireNonceLock(account.address);
      lockedAddress = account.address;

      const currentGas = BigInt(tx.maxFeePerGas || "0");
      const newGas = currentGas * BigInt(Math.floor(multiplier * 100)) / 100n;

      if (newGas <= currentGas) throw new ValidationError("New gas price must be higher than current");

      const txData: ethers.TransactionRequest = {
        to: tx.to,
        value: ethers.parseEther(tx.value),
        chainId: account.chain.chainId,
        nonce: tx.nonce!,
        gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
        maxFeePerGas: newGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) * BigInt(Math.floor(multiplier * 100)) / 100n : undefined,
        data: tx.data || undefined,
      };

      const { signedTx } = await signTxForWallet(request.orgId!, wallet.encryptedSeed, account.index, account.chain.derivationPath, txData);

      const replaceTx = await prisma.transaction.create({
        data: {
          accountId: tx.accountId, orgId: tx.orgId, chain: tx.chain,
          to: tx.to, value: tx.value, nonce: tx.nonce,
          gasLimit: tx.gasLimit, maxFeePerGas: newGas.toString(),
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? (BigInt(tx.maxPriorityFeePerGas) * BigInt(Math.floor(multiplier * 100)) / 100n).toString() : undefined,
          data: tx.data, status: "SIGNED", signedTx, replacementFor: id,
        },
      });

      await createAuditLog(request.orgId, "TX_REPLACE", { transactionId: replaceTx.id, replacedTxId: id }, request.userId, request);

      try {
        const { hash } = await broadcastTransaction(signedTx, account.chain.rpcUrl);
        await prisma.transaction.update({ where: { id: replaceTx.id }, data: { txHash: hash, status: "BROADCAST" } });
        await prisma.transaction.update({ where: { id }, data: { status: "REPLACED" } });

        return sendSuccess(reply, { transactionId: replaceTx.id, txHash: hash, status: "BROADCAST", replaced: id }, 201);
      } catch (broadcastErr: any) {
        await prisma.transaction.update({ where: { id: replaceTx.id }, data: { status: "FAILED", error: broadcastErr.message } });
        throw broadcastErr;
      }
    } catch (err) {
      return sendError(reply, err);
    } finally {
      if (lockId && lockedAddress) await releaseNonceLock(lockedAddress, lockId).catch(() => {});
    }
  });

  app.get("/accounts/:address/nonce", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { address } = request.params as { address: string };
      const { chain: chainName } = request.query as { chain?: string };

      const account = await prisma.walletAccount.findFirst({
        where: { address, wallet: { orgId: request.orgId } },
        include: { chain: true },
      });
      if (!account) throw new NotFoundError("Account");

      const rpcUrl = chainName
        ? (await prisma.chain.findUnique({ where: { name: chainName } }))?.rpcUrl || account.chain.rpcUrl
        : account.chain.rpcUrl;

      const nonce = await getNextNonce(address, rpcUrl);

      return sendSuccess(reply, { address, nonce, chain: account.chain.name });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/transactions/estimate-fee", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { to, value, data, chain: chainName } = request.body as { to: string; value: string; data?: string; chain?: string };

      if (!to) throw new ValidationError("to is required");

      let rpcUrl = config.defaultRpcUrl;
      let feeChainId = config.defaultChainId;
      let chainSymbol = "ETH";

      if (chainName) {
        try {
          const chainInfo = await prisma.chain.findUnique({ where: { name: chainName } });
          if (chainInfo) {
            rpcUrl = chainInfo.rpcUrl;
            feeChainId = chainInfo.chainId;
            chainSymbol = chainInfo.symbol;
          }
        } catch {}
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const tx: ethers.TransactionRequest = {
        to, value: value ? ethers.parseEther(value) : 0n, data: data || undefined,
      };
      const gasLimit = await provider.estimateGas(tx);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits("20", "gwei");
      const estimatedFee = gasLimit * gasPrice;

      return sendSuccess(reply, {
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
        estimatedFee: ethers.formatEther(estimatedFee),
        estimatedFeeWei: estimatedFee.toString(),
        chain: chainName || "sepolia",
        chainId: feeChainId,
        currency: chainSymbol,
      });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post("/transactions/sign-message", { preHandler: [authMiddleware] }, async (request, reply) => {
    try {
      const { walletId, chain: chainName, message } = request.body as {
        walletId: string; chain?: string; message: string;
      };

      if (!walletId || message === undefined) {
        throw new ValidationError("walletId and message are required");
      }

      const wallet = await prisma.wallet.findFirst({
        where: { id: walletId, orgId: request.orgId },
        include: { accounts: { include: { chain: true } } },
      });
      if (!wallet) throw new NotFoundError("Wallet");
      if (wallet.status === "FROZEN") throw new ForbiddenError("Wallet is frozen — message signing is blocked");

      const targetAccount = chainName
        ? wallet.accounts.find((a) => a.chain.name === chainName)
        : wallet.accounts[0];

      if (!targetAccount) throw new NotFoundError("Account for chain");

      if (isWvcWallet(wallet.encryptedSeed)) {
        throw new ValidationError("Message signing is not supported for WVC-managed wallets — the enclave only exposes transaction signing. Use the transaction sign endpoint instead.");
      }

      const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);
      const derived = deriveAccount(mnemonic, targetAccount.index, targetAccount.chain.derivationPath);

      // Sign message using ethers.js
      const signature = await signMessage(derived.privateKey, message);

      await createAuditLog(
        request.orgId,
        "WALLET_SIGN_MESSAGE",
        { walletId, address: targetAccount.address, chain: targetAccount.chain.name, messageLength: message.length },
        request.userId,
        request
      );

      return sendSuccess(reply, {
        signature,
        address: targetAccount.address,
        chain: targetAccount.chain.name,
      }, 201);
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
