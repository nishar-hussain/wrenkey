"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

type AuthTab = "email" | "phone" | "password" | "oauth" | "wallet";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [tab, setTab] = useState<AuthTab>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Email OTP
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState("");

  // Phone OTP
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [devPhoneOtp, setDevPhoneOtp] = useState("");

  // Password
  const [pwEmail, setPwEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [pwName, setPwName] = useState("");

  // OAuth
  const [oauthLoading, setOauthLoading] = useState(false);

  // Wallet
  const [walletAddress, setWalletAddress] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);

  const doLogin = (res: any) => {
    login(
      res.sessionToken,
      { id: res.user.id, email: res.user.email || res.user.phone, role: res.user.role },
      { id: res.org.id, name: res.org.name }
    );
    router.push("/");
  };

  // Email OTP
  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/email/send", { method: "POST", body: JSON.stringify({ email }) });
      setOtpSent(true);
      // Show dev OTP if email wasn't sent (dev mode or SMTP failure)
      if (res.devOtp) setDevOtp(res.devOtp);
      // Show warning if email wasn't actually delivered
      if (res.emailSent === false) {
        setError(res.message || "Email could not be sent. Check server logs.");
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/email/verify", { method: "POST", body: JSON.stringify({ email, otp }) });
      doLogin(res);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Phone OTP
  const sendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/phone/send", { method: "POST", body: JSON.stringify({ phone }) });
      setPhoneOtpSent(true);
      if (res.otp) setDevPhoneOtp(res.otp);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/phone/verify", { method: "POST", body: JSON.stringify({ phone, otp: phoneOtp }) });
      doLogin(res);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Password
  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const path = isSignup ? "/auth/password/signup" : "/auth/password/login";
      const body = isSignup ? { email: pwEmail, password, name: pwName } : { email: pwEmail, password };
      const res: any = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      doLogin(res);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  // OAuth - Google
  const handleGoogleOAuth = async () => {
    setOauthLoading(true); setError("");
    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!clientId) {
        setError("Google OAuth not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment.");
        setOauthLoading(false);
        return;
      }
      const redirectUri = `${window.location.origin}/login`;
      const scope = "email profile";
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
      window.location.href = authUrl;
    } catch {
      setError("Failed to initiate Google OAuth");
      setOauthLoading(false);
    }
  };

  // Handle OAuth callback (code in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setLoading(true); setError("");
      apiFetch("/auth/oauth", {
        method: "POST",
        body: JSON.stringify({ provider: "google", code, redirectUri: `${window.location.origin}/login` }),
      })
        .then((res: any) => {
          doLogin(res);
          window.history.replaceState({}, "", "/login");
        })
        .catch((err: any) => {
          setError(err.message || "OAuth login failed");
          setLoading(false);
          window.history.replaceState({}, "", "/login");
        });
    }
  }, []);

  // Wallet
  const connectWallet = async () => {
    setError("");
    try {
      if (!(window as any).ethereum) {
        setError("MetaMask not detected. Please install MetaMask extension.");
        return;
      }
      const accounts: string[] = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setWalletConnected(true);
      }
    } catch (err: any) {
      if (err.code === 4001) setError("Connection rejected by user.");
      else setError(err.message || "Failed to connect wallet");
    }
  };

  const handleWallet = async () => {
    setLoading(true); setError("");
    try {
      const message = `Sign in to WranKey\n\nTimestamp: ${Date.now()}`;
      const signature: string = await (window as any).ethereum.request({
        method: "personal_sign",
        params: [message, walletAddress],
      });
      const res: any = await apiFetch("/auth/wallet", {
        method: "POST",
        body: JSON.stringify({ address: walletAddress, signature, message }),
      });
      doLogin(res);
    } catch (err: any) {
      if (err.code === 4001) setError("Signing rejected by user.");
      else setError(err.message || "Wallet login failed");
    }
    finally { setLoading(false); }
  };

  const tabs: Array<{ key: AuthTab; label: string }> = [
    { key: "email", label: "Email OTP" },
    { key: "phone", label: "Phone OTP" },
    { key: "password", label: "Password" },
    { key: "oauth", label: "Google" },
    { key: "wallet", label: "Wallet" },
  ];

  const resetForm = (newTab: AuthTab) => {
    setTab(newTab);
    setError("");
    setOtpSent(false);
    setPhoneOtpSent(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo-icon.png" alt="WranKey" className="w-8 h-8 rounded-md" />
            <h1 className="text-2xl font-bold text-center">WranKey</h1>
          </div>
          <p className="text-sm text-slate-500 text-center">Sign in to your account</p>
          <div className="flex border-b border-slate-200 mt-4 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => resetForm(t.key)}
                className={`flex-1 pb-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap px-1 ${tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}

          {/* Email OTP */}
          {tab === "email" && !otpSent && (
            <form onSubmit={sendOtp} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <Button type="submit" disabled={loading} className="w-full">Send Code</Button>
            </form>
          )}
          {tab === "email" && otpSent && (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-slate-500">Code sent to <strong>{email}</strong></p>
              {devOtp && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
                  <p className="font-medium text-amber-700">Dev Mode - Your OTP:</p>
                  <p className="text-2xl font-mono font-bold text-amber-600 tracking-widest mt-1">{devOtp}</p>
                  <p className="text-xs text-amber-500 mt-1">SMTP not configured. Use this code to sign in.</p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Verification Code</label>
                <Input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required maxLength={6} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">Verify & Sign In</Button>
              <button type="button" onClick={() => { setOtpSent(false); setDevOtp(""); }} className="text-sm text-brand-600 hover:underline w-full text-center">Back</button>
            </form>
          )}

          {/* Phone OTP */}
          {tab === "phone" && !phoneOtpSent && (
            <form onSubmit={sendPhoneOtp} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Phone Number</label>
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890" required />
              </div>
              <Button type="submit" disabled={loading} className="w-full">Send Code</Button>
            </form>
          )}
          {tab === "phone" && phoneOtpSent && (
            <form onSubmit={verifyPhoneOtp} className="space-y-4">
              <p className="text-sm text-slate-500">Code sent to <strong>{phone}</strong></p>
              {devPhoneOtp && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
                  <p className="font-medium text-amber-700">Dev Mode - Your OTP:</p>
                  <p className="text-2xl font-mono font-bold text-amber-600 tracking-widest mt-1">{devPhoneOtp}</p>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Verification Code</label>
                <Input value={phoneOtp} onChange={(e) => setPhoneOtp(e.target.value)} placeholder="123456" required maxLength={6} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">Verify & Sign In</Button>
              <button type="button" onClick={() => { setPhoneOtpSent(false); setDevPhoneOtp(""); }} className="text-sm text-brand-600 hover:underline w-full text-center">Back</button>
            </form>
          )}

          {/* Password */}
          {tab === "password" && (
            <form onSubmit={handlePassword} className="space-y-4">
              {isSignup && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Name</label>
                  <Input value={pwName} onChange={(e) => setPwName(e.target.value)} placeholder="Your name" />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} />
              </div>
              <Button type="submit" disabled={loading} className="w-full">{isSignup ? "Create Account" : "Sign In"}</Button>
              <button type="button" onClick={() => setIsSignup(!isSignup)} className="text-sm text-brand-600 hover:underline w-full text-center">
                {isSignup ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
              </button>
              {!isSignup && (
                <button type="button" onClick={() => router.push("/reset-password")} className="text-sm text-slate-500 hover:text-slate-700 hover:underline w-full text-center block">
                  Forgot password?
                </button>
              )}
            </form>
          )}

          {/* OAuth - Google */}
          {tab === "oauth" && (
            <div className="space-y-4">
              <Button onClick={handleGoogleOAuth} disabled={oauthLoading} className="w-full flex items-center justify-center gap-2" variant="secondary">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {oauthLoading ? "Connecting..." : "Continue with Google"}
              </Button>
              <p className="text-xs text-slate-400 text-center">
                Requires GOOGLE_CLIENT_ID to be configured on the backend.
              </p>
            </div>
          )}

          {/* Wallet */}
          {tab === "wallet" && (
            <div className="space-y-4">
              {!walletConnected ? (
                <Button onClick={connectWallet} disabled={loading} className="w-full">
                  Connect MetaMask
                </Button>
              ) : (
                <>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm">
                    <p className="font-medium text-green-700">Wallet Connected</p>
                    <p className="font-mono text-xs text-green-600 mt-1 break-all">{walletAddress}</p>
                  </div>
                  <Button onClick={handleWallet} disabled={loading} className="w-full">
                    Sign In with Wallet
                  </Button>
                  <button type="button" onClick={() => { setWalletConnected(false); setWalletAddress(""); }}
                    className="text-sm text-brand-600 hover:underline w-full text-center">
                    Disconnect
                  </button>
                </>
              )}
            </div>
          )}

          <p className="text-xs text-slate-400 text-center mt-4">AI-Native Wallet & Agent Platform on Arc</p>
        </CardContent>
      </Card>
    </div>
  );
}