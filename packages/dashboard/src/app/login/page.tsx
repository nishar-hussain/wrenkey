"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/auth/email/send", { method: "POST", body: JSON.stringify({ email }) });
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res: any = await apiFetch("/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      login(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role }, { id: res.org.id, name: res.org.name });
      router.push("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-bold text-center">WranKey</h1>
          <p className="text-sm text-slate-500 text-center mt-1">Sign in to your account</p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>
          )}
          {step === "email" ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              <Button type="submit" loading={loading} className="w-full">Send Code</Button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-slate-500">Enter the code sent to <strong>{email}</strong></p>
              <Input label="Verification Code" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required maxLength={6} />
              <Button type="submit" loading={loading} className="w-full">Verify & Sign In</Button>
              <button type="button" onClick={() => setStep("email")} className="text-sm text-brand-600 hover:underline w-full text-center">Back</button>
            </form>
          )}
          <p className="text-xs text-slate-400 text-center mt-6">AI-Native Wallet & Agent Platform on Arc</p>
        </CardContent>
      </Card>
    </div>
  );
}
