"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Shield, Search, ChevronLeft, AlertTriangle } from "lucide-react";

interface QuorumMember {
  id: string;
  name?: string;
  email?: string;
  role: string;
  isRoot: boolean;
  isService: boolean;
  tags: string[];
}

export default function RootQuorumPage() {
  const router = useRouter();
  const { isAuthenticated, token, org, user } = useAuth();
  const { addToast } = useToast();
  const [members, setMembers] = useState<QuorumMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search) params.set("search", search);
      const res: any = await apiFetch(`/users?${params}`, { token });
      const data = res.data || [];

      const agentsRes: any = await apiFetch("/agents?limit=100", { token }).catch(() => ({ data: [] }));
      const agentUserIds = new Set((agentsRes.data || []).map((a: any) => a.userId));

      const mapped: QuorumMember[] = data.map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        isRoot: m.role === "ORG_ADMIN",
        isService: agentUserIds.has(m.id),
        tags: m.tags || [],
      }));

      setMembers(mapped);

      // Pre-select root users as quorum members
      const rootIds = new Set(mapped.filter((m) => m.isRoot).map((m) => m.id));
      setSelectedIds(rootIds);
    } catch {
      addToast("Failed to load members", "error");
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchMembers();
  }, [isAuthenticated, fetchMembers, router]);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const quorumCount = selectedIds.size;
  const threshold = quorumCount > 0 ? Math.ceil(quorumCount / 2) : 1;

  const saveQuorum = async () => {
    setSaving(true);
    try {
      await apiFetch("/org/config", {
        method: "POST",
        body: JSON.stringify({ rootQuorumIds: Array.from(selectedIds), approvalThreshold: threshold }),
        token: token!,
      });
      addToast("Root quorum updated", "success");
    } catch {
      addToast("Failed to save quorum configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/team" className="text-slate-500 hover:text-slate-700 transition-colors">Team</Link>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-medium text-slate-900">Root Quorum</span>
        </div>
        <span className="text-xs text-slate-400 flex items-center gap-1">
          <Shield className="w-3.5 h-3.5" /> Root user
        </span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Root Quorum</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure quorum members</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="pl-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const eligible = m.isRoot && !m.isService;
            return (
              <Card
                key={m.id}
                className={`border bg-white dark:bg-slate-900 transition-colors ${
                  eligible
                    ? "border-slate-100 dark:border-slate-800/80 cursor-pointer hover:border-brand-200"
                    : "border-slate-100 dark:border-slate-800/80 opacity-60"
                }`}
                onClick={() => eligible && toggleMember(m.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 ${
                          !eligible
                            ? "border-slate-200 bg-slate-50"
                            : selectedIds.has(m.id)
                            ? "border-brand-600 bg-brand-600"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {eligible && selectedIds.has(m.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {m.isService ? "Auth Proxy User" : m.name || m.email || "Root user"}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {m.isService
                            ? "Service User · Not eligible for root quorum"
                            : m.email || ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        m.isRoot
                          ? "text-brand-700 bg-brand-50 border-brand-100"
                          : "text-slate-600 bg-slate-100 border-slate-200"
                      }`}
                    >
                      {m.isRoot ? "Root" : "Basic"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-4">
          <p className="text-xs text-slate-500 mb-1">Approval Threshold</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">1/1</p>
        </CardContent>
      </Card>

      <Card className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Quorum health</p>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mt-0.5">
                Single point of failure
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                One compromised key gives full root access. Add root users to enable a quorum. Recommended minimum setup: 2/3.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-medium mt-2"
              >
                Visit documentation to learn more about root quorum configuration
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button onClick={saveQuorum} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
