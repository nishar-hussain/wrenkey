"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

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
  const { addToast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [chainFilter, setChainFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (statusFilter) params.set("status", statusFilter);
      if (chainFilter) params.set("chain", chainFilter);
      if (searchQuery) params.set("search", searchQuery);

      const res: any = await apiFetch(`/transactions?${params.toString()}`, { token });
      setTransactions(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load transactions", "error");
      setTransactions([]);
      setTotal(0);
    } finally { setLoading(false); }
  }, [token, limit, offset, statusFilter, chainFilter, searchQuery]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
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

  const statusOptions = ["", "PENDING", "SIGNED", "BROADCAST", "CONFIRMED", "FAILED"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Button onClick={() => router.push("/transactions/send")}>Send Transaction</Button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          {statusOptions.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setOffset(0); }}
          placeholder="Search by tx hash or address..."
          className="border rounded-md px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={transactions} loading={false} emptyMessage="No transactions yet." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}