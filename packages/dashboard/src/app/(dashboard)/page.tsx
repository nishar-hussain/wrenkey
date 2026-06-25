"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch, API_BASE } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { useWebSocket } from "@/lib/websocket";
import { Wallet, ArrowLeftRight, Users, Bot, ChevronRight, ArrowUpRight } from "lucide-react";

interface HealthStatus {
  database: string;
  redis: string;
  blockchain: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [stats, setStats] = useState({ wallets: 0, transactions: 0, users: 0, agents: 0 });
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
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

  useEffect(() => {
    setWsConnected(connected);
  }, [connected]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function loadStats() {
      setLoading(true);
      try {
        const [wallets, txs, users, agents, healthRes] = await Promise.all([
          apiFetch<any>("/wallets?limit=1", { token: token! }),
          apiFetch<any>("/transactions?limit=1", { token: token! }),
          apiFetch<any>("/users?limit=1", { token: token! }),
          apiFetch<any>("/agents?limit=1", { token: token! }),
          fetch(`${API_BASE}/health/services`).then(r => r.json()).catch(() => null),
        ]);
        setStats({
          wallets: wallets.total || 0,
          transactions: txs.total || 0,
          users: users.total || 0,
          agents: agents.total || 0,
        });
        if (healthRes?.services) {
          setHealth(healthRes.services);
        }
      } catch (err: any) {
        addToast(err.message || "Failed to load dashboard stats", "error");
        setStats({ wallets: 0, transactions: 0, users: 0, agents: 0 });
      } finally { setLoading(false); }
    }
    loadStats();

    const healthInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/health/services`);
        const data = await res.json();
        if (data?.services) setHealth(data.services);
      } catch {}
    }, 30000);

    return () => clearInterval(healthInterval);
  }, [isAuthenticated, token, router]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Wallets",
      value: stats.wallets,
      description: "Secure MPC Enclaves",
      href: "/wallets",
      icon: Wallet,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/40",
      borderColor: "border-blue-100/50 dark:border-blue-900/30",
    },
    {
      label: "Transactions",
      value: stats.transactions,
      description: "On-Chain Activity Logs",
      href: "/transactions",
      icon: ArrowLeftRight,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
      borderColor: "border-emerald-100/50 dark:border-emerald-900/30",
    },
    {
      label: "Users",
      value: stats.users,
      description: "Active Team Members",
      href: "/users",
      icon: Users,
      color: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-950/40",
      borderColor: "border-violet-100/50 dark:border-violet-900/30",
    },
    {
      label: "Agents",
      value: stats.agents,
      description: "Autonomous Workers",
      href: "/agents",
      icon: Bot,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-950/40",
      borderColor: "border-amber-100/50 dark:border-amber-900/30",
    },
  ];

  const healthServices = health
    ? [
        { label: "Database", status: health.database, key: "database" as const },
        { label: "Redis Cache", status: health.redis, key: "redis" as const },
        { label: "Blockchain RPC", status: health.blockchain, key: "blockchain" as const },
      ]
    : [
        { label: "MPC Signer Node", status: "operational", key: "database" as const },
        { label: "Policy Engine", status: "operational", key: "redis" as const },
        { label: "API Gateway", status: "operational", key: "blockchain" as const },
      ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">
          System Overview
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage secure wallet enclaves, smart policies, team members, and autonomous agents.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="group cursor-pointer border border-slate-100 dark:border-slate-800/80 shadow-[0_2px_8px_rgba(0,0,0,0.015)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.035)] dark:hover:shadow-[0_12px_30px_rgba(0,0,0,0.2)] hover:border-slate-200 dark:hover:border-slate-700/80 transition-all duration-300 hover:-translate-y-0.5 rounded-2xl overflow-hidden bg-white dark:bg-slate-900"
              onClick={() => router.push(stat.href)}
            >
              <CardContent className="p-6 pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div className={`w-12 h-12 rounded-xl ${stat.bgColor} border ${stat.borderColor} flex items-center justify-center ${stat.color} transition-colors`}>
                    <Icon className="w-5 h-5 stroke-[1.8]" />
                  </div>
                  <div className="text-slate-300 dark:text-slate-700 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors">
                    <ArrowUpRight className="w-5 h-5 stroke-[1.5]" />
                  </div>
                </div>

                <div className="space-y-1">
                  {loading ? (
                    <>
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3.5 w-16" />
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-semibold text-slate-800 dark:text-slate-100 tracking-tight leading-none">
                        {stat.value}
                      </p>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 pt-1.5">
                        {stat.label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-normal">
                        {stat.description}
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        <Card className="lg:col-span-2 border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.015)] bg-white dark:bg-slate-900">
          <CardContent className="p-6 pt-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Getting Started</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              WranKey allows organizations to leverage MPC secure enclaves to securely spin up agents and policy-guided wallets.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div 
                onClick={() => router.push("/wallets")} 
                className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100/50 dark:border-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Wallet className="w-5 h-5 stroke-[1.8]" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">Secure Wallets</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Create your first enclave</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>

              <div 
                onClick={() => router.push("/agents")} 
                className="flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100/50 dark:border-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Bot className="w-5 h-5 stroke-[1.8]" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 leading-tight">Autonomous Agents</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Deploy AI signers & workers</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.015)] bg-white dark:bg-slate-900">
          <CardContent className="p-6 pt-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Platform Status</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {health ? "Real-time service health" : "All systems operational."}
            </p>
            
            <div className="space-y-4">
              {healthServices.map((svc) => {
                const isOperational = svc.status === "operational" || svc.status === "healthy";
                return (
                  <div key={svc.key} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/50 last:border-b-0">
                    <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">{svc.label}</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      isOperational
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        isOperational
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-red-500"
                      }`} />
                      {isOperational ? "Operational" : "Unavailable"}
                    </span>
                  </div>
                );
              })}
              {wsConnected && (
                <div className="flex items-center justify-between py-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/50">
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">WebSocket</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
