"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface Transaction {
  id: string;
  txHash?: string;
  to: string;
  value: string;
  status: string;
  chain: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/transactions?limit=${limit}&offset=${offset}`, { token });
      setTransactions(res.data);
      setTotal(res.total);
    } catch { setTransactions([]); setTotal(0); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  if (!isAuthenticated) return null;

  const columns = [
    { key: "txHash", header: "Tx Hash", render: (tx: Transaction) => tx.txHash ? <span className="font-mono text-xs">{tx.txHash.slice(0, 12)}...</span> : "-" },
    { key: "to", header: "To", render: (tx: Transaction) => <span className="font-mono text-xs">{tx.to.slice(0, 12)}...</span> },
    { key: "value", header: "Value", render: (tx: Transaction) => tx.value },
    { key: "chain", header: "Chain" },
    { key: "status", header: "Status", render: (tx: Transaction) => <StatusBadge status={tx.status} /> },
    { key: "createdAt", header: "Date", render: (tx: Transaction) => new Date(tx.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Transactions</h1>
      <Card>
        <CardContent className="p-0">
          <Table columns={columns} data={transactions} loading={loading} emptyMessage="No transactions yet." />
          <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
        </CardContent>
      </Card>
    </div>
  );
}
