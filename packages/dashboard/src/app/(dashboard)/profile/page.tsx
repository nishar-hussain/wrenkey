"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { User, Mail, Shield, Building2 } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, token, user, org } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    setLoading(false);
    setEditName(user?.email?.split("@")[0] || "");
  }, [isAuthenticated, router, user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/users/me", {
        method: "PATCH",
        token: token!,
        body: JSON.stringify({ name: editName }),
      });
      addToast("Profile updated", "success");
    } catch (err: any) {
      addToast(err.message || "Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) return null;
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">My Profile</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-xl font-bold">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user?.email || "—"}</h2>
              <p className="text-sm text-muted-foreground capitalize">{user?.role === "ORG_ADMIN" ? "Root User" : user?.role?.replace(/_/g, " ").toLowerCase()}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate">{user?.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Shield className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Role</p>
                <p className="text-sm font-medium capitalize">{user?.role === "ORG_ADMIN" ? "Root User" : user?.role?.replace(/_/g, " ").toLowerCase() || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="text-sm font-medium">{org?.name || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <User className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-sm font-mono text-xs truncate">{user?.id || "—"}</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <h3 className="text-sm font-semibold">Display Name</h3>
            <div className="flex gap-3">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Your display name"
                className="flex-1"
              />
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
