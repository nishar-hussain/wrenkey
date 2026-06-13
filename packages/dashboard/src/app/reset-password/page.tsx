"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Check if we have a token in the URL (from email link)
  useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setToken(urlToken);
      setStep("confirm");
    }
  });

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(""); setSuccess("");
    try {
      const res: any = await apiFetch("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSuccess(res.message || "If an account exists, a reset link has been sent");
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true); setError(""); setSuccess("");
    try {
      await apiFetch("/auth/password/reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess("Password reset successfully!");
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo-icon.png" alt="WranKey" className="w-8 h-8 rounded-md" />
            <h1 className="text-2xl font-bold text-center">WranKey</h1>
          </div>
          <p className="text-sm text-slate-500 text-center">
            {step === "request" ? "Reset Your Password" : "Set New Password"}
          </p>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">{error}</div>}
          {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-600">{success}</div>}

          {step === "request" && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                Send Reset Link
              </Button>
              <button type="button" onClick={() => router.push("/login")} className="text-sm text-brand-600 hover:underline w-full text-center">
                Back to Login
              </button>
            </form>
          )}

          {step === "confirm" && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Reset Token</label>
                <Input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from email or URL"
                  required
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Confirm Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                Reset Password
              </Button>
              <button type="button" onClick={() => router.push("/login")} className="text-sm text-brand-600 hover:underline w-full text-center">
                Back to Login
              </button>
            </form>
          )}

          <p className="text-xs text-slate-400 text-center mt-4">AI-Native Wallet & Agent Platform on Arc</p>
        </CardContent>
      </Card>
    </div>
  );
}