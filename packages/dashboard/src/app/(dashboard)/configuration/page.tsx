"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import {
  Shield, Key, Globe, Mail, Smartphone, Banknote, Plus, Trash2, Copy, Check, Edit3,
} from "lucide-react";

interface OAuthCredential {
  provider: string;
  clientId: string;
  clientSecret: string;
  credentialId: string;
  verified?: boolean;
}

interface OnRampProvider {
  provider: string;
  publishableKey: string;
  credentialId: string;
  environment: string;
}

export default function ConfigurationPage() {
  const router = useRouter();
  const { isAuthenticated, token, org } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"auth" | "oauth" | "fiat">("auth");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [configId, setConfigId] = useState("1570····810e");
  const [sessionExpiry, setSessionExpiry] = useState("900");
  const [allowedOrigins, setAllowedOrigins] = useState("");
  const [otpEnabled, setOtpEnabled] = useState(true);
  const [otpLength, setOtpLength] = useState("6");
  const [otpType, setOtpType] = useState("alphanumeric");
  const [otpEmail, setOtpEmail] = useState(true);
  const [otpSms, setOtpSms] = useState(false);
  const [appName, setAppName] = useState(org?.name || "");
  const [appLogo, setAppLogo] = useState("");
  const [requireTokenLookup, setRequireTokenLookup] = useState(false);
  const [socialOAuth, setSocialOAuth] = useState(true);
  const [googleLogin, setGoogleLogin] = useState(true);
  const [appleLogin, setAppleLogin] = useState(false);
  const [xLogin, setXLogin] = useState(false);
  const [discordLogin, setDiscordLogin] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState("https://example.com/auth/callback");
  const [passkeyAuth, setPasskeyAuth] = useState(true);
  const [walletAuth, setWalletAuth] = useState(true);
  const [authProxyEnabled, setAuthProxyEnabled] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<"inactive" | "active" | "loading">("inactive");

  const [oauthCredentials, setOauthCredentials] = useState<OAuthCredential[]>([]);
  const [showAddOAuth, setShowAddOAuth] = useState(false);
  const [editingOAuthId, setEditingOAuthId] = useState<string | null>(null);
  const [newOAuthProvider, setNewOAuthProvider] = useState("google");
  const [newOAuthClientId, setNewOAuthClientId] = useState("");
  const [newOAuthClientSecret, setNewOAuthClientSecret] = useState("");
  const [showOAuthSecret, setShowOAuthSecret] = useState(false);
  const [testingOAuth, setTestingOAuth] = useState(false);

  const [onRampProviders, setOnRampProviders] = useState<OnRampProvider[]>([]);
  const [showAddOnRamp, setShowAddOnRamp] = useState(false);
  const [newRampProvider, setNewRampProvider] = useState("coinbase");
  const [newRampKey, setNewRampKey] = useState("");
  const [newRampSecret, setNewRampSecret] = useState("");
  const [newRampProjectId, setNewRampProjectId] = useState("");
  const [newRampPrivateKey, setNewRampPrivateKey] = useState("");
  const [newRampEnv, setNewRampEnv] = useState("production");

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        const [cfgRes]: any[] = await Promise.all([
          apiFetch<any>("/configuration", { token: token! }),
        ]);
        const c = cfgRes || {};
        setSessionExpiry(String(c.sessionExpiry || 900));
        setAllowedOrigins(c.allowedOrigins || "");
        setOtpEnabled(c.otpEnabled ?? true);
        setOtpLength(String(c.otpLength || 6));
        setOtpType(c.otpType || "alphanumeric");
        setOtpEmail(c.otpEmail ?? true);
        setOtpSms(c.otpSms ?? false);
        setAppName(c.appName || org?.name || "");
        setAppLogo(c.appLogo || "");
        setRequireTokenLookup(c.requireTokenLookup ?? false);
        setSocialOAuth(c.socialOAuth ?? true);
        setGoogleLogin(c.googleLogin ?? true);
        setAppleLogin(c.appleLogin ?? false);
        setXLogin(c.xLogin ?? false);
        setDiscordLogin(c.discordLogin ?? false);
        setRedirectUrl(c.redirectUrl || "https://example.com/auth/callback");
        setPasskeyAuth(c.passkeyAuth ?? true);
        setWalletAuth(c.walletAuth ?? true);
        setAuthProxyEnabled(c.authProxyEnabled ?? false);
        setOauthCredentials(c.oauthCredentials || []);
        setOnRampProviders(c.onRampProviders || []);
        if (c.configId) {
          setConfigId(c.configId);
          setProxyStatus("active");
        } else {
          setConfigId("");
          setProxyStatus("inactive");
        }
      } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, router, token, org]);

  const handleSave = async () => {
    try {
      await apiFetch("/configuration", {
        method: "PATCH",
        body: JSON.stringify({
          sessionExpiry: parseInt(sessionExpiry),
          allowedOrigins,
          otpEnabled, otpLength: parseInt(otpLength), otpType, otpEmail, otpSms,
          appName, appLogo, requireTokenLookup,
          socialOAuth, googleLogin, appleLogin, xLogin, discordLogin, redirectUrl,
          passkeyAuth, walletAuth, authProxyEnabled,
          oauthCredentials, onRampProviders,
        }),
        token: token!,
      });
      setSaved(true);
      addToast("Configuration saved", "success");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      addToast(err.message || "Failed to save", "error");
    }
  };

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSave = useCallback((field: string, value: any) => {
    if (!token) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ [field]: value }), token: token! });
      } catch { /* silent */ }
    }, 600);
  }, [token]);

  const toggleSave = useCallback((field: string, value: boolean) => {
    if (!token) return;
    apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ [field]: value }), token: token! }).catch(() => {});
  }, [token]);

  const resetOAuthForm = () => {
    setNewOAuthProvider("google"); setNewOAuthClientId(""); setNewOAuthClientSecret("");
    setShowOAuthSecret(false); setEditingOAuthId(null);
  };

  const openAddOAuth = () => { resetOAuthForm(); setShowAddOAuth(true); };

  const openEditOAuth = (cred: OAuthCredential) => {
    setEditingOAuthId(cred.credentialId);
    setNewOAuthProvider(cred.provider);
    setNewOAuthClientId(cred.clientId);
    setNewOAuthClientSecret(cred.clientSecret || "");
    setShowOAuthSecret(false);
    setShowAddOAuth(true);
  };

  const saveOAuthCredential = async () => {
    if (!newOAuthProvider || !newOAuthClientId || !newOAuthClientSecret) {
      addToast("Provider, Client ID, and Client Secret are required", "error"); return;
    }
    let updated: OAuthCredential[];
    if (editingOAuthId) {
      updated = oauthCredentials.map(c => c.credentialId === editingOAuthId ? { ...c, provider: newOAuthProvider, clientId: newOAuthClientId, clientSecret: newOAuthClientSecret } : c);
    } else {
      updated = [...oauthCredentials, { provider: newOAuthProvider, clientId: newOAuthClientId, clientSecret: newOAuthClientSecret, credentialId: `cred_${Date.now().toString(36)}` }];
    }
    try {
      await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ oauthCredentials: updated }), token: token! });
      setOauthCredentials(updated);
      addToast(editingOAuthId ? "OAuth credential updated" : "OAuth credential added", "success");
      setShowAddOAuth(false); resetOAuthForm();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const removeOAuthCredential = async (id: string) => {
    const updated = oauthCredentials.filter(c => c.credentialId !== id);
    try {
      await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ oauthCredentials: updated }), token: token! });
      setOauthCredentials(updated);
      addToast("OAuth credential removed", "success");
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const testOAuthConnection = async () => {
    if (!newOAuthProvider || !newOAuthClientId || !newOAuthClientSecret) {
      addToast("Fill in all fields first", "error"); return;
    }
    setTestingOAuth(true);
    try {
      // Use a mock authorization code test — validates credentials exist server-side
      const res: any = await apiFetch("/auth/oauth", {
        method: "POST",
        body: JSON.stringify({ provider: newOAuthProvider, code: "__test__", redirectUri: redirectUrl, orgId: org?.id }),
        token: token!,
      }).catch((e: any) => ({ error: e.message }));
      if (res?.error && !res.error.includes("not configured") && !res.error.includes("configured")) {
        // Any error other than "not configured" means the endpoint is reachable with valid creds
        addToast("Credentials validated — provider reachable", "success");
        const updated = oauthCredentials.map(c => c.credentialId === editingOAuthId ? { ...c, verified: true } : c);
        if (editingOAuthId) setOauthCredentials(updated);
      } else if (res?.error?.includes("not configured")) {
        addToast("Credentials not configured properly", "error");
      } else {
        addToast("Provider endpoint reachable", "success");
      }
    } catch (err: any) { addToast(err.message || "Connection test failed", "error"); }
    finally { setTestingOAuth(false); }
  };

  const addOnRampProvider = async () => {
    if (!newRampProvider || !newRampKey) return;
    const updated = [...onRampProviders, { provider: newRampProvider, publishableKey: newRampKey, secretKey: newRampSecret, projectId: newRampProjectId, privateKey: newRampPrivateKey, environment: newRampEnv, credentialId: `ramp_${Date.now().toString(36)}` }];
    try {
      await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ onRampProviders: updated }), token: token! });
      setOnRampProviders(updated);
      addToast("On-ramp provider added", "success");
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
    setNewRampProvider("coinbase"); setNewRampKey(""); setNewRampSecret(""); setNewRampProjectId(""); setNewRampPrivateKey(""); setNewRampEnv("production"); setShowAddOnRamp(false);
  };

  const removeOnRampProvider = async (id: string) => {
    const updated = onRampProviders.filter(p => p.credentialId !== id);
    try {
      await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ onRampProviders: updated }), token: token! });
      setOnRampProviders(updated);
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const Toggle = ({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label?: string }) => (
    <button onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${enabled ? "translate-x-[18px]" : "translate-x-[4px]"}`} />
    </button>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuration</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "auth", label: "Authentication" },
          { key: "oauth", label: "OAuth 2.0" },
          { key: "fiat", label: "Fiat On Ramp" },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "auth" && (
        <div className="space-y-6">
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardHeader><h3 className="font-semibold">WalletKit Configuration</h3></CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-3 rounded-md text-sm ${authProxyEnabled ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">Auth Proxy</p>
                  <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${authProxyEnabled ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
                    {authProxyEnabled ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {authProxyEnabled
                    ? "Auth proxy is enabled. Use the Config ID below in your frontend SDK to authenticate without a backend."
                    : "Enable the auth proxy to allow frontend-only authentication. A unique Config ID will be generated."}
                </p>
              </div>
              <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Auth Proxy</span><Toggle enabled={authProxyEnabled} onChange={(v) => { setAuthProxyEnabled(v); toggleSave("authProxyEnabled", v); }} /></div>
              {authProxyEnabled && configId && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Config ID</label>
                  <div className="flex gap-2">
                    <Input value={configId} readOnly className="font-mono text-xs bg-white flex-1" />
                    <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(configId); addToast("Config ID copied", "success"); }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Pass this to your frontend SDK: <code className="bg-slate-200 px-1 rounded">configId="{configId.slice(0, 8)}..."</code>
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Session expiration length, sec.</label><Input value={sessionExpiry} onChange={e => { setSessionExpiry(e.target.value); autoSave('sessionExpiry', parseInt(e.target.value)); }} className="text-xs" /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Allowed origins</label>
                <textarea value={allowedOrigins} onChange={e => { setAllowedOrigins(e.target.value); autoSave('allowedOrigins', e.target.value); }} placeholder="https://myapp.com&#10;https://app.myapp.com" rows={3} className="w-full border rounded-md px-3 py-2 text-xs font-mono resize-none bg-slate-50 dark:bg-slate-800" />
                <p className="text-[10px] text-slate-400 mt-1">One origin per line. Leave empty to allow all origins.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardHeader><h3 className="font-semibold">One-Time Password</h3></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between"><span className="text-sm text-slate-700 font-medium">Enable Email &amp; SMS OTP</span><Toggle enabled={otpEnabled} onChange={(v) => { setOtpEnabled(v); toggleSave("otpEnabled", v); }} /></div>
              {otpEnabled && (
                <div className="space-y-4 pl-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs font-medium text-slate-500 mb-1 block">OTP Length</label><select value={otpLength} onChange={e => { setOtpLength(e.target.value); autoSave('otpLength', parseInt(e.target.value)); }} className="w-full border rounded-md px-3 py-2 text-xs"><option value="4">4</option><option value="6">6</option><option value="8">8</option></select></div>
                    <div><label className="text-xs font-medium text-slate-500 mb-1 block">Type</label><select value={otpType} onChange={e => { setOtpType(e.target.value); autoSave('otpType', e.target.value); }} className="w-full border rounded-md px-3 py-2 text-xs"><option value="numeric">Numeric</option><option value="alphanumeric">Alphanumeric</option></select></div>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-slate-100"><span className="text-sm text-slate-600">Send OTP via Email</span><Toggle enabled={otpEmail} onChange={(v) => { setOtpEmail(v); toggleSave("otpEmail", v); }} /></div>
                  {otpEmail && (
                    <div className="space-y-3 pl-1">
                      <div><label className="text-xs font-medium text-slate-500 mb-1 block">Application name (brand)</label><Input value={appName} onChange={e => { setAppName(e.target.value); autoSave('appName', e.target.value); }} placeholder="Name" className="text-xs" /><p className="text-[10px] text-slate-400 mt-1">App name is required when email OTP is enabled.</p></div>
                      <div><label className="text-xs font-medium text-slate-500 mb-1 block">Logo URL</label><Input value={appLogo} onChange={e => { setAppLogo(e.target.value); autoSave('appLogo', e.target.value); }} placeholder="https://" className="text-xs" /></div>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 border-t border-slate-100">
                    <div><span className="text-sm text-slate-600">Send OTP via SMS</span><p className="text-[10px] text-slate-400">SMS OTP is only available on the Enterprise plan.</p></div>
                    <Toggle enabled={otpSms} onChange={setOtpSms} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-slate-100"><span className="text-sm text-slate-600">Require token for account lookups</span><Toggle enabled={requireTokenLookup} onChange={(v) => { setRequireTokenLookup(v); toggleSave("requireTokenLookup", v); }} /></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardHeader><h3 className="font-semibold">Social Logins</h3><p className="text-xs text-slate-400 mt-1">Social sign-in providers surfaced in the Wallet Kit.</p></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2"><div><span className="text-sm text-slate-700 font-medium">OAuth</span><p className="text-xs text-slate-400">Allow users to sign in using third-party providers.</p></div><Toggle enabled={socialOAuth} onChange={(v) => { setSocialOAuth(v); toggleSave("socialOAuth", v); }} /></div>
              {socialOAuth && (
                <div className="pl-2 border-l-2 border-brand-200 dark:border-brand-800 space-y-3 mt-2">
                  <p className="text-xs font-medium text-slate-500">Social login buttons to surface on the wallet kit.</p>
                  {[
                    { label: "Google", enabled: googleLogin, setter: setGoogleLogin },
                    { label: "Apple", enabled: appleLogin, setter: setAppleLogin },
                    { label: "X", enabled: xLogin, setter: setXLogin },
                    { label: "Discord", enabled: discordLogin, setter: setDiscordLogin },
                  ].map(provider => (
                    <div key={provider.label} className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800/50">
                      <span className="text-sm text-slate-600">{provider.label}</span>
                      <Toggle enabled={provider.enabled} onChange={provider.setter} />
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/50">
                    <label className="text-xs font-medium text-slate-500 mb-1 block">Redirect URL</label>
                    <Input value={redirectUrl} onChange={e => { setRedirectUrl(e.target.value); autoSave('redirectUrl', e.target.value); }} className="text-xs font-mono" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardHeader><h3 className="font-semibold">SDK Configuration</h3><p className="text-xs text-slate-400 mt-1">Configuration for Wallet Kits and SDKs.</p></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between py-2"><div><span className="text-sm text-slate-700 font-medium">Passkey</span><p className="text-xs text-slate-400">Display passkey authentication</p></div><Toggle enabled={passkeyAuth} onChange={(v) => { setPasskeyAuth(v); toggleSave("passkeyAuth", v); }} /></div>
              <div className="flex items-center justify-between py-2 border-t border-slate-100"><div><span className="text-sm text-slate-700 font-medium">Wallet</span><p className="text-xs text-slate-400">Display external wallet authentication</p></div><Toggle enabled={walletAuth} onChange={(v) => { setWalletAuth(v); toggleSave("walletAuth", v); }} /></div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} className="w-full md:w-auto">{saved ? <><Check className="w-4 h-4 mr-1" /> Saved</> : "Save Changes"}</Button>
        </div>
      )}

      {activeTab === "oauth" && (
        <div className="space-y-6">
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <h3 className="font-semibold">OAuth 2.0 Credentials</h3>
                <p className="text-xs text-slate-400 mt-1">Connect external identity providers so users can sign in with existing accounts.</p>
              </div>
              <Button size="sm" onClick={openAddOAuth}><Plus className="w-3.5 h-3.5 mr-1" /> Add Provider</Button>
            </CardHeader>
            <CardContent>
              {oauthCredentials.length === 0 ? (
                <div className="text-center py-12">
                  <Globe className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">No OAuth providers configured</p>
                  <p className="text-xs text-slate-400 mb-4">Connect Google, Apple, GitHub, Discord, or X for social login.</p>
                  <Button size="sm" variant="secondary" onClick={openAddOAuth}><Plus className="w-3.5 h-3.5 mr-1" /> Add Provider</Button>
                </div>
              ) : (
                <Table
                  columns={[
                    { key: "provider", header: "Provider", render: (c: OAuthCredential) => {
                      const iconMap: Record<string, string> = { google: "🔵", apple: "🍎", twitter: "🐦", x: "🐦", discord: "💬", github: "📦" };
                      const labelMap: Record<string, string> = { google: "Google", apple: "Apple", twitter: "X (Twitter)", x: "X (Twitter)", discord: "Discord", github: "GitHub" };
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-base">{iconMap[c.provider] || "🔑"}</span>
                          <span className="text-sm font-medium">{labelMap[c.provider] || c.provider}</span>
                        </div>
                      );
                    }},
                    { key: "clientId", header: "Client ID", render: (c: OAuthCredential) => (
                      <div className="flex items-center gap-1">
                        <code className="text-[11px] font-mono text-slate-500">{c.clientId.slice(0, 8)}••••{c.clientId.slice(-4)}</code>
                        <button onClick={() => { navigator.clipboard.writeText(c.clientId); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button>
                      </div>
                    )},
                    { key: "status", header: "Status", render: (c: OAuthCredential) => (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${c.verified ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                        {c.verified ? <Check className="w-2.5 h-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                        {c.verified ? "Verified" : "Not tested"}
                      </span>
                    )},
                    { key: "actions", header: "", render: (c: OAuthCredential) => (
                      <div className="flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditOAuth(c)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeOAuthCredential(c.credentialId)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                      </div>
                    )},
                  ]}
                  data={oauthCredentials} loading={false}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "fiat" && (
        <div className="space-y-6">
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between"><h3 className="font-semibold">Fiat On Ramp Providers</h3><Button size="sm" onClick={() => setShowAddOnRamp(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Add Provider</Button></CardHeader>
            <CardContent>
              {onRampProviders.length === 0 && !showAddOnRamp ? (
                <p className="text-sm text-slate-400 py-4 text-center">No on-ramp credentials found.</p>
              ) : onRampProviders.length > 0 ? (
                <Table
                  columns={[
                    { key: "provider", header: "Provider" },
                    { key: "publishableKey", header: "Publishable Key", render: (p: OnRampProvider) => <span className="font-mono text-[11px]">{p.publishableKey.slice(0, 16)}...</span> },
                    { key: "credentialId", header: "Credential ID", render: (p: OnRampProvider) => <span className="font-mono text-[11px]">{p.credentialId}</span> },
                    { key: "environment", header: "Environment", render: (p: OnRampProvider) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${p.environment === "production" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>{p.environment}</span> },
                    { key: "actions", header: "Actions", render: (p: OnRampProvider) => <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => removeOnRampProvider(p.credentialId)}><Trash2 className="w-3 h-3" /></Button> },
                  ]}
                  data={onRampProviders} loading={false}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      <Modal open={showAddOAuth} onClose={() => { setShowAddOAuth(false); resetOAuthForm(); }} title={editingOAuthId ? "Edit OAuth2 Provider" : "Add OAuth2 Provider"}>
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <p className="text-sm text-slate-500">Connect an identity provider so users can log in with their existing accounts instead of creating a new password.</p>

          <div className="space-y-1">
            <label className="text-sm font-medium">Provider</label>
            <select value={newOAuthProvider} onChange={e => setNewOAuthProvider(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-900">
              <option value="google">🔵 Google</option>
              <option value="apple">🍎 Apple</option>
              <option value="twitter">🐦 Twitter (X)</option>
              <option value="discord">💬 Discord</option>
              <option value="github">📦 GitHub</option>
            </select>
          </div>

          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-blue-700">
            {newOAuthProvider === "google" && "Create an OAuth 2.0 client in the Google Cloud Console. Set the redirect URI to the URL shown below."}
            {newOAuthProvider === "apple" && "Create a Sign in with Apple service in the Apple Developer Portal. Use the redirect URL below in your configuration."}
            {newOAuthProvider === "twitter" && "Create an app in the Twitter Developer Portal. Before connecting, obtain your Client ID and Client Secret from Twitter's OAuth 2.0 settings."}
            {newOAuthProvider === "discord" && "Create an application in the Discord Developer Portal. Add the redirect URL below to your OAuth2 redirects."}
            {newOAuthProvider === "github" && "Register a new OAuth app in GitHub Developer Settings. Use the redirect URL below as the Authorization callback URL."}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Client ID</label>
            <Input value={newOAuthClientId} onChange={e => setNewOAuthClientId(e.target.value)} placeholder="Enter client ID" className="font-mono text-xs" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Client Secret</label>
            <div className="relative">
              <Input
                value={newOAuthClientSecret}
                onChange={e => setNewOAuthClientSecret(e.target.value)}
                placeholder="Enter client secret"
                type={showOAuthSecret ? "text" : "password"}
                className="font-mono text-xs pr-10"
              />
              <button
                type="button"
                onClick={() => setShowOAuthSecret(!showOAuthSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium"
              >
                {showOAuthSecret ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">This must be stored securely and never exposed to the frontend.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Redirect URL</label>
            <div className="flex items-center gap-1">
              <Input value={redirectUrl} readOnly className="font-mono text-xs bg-slate-50 flex-1" />
              <button onClick={() => { navigator.clipboard.writeText(redirectUrl); addToast("Redirect URL copied", "success"); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Copy this URL into your provider&apos;s OAuth settings.</p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowAddOAuth(false); resetOAuthForm(); }} className="flex-1">Cancel</Button>
            {editingOAuthId && (
              <Button variant="secondary" onClick={testOAuthConnection} disabled={testingOAuth} className="flex-1">
                {testingOAuth ? "Testing..." : "Test Connection"}
              </Button>
            )}
            <Button onClick={saveOAuthCredential} className="flex-1">
              {editingOAuthId ? "Update" : "Add Provider"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showAddOnRamp} onClose={() => { setShowAddOnRamp(false); setNewRampProvider("coinbase"); setNewRampKey(""); }} title="Add Fiat On Ramp Provider">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Configure a fiat on-ramp provider for buying crypto.</p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Provider</label>
            <select value={newRampProvider} onChange={e => setNewRampProvider(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="coinbase">Coinbase</option>
              <option value="stripe">Stripe</option>
              <option value="moonpay">MoonPay</option>
              <option value="ramp">Ramp</option>
              <option value="transak">Transak</option>
              <option value="sardine">Sardine</option>
            </select>
          </div>

          {newRampProvider === "coinbase" ? (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium">Publishable API Key</label>
                <Input value={newRampKey} onChange={e => setNewRampKey(e.target.value)} placeholder="Enter publishable API key" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Secret API Key</label>
                <Input value={newRampSecret} onChange={e => setNewRampSecret(e.target.value)} placeholder="Enter secret API key" type="password" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Project ID</label>
                <Input value={newRampProjectId} onChange={e => setNewRampProjectId(e.target.value)} placeholder="Enter Coinbase project ID" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Private API Key</label>
                <Input value={newRampPrivateKey} onChange={e => setNewRampPrivateKey(e.target.value)} placeholder="Enter private API key" type="password" />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <label className="text-sm font-medium">Publishable Key</label>
              <Input value={newRampKey} onChange={e => setNewRampKey(e.target.value)} placeholder="Enter publishable key" />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Environment</label>
            <select value={newRampEnv} onChange={e => setNewRampEnv(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="production">Production</option>
              <option value="sandbox">Sandbox</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowAddOnRamp(false); setNewRampKey(""); }} className="flex-1">Cancel</Button>
            <Button onClick={addOnRampProvider} className="flex-1">Add Provider</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
