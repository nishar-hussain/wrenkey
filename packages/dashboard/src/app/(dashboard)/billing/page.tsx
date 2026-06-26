"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { BadgeCheck, Check, Wallet, ArrowLeftRight, Bot, Webhook, Users, FileText, Download, ChevronDown, ChevronUp } from "lucide-react";

interface PlanUsage {
  wallets: number;
  transactions: number;
  agents: number;
  users: number;
  webhooks: number;
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  amount: string;
  status: "paid" | "pending" | "overdue";
  period: string;
}

function generateInvoices(planKey: string, orgCreatedAt?: string): Invoice[] {
  const plan = PLAN_LIMITS[planKey as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
  const price = plan.name === "Free" ? "$0.00" : plan.name === "Developer" ? "$49.00" : "$299.00";
  const now = new Date();
  const invoices: Invoice[] = [];
  const startMonth = Math.max(1, now.getMonth() - 5);

  for (let i = 0; i < 6; i++) {
    const month = new Date(now.getFullYear(), startMonth + i, 1);
    const dueDate = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const isPast = dueDate < now;
    const isCurrentMonth = month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear();
    const invNum = `INV-${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(3, "0")}`;

    invoices.push({
      id: `inv-${i}`,
      number: invNum,
      date: month.toISOString().split("T")[0],
      dueDate: dueDate.toISOString().split("T")[0],
      amount: price,
      period: month.toLocaleString("default", { month: "long", year: "numeric" }),
      status: isCurrentMonth ? "pending" : isPast ? "paid" : "pending",
    });
  }
  return invoices.reverse();
}
const PLAN_LIMITS = {
  free: { wallets: 3, transactions: 100, agents: 1, users: 2, webhooks: 3, name: "Free", price: "$0", color: "slate" },
  developer: { wallets: 25, transactions: 5000, agents: 10, users: 10, webhooks: 25, name: "Developer", price: "$49/mo", color: "blue" },
  enterprise: { wallets: Infinity, transactions: Infinity, agents: Infinity, users: Infinity, webhooks: Infinity, name: "Enterprise", price: "Custom", color: "violet" },
};

export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated, token, org } = useAuth();
  const { addToast } = useToast();
  const [usage, setUsage] = useState<PlanUsage>({ wallets: 0, transactions: 0, agents: 0, users: 0, webhooks: 0 });
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState<keyof typeof PLAN_LIMITS>("free");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showAllInvoices, setShowAllInvoices] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [wallets, txs, agents, users, webhooks] = await Promise.all([
        apiFetch<any>("/wallets?limit=1", { token }),
        apiFetch<any>("/transactions?limit=1", { token }),
        apiFetch<any>("/agents?limit=1", { token }),
        apiFetch<any>("/users?limit=1", { token }),
        apiFetch<any>("/webhooks?limit=1", { token }),
      ]);
      const u = {
        wallets: wallets.total || 0,
        transactions: txs.total || 0,
        agents: agents.total || 0,
        users: users.total || 0,
        webhooks: webhooks.total || 0,
      };
      setUsage(u);
      let detectedPlan: keyof typeof PLAN_LIMITS = "free";
      if (u.wallets > 25 || u.transactions > 5000 || u.agents > 10) detectedPlan = "enterprise";
      else if (u.wallets > 3 || u.transactions > 100 || u.agents > 1 || u.users > 2) detectedPlan = "developer";
      setCurrentPlan(detectedPlan);
      setInvoices(generateInvoices(detectedPlan));
    } catch (err: any) {
      addToast(err.message || "Failed to load billing data", "error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchUsage();
  }, [isAuthenticated, fetchUsage, router]);

  if (!isAuthenticated) return null;

  const plan = PLAN_LIMITS[currentPlan];
  const metrics = [
    { key: "wallets" as const, label: "Wallets", icon: Wallet, limit: plan.wallets === Infinity ? "Unlimited" : plan.wallets },
    { key: "transactions" as const, label: "Transactions", icon: ArrowLeftRight, limit: plan.transactions === Infinity ? "Unlimited" : plan.transactions },
    { key: "agents" as const, label: "Agents", icon: Bot, limit: plan.agents === Infinity ? "Unlimited" : plan.agents },
    { key: "users" as const, label: "Team Members", icon: Users, limit: plan.users === Infinity ? "Unlimited" : plan.users },
    { key: "webhooks" as const, label: "Webhooks", icon: Webhook, limit: plan.webhooks === Infinity ? "Unlimited" : plan.webhooks },
  ];

  const planColorMap: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300",
    blue: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300",
    violet: "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-slate-500">Manage your plan and monitor resource usage</p>
      </div>

      <Card className={`border ${planColorMap[plan.color]} bg-white dark:bg-slate-900`}>
        <CardContent className="p-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl border ${planColorMap[plan.color]} flex items-center justify-center`}>
                  <BadgeCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{plan.name} Plan</h2>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Current</span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{org?.name || "Your Organization"}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{plan.price}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">per month</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Resource Usage</h3>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.map((metric) => {
                const used = usage[metric.key];
                const limit = plan[metric.key] === Infinity ? Infinity : (plan[metric.key] as number);
                const pct = limit === Infinity ? 0 : Math.min((used / limit) * 100, 100);
                const isNearLimit = limit !== Infinity && used >= limit * 0.8;
                const isOverLimit = limit !== Infinity && used >= limit;
                const Icon = metric.icon;

                return (
                  <div key={metric.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{metric.label}</span>
      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Invoices</h3>
            <span className="text-xs text-slate-400">{invoices.length} invoices</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-slate-400 py-2">No invoices yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice</th>
                      <th className="text-left py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Period</th>
                      <th className="text-right py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                      <th className="text-center py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="text-right py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllInvoices ? invoices : invoices.slice(0, 4)).map((inv) => {
                      const statusColor = inv.status === "paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30"
                        : inv.status === "overdue"
                        ? "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"
                        : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30";

                      return (
                        <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-b-0">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                                <FileText className="w-4 h-4 text-slate-400" />
                              </div>
                              <div>
                                <p className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">{inv.number}</p>
                                <p className="text-[10px] text-slate-400">Due {new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="text-xs text-slate-600 dark:text-slate-400">{inv.period}</span>
                          </td>
                          <td className="py-3 text-right">
                            <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">{inv.amount}</span>
                          </td>
                          <td className="py-3">
                            <div className="flex justify-center">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${inv.status === "paid" ? "bg-emerald-500" : inv.status === "overdue" ? "bg-red-500" : "bg-amber-500"}`} />
                                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addToast(`Invoice ${inv.number} download will be available soon`, "info")}>
                              <Download className="w-3 h-3 mr-1" />
                              PDF
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {invoices.length > 4 && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAllInvoices(!showAllInvoices)} className="text-xs text-slate-500 hover:text-slate-700">
                    {showAllInvoices ? (
                      <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Show Less</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Show All ({invoices.length} invoices)</>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
                      <span className={`text-xs font-mono ${isOverLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-slate-500"}`}>
                        {used} / {metric.limit}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%`, minWidth: used > 0 ? "2px" : "0" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["free", "developer", "enterprise"] as const).map((tierKey) => {
          const tier = PLAN_LIMITS[tierKey];
          const isCurrent = tierKey === currentPlan;
          return (
            <Card key={tierKey} className={`border ${isCurrent ? "border-brand-600 dark:border-brand-400 ring-2 ring-brand-600/10" : "border-slate-100 dark:border-slate-800/80"} bg-white dark:bg-slate-900`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-900 dark:text-white">{tier.name}</h4>
                  {isCurrent && <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">Active</span>}
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white mb-4">{tier.price}</p>
                <ul className="space-y-2 mb-4">
                  {Object.entries(tier).filter(([k]) => k !== "name" && k !== "price" && k !== "color").map(([key, limit]) => (
                    <li key={key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="capitalize">{key}: {limit === Infinity ? "Unlimited" : limit.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                {!isCurrent && (
                  <Button variant="secondary" className="w-full" disabled>
                    {tierKey === "free" ? "Downgrade" : "Upgrade"}
                  </Button>
                )}
                {isCurrent && (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
