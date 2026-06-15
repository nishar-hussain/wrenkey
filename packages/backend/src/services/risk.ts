import { EvaluationContext } from "../modules/policy/engine.js";
import prisma from "../db.js";
import { config } from "../config.js";
import { getRedis } from "../redis.js";

export interface RiskResult {
  score: number;
  flags: string[];
  requiresApproval: boolean;
}

export async function assessTransactionRisk(context: EvaluationContext, walletId: string): Promise<RiskResult> {
  const flags: string[] = [];
  let score = 0;

  const value = Number(context.params.value) || 0;
  const to = String(context.params.to || "").toLowerCase();

  if (value > 0) {
    const recentTxs = await prisma.transaction.findMany({
      where: {
        account: { walletId },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { value: true, to: true },
    });

    const avgValue = recentTxs.length > 0
      ? recentTxs.reduce((sum, tx) => sum + parseFloat(tx.value || "0"), 0) / recentTxs.length
      : 0;

    if (avgValue > 0 && value > avgValue * 5) {
      score += 30;
      flags.push("UNUSUALLY_HIGH_VALUE");
    }

    if (value > avgValue * 10 && avgValue > 0) {
      score += 20;
      flags.push("EXTREME_VALUE_SPIKE");
    }

    const knownRecipients = new Set(recentTxs.map((tx) => tx.to.toLowerCase()));
    if (recentTxs.length > 5 && !knownRecipients.has(to)) {
      score += 20;
      flags.push("NEW_RECIPIENT");
    }
  }

  const hour = new Date().getUTCHours();
  if (hour < 6 || hour > 22) {
    score += 5;
    flags.push("OFF_HOURS");
  }

  const velocityCheck = await checkVelocity(walletId);
  if (velocityCheck.exceeded) {
    score += 40;
    flags.push("VELOCITY_EXCEEDED");
  }

  if (isBurnAddress(to) || isKnownScamAddress(to)) {
    score += 100;
    flags.push("HIGH_RISK_RECIPIENT");
  }

  return {
    score: Math.min(score, 100),
    flags,
    requiresApproval: score >= config.riskThresholds.highRiskScoreThreshold,
  };
}

export async function checkVelocity(walletId: string): Promise<{ exceeded: boolean; count: number }> {
  try {
    const redis = getRedis();
    const key = `velocity:wallet:${walletId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.riskThresholds.velocityWindowSeconds);
    }
    return {
      exceeded: count > config.riskThresholds.maxTxPerWindow,
      count,
    };
  } catch {
    return { exceeded: false, count: 0 };
  }
}

const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0x0000000000000000000000000000000000000001",
];

function isBurnAddress(address: string): boolean {
  return BURN_ADDRESSES.includes(address.toLowerCase());
}

function isKnownScamAddress(_address: string): boolean {
  return false;
}

export async function validateSpendingLimits(
  orgId: string,
  walletId: string,
  chainId: string,
  value: number,
  to: string
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await prisma.spendingLimit.findMany({
    where: {
      orgId,
      active: true,
      OR: [
        { walletId },
        { walletId: null },
      ],
    },
  });

  for (const limit of limits) {
    if (limit.walletId && limit.walletId !== walletId) continue;
    if (limit.chainId && limit.chainId !== chainId) continue;

    if (limit.denylist.length > 0 && limit.denylist.map((a) => a.toLowerCase()).includes(to.toLowerCase())) {
      return { allowed: false, reason: `Address ${to} is denylisted by spending limit "${limit.name}"` };
    }

    if (limit.allowlist.length > 0 && !limit.allowlist.map((a) => a.toLowerCase()).includes(to.toLowerCase())) {
      return { allowed: false, reason: `Address ${to} is not in allowlist for "${limit.name}"` };
    }

    if (limit.maxPerTx) {
      const maxPerTx = parseFloat(limit.maxPerTx);
      if (value > maxPerTx) {
        return { allowed: false, reason: `Transaction value ${value} exceeds max-per-tx ${maxPerTx} for "${limit.name}"` };
      }
    }

    if (limit.maxDaily) {
      const dailyTotal = await getDailyTotal(walletId);
      const maxDaily = parseFloat(limit.maxDaily);
      if (dailyTotal + value > maxDaily) {
        return { allowed: false, reason: `Daily total would exceed ${maxDaily} for "${limit.name}"` };
      }
    }

    if (limit.maxMonthly) {
      const monthlyTotal = await getMonthlyTotal(walletId);
      const maxMonthly = parseFloat(limit.maxMonthly);
      if (monthlyTotal + value > maxMonthly) {
        return { allowed: false, reason: `Monthly total would exceed ${maxMonthly} for "${limit.name}"` };
      }
    }
  }

  return { allowed: true };
}

async function getDailyTotal(walletId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const txs = await prisma.transaction.findMany({
    where: {
      account: { walletId },
      status: { in: ["CONFIRMED", "BROADCAST"] },
      createdAt: { gte: startOfDay },
    },
    select: { value: true },
  });

  return txs.reduce((sum, tx) => sum + parseFloat(tx.value || "0"), 0);
}

async function getMonthlyTotal(walletId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const txs = await prisma.transaction.findMany({
    where: {
      account: { walletId },
      status: { in: ["CONFIRMED", "BROADCAST"] },
      createdAt: { gte: startOfMonth },
    },
    select: { value: true },
  });

  return txs.reduce((sum, tx) => sum + parseFloat(tx.value || "0"), 0);
}
