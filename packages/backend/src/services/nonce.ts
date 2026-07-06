import prisma from "../db.js";
import { getRedis } from "../redis.js";
import { randomUUID } from "crypto";

const NONCE_LOCK_PREFIX = "nonce_lock:";

export async function acquireNonceLock(address: string, timeoutMs = 15000): Promise<string> {
  const redis = getRedis();
  const lockKey = `${NONCE_LOCK_PREFIX}${address}`;
  const lockId = `${Date.now()}-${randomUUID()}`;

  const acquired = await redis.set(lockKey, lockId, "PX", timeoutMs, "NX");
  if (!acquired) {
    throw new Error("Nonce lock busy — concurrent transaction in progress for this address");
  }

  return lockId;
}

export async function releaseNonceLock(address: string, lockId: string): Promise<void> {
  const redis = getRedis();
  const lockKey = `${NONCE_LOCK_PREFIX}${address}`;

  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    end
    return 0
  `;
  await redis.eval(script, 1, lockKey, lockId);
}

export async function getNextNonce(address: string, rpcUrl: string, useDbTracking = true): Promise<number> {
  if (!useDbTracking) {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return provider.getTransactionCount(address, "pending");
  }

  const onChainNonce = await (async () => {
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return provider.getTransactionCount(address, "pending");
  })();

  const latestTx = await prisma.transaction.findFirst({
    where: {
      account: { address },
      status: { in: ["PENDING", "SIGNED", "BROADCAST"] },
      nonce: { not: null },
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
