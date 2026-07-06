"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useWebSocket } from "@/lib/websocket";
import {
  Wallet, Send, Bot, CheckCircle, ArrowUpRight, Activity,
  Plus, Settings, Key, FileCode, Shield,
} from "lucide-react";

interface KpiData {
  wallets: number;
  transactions: number;
  agents: number;
  pendingApprovals: number;
}

interface TxRow {
  id: string;
  status: string;
  txHash?: string;
  to?: string;
  value?: string;
  chain?: string;
  createdAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, token, user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KpiData>({ wallets: 0, transactions: 0, agents: 0, pendingApprovals: 0 });
  const [recentTxs, setRecentTxs] = useState<TxRow[]>([]);
  const [health, setHealth] = useState<Record<string, string>>({});
  const [wsConnected, setWsConnected] = useState(false);

  const handleTransactionStatus = useCallback((data: { transactionId: string; status: string; txHash?: string }) => {
    addToast(`Transaction ${data.transactionId.slice(0, 8)}... ${data.status}`, "info");
  }, [addToast]);

  const handleWalletEvent = useCallback((event: string, data: any) => {
    addToast(`${event.replace("wallet.", "")}: ${data.walletId?.slice(0, 8)}...`, "info");
  }, [addToast]);

  const { connected } = useWebSocket(API_BASE, token, {
    onTransactionStatus: handleTransactionStatus,
    onWalletEvent: handleWalletEvent,
  });

  useEffect(() => { setWsConnected(connected); }, [connected]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        const [walletsRes, txsRes, agentsRes, approvalsRes, recentTxsRes] = await Promise.all([
          apiFetch<{ total: number }>("/wallets?limit=1", { token: token ?? undefined }),
          apiFetch<{ total: number }>("/transactions?limit=1", { token: token ?? undefined }),
          apiFetch<{ total: number }>("/agents?limit=1", { token: token ?? undefined }),
          apiFetch<{ total: number }>("/approval-requests?limit=1&status=PENDING", { token: token ?? undefined }),
          apiFetch<{ data: TxRow[]; total: number }>("/transactions?limit=5", { token: token ?? undefined }),
        ]);
        setKpi({
          wallets: walletsRes.total,
          transactions: txsRes.total,
          agents: agentsRes.total,
          pendingApprovals: approvalsRes.total,
        });
        setRecentTxs(recentTxsRes.data || []);
      } catch {}
      try {
        const healthRes = await fetch(`${API_BASE}/health/services`).then(r => r.json()).catch(() => ({ services: {} }));
        setHealth(healthRes.services || {});
      } catch {}
      finally { setLoading(false); }
    }
    load();
    const interval = setInterval(async () => {
      try { const r = await fetch(`${API_BASE}/health/services`); const d = await r.json(); if (d?.services) setHealth(d.services); } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, router, token]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const kpiCards = [
    { label: "Wallets", value: kpi.wallets, icon: Wallet, href: "/wallets", color: "text-blue-600 dark:text-blue-400" },
    { label: "Transactions", value: kpi.transactions, icon: Send, href: "/transactions", color: "text-violet-600 dark:text-violet-400" },
    { label: "Agents", value: kpi.agents, icon: Bot, href: "/agents", color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Pending Approvals", value: kpi.pendingApprovals, icon: CheckCircle, href: "/approvals", color: "text-amber-600 dark:text-amber-400" },
  ];

  const quickActions = [
    { label: "New Wallet", icon: Plus, href: "/wallets" },
    { label: "New Transaction", icon: Send, href: "/transactions" },
    { label: "Create Agent", icon: Bot, href: "/agents" },
    { label: "API Keys", icon: Key, href: "/api-keys" },
    { label: "Policies", icon: Shield, href: "/policies" },
    { label: "Settings", icon: Settings, href: "/configuration" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here's what's happening in your organization.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-4 w-20 mb-3" />
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} href={card.href}>
                <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                      <Icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{card.value}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
            <Link href="/transactions" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              View all →
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : recentTxs.length === 0 ? (
              <div className="text-center py-10">
                <Send className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No transactions yet</p>
                <Button size="sm" variant="secondary" className="mt-3" onClick={() => router.push("/transactions")}>
                  Create Transaction
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {recentTxs.map((tx) => (
                  <Link key={tx.id} href="/transactions"
                    className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Send className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate font-mono">
                          {tx.txHash ? `${tx.txHash.slice(0, 10)}...${tx.txHash.slice(-6)}` : tx.to ? `${tx.to.slice(0, 10)}...${tx.to.slice(-6)}` : tx.id.slice(0, 12)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.chain || "Unknown"} · {new Date(tx.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={tx.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions + Status */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link key={action.label} href={action.href}
                      className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all group">
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-[11px] text-muted-foreground text-center leading-tight">{action.label}</span>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Platform Status</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2.5">
                {[
                  { label: "Database", key: "database" },
                  { label: "Redis", key: "redis" },
                  { label: "RPC Node", key: "blockchain" },
                  { label: "WebSocket", key: wsConnected ? "ws" : "" },
                ].map((svc) => {
                  const ok = svc.key === "ws" ? wsConnected : health[svc.key] === "operational";
                  return (
                    <div key={svc.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{svc.label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
                        <span className="text-xs font-medium text-muted-foreground">{ok ? "Operational" : "Down"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
