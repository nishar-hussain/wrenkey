"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  Building2, Shield, Globe, Key, Bell, Activity, Zap,
  Clock, AlertTriangle, Check, Save, RefreshCw
} from "lucide-react";

interface SettingItem {
  label: string;
  value: string;
  copy?: boolean;
  mono?: boolean;
  edit?: boolean;
  onChange?: (v: string) => void;
  onSave?: () => void;
  saving?: boolean;
  status?: boolean;
}

interface SettingSection {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SettingItem[];
}

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, token, org, user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgId] = useState(org?.id || "");
  const [health, setHealth] = useState<Record<string, string>>({});
  const [walletCount, setWalletCount] = useState(0);
  const [userCount, setUserCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        setOrgName(org?.name || "");
        const [healthRes, walletsRes, usersRes] = await Promise.all([
          fetch("http://localhost:3001/health/services").then(r => r.json()).catch(() => ({ services: {} })),
          apiFetch<any>("/wallets?limit=1", { token: token! }),
          apiFetch<any>("/users?limit=1", { token: token! }),
        ]);
        setHealth(healthRes.services || {});
        setWalletCount(walletsRes.total || 0);
        setUserCount(usersRes.total || 0);
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, router, user, org, token]);

  const saveOrgName = async () => {
    if (!orgName.trim()) { addToast("Organization name is required", "error"); return; }
    setSaving(true);
    try {
      await apiFetch("/org", { method: "PATCH", body: JSON.stringify({ name: orgName.trim() }), token: token! });
      addToast("Organization name updated", "success");
    } catch (err: any) { addToast(err.message || "Failed to update", "error"); }
    finally { setSaving(false); }
  };

  if (!isAuthenticated) return null;

  const configSections: SettingSection[] = [
    {
      title: "Organization",
      icon: Building2,
      items: [
        { label: "Organization ID", value: orgId, copy: true, mono: true },
        { label: "Name", value: orgName, edit: true, onChange: setOrgName, onSave: saveOrgName, saving },
        { label: "Your Role", value: user?.role?.replace(/_/g, " ") || "Member" },
        { label: "Your Email", value: user?.email || "—" },
      ],
    },
    {
      title: "Platform Health",
      icon: Activity,
      items: [
        { label: "Database", value: health.database || "Unknown", status: health.database === "operational" },
        { label: "Redis Cache", value: health.redis || "Unknown", status: health.redis === "operational" },
        { label: "Blockchain RPC", value: health.blockchain || "Unknown", status: health.blockchain === "operational" },
      ],
    },
    {
      title: "Resource Summary",
      icon: Zap,
      items: [
        { label: "Total Wallets", value: loading ? "..." : String(walletCount) },
        { label: "Team Members", value: loading ? "..." : String(userCount) },
        { label: "Plan", value: walletCount > 25 ? "Enterprise" : walletCount > 3 ? "Developer" : "Free" },
      ],
    },
    {
      title: "Security Defaults",
      icon: Shield,
      items: [
        { label: "Session Expiry", value: "1 hour" },
        { label: "OTP Expiry", value: "5 minutes" },
        { label: "API Key Expiry", value: "365 days" },
        { label: "WebAuthn RP ID", value: "localhost" },
        { label: "Encryption", value: "AES-256-GCM" },
        { label: "JWT Algorithm", value: "HS256" },
      ],
    },
    {
      title: "Risk & Compliance",
      icon: AlertTriangle,
      items: [
        { label: "Risk High Value %", value: "80%" },
        { label: "Risk Score Threshold", value: "70/100" },
        { label: "Velocity Window", value: "1 hour" },
        { label: "Max Tx / Window", value: "50" },
        { label: "Tx Max Retries", value: "3" },
        { label: "Scam Detection", value: "Enabled (static + live)" },
      ],
    },
    {
      title: "Webhooks & API",
      icon: Globe,
      items: [
        { label: "HMAC Signature", value: "SHA-256" },
        { label: "Max Retries", value: "5" },
        { label: "Retry Base Delay", value: "60 seconds" },
        { label: "Rate Limit", value: "1000 req/min" },
        { label: "CORS Origins", value: "localhost:5173" },
      ],
    },
  ];

  const statusDot = (ok?: boolean) => (
    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${ok ? "bg-emerald-500" : ok === false ? "bg-red-500" : "bg-slate-300"}`} />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Platform configuration and organization preferences</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {configSections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.title} className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-slate-500" />
                    </div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{section.title}</h3>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-b-0">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                      <div className="flex items-center gap-2">
                        {item.status !== undefined ? (
                          <span className={`text-xs font-medium flex items-center ${item.status ? "text-emerald-600" : "text-red-600"}`}>
                            {statusDot(item.status)}
                            {item.value}
                          </span>
                        ) : item.edit ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={String(item.value)}
                              onChange={(e) => item.onChange?.(e.target.value)}
                              className="h-7 w-40 text-xs"
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={item.onSave} disabled={item.saving}>
                              <Save className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className={`text-xs font-medium text-slate-700 dark:text-slate-300 ${item.mono ? "font-mono" : ""}`}>
                            {String(item.value).length > 30 ? `${String(item.value).slice(0, 14)}...${String(item.value).slice(-6)}` : String(item.value)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
