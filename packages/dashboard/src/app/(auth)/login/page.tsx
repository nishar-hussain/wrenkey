"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, UserPlus, LogIn, User, ChevronRight, KeyRound, Mail, Phone, Fingerprint, Wallet, Lock, Smartphone } from "lucide-react";

type Step = "accounts" | "method-select" | "email-signup" | "email-signin" | "phone-signin" | "otp-verify" | "password-signup" | "password-signin" | "password-reset";
type AuthMethod = "email" | "phone" | "passkey" | "social" | "password" | "wallet";

interface StoredAccount { email: string; orgName: string; lastUsed: number; }
interface AuthConfig {
  googleClientId: string; sessionExpiry: number; otpEnabled: boolean; otpLength: number; otpType: string;
  otpEmail: boolean; otpSms: boolean; passkeyAuth: boolean; walletAuth: boolean; socialOAuth: boolean;
  googleLogin: boolean; appleLogin: boolean; xLogin: boolean; discordLogin: boolean;
  redirectUrl: string; appName: string; appLogo: string; requireTokenLookup: boolean;
}

const OAUTH_PROVIDERS = [
  { key: "google", label: "Google", icon: "G", color: "bg-red-500 hover:bg-red-600", authUrl: "https://accounts.google.com/o/oauth2/v2/auth" },
  { key: "apple", label: "Apple", icon: "", color: "bg-black hover:bg-gray-800", authUrl: "https://appleid.apple.com/auth/authorize", svg: true },
  { key: "discord", label: "Discord", icon: "D", color: "bg-indigo-500 hover:bg-indigo-600", authUrl: "https://discord.com/api/oauth2/authorize" },
  { key: "github", label: "GitHub", icon: "GH", color: "bg-gray-800 hover:bg-gray-900", authUrl: "https://github.com/login/oauth/authorize" },
  { key: "x", label: "X", icon: "X", color: "bg-gray-900 hover:bg-black", authUrl: "https://twitter.com/i/oauth2/authorize" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("method-select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [config, setConfig] = useState<AuthConfig | null>(null);

  // Shared form fields
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [currentMethod, setCurrentMethod] = useState<AuthMethod>("email");
  const [existingUserFlow, setExistingUserFlow] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);

  // Passkey state
  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [passkeyMode, setPasskeyMode] = useState<"register" | "authenticate">("authenticate");

  // Wallet state
  const [walletAddress, setWalletAddress] = useState("");

  // Init
  useEffect(() => {
    loadAccounts();
    fetchConfig();
  }, []);

  const loadAccounts = () => {
    try {
      const legacyRaw = localStorage.getItem("wrankey_remembered_user");
      if (legacyRaw) {
        const legacy = JSON.parse(legacyRaw);
        if (legacy?.email) {
          const accountsStr = localStorage.getItem("wrankey_accounts");
          const existing: StoredAccount[] = accountsStr ? JSON.parse(accountsStr) : [];
          if (!existing.find(a => a.email === legacy.email)) {
            existing.push({ email: legacy.email, orgName: legacy.orgName || "", lastUsed: Date.now() });
          }
          existing.sort((a, b) => b.lastUsed - a.lastUsed);
          localStorage.setItem("wrankey_accounts", JSON.stringify(existing));
        }
        localStorage.removeItem("wrankey_remembered_user");
      }
      const raw = localStorage.getItem("wrankey_accounts");
      if (raw) {
        const parsed: StoredAccount[] = JSON.parse(raw);
        if (parsed?.length > 0) { setAccounts(parsed); setStep("accounts"); }
      }
    } catch { /* ignore */ }
  };

  const fetchConfig = async () => {
    try {
      const res: any = await apiFetch("/auth/config");
      setConfig(res.data || res);
    } catch { }
  };

  // ─── Helpers ──────────────────────────────────────────────────────

  const doLogin = (res: any, orgNameAlreadySet?: boolean) => {
    login(res.sessionToken, { id: res.user.id, email: res.user.email || res.user.phone, role: res.user.role }, { id: res.org?.id || "", name: res.org?.name || "" });
    router.push(res.isNewUser && !orgNameAlreadySet ? "/onboarding" : "/");
  };

  const sendOtp = async (contact: string, isEmail: boolean) => {
    if (!contact || loading) return;
    setLoading(true); setError("");
    try {
      const sendRes: any = await apiFetch(`/auth/${isEmail ? "email" : "phone"}/send`, { method: "POST", body: JSON.stringify(isEmail ? { email: contact } : { phone: contact }) });
      if (sendRes.data?.emailSent === false || sendRes.emailSent === false) {
        setError(sendRes.data?.message || sendRes.message || "Failed to send email. Check SMTP configuration.");
        return;
      }
      setStep("otp-verify");
    } catch (err: any) { setError(err.message || "Failed"); } finally { setLoading(false); }
  };

  const verifyOtpAndLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      const contact = currentMethod === "phone" ? phone : email;
      const isEmail = currentMethod !== "phone";
      const body: any = { email: isEmail ? contact : undefined, phone: !isEmail ? contact : undefined, otp };
      if (!existingUserFlow && fullName) body.name = fullName;
      if (!existingUserFlow && orgName) body.orgName = orgName;
      const res: any = await apiFetch(`/auth/${isEmail ? "email" : "phone"}/verify`, { method: "POST", body: JSON.stringify(body) });
      doLogin(res, !!existingUserFlow);
    } catch (err: any) { setError(err.message || "Invalid OTP"); } finally { setLoading(false); }
  };

  // ─── Account actions ──────────────────────────────────────────────

  const handleAccountClick = async (account: StoredAccount) => {
    setEmail(account.email); setCurrentMethod("email"); setExistingUserFlow(true);
    await sendOtp(account.email, true);
  };

  const handleRemoveAccount = (emailToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = accounts.filter(a => a.email !== emailToRemove);
    setAccounts(updated);
    localStorage.setItem("wrankey_accounts", JSON.stringify(updated));
    if (updated.length === 0) setStep("method-select");
  };

  // ─── Password ─────────────────────────────────────────────────────

  const handlePasswordSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/password/signup", { method: "POST", body: JSON.stringify({ email, password, name: fullName }) });
      doLogin(res);
    } catch (err: any) { setError(err.message || "Failed"); } finally { setLoading(false); }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/password/login", { method: "POST", body: JSON.stringify({ email, password }) });
      doLogin(res);
    } catch (err: any) { setError(err.message || "Invalid credentials"); } finally { setLoading(false); }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || loading) return;
    setLoading(true); setError("");
    try {
      await apiFetch("/auth/password/reset", { method: "POST", body: JSON.stringify({ email }) });
      setError("Reset link sent to your email");
    } catch (err: any) { setError(err.message || "Failed"); } finally { setLoading(false); }
  };

  // ─── Passkey ──────────────────────────────────────────────────────

  const handlePasskeyRegister = async () => {
    if (!passkeyEmail || loading) return;
    setLoading(true); setError("");
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const res: any = await apiFetch("/auth/webauthn/register", { method: "POST", body: JSON.stringify({ email: passkeyEmail }) });
      const attResp = await startRegistration({ optionsJSON: res.data?.options || res.options });
      const verifyRes: any = await apiFetch("/auth/webauthn/register/verify", {
        method: "POST", body: JSON.stringify({ userId: res.data?.userId || res.userId, credential: attResp }),
      });
      doLogin(verifyRes);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.message?.includes("cancel")) setError("Passkey registration cancelled");
      else setError(err.message || "Passkey registration failed");
    } finally { setLoading(false); }
  };

  const handlePasskeyAuthenticate = async () => {
    if (!passkeyEmail || loading) return;
    setLoading(true); setError("");
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const res: any = await apiFetch("/auth/webauthn/authenticate", { method: "POST", body: JSON.stringify({ email: passkeyEmail }) });
      const authResp = await startAuthentication({ optionsJSON: res.data?.options || res.options });
      const verifyRes: any = await apiFetch("/auth/webauthn/authenticate/verify", {
        method: "POST", body: JSON.stringify({ userId: res.data?.userId || res.userId, credential: authResp }),
      });
      doLogin(verifyRes);
    } catch (err: any) {
      if (err.name === "NotAllowedError" || err.message?.includes("cancel")) setError("Passkey authentication cancelled");
      else setError(err.message || "Passkey authentication failed");
    } finally { setLoading(false); }
  };

  // ─── Wallet ───────────────────────────────────────────────────────

  const handleWalletLogin = async () => {
    if (loading) return;
    setLoading(true); setError("");
    try {
      if (!(window as any).ethereum) { setError("No wallet detected. Please install MetaMask or another wallet."); setLoading(false); return; }
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts[0];
      setWalletAddress(address);
      const message = "Sign in to WranKey";
      const signature = await (window as any).ethereum.request({ method: "personal_sign", params: [message, address] });
      const res: any = await apiFetch("/auth/wallet", { method: "POST", body: JSON.stringify({ address, signature, message }) });
      doLogin(res);
    } catch (err: any) {
      if (err.code === 4001) setError("Wallet connection rejected");
      else setError(err.message || "Wallet login failed");
    } finally { setLoading(false); }
  };

  // ─── Social OAuth ─────────────────────────────────────────────────

  const getEnabledSocialProviders = () => {
    if (!config) return [];
    const providers: Array<{ key: string; label: string; icon: string; color: string; enabled: boolean; hasCredentials: boolean }> = [];
    
    for (const p of OAUTH_PROVIDERS) {
      let enabled = false;
      let hasCredentials = false;
      
      if (p.key === "google") {
        enabled = config.googleLogin === true;
        hasCredentials = !!(config.googleClientId);
      } else if (p.key === "apple") {
        enabled = config.appleLogin === true;
        hasCredentials = true;
      } else if (p.key === "x") {
        enabled = config.xLogin === true;
        hasCredentials = true;
      } else if (p.key === "discord") {
        enabled = config.discordLogin === true;
        hasCredentials = true;
      } else if (p.key === "github") {
        enabled = config.socialOAuth === true;
        hasCredentials = true;
      }
      
      if (enabled) {
        providers.push({ ...p, enabled, hasCredentials });
      }
    }
    return providers;
  };

  const handleSocialLogin = (provider: string) => {
    const clientIdMap: Record<string, string> = {
      google: config?.googleClientId || "",
    };
    const scopeMap: Record<string, string> = {
      google: "openid email profile", apple: "name email", discord: "identify email",
      github: "user:email", x: "users.read tweet.read",
    };
    const redirectUri = config?.redirectUrl || `${window.location.origin}/oauth-callback`;
    const clientId = clientIdMap[provider] || "";
    const scope = scopeMap[provider] || "email";

    // For external apps, pass configId in the state parameter
    const stateParam = `provider:${provider}`;

    if (provider === "x" || provider === "twitter") {
      window.location.href = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope.replace(/ /g, "%20")}&state=${stateParam}&code_challenge=challenge&code_challenge_method=plain`;
    } else if (provider === "apple") {
      window.location.href = `https://appleid.apple.com/auth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${stateParam}`;
    } else {
      window.location.href = `${OAUTH_PROVIDERS.find(p => p.key === provider)?.authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${stateParam}`;
    }
  };

  // ─── Header Icon ──────────────────────────────────────────────────

  const HeaderIcon = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <div className="flex flex-col items-center gap-2 mb-4">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 text-primary">
        <Icon className="w-6 h-6 stroke-[1.5]" />
      </div>
      <h2 className="text-xl font-semibold text-foreground tracking-tight">{label}</h2>
    </div>
  );

  // ─── Method Tile ──────────────────────────────────────────────────

  const MethodTile = ({ method, icon: Icon, label, desc }: { method: string; icon: any; label: string; desc: string }) => (
    <button onClick={() => { setCurrentMethod(method as AuthMethod); setError("");
      if (method === "email") setStep("email-signin");
      else if (method === "phone") setStep("phone-signin");
      else if (method === "password") setStep("password-signin");
      else if (method === "passkey") setStep("method-select"); // stays, handled inline
      else if (method === "social") setStep("method-select"); // stays, handled inline
      else if (method === "wallet") { /* inline */ }
    }} className="border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-accent/30 transition-all text-left flex items-center gap-4 group">
      <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center group-hover:border-primary/30 transition-colors">
        <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
  );

  // ─── Social Buttons ───────────────────────────────────────────────

  const SocialButtons = () => {
    const providers = getEnabledSocialProviders();
    if (providers.length === 0) {
      return <p className="text-xs text-slate-400 text-center py-4">No social login providers available. Ask your admin to enable them in Configuration → Auth.</p>;
    }
    return (
      <div className="space-y-2">
        {providers.map(p => (
          <button key={p.key} onClick={() => handleSocialLogin(p.key)} disabled={loading}
            className="w-full h-11 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: p.key === "google" ? "#4285f4" : p.key === "apple" ? "#000" : p.key === "discord" ? "#5865F2" : p.key === "github" ? "#24292e" : "#000" }}>
            {p.key === "apple" ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            ) : (
              <span className="font-bold text-base">{p.icon}</span>
            )}Continue with {p.label}
          </button>
        ))}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-[440px] border border-border shadow-xl rounded-2xl bg-card overflow-hidden p-8">
        <CardContent className="p-0">
          {error && (
            <div className={`mb-6 p-3 rounded-lg text-xs font-medium ${error.includes("sent") || error.includes("Reset link") ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-destructive/10 border border-destructive/20 text-destructive"}`}>
              {error}
            </div>
          )}

          {/* ── Accounts List ─────────────────── */}
          {step === "accounts" && (
            <div className="space-y-5">
              <HeaderIcon icon={LogIn} label="Welcome Back" /><p className="text-sm text-muted-foreground text-center -mt-2">Choose an account to sign in</p>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div key={account.email} className="border border-border rounded-xl overflow-hidden bg-card">
                    <div onClick={() => handleAccountClick(account)} className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center group-hover:border-primary/40 transition-colors"><User className="w-5 h-5 text-muted-foreground" /></div>
                        <div className="text-left min-w-0"><p className="text-sm font-semibold text-foreground leading-tight truncate">{account.email}</p><p className="text-xs text-muted-foreground mt-0.5">{account.orgName}</p></div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <button type="button" onClick={(e) => handleRemoveAccount(account.email, e)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors ml-1" title="Remove"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setStep("method-select")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">Sign in another way</button>
            </div>
          )}

          {/* ── Method Select ─────────────────── */}
          {step === "method-select" && (
            <div className="space-y-5">
              <HeaderIcon icon={LogIn} label="Sign In" /><p className="text-sm text-muted-foreground text-center -mt-2">Choose a method to continue</p>
              <div className="space-y-2">
                <MethodTile method="email" icon={Mail} label="Email" desc="Passwordless login via one-time code" />
                <MethodTile method="phone" icon={Smartphone} label="Phone" desc="SMS one-time password" />
                {config?.passkeyAuth !== false && <MethodTile method="passkey" icon={Fingerprint} label="Passkey" desc="Biometric or security key login" />}
                <MethodTile method="password" icon={Lock} label="Password" desc="Email and password" />
                {config?.socialOAuth !== false && getEnabledSocialProviders().length > 0 && <MethodTile method="social" icon={User} label="Social Login" desc="Google, Apple, Discord, more" />}
                {config?.walletAuth !== false && <MethodTile method="wallet" icon={Wallet} label="Crypto Wallet" desc="Sign-In With Ethereum" />}
              </div>
              {accounts.length > 0 && (
                <button type="button" onClick={() => setStep("accounts")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back to accounts</button>
              )}
            </div>
          )}

          {/* ── Email Sign In ─────────────────── */}
          {step === "email-signin" && (
            <form onSubmit={(e) => { e.preventDefault(); setCurrentMethod("email"); if (email) { sendOtp(email, true); } }} className="space-y-4">
              <HeaderIcon icon={Mail} label="Sign In with Email" />
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 px-4 rounded-lg" autoFocus />
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Sending..." : "Send OTP"}</Button>
              <button type="button" onClick={() => setStep("method-select")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back</button>
            </form>
          )}

          {/* ── Email Sign Up ─────────────────── */}
          {step === "email-signup" && (
            <form onSubmit={(e) => { e.preventDefault(); setCurrentMethod("email"); setExistingUserFlow(false); if (email) sendOtp(email, true); }} className="space-y-4">
              <HeaderIcon icon={UserPlus} label="Create Account" />
              <Input type="text" placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11 px-4 rounded-lg" />
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 px-4 rounded-lg" />
              <Input type="text" placeholder="Organization name" value={orgName} onChange={e => setOrgName(e.target.value)} required className="h-11 px-4 rounded-lg" />
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Sending..." : "Create Account"}</Button>
              <button type="button" onClick={() => setStep("method-select")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back</button>
            </form>
          )}

          {/* ── Phone Sign In ─────────────────── */}
          {step === "phone-signin" && (
            <form onSubmit={(e) => { e.preventDefault(); setCurrentMethod("phone"); setExistingUserFlow(true); if (phone) sendOtp(phone, false); }} className="space-y-4">
              <HeaderIcon icon={Smartphone} label="Sign In with Phone" />
              <Input type="tel" placeholder="+1234567890" value={phone} onChange={e => setPhone(e.target.value)} required className="h-11 px-4 rounded-lg" autoFocus />
              <p className="text-[11px] text-muted-foreground">Enter your phone number with country code</p>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Sending..." : "Send SMS Code"}</Button>
              <button type="button" onClick={() => setStep("method-select")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back</button>
            </form>
          )}

          {/* ── OTP Verify ────────────────────── */}
          {step === "otp-verify" && (
            <form onSubmit={verifyOtpAndLogin} className="space-y-6">
              <HeaderIcon icon={KeyRound} label="Verify Your Code" />
              <p className="text-sm text-muted-foreground text-center -mt-2">Code sent to <strong className="text-foreground">{currentMethod === "phone" ? phone : email}</strong></p>
              <Input value={otp} onChange={e => setOtp(e.target.value)} placeholder="123456" required maxLength={config?.otpLength || 6} autoFocus className="h-11 text-center font-mono text-lg tracking-widest rounded-lg placeholder:font-sans placeholder:tracking-normal placeholder:text-sm" />
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Verifying..." : "Verify & Sign In"}</Button>
              <button type="button" onClick={() => { setOtp(""); setStep(currentMethod === "phone" ? "phone-signin" : "email-signin"); }} className="text-sm text-muted-foreground hover:text-foreground transition-colors text-center w-full">← Back</button>
            </form>
          )}

          {/* ── Passkey ───────────────────────── */}
          {step === "method-select" && currentMethod === "passkey" && (
            <div className="space-y-5">
              <HeaderIcon icon={Fingerprint} label="Passkey" />
              <p className="text-sm text-muted-foreground text-center -mt-2">Use biometrics or a security key</p>
              <div className="flex gap-2 mb-2">
                <button onClick={() => setPasskeyMode("authenticate")} className={`flex-1 py-2 text-xs font-medium rounded-lg border-2 transition-all ${passkeyMode === "authenticate" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500"}`}>Sign In</button>
                <button onClick={() => setPasskeyMode("register")} className={`flex-1 py-2 text-xs font-medium rounded-lg border-2 transition-all ${passkeyMode === "register" ? "border-primary bg-primary/5 text-primary" : "border-slate-200 text-slate-500"}`}>Register</button>
              </div>
              <Input type="email" placeholder="Email" value={passkeyEmail} onChange={e => setPasskeyEmail(e.target.value)} className="h-11 px-4 rounded-lg" />
              <Button onClick={passkeyMode === "register" ? handlePasskeyRegister : handlePasskeyAuthenticate} disabled={loading || !passkeyEmail} className="w-full h-11 rounded-lg text-sm">
                {loading ? "Please follow the prompt..." : passkeyMode === "register" ? "Register Passkey" : "Sign In with Passkey"}
              </Button>
              <button type="button" onClick={() => { setCurrentMethod("email"); setStep("method-select"); }} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back to methods</button>
            </div>
          )}

          {/* ── Password ──────────────────────── */}
          {step === "password-signin" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <HeaderIcon icon={Lock} label="Sign In with Password" />
              <div className="space-y-3">
                <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 px-4 rounded-lg" autoFocus />
                <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 px-4 rounded-lg" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Signing in..." : "Sign In"}</Button>
              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => { setStep("password-signup"); setError(""); }} className="text-muted-foreground hover:text-foreground underline">Create account</button>
                <button type="button" onClick={() => { setStep("password-reset"); setError(""); }} className="text-muted-foreground hover:text-foreground underline">Forgot password?</button>
              </div>
              <button type="button" onClick={() => setStep("method-select")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back to methods</button>
            </form>
          )}

          {step === "password-signup" && (
            <form onSubmit={handlePasswordSignup} className="space-y-4">
              <HeaderIcon icon={Lock} label="Create Password Account" />
              <div className="space-y-3">
                <Input type="text" placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} className="h-11 px-4 rounded-lg" />
                <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 px-4 rounded-lg" autoFocus />
                <Input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="h-11 px-4 rounded-lg" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Creating..." : "Create Account"}</Button>
              <button type="button" onClick={() => setStep("password-signin")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">Already have an account? Sign in</button>
            </form>
          )}

          {step === "password-reset" && (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <HeaderIcon icon={Lock} label="Reset Password" />
              <p className="text-sm text-muted-foreground text-center -mt-2">Enter your email to receive a reset link</p>
              <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11 px-4 rounded-lg" autoFocus />
              <Button type="submit" disabled={loading} className="w-full h-11 rounded-lg text-sm">{loading ? "Sending..." : "Send Reset Link"}</Button>
              <button type="button" onClick={() => setStep("password-signin")} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back</button>
            </form>
          )}

          {/* ── Social Login ──────────────────── */}
          {step === "method-select" && currentMethod === "social" && (
            <div className="space-y-5">
              <HeaderIcon icon={User} label="Social Login" /><p className="text-sm text-muted-foreground text-center -mt-2">Continue with your favorite platform</p>
              <SocialButtons />
              <button type="button" onClick={() => { setCurrentMethod("email"); setStep("method-select"); }} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back to methods</button>
            </div>
          )}

          {/* ── Wallet ────────────────────────── */}
          {step === "method-select" && currentMethod === "wallet" && (
            <div className="space-y-5">
              <HeaderIcon icon={Wallet} label="Connect Wallet" /><p className="text-sm text-muted-foreground text-center -mt-2">Sign-In With Ethereum</p>
              {walletAddress && <p className="text-xs text-emerald-600 text-center font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</p>}
              <Button onClick={handleWalletLogin} disabled={loading} className="w-full h-11 rounded-lg text-sm bg-gradient-to-r from-orange-400 to-pink-500 hover:from-orange-500 hover:to-pink-600 text-white">
                {(window as any)?.ethereum ? (loading ? "Connecting..." : "Connect MetaMask") : "No Wallet Detected"}
              </Button>
              <button type="button" onClick={() => { setCurrentMethod("email"); setStep("method-select"); }} className="text-sm text-muted-foreground hover:text-foreground underline transition-colors text-center w-full">← Back to methods</button>
            </div>
          )}

          {/* ── Branding Footer ───────────────── */}
          {step !== "otp-verify" && step !== "accounts" && (
            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-[10px] text-center text-muted-foreground">Secured by {config?.appName || "WranKey"}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
