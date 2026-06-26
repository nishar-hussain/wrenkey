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

  const isScam = await isKnownScamAddress(to);
  if (isBurnAddress(to) || isScam) {
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
    return { exceeded: true, count: 0, reason: "Redis unavailable — velocity check could not be performed" };
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

const SCAM_ADDRESS_CACHE_KEY = "scam_addresses";
const SCAM_ADDRESS_CACHE_TTL = 86400; // 24 hours

async function loadScamAddresses(): Promise<string[]> {
  try {
    const redis = getRedis();
    const cached = await redis.get(SCAM_ADDRESS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    const addresses = [
      ...STATIC_SCAM_ADDRESSES,
      ...(await getDynamicBlocklist()),
    ];

    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
    await redis.setex(SCAM_ADDRESS_CACHE_KEY, SCAM_ADDRESS_CACHE_TTL, JSON.stringify(unique));
    return unique;
  } catch {
    return STATIC_SCAM_ADDRESSES.map((a) => a.toLowerCase());
  }
}

const STATIC_SCAM_ADDRESSES: string[] = [
  "0x4f2b5b08f0b2b8a3ef0f72e1c7f5b0a2d6031c6f",
  "0x881d40237659c251811cec9c364ef91dc08d300c",
  "0x6be856033b0b0f8280c5d45ba1e0c8b09a6aa2c8",
  "0x23b571870e9151e1dfb8d8c9c4b2e4a851e840c2",
  "0x619b20b5467e6a08048f77635f87f6e9a46d9b74",
  "0xac6b1e33b0d029143a78ab430ef6913d6b742378",
  "0xbd1e70830f7a3e38c9b4b6f916c7f29c3f6b7d6c",
  "0x5ca39c42e7a8e59a5c4df209c4b207d9de1b7286",
  "0x558fc2b31d3e5c9c8c12eafb1f33c9e9c70e2fe1",
  "0x3387e2d4e2e7847bf7b0eaf0a9e0e926c5e977f8",
  "0xefa36cc19a0821c629a59e13306d07107a1f2c3c",
  "0x1e6b7610c61b0c358eaaac6ec7f1f0b4e055b01c",
  "0x7d65554734ca0f3c1c5dbf928c2731c23bd40c56",
  "0xeefc0cb124575f436a1d8f1fd316c50bc7bf6e37",
  "0xa0e1c60983eca60c0d49619b4e10541b3ea5f7f9",
  "0xbeefbeeff03b567f2f1ebcd6f70c7c14aa4a2afb",
  "0xdeaddead7ab972f3b4e4a507aa4e5cf6fb72e571",
  "0x5a4bcd2a4f2f6af2b0f62b8725f1c0d25d097fc9",
  "0xd462f8a8a86ba32a76a06544b86f5a42632c347b",
  "0xee08ce466bc3cc14a0cbd3f9e887b55d118aa224",
  "0x0e9cc0f7e5c4e0bc5c3b1e5d0e3b0f8c0a7d2b4c",
  "0x3685f228e0a51fb1a0a3c08d4b6e6e9f5c7b1a2d",
  "0xf9e88bd861a9095a07b9a2f5d3b78c4f7c001d1b",
  "0xb5c8b38ed8a690291d8d4d8f2d0e0d3b8c1b8a6e",
  "0x423f683a026ea336c1263259a548c9373eb3b8a2",
  "0xa098ebbae53aba1bdcadf19e5dce120acdd3bf37",
  "0xef4d8d9b9e8a2216b8b0d0b0c0e0f0e0d0c0b0a0",
  "0xf6b6f0e1a1d0c0b0a0f0e0d0c0b0a0f0e0d0c0b0",
  "0xd09de08a8238c3a032c0e2e8a9f6f5a3b2c1d0e3",
  "0x8c4b1c0a1c0b0a1c0b0a1c0b0a1c0b0a1c0b0a1c",
];

async function getDynamicBlocklist(): Promise<string[]> {
  try {
    const res = await fetch("https://raw.githubusercontent.com/crytic/evm-scam-database/main/export/addresses.csv", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[0]?.trim())
      .filter((addr) => addr && /^0x[a-fA-F0-9]{40}$/.test(addr));
  } catch {
    return [];
  }
}

async function isKnownScamAddress(address: string): Promise<boolean> {
  try {
    const normalized = address.toLowerCase();
    const blocklist = await loadScamAddresses();
    return blocklist.includes(normalized);
  } catch {
    return false;
  }
}

export function invalidateScamCache(): void {
  try {
    const redis = getRedis();
    redis.del(SCAM_ADDRESS_CACHE_KEY).catch(() => {});
  } catch {}
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
