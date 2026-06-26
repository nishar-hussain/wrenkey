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
import { Search, Check, ChevronDown, CreditCard, Mail } from "lucide-react";

const PLANS = [
  {
    key: "free", name: "Free", price: "$0/mo",
    features: [{ label: "Signatures", value: "First 25 Free" }, { label: "Wallets", value: "Up to 1k" }],
    badge: "Current Plan",
  },
  {
    key: "payg", name: "Pay as you go", price: "Variable",
    features: [{ label: "Signatures", value: "Free · 25/mo" }, { label: "Additional", value: "$0.10/tx" }, { label: "Wallets", value: "Up to 1k" }],
    action: "Change Plan",
  },
  {
    key: "pro", name: "Pro", price: "$99/mo",
    features: [{ label: "Signatures", value: "$0.05/sig" }, { label: "Wallets", value: "Up to 2k" }],
    action: "Change Plan",
  },
  {
    key: "enterprise", name: "Enterprise", price: "Custom",
    features: [
      { label: "Signatures", value: "Custom Pricing" }, { label: "Wallets", value: "Unlimited" },
      { label: "Enterprise support", value: "" }, { label: "Technical and security advisory", value: "" },
      { label: "Prioritized feature requests", value: "" }, { label: "SMS auth available on request", value: "" },
      { label: "Fiat on-ramp available on request", value: "" },
    ],
    action: "Contact Us",
  },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const USAGE_METRICS = ["Signatures", "Activities", "Wallets", "Sub-orgs", "Private Keys", "Private Keys (in/out)"];

export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated, token, org } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"invoices" | "usage" | "plans" | "payment">("invoices");
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");

  const [cardName, setCardName] = useState("");
  const [cardEmail, setCardEmail] = useState("");

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        const [w, t, a, u, wh] = await Promise.all([
          apiFetch<any>("/wallets?limit=1", { token: token! }),
          apiFetch<any>("/transactions?limit=1", { token: token! }),
          apiFetch<any>("/agents?limit=1", { token: token! }),
          apiFetch<any>("/users?limit=1", { token: token! }),
          apiFetch<any>("/webhooks?limit=1", { token: token! }),
        ]);
        setUsage({
          Signatures: (t.total || 0),
          Activities: (t.total || 0) + (w.total || 0) + (a.total || 0),
          Wallets: (w.total || 0),
          "Sub-orgs": 0,
          "Private Keys": (w.total || 0),
          "Private Keys (in/out)": (t.total || 0),
        });
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, router, token]);

  if (!isAuthenticated) return null;

  const tabs = [
    { key: "invoices", label: "Invoices" },
    { key: "usage", label: "Usage" },
    { key: "plans", label: "Plans" },
    { key: "payment", label: "Payment Details" },
  ];

  const maxVal = Math.max(...Object.values(usage), 1);
  const barScale = 25;

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

      {activeTab === "invoices" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 text-sm" />
          </div>
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6"><Skeleton className="h-24 w-full" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-100 dark:border-slate-800"><th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Billing Period</th><th className="text-left py-3 text-xs font-semibold text-slate-400 uppercase">Plan</th><th className="text-right py-3 text-xs font-semibold text-slate-400 uppercase">Amount due</th><th className="text-center py-3 text-xs font-semibold text-slate-400 uppercase">Status</th><th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Action</th></tr></thead>
                  <tbody>
                    <tr><td colSpan={5} className="text-center py-12 text-sm text-slate-400">You don&apos;t have any invoices yet.</td></tr>
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

          {USAGE_METRICS.map(metric => {
            const val = usage[metric] || 0;
            const bars = Math.min(Math.ceil((val / barScale) * barScale), barScale);
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
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>0</span><span>{Math.floor(barScale/2)}</span><span>{barScale}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "plans" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map(plan => (
            <Card key={plan.key} className={`border ${plan.badge ? "border-brand-600 dark:border-brand-400 ring-2 ring-brand-600/10" : "border-slate-100 dark:border-slate-800/80"} bg-white dark:bg-slate-900`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-slate-900 dark:text-white">{plan.name}</h4>
                  {plan.badge && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">{plan.badge}</span>}
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
                {plan.action && <Button variant="secondary" className="w-full" size="sm">{plan.action}</Button>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "payment" && (
        <div className="space-y-6">
          <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No Payment Details Yet</p>
            <p className="text-xs text-slate-400">Try adding a New Card.</p>
          </div>

          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-4">New Card</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Name on Card</label>
                  <Input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Email for Invoices</label>
                  <Input value={cardEmail} onChange={e => setCardEmail(e.target.value)} placeholder="billing@example.com" />
                </div>
                <Button className="w-full" onClick={() => { addToast("Payment method will be processed", "info"); setCardName(""); setCardEmail(""); }}>
                  <Mail className="w-4 h-4 mr-1.5" /> Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
