"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";

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
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [walletRes, txRes]: any[] = await Promise.all([
        apiFetch(`/wallets/${params.id}`, { token }),
        apiFetch(`/transactions?limit=50`, { token }),
      ]);
      setWallet(walletRes);
      setTransactions(txRes.data);
    } catch {} finally { setLoading(false); }
  }, [token, params.id]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const deriveNewAccount = async () => {
    try {
      await apiFetch(`/wallets/${params.id}/accounts`, { method: "POST", body: JSON.stringify({ chain: "arc" }), token: token! });
      addToast("Account derived successfully", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message, "error");
    }
  };

  if (!isAuthenticated || loading) return <div className="text-center py-12 text-slate-400">Loading...</div>;
  if (!wallet) return <div className="text-center py-12 text-slate-400">Wallet not found</div>;

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
          <p className="text-sm text-slate-500 mt-1">Status: <StatusBadge status={wallet.status} /> | Owner: {wallet.ownerType}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/wallets")}>Back</Button>
          <Button onClick={deriveNewAccount}>Derive Account</Button>
        </div>
      </div>

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
    </div>
  );
}
