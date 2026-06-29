"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [step, setStep] = useState<"exchanging" | "error">("exchanging");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const provider = searchParams.get("provider") || searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStep("error");
      setError(error || "Authorization denied by provider");
      return;
    }

    if (!code) {
      setStep("error");
      setError("No authorization code received. Please try again.");
      return;
    }

    async function exchangeCode() {
      try {
        const res: any = await apiFetch("/auth/oauth", {
          method: "POST",
          body: JSON.stringify({ provider: provider || "google", code, redirectUri: window.location.origin + "/oauth-callback" }),
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

        router.push("/");
      } catch (err: any) {
        setStep("error");
        setError(err.message || "Failed to complete authentication. Please try again.");
      }
    }

    exchangeCode();
  }, [searchParams, router, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <Card className="w-full max-w-[420px] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.03)] rounded-2xl bg-white overflow-hidden p-8">
        <CardContent className="p-0">
          {step === "exchanging" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              <Skeleton className="h-5 w-32" />
              <p className="text-sm text-slate-400 text-center">Completing authentication...</p>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50 border border-red-100 text-red-500 text-xl">
                  !
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Authentication Failed</h2>
                <p className="text-sm text-slate-500 mt-2">{error}</p>
              </div>
              <Button onClick={() => router.push("/login")} className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white">
                Go to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
