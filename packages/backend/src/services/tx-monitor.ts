import prisma from "../db.js";
import { getTransactionStatus } from "../utils/enclave.js";
import { triggerWebhookEvents } from "../modules/webhook/routes.js";
import { notifyTransactionStatus } from "./websocket.js";

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startTransactionMonitor(intervalMs = 30000) {
  if (monitorInterval) return;

  monitorInterval = setInterval(async () => {
    try {
      const pendingTxs = await prisma.transaction.findMany({
        where: {
          status: { in: ["SIGNED", "BROADCAST"] },
          txHash: { not: null },
        },
        include: {
          account: { include: { chain: true } },
        },
        take: 50,
      });

      for (const tx of pendingTxs) {
        if (!tx.txHash) continue;

        try {
          const chain = tx.account?.chain;
          if (!chain) continue;

          const { status: onChainStatus, confirmations } = await getTransactionStatus(tx.txHash, chain.rpcUrl);

          if (onChainStatus === "CONFIRMED" && tx.status !== "CONFIRMED") {
            await prisma.transaction.update({
              where: { id: tx.id },
              data: { status: "CONFIRMED", confirmedAt: new Date() },
            });

            triggerWebhookEvents(tx.orgId, "transaction.confirmed", {
              transactionId: tx.id,
              txHash: tx.txHash,
              confirmations,
            });

            notifyTransactionStatus(tx.orgId, tx.id, "CONFIRMED", tx.txHash);
          } else if (onChainStatus === "FAILED" && tx.status !== "FAILED") {
            await prisma.transaction.update({
              where: { id: tx.id },
              data: { status: "FAILED" },
            });

            triggerWebhookEvents(tx.orgId, "transaction.failed", {
              transactionId: tx.id,
              txHash: tx.txHash,
            });

            notifyTransactionStatus(tx.orgId, tx.id, "FAILED", tx.txHash);
          }
        } catch (err: any) {
          if (err.code === "CALL_EXCEPTION" || err.message?.includes("not found")) {
            await prisma.transaction.update({
              where: { id: tx.id },
              data: { status: "FAILED" },
            }).catch(() => {});

            triggerWebhookEvents(tx.orgId, "transaction.failed", {
              transactionId: tx.id,
              txHash: tx.txHash,
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error("[TX-MONITOR] Error monitoring transactions:", err);
    }
  }, intervalMs);

  console.log(`[TX-MONITOR] Started with ${intervalMs}ms interval`);
}

export function stopTransactionMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[TX-MONITOR] Stopped");
  }
}
