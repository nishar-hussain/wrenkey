"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Search, Check, ChevronDown, CreditCard, Mail, Copy, Building2, Save } from "lucide-react";

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
const USAGE_METRICS = ["Signatures", "Activities", "Wallets", "Sub-orgs", "Private Keys", "Private Keys (in/out)"];

export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated, token, org, user, updateOrg } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"invoices" | "usage" | "plans" | "payment" | "organization">("organization");
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardEmail, setCardEmail] = useState("");
  const [orgName, setOrgName] = useState(org?.name || "");
  const [editingOrg, setEditingOrg] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        const [invRes, usageRes, plansRes] = await Promise.all([
          apiFetch<any>("/billing/invoices?limit=50", { token: token! }),
          apiFetch<any>(`/billing/usage?month=${MONTHS.indexOf(month)+1}&year=${year}`, { token: token! }),
          apiFetch<any>("/billing/plans", { token: token! }),
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
      await apiFetch("/billing/generate-invoice", { method: "POST", token: token! });
      addToast("Invoice generated", "success");
      const res = await apiFetch<any>("/billing/invoices?limit=50", { token: token! });
      setInvoices(res.data || []);
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const tabs = [
    { key: "organization", label: "Organization" },
    { key: "invoices", label: "Invoices" },
    { key: "usage", label: "Usage" },
    { key: "plans", label: "Plans" },
    { key: "payment", label: "Payment Details" },
  ];

  useEffect(() => { if (org?.name) setOrgName(org.name); }, [org?.name]);

  const saveOrgName = async () => {
    if (!orgName.trim() || orgName.trim() === org?.name) return;
    setSavingOrg(true);
    try {
      const res: any = await apiFetch("/org", { method: "PATCH", token: token!, body: JSON.stringify({ name: orgName.trim() }) });
      updateOrg({ id: res.id, name: res.name });
      setEditingOrg(false);
      addToast("Organization name updated", "success");
    } catch (err: any) { addToast(err.message || "Failed to update", "error"); } finally { setSavingOrg(false); }
  };

  const changePlan = async (plan: string) => {
    if (plan === "enterprise") { addToast("Contact sales@wrankey.io for enterprise pricing", "info"); return; }
    try {
      await apiFetch("/org", { method: "PATCH", token: token!, body: JSON.stringify({ name: org?.name }) });
      addToast(`Plan change to ${plan} requested. Your plan will be updated on the next billing cycle.`, "success");
    } catch (err: any) { addToast(err.message || "Failed to change plan", "error"); }
  };

  const maxVal = Math.max(...Object.values(usage), 1);
  const barScale = 25;

  const filteredInvoices = search ? invoices.filter(i => i.number.toLowerCase().includes(search.toLowerCase()) || i.period.toLowerCase().includes(search.toLowerCase())) : invoices;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Billing & Usage</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "organization" && (
        <div className="space-y-6">
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 dark:bg-violet-950/30 dark:border-violet-900/30 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Organization</h3>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Organization Name</label>
                      {editingOrg ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            className="h-10 max-w-md font-medium text-slate-900 dark:text-white"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") saveOrgName(); if (e.key === "Escape") { setEditingOrg(false); setOrgName(org?.name || ""); } }}
                          />
                          <Button size="sm" onClick={saveOrgName} disabled={savingOrg || !orgName.trim() || orgName.trim() === org?.name}>
                            <Save className="w-3.5 h-3.5 mr-1" /> {savingOrg ? "Saving..." : "Save"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingOrg(false); setOrgName(org?.name || ""); }}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold text-slate-900 dark:text-white">{org?.name || "My Organization"}</p>
                          <button onClick={() => setEditingOrg(true)} className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2">
                            Update
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Organization ID</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg select-all">
                          {org?.id ? `${org.id.slice(0, 4)}····${org.id.slice(-4)}` : "············"}
                        </code>
                        <button
                          onClick={() => { if (org?.id) { navigator.clipboard.writeText(org.id); addToast("Organization ID copied", "success"); } }}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Plan</label>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{currentPlan === "free" ? "Free" : currentPlan === "payg" ? "Pay as you go" : currentPlan === "pro" ? "Pro" : "Enterprise"}</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Billing Email</label>
                      <p className="text-sm text-slate-700 dark:text-slate-300">{user?.email || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 text-sm" />
            </div>
            <Button size="sm" variant="secondary" onClick={generateInvoice}>Generate Invoice</Button>
          </div>
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6"><Skeleton className="h-24 w-full" /></div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">You don&apos;t have any invoices yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 dark:border-slate-800"><th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Billing Period</th><th className="text-left py-3 text-xs font-semibold text-slate-400 uppercase">Plan</th><th className="text-right py-3 text-xs font-semibold text-slate-400 uppercase">Amount due</th><th className="text-center py-3 text-xs font-semibold text-slate-400 uppercase">Status</th><th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Action</th></tr></thead>
                  <tbody>
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-b-0">
                        <td className="py-3 px-4 text-xs font-medium text-slate-700">{inv.period}</td>
                        <td className="py-3 text-xs text-slate-500">{inv.plan}</td>
                        <td className="py-3 text-right text-xs font-mono text-slate-700">{inv.amount}</td>
                        <td className="py-3 text-center">
                          <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${inv.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : inv.status === "overdue" ? "bg-red-50 text-red-700 border-red-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addToast("Invoice PDF download coming soon", "info")}>PDF</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "usage" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Month</span>
            <div className="relative">
              <select value={month} onChange={e => setMonth(e.target.value)} className="appearance-none border rounded-md px-3 py-1.5 text-sm pr-8">
                {MONTHS.map(m => <option key={m} value={m}>{m} {year}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {loading ? (
            <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            USAGE_METRICS.map(metric => {
              const val = usage[metric] || 0;
              const bars = Math.min(Math.ceil((val / Math.max(maxVal, 1)) * barScale), barScale);
              return (
                <div key={metric} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-600">{metric}</span>
                    <span className="text-sm font-bold text-slate-800">{val}</span>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: barScale }).map((_, i) => (
                      <div key={i} className={`flex-1 h-6 rounded-sm ${i < bars ? "bg-brand-600" : "bg-slate-100 dark:bg-slate-800"}`} />
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400"><span>0</span><span>{Math.floor(barScale/2)}</span><span>{barScale}</span></div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "plans" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(plan => (
            <Card key={plan.key} className={`border ${plan.key === currentPlan ? "border-brand-600 dark:border-brand-400 ring-2 ring-brand-600/10" : "border-slate-100 dark:border-slate-800/80"} bg-white dark:bg-slate-900`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-900 dark:text-white">{plan.name}</h4>
                  {plan.key === currentPlan && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">Current Plan</span>}
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white mb-4">{plan.price}</p>
                <ul className="space-y-2 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{f.label}{f.value ? ` — ${f.value}` : ""}</span>
                    </li>
                  ))}
                </ul>
                {plan.key !== currentPlan && <Button variant="secondary" className="w-full" size="sm" onClick={() => changePlan(plan.key)}>{plan.key === "free" ? "Downgrade" : plan.key === "enterprise" ? "Contact Us" : "Change Plan"}</Button>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "payment" && (
        <div className="space-y-6">
          <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">Payment Processing via Stripe</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">Online payment integration is coming soon. For now, invoices are generated monthly and payable via bank transfer. Contact sales@wrankey.io for enterprise plans.</p>
          </div>
        </div>
      )}
    </div>
  );
}
