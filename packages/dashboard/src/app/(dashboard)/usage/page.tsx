"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Activity, Zap, BarChart3, TrendingUp, Wallet, ArrowLeftRight, Bot, Users } from "lucide-react";

interface UsageStats {
  wallets: number;
  transactions: number;
  users: number;
  agents: number;
  apiKeys: number;
  webhooks: number;
  policies: number;
  auditLogs: number;
}

export default function UsagePage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [stats, setStats] = useState<UsageStats>({ wallets: 0, transactions: 0, users: 0, agents: 0, apiKeys: 0, webhooks: 0, policies: 0, auditLogs: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [wallets, txs, users, agents, apiKeys, webhooks, policies, auditLogs] = await Promise.all([
        apiFetch<any>("/wallets?limit=1", { token }),
        apiFetch<any>("/transactions?limit=1", { token }),
        apiFetch<any>("/users?limit=1", { token }),
        apiFetch<any>("/agents?limit=1", { token }),
        apiFetch<any>("/api-keys?limit=1", { token }),
        apiFetch<any>("/webhooks?limit=1", { token }),
        apiFetch<any>("/policies?limit=1", { token }),
        apiFetch<any>("/audit-logs?limit=1", { token }),
      ]);
      setStats({
        wallets: wallets.total || 0,
        transactions: txs.total || 0,
        users: users.total || 0,
        agents: agents.total || 0,
        apiKeys: apiKeys.total || 0,
        webhooks: webhooks.total || 0,
        policies: policies.total || 0,
        auditLogs: auditLogs.total || 0,
      });
    } catch (err: any) {
      addToast(err.message || "Failed to load usage stats", "error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchStats();
  }, [isAuthenticated, fetchStats, router]);

  if (!isAuthenticated) return null;

  const total = stats.wallets + stats.transactions + stats.auditLogs || 1;

  const usageCards = [
    { label: "Wallets", value: stats.wallets, icon: Wallet, color: "blue", desc: "MPC enclaves", href: "/wallets" },
    { label: "Transactions", value: stats.transactions, icon: ArrowLeftRight, color: "emerald", desc: "On-chain activity", href: "/transactions" },
    { label: "Users", value: stats.users, icon: Users, color: "violet", desc: "Team members", href: "/users" },
    { label: "Agents", value: stats.agents, icon: Bot, color: "amber", desc: "AI workers", href: "/agents" },
    { label: "API Keys", value: stats.apiKeys, icon: Zap, color: "rose", desc: "Access tokens", href: "/api-keys" },
    { label: "Webhooks", value: stats.webhooks, icon: Activity, color: "cyan", desc: "Event endpoints", href: "/webhooks" },
    { label: "Policies", value: stats.policies, icon: BarChart3, color: "indigo", desc: "Rules active", href: "/policies" },
    { label: "Audit Logs", value: stats.auditLogs, icon: TrendingUp, color: "slate", desc: "Total events", href: "/audit-logs" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-950/30 dark:border-blue-900/30 dark:text-blue-400",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900/30 dark:text-emerald-400",
    violet: "bg-violet-50 border-violet-100 text-violet-600 dark:bg-violet-950/30 dark:border-violet-900/30 dark:text-violet-400",
    amber: "bg-amber-50 border-amber-100 text-amber-600 dark:bg-amber-950/30 dark:border-amber-900/30 dark:text-amber-400",
    rose: "bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-950/30 dark:border-rose-900/30 dark:text-rose-400",
    cyan: "bg-cyan-50 border-cyan-100 text-cyan-600 dark:bg-cyan-950/30 dark:border-cyan-900/30 dark:text-cyan-400",
    indigo: "bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-900/30 dark:text-indigo-400",
    slate: "bg-slate-50 border-slate-100 text-slate-600 dark:bg-slate-950/30 dark:border-slate-900/30 dark:text-slate-400",
  };

  const barColorMap: Record<string, string> = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    cyan: "bg-cyan-500",
    indigo: "bg-indigo-500",
    slate: "bg-slate-500",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="text-sm text-slate-500">Platform utilization across all resources</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {usageCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.label}
              className="cursor-pointer hover:shadow-md transition-shadow border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900"
              onClick={() => router.push(card.href)}
            >
              <CardContent className="p-4">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-5 w-12" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ) : (
                  <>
                    <div className={`w-8 h-8 rounded-lg border ${colorMap[card.color]} flex items-center justify-center mb-3`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{card.value}</p>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{card.desc}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Resource Distribution</h3>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {usageCards.map((card) => (
                <div key={card.label} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 w-24 shrink-0">{card.label}</span>
                  <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColorMap[card.color]}`}
                      style={{ width: `${total > 0 ? (card.value / Math.max(...usageCards.map(c => c.value), 1)) * 100 : 0}%`, minWidth: card.value > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-10 text-right">{card.value}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
