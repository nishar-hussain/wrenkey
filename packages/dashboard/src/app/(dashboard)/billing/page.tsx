"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  Search, Check, ChevronDown, CreditCard, Copy, Building2, Save,
  Receipt, BarChart3, CreditCard as CardIcon, Wallet, TrendingUp,
  CheckCircle2, Sparkles, Mail, ArrowRight,
} from "lucide-react";

interface Invoice {
  id: string;
  number: string;
  period: string;
  plan: string;
  amount: string;
  status: string;
  dueDate: string;
}

interface PlanItem {
  key: string;
  name: string;
  price: string;
  features: Array<{ label: string; value: string }>;
  badge?: string;
  action?: string;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const USAGE_METRICS = ["Signatures", "Activities", "Wallets", "Sub-orgs", "Private Keys", "Transactions (in/out)"];

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  payg: "Pay as you go",
  pro: "Pro",
  enterprise: "Enterprise",
};

export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated, token, org, user, updateOrg } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "invoices" | "usage" | "plans" | "payment" | "organization">("overview");
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [orgName, setOrgName] = useState(org?.name || "");
  const [editingOrg, setEditingOrg] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        const [invRes, usageRes, plansRes] = await Promise.all([
          apiFetch<any>("/billing/invoices?limit=50", { token: token ?? undefined }),
          apiFetch<any>(`/billing/usage?month=${MONTHS.indexOf(month)+1}&year=${year}`, { token: token ?? undefined }),
          apiFetch<any>("/billing/plans", { token: token ?? undefined }),
        ]);
        setInvoices(invRes.data || []);
        setUsage(usageRes.metrics || {});
        setPlans(plansRes.plans || []);
        setCurrentPlan(plansRes.currentPlan || "free");
      } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, router, token, month, year]);

  const generateInvoice = async () => {
    try {
      await apiFetch("/billing/generate-invoice", { method: "POST", token: token ?? undefined });
      addToast("Invoice generated", "success");
      const res = await apiFetch<any>("/billing/invoices?limit=50", { token: token ?? undefined });
      setInvoices(res.data || []);
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  useEffect(() => { if (org?.name) setOrgName(org.name); }, [org?.name]);

  const saveOrgName = async () => {
    if (!orgName.trim() || orgName.trim() === org?.name) return;
    setSavingOrg(true);
    try {
      const res: any = await apiFetch("/org", { method: "PATCH", token: token ?? undefined, body: JSON.stringify({ name: orgName.trim() }) });
      updateOrg({ id: res.id, name: res.name });
      setEditingOrg(false);
      addToast("Organization name updated", "success");
    } catch (err: any) { addToast(err.message || "Failed to update", "error"); } finally { setSavingOrg(false); }
  };

  const changePlan = async (plan: string) => {
    if (plan === "enterprise") { addToast("Contact sales@wrankey.io for enterprise pricing", "info"); return; }
    try {
      await apiFetch("/org", { method: "PATCH", token: token ?? undefined, body: JSON.stringify({ name: org?.name }) });
      addToast(`Plan change to ${plan} requested. Your plan will be updated on the next billing cycle.`, "success");
    } catch (err: any) { addToast(err.message || "Failed to change plan", "error"); }
  };

  const maxVal = Math.max(...Object.values(usage), 1);

  const filteredInvoices = search ? invoices.filter(i =>
    i.number.toLowerCase().includes(search.toLowerCase()) || i.period.toLowerCase().includes(search.toLowerCase())
  ) : invoices;

  const totalUsage = Object.values(usage).reduce((a, b) => a + b, 0);
  const paidInvoices = invoices.filter(i => i.status === "paid").length;
  const pendingInvoices = invoices.filter(i => i.status === "pending" || i.status === "overdue").length;

  const tabs = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "invoices", label: "Invoices", icon: Receipt },
    { key: "usage", label: "Usage", icon: TrendingUp },
    { key: "plans", label: "Plans", icon: Sparkles },
    { key: "payment", label: "Payment", icon: CardIcon },
    { key: "organization", label: "Organization", icon: Building2 },
  ] as const;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Billing & Usage</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your subscription, invoices, and usage.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] whitespace-nowrap",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Overview Tab ──────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Current Plan", value: PLAN_LABELS[currentPlan] || "Free", icon: Sparkles, color: "text-violet-600 dark:text-violet-400" },
              { label: "Total Usage", value: String(totalUsage), icon: TrendingUp, color: "text-blue-600 dark:text-blue-400" },
              { label: "Paid Invoices", value: String(paidInvoices), icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Pending", value: String(pendingInvoices), icon: Receipt, color: "text-amber-600 dark:text-amber-400" },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-muted-foreground">{card.label}</span>
                      <Icon className={cn("h-4 w-4", card.color)} />
                    </div>
                    <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Usage snapshot */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-base font-semibold">Usage Snapshot</CardTitle>
                <CardDescription className="text-xs">{month} {year}</CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setActiveTab("usage")}>
                View details <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {USAGE_METRICS.slice(0, 4).map(metric => {
                    const val = usage[metric] || 0;
                    const pct = Math.min((val / Math.max(maxVal, 1)) * 100, 100);
                    return (
                      <div key={metric} className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground w-32 shrink-0">{metric}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-foreground w-12 text-right tabular-nums">{val}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent invoices */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-base font-semibold">Recent Invoices</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setActiveTab("invoices")}>
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No invoices yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {invoices.slice(0, 4).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-accent transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{inv.period}</p>
                          <p className="text-xs text-muted-foreground">{inv.plan} · {inv.number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono font-medium text-foreground">{inv.amount}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Invoices Tab ─────────────────────────── */}
      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..." className="pl-9 text-sm" />
            </div>
            <Button size="sm" variant="secondary" onClick={generateInvoice}>
              <Receipt className="w-3.5 h-3.5 mr-1.5" /> Generate Invoice
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-16">
                  <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">No invoices found</p>
                  <p className="text-xs text-muted-foreground">Invoices are generated monthly for paid plans.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Period</th>
                        <th className="text-left py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                        <th className="text-right py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                        <th className="text-center py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map(inv => (
                        <tr key={inv.id} className="border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors">
                          <td className="py-3 px-4 text-sm font-medium text-foreground">{inv.period}</td>
                          <td className="py-3 text-sm text-muted-foreground">{inv.plan}</td>
                          <td className="py-3 text-right text-sm font-mono font-medium text-foreground">{inv.amount}</td>
                          <td className="py-3 text-center">
                            <StatusBadge status={inv.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addToast("Invoice PDF download coming soon", "info")}>PDF</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Usage Tab ────────────────────────────── */}
      {activeTab === "usage" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Usage Metrics</h2>
              <p className="text-sm text-muted-foreground">Resource consumption for {month} {year}</p>
            </div>
            <div className="relative">
              <select value={month} onChange={e => setMonth(e.target.value)}
                className="appearance-none border border-border bg-background rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-ring">
                {MONTHS.map(m => <option key={m} value={m}>{m} {year}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}><CardContent className="p-6 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-full" />
                </CardContent></Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {USAGE_METRICS.map(metric => {
                const val = usage[metric] || 0;
                const pct = Math.min((val / Math.max(maxVal, 1)) * 100, 100);
                return (
                  <Card key={metric}>
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-muted-foreground">{metric}</span>
                        <span className="text-xl font-bold text-foreground tabular-nums">{val}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                        <span>0</span>
                        <span>{maxVal}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Plans Tab ────────────────────────────── */}
      {activeTab === "plans" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Choose Your Plan</h2>
            <p className="text-sm text-muted-foreground mt-1">Upgrade or downgrade at any time. Changes take effect on the next billing cycle.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map(plan => {
              const isCurrent = plan.key === currentPlan;
              return (
                <Card key={plan.key} className={cn(
                  "relative flex flex-col transition-all",
                  isCurrent && "border-primary ring-2 ring-primary/10",
                  !isCurrent && plan.badge && "border-primary/30",
                )}>
                  {plan.badge && !isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground">{plan.badge}</span>
                    </div>
                  )}
                  <CardContent className="p-5 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-foreground">{plan.name}</h4>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Current</span>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-foreground mb-1">{plan.price}</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {plan.key === "free" && "For trying things out"}
                      {plan.key === "payg" && "For small teams"}
                      {plan.key === "pro" && "For growing organizations"}
                      {plan.key === "enterprise" && "For large scale deployments"}
                    </p>
                    <ul className="space-y-2.5 mb-5 flex-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                          <span>{f.label}{f.value ? ` — ${f.value}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" size="sm" disabled>Current Plan</Button>
                    ) : (
                      <Button
                        variant={plan.key === "enterprise" ? "outline" : "secondary"}
                        className="w-full"
                        size="sm"
                        onClick={() => changePlan(plan.key)}
                      >
                        {plan.key === "free" ? "Downgrade" : plan.key === "enterprise" ? "Contact Us" : "Upgrade"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Payment Tab ──────────────────────────── */}
      {activeTab === "payment" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Payment Method</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your payment details and billing information.</p>
          </div>
          <Card className="border-dashed">
            <CardContent className="p-12">
              <div className="text-center max-w-md mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">Stripe Integration Coming Soon</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Online payment integration is on the way. For now, invoices are generated monthly and payable via bank transfer.
                </p>
                <Button variant="secondary" size="sm" onClick={() => addToast("Email sales@wrankey.io for assistance", "info")}>
                  <Mail className="w-3.5 h-3.5 mr-1.5" /> Contact Sales
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Organization Tab ─────────────────────── */}
      {activeTab === "organization" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Organization Details</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your organization's billing information.</p>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-foreground">Organization</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Org Name */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization Name</label>
                  {editingOrg ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        className="h-10 font-medium"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveOrgName();
                          if (e.key === "Escape") { setEditingOrg(false); setOrgName(org?.name || ""); }
                        }}
                      />
                      <Button size="sm" onClick={saveOrgName} disabled={savingOrg || !orgName.trim() || orgName.trim() === org?.name}>
                        <Save className="w-3.5 h-3.5 mr-1" /> {savingOrg ? "..." : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingOrg(false); setOrgName(org?.name || ""); }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{org?.name || "My Organization"}</p>
                      <button onClick={() => setEditingOrg(true)} className="text-xs text-primary hover:text-primary/80 font-medium underline underline-offset-2">
                        Edit
                      </button>
                    </div>
                  )}
                </div>

                {/* Org ID */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization ID</label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-muted-foreground bg-muted px-3 py-1.5 rounded-lg select-all">
                      {org?.id ? `${org.id.slice(0, 4)}····${org.id.slice(-4)}` : "············"}
                    </code>
                    <button
                      onClick={() => { if (org?.id) { navigator.clipboard.writeText(org.id); addToast("Organization ID copied", "success"); } }}
                      className="p-1.5 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Current Plan */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Plan</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground capitalize">{PLAN_LABELS[currentPlan] || "Free"}</span>
                    <button onClick={() => setActiveTab("plans")} className="text-xs text-primary hover:text-primary/80 font-medium underline underline-offset-2">
                      Change
                    </button>
                  </div>
                </div>

                {/* Billing Email */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Email</label>
                  <p className="text-sm font-medium text-foreground">{user?.email || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
