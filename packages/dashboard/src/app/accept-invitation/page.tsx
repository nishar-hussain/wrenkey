"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Mail, KeyRound, Building2, ShieldAlert } from "lucide-react";

export default function AcceptInvitationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { login } = useAuth();
  const { addToast } = useToast();

  const [step, setStep] = useState<"verifying" | "send-otp" | "verify-otp" | "error">("verifying");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [orgName, setOrgName] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");

  useEffect(() => {
    if (!token) {
      setStep("error");
      setError("No invitation token found in URL.");
      return;
    }

    async function verifyToken() {
      try {
        const res: any = await apiFetch(`/auth/invitation/${token}`);
        setEmail(res.email);
        setOrgName(res.orgName);
        setStep("send-otp");
      } catch (err: any) {
        setStep("error");
        setError(err.message || "Invalid or expired invitation link.");
      }
    }
    verifyToken();
  }, [token]);

  const sendOtp = async () => {
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await apiFetch("/auth/email/send", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setStep("verify-otp");
      if (res.devOtp) setDevOtp(res.devOtp);
      if (res.emailSent === false) {
        setError(res.message || "Failed to send email.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !otp || loading) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await apiFetch("/auth/invitation/accept", {
        method: "POST",
        body: JSON.stringify({ token, otp }),
      });
      login(
        res.sessionToken,
        { id: res.user.id, email: res.user.email, role: res.user.role },
        { id: res.org.id, name: res.org.name },
      );
      localStorage.setItem(
        "wrankey_remembered_user",
        JSON.stringify({ email: res.user.email, orgName: res.org.name }),
      );
      addToast("Invitation accepted!", "success");
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-[420px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] rounded-2xl bg-white overflow-hidden p-8">
        <CardContent className="p-0">
          {step === "verifying" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
              <p className="text-sm text-slate-400">Verifying invitation...</p>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50 border border-red-100 text-red-500">
                  <ShieldAlert className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Invalid Invitation</h2>
                <p className="text-sm text-slate-500 mt-2">{error}</p>
              </div>
              <Button onClick={() => router.push("/login")} className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white">
                Go to Login
              </Button>
            </div>
          )}

          {step === "send-otp" && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-violet-50 border border-violet-100 text-violet-500">
                  <Building2 className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">You're Invited</h2>
                <p className="text-sm text-slate-500 mt-2">
                  Join <strong className="text-slate-700">{orgName}</strong> on WranKey
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  as <strong className="text-slate-700">{email}</strong>
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-medium text-red-600">
                  {error}
                </div>
              )}

              <Button
                onClick={sendOtp}
                disabled={loading}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                <Mail className="w-4 h-4 mr-2" />
                {loading ? "Sending..." : "Accept Invitation"}
              </Button>

              <p className="text-[11px] text-center text-slate-400">
                You'll receive a verification code to complete your sign-in.
              </p>
            </div>
          )}

          {step === "verify-otp" && (
            <form onSubmit={acceptInvitation} className="space-y-6">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
                  <KeyRound className="w-6 h-6 stroke-[1.5]" />
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Verify Your Email</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Code sent to <strong className="text-slate-700 font-semibold">{email}</strong>
                </p>
              </div>

              {devOtp && (
                <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl text-center">
                  <p className="text-xs font-semibold text-amber-700 tracking-wider uppercase">Dev Mode Code</p>
                  <p className="text-2xl font-mono font-bold text-amber-600 tracking-widest mt-1">{devOtp}</p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-medium text-red-600">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  required
                  maxLength={6}
                  autoFocus
                  className="h-11 text-center font-mono text-lg tracking-widest border-slate-200 bg-slate-50/50 focus:bg-white rounded-lg focus-visible:ring-slate-400 transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
              >
                {loading ? "Verifying..." : "Verify & Accept"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setStep("send-otp"); setOtp(""); setDevOtp(""); setError(""); }}
                  className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ← Back
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
