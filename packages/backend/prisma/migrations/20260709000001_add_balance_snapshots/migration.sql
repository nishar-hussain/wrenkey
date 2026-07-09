-- CreateTable
CREATE TABLE "wallet_balance_snapshots" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "balance" TEXT NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_balance_snapshots_wallet_id_chain_id_snapshot_at_idx" ON "wallet_balance_snapshots"("wallet_id", "chain_id", "snapshot_at" DESC);

-- CreateIndex
CREATE INDEX "wallet_balance_snapshots_snapshot_at_idx" ON "wallet_balance_snapshots"("snapshot_at");

-- AddForeignKey
ALTER TABLE "wallet_balance_snapshots" ADD CONSTRAINT "wallet_balance_snapshots_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_balance_snapshots" ADD CONSTRAINT "wallet_balance_snapshots_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
