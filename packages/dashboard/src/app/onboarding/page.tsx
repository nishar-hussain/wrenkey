"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/Toast";
import { Building2, ArrowRight } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { isAuthenticated, ready, token, user, org, updateOrg } = useAuth();
  const { addToast } = useToast();
  const [orgName, setOrgName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && !isAuthenticated) {
      router.push("/login");
    }
  }, [ready, isAuthenticated, router]);

  // Auto-skip onboarding if the user's org already has a real name
  // (e.g. they provided it during signup — no need to ask again)
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    const autoGenPattern = /^.+'s Org$/;
    if (org?.name && !autoGenPattern.test(org.name)) {
      // Org already has a real custom name — skip onboarding
      router.replace("/");
    }
  }, [ready, isAuthenticated, org, router]);

  if (!ready || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed) {
      setError("Organization name is required");
      return;
    }
    if (trimmed.length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated: any = await apiFetch("/org", {
        method: "PATCH",
        token: token!,
        body: JSON.stringify({ name: trimmed }),
      });
      updateOrg({ id: updated.id, name: updated.name });
      addToast("Organization created successfully!", "success");
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to create organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mb-2">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to WranKey</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as <strong className="text-foreground">{user?.email || "—"}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Name your organization to get started
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Organization Name</label>
              <Input
                value={orgName}
                onChange={(e) => { setOrgName(e.target.value); setError(""); }}
                placeholder="e.g. Acme Corp"
                required
                autoFocus
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                This will be your workspace name. You can change it later in settings.
              </p>
            </div>
            <Button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2">
              {saving ? "Creating..." : "Create Organization"}
              {!saving && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
