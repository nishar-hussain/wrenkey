"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

type AuthTab = "email" | "password" | "wallet";

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
  const [devOtp, setDevOtp] = useState(""); // Shows OTP in dev mode

  // Password
  const [pwEmail, setPwEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [pwName, setPwName] = useState("");

  // Wallet
  const [walletAddress, setWalletAddress] = useState("");
  const [walletConnected, setWalletConnected] = useState(false);

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/email/send", { method: "POST", body: JSON.stringify({ email }) });
      setOtpSent(true);
      // Show OTP in dev mode (when backend returns it in response)
      if (res.otp) {
        setDevOtp(res.otp);
      }
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res: any = await apiFetch("/auth/email/verify", { method: "POST", body: JSON.stringify({ email, otp }) });
      login(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role }, { id: res.org.id, name: res.org.name });
      router.push("/");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const path = isSignup ? "/auth/password/signup" : "/auth/password/login";
      const body = isSignup ? { email: pwEmail, password, name: pwName } : { email: pwEmail, password };
      const res: any = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      login(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role }, { id: res.org.id, name: res.org.name });
      router.push("/");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

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
      login(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role }, { id: res.org.id, name: res.org.name });
      router.push("/");
    } catch (err: any) {
      if (err.code === 4001) setError("Signing rejected by user.");
      else setError(err.message || "Wallet login failed");
    }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-bold text-center">WranKey</h1>
          <p className="text-sm text-slate-500 text-center mt-1">Sign in to your account</p>
          <div className="flex border-b border-slate-200 mt-4">
            {(["email", "password", "wallet"] as AuthTab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); setError(""); setOtpSent(false); }}
                className={`flex-1 pb-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                {t === "email" ? "Email OTP" : t === "password" ? "Password" : "Wallet"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}

          {tab === "email" && !otpSent && (
            <form onSubmit={sendOtp} className="space-y-4">
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              <Button type="submit" loading={loading} className="w-full">Send Code</Button>
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
              <Input label="Verification Code" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required maxLength={6} />
              <Button type="submit" loading={loading} className="w-full">Verify & Sign In</Button>
              <button type="button" onClick={() => { setOtpSent(false); setDevOtp(""); }} className="text-sm text-brand-600 hover:underline w-full text-center">Back</button>
            </form>
          )}

          {tab === "password" && (
            <form onSubmit={handlePassword} className="space-y-4">
              {isSignup && <Input label="Name" value={pwName} onChange={(e) => setPwName(e.target.value)} placeholder="Your name" />}
              <Input label="Email" type="email" value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} placeholder="you@example.com" required />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required minLength={8} />
              <Button type="submit" loading={loading} className="w-full">{isSignup ? "Create Account" : "Sign In"}</Button>
              <button type="button" onClick={() => setIsSignup(!isSignup)} className="text-sm text-brand-600 hover:underline w-full text-center">
                {isSignup ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
              </button>
            </form>
          )}

          {tab === "wallet" && (
            <div className="space-y-4">
              {!walletConnected ? (
                <Button onClick={connectWallet} loading={loading} className="w-full">
                  Connect MetaMask
                </Button>
              ) : (
                <>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm">
                    <p className="font-medium text-green-700">Wallet Connected</p>
                    <p className="font-mono text-xs text-green-600 mt-1 break-all">{walletAddress}</p>
                  </div>
                  <Button onClick={handleWallet} loading={loading} className="w-full">
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
