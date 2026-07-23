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

  const [step, setStep] = useState<"exchanging" | "error" | "external">("exchanging");
  const [error, setError] = useState("");
  const [sessionResult, setSessionResult] = useState<any>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const provider = searchParams.get("provider") || extractProvider(searchParams.get("state"));
    const errorParam = searchParams.get("error");
    const configId = searchParams.get("configId");
    const isExternal = !!configId;

    if (errorParam) {
      setStep("error");
      setError(errorParam || "Authorization denied by provider");
      return;
    }

    if (!code) {
      setStep("error");
      setError("No authorization code received. Please try again.");
      return;
    }

    async function exchangeCode() {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (configId) {
          headers["X-Auth-Proxy-Config-Id"] = configId;
        }

        const res: any = await apiFetch("/auth/oauth", {
          method: "POST",
          body: JSON.stringify({
            provider: provider || "google",
            code,
            redirectUri: window.location.origin + "/oauth-callback",
          }),
        });

        if (isExternal) {
          // External app — return session via URL hash
          setStep("external");
          setSessionResult(res);
        } else {
          // WranKey dashboard — login directly
          login(
            res.sessionToken,
            { id: res.user.id, email: res.user.email, role: res.user.role },
            { id: res.org.id, name: res.org.name },
          );
          router.push("/");
        }
      } catch (err: any) {
        setStep("error");
        setError(err.message || "Failed to complete authentication. Please try again.");
      }
    }

    exchangeCode();
  }, [searchParams, router, login]);

  function extractProvider(state: string | null): string | null {
    if (!state) return null;
    const match = state.match(/provider:(\w+)/);
    return match ? match[1] : state;
  }

  function sendToExternalApp() {
    if (!sessionResult) return;
    const data = encodeURIComponent(JSON.stringify({
      sessionToken: sessionResult.sessionToken,
      user: sessionResult.user,
      org: sessionResult.org,
    }));
    // Post message to opener window, then redirect with hash
    if (window.opener) {
      window.opener.postMessage({ type: "wrankey-oauth-complete", ...sessionResult }, window.location.origin);
    }
    window.location.hash = `wrankey_session=${data}`;
  }

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

          {step === "external" && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 text-xl">
                  ✓
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Authentication Complete</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Signed in as <strong>{sessionResult?.user?.email}</strong>
                </p>
              </div>
              <Button onClick={sendToExternalApp} className="w-full h-11">
                Return to App
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Copy session token: <code className="bg-slate-100 px-1 rounded text-xs">{sessionResult?.sessionToken?.slice(0, 20)}...</code>
              </p>
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
