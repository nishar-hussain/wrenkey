"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch, API_BASE } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { useWebSocket } from "@/lib/websocket";
import {
  Wallet, Building2, Shield, CheckCircle, BookOpen, Radio,
  Scale, Code, FileText, ChevronRight, ExternalLink,
} from "lucide-react";

const EMBEDDED_SDKS = [
  { label: "React" }, { label: "React Native" }, { label: "Swift" },
  { label: "Flutter" }, { label: "Kotlin" }, { label: "TypeScript | Frontend" }, { label: "TypeScript | Server" },
];

const COMPANY_SDKS = [
  { label: "TypeScript | Server" }, { label: "Go" }, { label: "Python" },
  { label: "Ruby" }, { label: "Rust" }, { label: "Foundry" },
];

const FOUNDATIONS = [
  { icon: Shield, label: "Security overview", href: "/policies", color: "blue" },
  { icon: CheckCircle, label: "Production checklist", href: "/settings", color: "emerald" },
  { icon: Scale, label: "Policies", href: "/policies", color: "violet" },
  { icon: BookOpen, label: "Support", href: "/activity-logs", color: "amber" },
  { icon: Radio, label: "Broadcasting", href: "/transactions", color: "rose" },
  { icon: Wallet, label: "Balances", href: "/wallets", color: "cyan" },
  { icon: Code, label: "SDK reference", href: "/api-keys", color: "indigo" },
  { icon: FileText, label: "API reference", href: "/api-keys", color: "slate" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, token, user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
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
        const healthRes = await fetch(`${API_BASE}/health/services`).then(r => r.json()).catch(() => ({ services: {} }));
        setHealth(healthRes.services || {});
      } catch {} finally { setLoading(false); }
    }
    load();
    const interval = setInterval(async () => {
      try { const r = await fetch(`${API_BASE}/health/services`); const d = await r.json(); if (d?.services) setHealth(d.services); } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, router]);

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

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="pt-4 pb-2">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Welcome{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          AI-native wallet infrastructure and autonomous agent platform on Arc.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="h-2 bg-blue-500" />
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/30 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Embedded Wallets</h3>
                <p className="text-sm text-slate-500 mt-1">Wallets embedded directly into your app experience.</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Quickstart</p>
              <p className="text-xs text-slate-500 mb-2">SDKs:</p>
              <div className="flex flex-wrap gap-1.5">
                {EMBEDDED_SDKS.map((sdk) => (
                  <span key={sdk.label} className="text-[11px] bg-slate-50 border border-slate-100 dark:bg-slate-800 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md font-mono">
                    {sdk.label}
                  </span>
                ))}
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => router.push("/wallets")} className="text-xs">
              Get Started <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="h-2 bg-violet-500" />
          <CardContent className="p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/30 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Company Wallets</h3>
                <p className="text-sm text-slate-500 mt-1">Programmatic wallets for treasury and operations.</p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Quickstart</p>
              <p className="text-xs text-slate-500 mb-2">SDKs:</p>
              <div className="flex flex-wrap gap-1.5">
                {COMPANY_SDKS.map((sdk) => (
                  <span key={sdk.label} className="text-[11px] bg-slate-50 border border-slate-100 dark:bg-slate-800 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md font-mono">
                    {sdk.label}
                  </span>
                ))}
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => router.push("/wallets")} className="text-xs">
              Get Started <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Foundations</h2>
        <p className="text-sm text-slate-500 mb-5">Everything you need to build, secure, and scale.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {FOUNDATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                onClick={() => router.push(item.href)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-sm cursor-pointer transition-all group"
              >
                <div className={`w-9 h-9 rounded-lg border ${colorMap[item.color]} flex items-center justify-center`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 text-center leading-tight">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pb-8">
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Platform Status</h3>
            <div className="flex flex-wrap gap-6">
              {[
                { label: "Database", key: "database" },
                { label: "Redis", key: "redis" },
                { label: "RPC", key: "blockchain" },
                { label: "WebSocket", key: wsConnected ? "ws" : "" },
              ].map((svc) => {
                const ok = svc.key === "ws" ? wsConnected : health[svc.key] === "operational";
                return (
                  <div key={svc.label} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-400"}`} />
                    <span className="text-xs text-slate-500">{svc.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
