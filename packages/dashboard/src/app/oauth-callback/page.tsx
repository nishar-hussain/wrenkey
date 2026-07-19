"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-muted/30"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function OAuthCallbackContent() {
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

        router.push("/");
      } catch (err: any) {
        setStep("error");
        setError(err.message || "Failed to complete authentication. Please try again.");
      }
    }

    exchangeCode();
  }, [searchParams, router, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-[420px] shadow-xl rounded-2xl overflow-hidden p-8">
        <CardContent className="p-0">
          {step === "exchanging" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <Skeleton className="h-5 w-32" />
              <p className="text-sm text-muted-foreground text-center">Completing authentication...</p>
            </div>
          )}

          {step === "error" && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xl">
                  !
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Authentication Failed</h2>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </div>
              <Button onClick={() => router.push("/login")} className="w-full h-11">
                Go to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
