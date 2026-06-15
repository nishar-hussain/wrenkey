"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";

type Step = "choose" | "email-input" | "welcome-back" | "new-org" | "otp-verify";

interface LookupResult {
  exists: boolean;
  email?: string;
  org?: { id: string; name: string };
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [orgName, setOrgName] = useState("");

  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  const [googleClientId, setGoogleClientId] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    apiFetch("/auth/config")
      .then((res: any) => {
        if (res.googleClientId) setGoogleClientId(res.googleClientId);
      })
      .catch(() => {});
  }, []);

  const doLogin = (res: any) => {
    login(
      res.sessionToken,
      { id: res.user.id, email: res.user.email || res.user.phone, role: res.user.role },
      { id: res.org.id, name: res.org.name },
    );
    router.push(res.isNewUser ? "/onboarding" : "/");
  };

  const resetToChoose = () => {
    setStep("choose");
    setError("");
    setEmail("");
    setOtp("");
    setDevOtp("");
    setOrgName("");
    setLookupResult(null);
  };

  const resetToEmailInput = () => {
    setStep("email-input");
    setError("");
    setOtp("");
    setDevOtp("");
    setOrgName("");
    setLookupResult(null);
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/email/lookup", { method: "POST", body: JSON.stringify({ email }) });
      setLookupResult(res);
      if (res.exists) {
        setStep("welcome-back");
      } else {
        setStep("new-org");
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const sendOtp = async () => {
    setLoading(true); setError("");
    try {
      const body: any = { email };
      if (!lookupResult?.exists && orgName) body.orgName = orgName;
      const res: any = await apiFetch("/auth/email/send", { method: "POST", body: JSON.stringify(body) });
      setStep("otp-verify");
      if (res.devOtp) setDevOtp(res.devOtp);
      if (res.emailSent === false) {
        setError(res.message || "Email could not be sent.");
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const body: any = { email, otp };
      if (lookupResult?.exists) {
        body.orgId = lookupResult.org.id;
      } else if (orgName) {
        body.orgName = orgName;
      }
      const res: any = await apiFetch("/auth/email/verify", { method: "POST", body: JSON.stringify(body) });
      doLogin(res);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleGoogleOAuth = async () => {
    setOauthLoading(true); setError("");
    const clientId = googleClientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Google OAuth not configured.");
      setOauthLoading(false);
      return;
    }
    const redirectUri = `${window.location.origin}/login`;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("email profile")}`;
    window.location.href = authUrl;
  };

  const oauthRan = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && !oauthRan.current) {
      oauthRan.current = true;
      setStep("choose");
      setLoading(true);
      apiFetch("/auth/oauth", {
        method: "POST",
        body: JSON.stringify({ provider: "google", code, redirectUri: `${window.location.origin}/login` }),
      })
        .then((res: any) => doLogin(res))
        .catch((err: any) => {
          setError(err.message || "OAuth login failed");
          setLoading(false);
          window.history.replaceState({}, "", "/login");
        });
    }
  }, []);

  const isGoogleCallback = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code");

  if (isGoogleCallback) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
        <Card className="w-full max-w-md"><CardContent className="py-8 text-center">
          <p className="text-slate-500">Completing sign in...</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo-icon.png" alt="WranKey" className="w-8 h-8 rounded-md" />
            <h1 className="text-2xl font-bold">WranKey</h1>
          </div>
          {step === "choose" && <p className="text-sm text-slate-500">Sign in to your account</p>}
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}

          {/* ── Step 1: Choose method ───────────────── */}
          {step === "choose" && (
            <div className="space-y-3">
              <Button onClick={() => { setStep("email-input"); setError(""); }} className="w-full h-12 text-base" variant="default">
                Continue with Email
              </Button>
              <Button onClick={handleGoogleOAuth} disabled={oauthLoading} className="w-full h-12 text-base" variant="secondary">
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </Button>
            </div>
          )}

          {/* ── Step 2: Enter email ──────────────────── */}
          {step === "email-input" && (
            <form onSubmit={handleEmailContinue} className="space-y-4">
              <button type="button" onClick={resetToChoose} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
                ← Back
              </button>
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Checking..." : "Continue"}
              </Button>
            </form>
          )}

          {/* ── Step 3a: Welcome Back ────────────────── */}
          {step === "welcome-back" && lookupResult && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                <p className="text-lg font-bold text-blue-900">Welcome Back</p>
                <p className="text-sm text-blue-600 mt-1">{lookupResult.email}</p>
                <p className="text-sm font-semibold text-blue-800 mt-2">{lookupResult.org?.name}</p>
              </div>
              <Button onClick={sendOtp} disabled={loading} className="w-full">
                Continue to sign in
              </Button>
              <button type="button" onClick={resetToEmailInput} className="w-full text-sm text-slate-500 hover:text-red-500 flex items-center justify-center gap-1.5 transition-colors">
                <Trash2 className="w-4 h-4" />
                Or enter a different email
              </button>
            </div>
          )}

          {/* ── Step 3b: New user - org creation ─────── */}
          {step === "new-org" && (
            <div className="space-y-4">
              <button type="button" onClick={resetToEmailInput} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1">
                ← Back
              </button>
              <p className="text-sm text-slate-500">Create a new account</p>
              <p className="text-xs font-mono text-slate-400 bg-slate-50 p-2 rounded">{email}</p>
              <div className="space-y-1">
                <label className="text-sm font-medium">Organization Name</label>
                <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. My Company" required autoFocus />
              </div>
              <Button onClick={sendOtp} disabled={loading} className="w-full">Send Code</Button>
            </div>
          )}

          {/* ── Step 4: OTP verification ─────────────── */}
          {step === "otp-verify" && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-slate-500 text-center">Code sent to <strong>{email}</strong></p>
              {devOtp && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-center">
                  <p className="font-medium text-amber-700">Dev Mode</p>
                  <p className="text-2xl font-mono font-bold text-amber-600 tracking-widest mt-1">{devOtp}</p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Verification Code</label>
                <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required maxLength={6} autoFocus />
              </div>
              <Button type="submit" disabled={loading} className="w-full">Verify & Sign In</Button>
              <button type="button" onClick={() => { setStep(lookupResult?.exists ? "welcome-back" : "new-org"); setOtp(""); setDevOtp(""); }} className="text-sm text-brand-600 hover:underline w-full text-center">
                Back
              </button>
            </form>
          )}

          <p className="text-xs text-slate-400 text-center mt-6">AI-Native Wallet & Agent Platform on Arc</p>
        </CardContent>
      </Card>
    </div>
  );
}
