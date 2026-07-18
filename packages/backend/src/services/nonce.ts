import prisma from "../db.js";
import { getRedis } from "../redis.js";
import { randomUUID } from "crypto";

const NONCE_LOCK_PREFIX = "nonce_lock:";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function acquireNonceLock(address: string, timeoutMs = 15000): Promise<string | null> {
  let lockId: string | null = null;
  try {
    const redis = getRedis();
    const lockKey = `${NONCE_LOCK_PREFIX}${address}`;
    lockId = `${Date.now()}-${randomUUID()}`;

    const acquired = await redis.set(lockKey, lockId, "PX", timeoutMs, "NX");
    if (!acquired) {
      throw new Error("Nonce lock busy — concurrent transaction in progress for this address");
    }

    return lockId;
  } catch (err: any) {
    if (err.message?.includes("Redis not connected")) {
      console.warn("[nonce] Redis unavailable — skipping nonce lock for", address);
      return null;
    }
    throw err;
  }
}

export async function releaseNonceLock(address: string, lockId: string | null): Promise<void> {
  if (!lockId) return;

  try {
    const redis = getRedis();
    const lockKey = `${NONCE_LOCK_PREFIX}${address}`;

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
      return 0
    `;
    await redis.eval(script, 1, lockKey, lockId);
  } catch (err: any) {
    if (err.message?.includes("Redis not connected")) return;
    throw err;
  }
}

export async function getNextNonce(address: string, rpcUrl: string, useDbTracking = true): Promise<number> {
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Always use "latest" — this gets the actual mined transaction count.
  // Using "pending" includes stuck mempool transactions that will never confirm,
  // causing new transactions to use a nonce the network has never seen.
  const onChainNonce = await withTimeout(provider.getTransactionCount(address, "latest"), 15000);

  if (!useDbTracking) {
    return onChainNonce;
  }

  // Only count BROADCAST transactions with a txHash (actually sent to the network)
  // from the last 30 minutes. Stale "SIGNED" transactions from failed broadcasts
  // must NOT inflate the nonce.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const latestTx = await prisma.transaction.findFirst({
    where: {
      account: { address },
      status: "BROADCAST",
      txHash: { not: null },
      nonce: { not: null },
      createdAt: { gte: thirtyMinAgo },
    },
    orderBy: { nonce: "desc" },
    select: { nonce: true },
  });

  const dbNonce = latestTx?.nonce;
  if (dbNonce !== null && dbNonce !== undefined) {
    return Math.max(onChainNonce, dbNonce + 1);
  }

  return onChainNonce;
}
