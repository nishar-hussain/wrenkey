"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, RefreshCw, X, Zap } from "lucide-react";

interface TxDetail {
  id: string;
  txHash?: string;
  chain: string;
  to: string;
  value: string;
  nonce?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  data?: string;
  status: string;
  signedTx?: string;
  replacementFor?: string;
  error?: string;
  riskScore?: number;
  sponsored: boolean;
  createdAt: string;
  confirmedAt?: string;
}

export default function TransactionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const txId = params.id as string;
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [tx, setTx] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTx = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/transactions/${txId}`, { token: token! });
      setTx(res);
    } catch (err: any) {
      addToast(err.message || "Failed to load transaction", "error");
    } finally { setLoading(false); }
  }, [token, txId]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchTx();
  }, [isAuthenticated, fetchTx, router]);

  if (!isAuthenticated) return null;
  if (loading) return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-48 w-full" /></div>;
  if (!tx) return <p className="text-sm text-slate-500">Transaction not found.</p>;

  const canRetry = ["FAILED", "PENDING"].includes(tx.status);
  const canCancel = ["PENDING", "SIGNED", "BROADCAST"].includes(tx.status);
  const canSpeedUp = ["PENDING", "SIGNED", "BROADCAST"].includes(tx.status) && !!tx.maxFeePerGas;

  const doAction = async (action: "retry" | "cancel" | "speed-up") => {
    setActionLoading(action);
    try {
      const endpoint = action === "speed-up" ? `/transactions/${txId}/speed-up` : `/transactions/${txId}/${action}`;
      const body = action === "speed-up" ? { gasMultiplier: 1.3 } : {};
      const res: any = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body), token: token! });
      addToast(`${action.charAt(0).toUpperCase() + action.slice(1)} submitted`, "success");
      if (res.transactionId) router.push(`/transactions/${res.transactionId}`);
      else fetchTx();
    } catch (err: any) {
      addToast(err.message || `Failed to ${action} transaction`, "error");
    } finally { setActionLoading(null); }
  };

  return (
    <div>
      <button onClick={() => router.push("/transactions")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to transactions
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            Transaction <StatusBadge status={tx.status} />
          </h1>
          <p className="text-xs font-mono text-slate-400 mt-1">{tx.id}</p>
        </div>
        <div className="flex gap-2">
          {canRetry && (
            <Button variant="secondary" size="sm" onClick={() => doAction("retry")} disabled={actionLoading === "retry"}>
              <RefreshCw className="h-4 w-4 mr-1" /> {actionLoading === "retry" ? "Retrying..." : "Retry"}
            </Button>
          )}
          {canSpeedUp && (
            <Button variant="secondary" size="sm" onClick={() => doAction("speed-up")} disabled={actionLoading === "speed-up"}>
              <Zap className="h-4 w-4 mr-1" /> {actionLoading === "speed-up" ? "Speeding up..." : "Speed Up"}
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" size="sm" onClick={() => doAction("cancel")} disabled={actionLoading === "cancel"}>
              <X className="h-4 w-4 mr-1" /> {actionLoading === "cancel" ? "Cancelling..." : "Cancel"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Tx Hash</p>
          <p className="text-sm font-mono mt-1 break-all">{tx.txHash || "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Chain</p>
          <p className="text-sm mt-1 capitalize">{tx.chain}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">To</p>
          <p className="text-sm font-mono mt-1 break-all">{tx.to}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Value</p>
          <p className="text-sm mt-1">{tx.value} ETH {tx.sponsored && <span className="text-xs text-green-600 ml-1">(sponsored)</span>}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Nonce</p>
          <p className="text-sm mt-1">{tx.nonce ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Gas Limit</p>
          <p className="text-sm mt-1">{tx.gasLimit || "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Max Fee Per Gas</p>
          <p className="text-sm mt-1 font-mono">{tx.maxFeePerGas || "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Risk Score</p>
          <p className="text-sm mt-1">{tx.riskScore ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Created</p>
          <p className="text-sm mt-1">{new Date(tx.createdAt).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Confirmed</p>
          <p className="text-sm mt-1">{tx.confirmedAt ? new Date(tx.confirmedAt).toLocaleString() : "—"}</p>
        </CardContent></Card>
      </div>

      {tx.error && (
        <Card className="mt-4 border-red-200"><CardContent className="p-4">
          <p className="text-xs text-red-400 uppercase tracking-wide mb-1">Error</p>
          <p className="text-sm text-red-600 font-mono break-all">{tx.error}</p>
        </CardContent></Card>
      )}

      {tx.data && (
        <Card className="mt-4"><CardContent className="p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Transaction Data</p>
          <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-800 p-3 rounded max-h-48 overflow-y-auto break-all">{tx.data}</pre>
        </CardContent></Card>
      )}

      {tx.replacementFor && (
        <p className="text-xs text-slate-400 mt-4">This transaction replaces {tx.replacementFor}</p>
      )}
    </div>
  );
}
