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
  Shield, Key, Globe, Mail, Smartphone, Banknote, Plus, Trash2, Copy, Check,
} from "lucide-react";

interface OAuthCredential {
  provider: string;
  clientId: string;
  credentialId: string;
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

  const [oauthCredentials, setOauthCredentials] = useState<OAuthCredential[]>([]);
  const [showAddOAuth, setShowAddOAuth] = useState(false);
  const [newOAuthProvider, setNewOAuthProvider] = useState("google");
  const [newOAuthClientId, setNewOAuthClientId] = useState("");
  const [newOAuthClientSecret, setNewOAuthClientSecret] = useState("");

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
          setConfigId(c.configId.slice(0, 4) + "····" + c.configId.slice(-4));
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

  const addOAuthCredential = async () => {
    if (!newOAuthProvider || !newOAuthClientId) return;
    const updated = [...oauthCredentials, { provider: newOAuthProvider, clientId: newOAuthClientId, clientSecret: newOAuthClientSecret, credentialId: `cred_${Date.now().toString(36)}` }];
    try {
      await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ oauthCredentials: updated }), token: token! });
      setOauthCredentials(updated);
      addToast("OAuth credential added", "success");
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
    setNewOAuthProvider("google"); setNewOAuthClientId(""); setNewOAuthClientSecret(""); setShowAddOAuth(false);
  };

  const removeOAuthCredential = async (id: string) => {
    const updated = oauthCredentials.filter(c => c.credentialId !== id);
    try {
      await apiFetch("/configuration", { method: "PATCH", body: JSON.stringify({ oauthCredentials: updated }), token: token! });
      setOauthCredentials(updated);
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
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
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
                <p className="font-medium text-amber-700">Auth Proxy</p>
                <p className="text-amber-600 mt-1">Enable the auth proxy to bypass requiring a backend.</p>
              </div>
              <div className="flex items-center justify-between"><span className="text-sm text-slate-600">Auth Proxy</span><Toggle enabled={authProxyEnabled} onChange={(v) => { setAuthProxyEnabled(v); toggleSave("authProxyEnabled", v); }} /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Config ID</label><Input value={configId} readOnly className="font-mono text-xs bg-slate-50" /></div>
                <div><label className="text-xs font-medium text-slate-500 mb-1 block">Session expiration length, sec.</label><Input value={sessionExpiry} onChange={e => { setSessionExpiry(e.target.value); autoSave('sessionExpiry', parseInt(e.target.value)); }} className="text-xs" /></div>
              </div>
              <div><label className="text-xs font-medium text-slate-500 mb-1 block">Allowed origins</label><Input value={allowedOrigins} onChange={e => { setAllowedOrigins(e.target.value); autoSave('allowedOrigins', e.target.value); }} placeholder="https://" className="text-xs" /><p className="text-[10px] text-slate-400 mt-1">All origins allowed. Add specific origins to restrict access.</p></div>
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
            <CardHeader className="flex flex-row items-center justify-between"><h3 className="font-semibold">OAuth 2.0 Credentials</h3><Button size="sm" onClick={() => setShowAddOAuth(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Add Credential</Button></CardHeader>
            <CardContent>
              {oauthCredentials.length === 0 && !showAddOAuth ? (
                <p className="text-sm text-slate-400 py-4 text-center">No OAuth 2.0 credentials found.</p>
              ) : oauthCredentials.length > 0 ? (
                <Table
                  columns={[
                    { key: "provider", header: "Provider" },
                    { key: "clientId", header: "Client ID", render: (c: OAuthCredential) => <span className="font-mono text-xs">{c.clientId}</span> },
                    { key: "credentialId", header: "Credential ID", render: (c: OAuthCredential) => <span className="font-mono text-[11px]">{c.credentialId}</span> },
                    { key: "actions", header: "Actions", render: (c: OAuthCredential) => <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => removeOAuthCredential(c.credentialId)}><Trash2 className="w-3 h-3" /></Button> },
                  ]}
                  data={oauthCredentials} loading={false}
                />
              ) : null}
            </CardContent>
          </Card>
          <div className="flex items-center gap-2 text-xs text-slate-400"><Shield className="w-3.5 h-3.5" /> Root user</div>
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

      <Modal open={showAddOAuth} onClose={() => { setShowAddOAuth(false); setNewOAuthProvider("google"); setNewOAuthClientId(""); setNewOAuthClientSecret(""); }} title="Add OAuth2 Provider">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Configure OAuth 2.0 credentials for a social login provider.</p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Provider</label>
            <select value={newOAuthProvider} onChange={e => setNewOAuthProvider(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="google">Google</option>
              <option value="apple">Apple</option>
              <option value="twitter">Twitter (X)</option>
              <option value="discord">Discord</option>
              <option value="github">GitHub</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Client ID</label>
            <Input value={newOAuthClientId} onChange={e => setNewOAuthClientId(e.target.value)} placeholder="Enter client ID" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Client Secret</label>
            <Input value={newOAuthClientSecret} onChange={e => setNewOAuthClientSecret(e.target.value)} placeholder="Enter client secret" type="password" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowAddOAuth(false); setNewOAuthClientId(""); setNewOAuthClientSecret(""); }} className="flex-1">Cancel</Button>
            <Button onClick={addOAuthCredential} className="flex-1">Add Provider</Button>
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
