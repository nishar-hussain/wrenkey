"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/skeleton";

interface BalanceInfo {
  address: string;
  balance: string;
  chain: string;
}

interface ExportInfo {
  mnemonic: string;
  accounts: Array<{ chain: string; address: string; derivationPath: string; index: number }>;
}

interface WalletDetail {
  id: string;
  name: string;
  ownerType: string;
  ownerId: string;
  status: string;
  tags: string[];
  accounts: Array<{ id: string; chain: string; address: string; derivationPath: string; index: number }>;
  createdAt: string;
}

interface TxItem {
  id: string;
  txHash?: string;
  to: string;
  value: string;
  status: string;
  createdAt: string;
}

export default function WalletDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState<ExportInfo | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [walletRes, txRes, balRes]: any[] = await Promise.all([
        apiFetch(`/wallets/${params.id}`, { token }),
        apiFetch(`/transactions?limit=50`, { token }),
        apiFetch(`/wallets/${params.id}/balance`, { token }).catch(() => null),
      ]);
      setWallet(walletRes);
      setTransactions(txRes.data);
      if (balRes) setBalance(balRes);
    } catch (err: any) {
      setError(err.message || "Failed to load wallet");
      addToast(err.message || "Failed to load wallet", "error");
    } finally { setLoading(false); }
  }, [token, params.id]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData, router]);

  const deriveNewAccount = async () => {
    try {
      await apiFetch(`/wallets/${params.id}/accounts`, { method: "POST", body: JSON.stringify({ chain: "arc" }), token: token! });
      addToast("Account derived successfully", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to derive account", "error");
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res: any = await apiFetch(`/wallets/${params.id}/export`, { method: "POST", token: token! });
      setExportData(res);
    } catch (err: any) {
      addToast(err.message || "Failed to export wallet", "error");
    } finally { setExportLoading(false); }
  };

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <Card><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card>
        <Card><CardContent><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 mb-4">{error || "Wallet not found"}</p>
        <Button variant="secondary" onClick={() => router.push("/wallets")}>Back to Wallets</Button>
      </div>
    );
  }

  const accountColumns = [
    { key: "index", header: "#" },
    { key: "chain", header: "Chain" },
    { key: "address", header: "Address", render: (a: any) => <span className="font-mono text-xs">{a.address}</span> },
    { key: "derivationPath", header: "Path", render: (a: any) => <span className="font-mono text-xs">{a.derivationPath}</span> },
  ];

  const txColumns = [
    { key: "txHash", header: "Tx Hash", render: (tx: any) => tx.txHash ? <span className="font-mono text-xs">{tx.txHash.slice(0, 12)}...</span> : "-" },
    { key: "to", header: "To", render: (tx: any) => <span className="font-mono text-xs">{tx.to.slice(0, 12)}...</span> },
    { key: "value", header: "Value" },
    { key: "status", header: "Status", render: (tx: any) => <StatusBadge status={tx.status} /> },
    { key: "createdAt", header: "Date", render: (tx: any) => new Date(tx.createdAt).toLocaleString() },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{wallet.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Status: <StatusBadge status={wallet.status} /> | Owner: {wallet.ownerType}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/wallets")}>Back</Button>
          <Button variant="secondary" onClick={() => { setShowExport(true); setExportData(null); }}>Export</Button>
          <Button onClick={deriveNewAccount}>Derive Account</Button>
        </div>
      </div>

      {balance && (
        <Card className="mb-6">
          <CardHeader><h2 className="font-semibold">Balance</h2></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500">Address</p>
                <p className="font-mono text-sm break-all">{balance.address}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Balance</p>
                <p className="text-2xl font-bold">{parseFloat(balance.balance).toFixed(6)} <span className="text-sm text-slate-500">{balance.chain.toUpperCase()}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader><h2 className="font-semibold">Accounts ({wallet.accounts.length})</h2></CardHeader>
          <CardContent className="p-0">
            <Table columns={accountColumns} data={wallet.accounts} emptyMessage="No accounts derived." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">Recent Transactions</h2></CardHeader>
          <CardContent className="p-0">
            <Table columns={txColumns} data={transactions} emptyMessage="No transactions yet." />
          </CardContent>
        </Card>
      </div>

      <Modal open={showExport} onClose={() => { setShowExport(false); setExportData(null); }} title="Export Wallet">
        {exportData ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Warning: Never share your mnemonic!</p>
              <p className="text-amber-600 mt-1">Anyone with this phrase can access your wallet.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Mnemonic Phrase</label>
              <Input value={exportData.mnemonic} readOnly className="font-mono text-sm" />
            </div>
            {exportData.accounts.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Accounts ({exportData.accounts.length})</p>
                <div className="space-y-1 text-xs font-mono">
                  {exportData.accounts.map((acc, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded">{acc.address} [{acc.chain}]</div>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={() => { setShowExport(false); setExportData(null); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Export wallet seed phrase</p>
              <p className="text-amber-600 mt-1">This will reveal the mnemonic phrase. Ensure you are in a secure environment.</p>
            </div>
            <Button onClick={handleExport} disabled={exportLoading} className="w-full">
              {exportLoading ? "Exporting..." : "Reveal Mnemonic"}
            </Button>
            <Button onClick={() => setShowExport(false)} variant="secondary" className="w-full">Cancel</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}