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
import { Shield, Search, ChevronLeft, AlertTriangle, CheckCircle, Info } from "lucide-react";

interface QuorumMember {
  id: string;
  name?: string;
  email?: string;
  role: string;
  tags: string[];
  isRoot: boolean;
  isService: boolean;
  isQuorumMember: boolean;
}

interface QuorumHealth {
  status: string;
  label: string;
  message: string;
  severity: string;
}

interface QuorumData {
  members: QuorumMember[];
  threshold: number;
  memberIds: string[];
  health: QuorumHealth;
}

export default function RootQuorumPage() {
  const router = useRouter();
  const { isAuthenticated, token, org, user } = useAuth();
  const { addToast } = useToast();
  const [quorumData, setQuorumData] = useState<QuorumData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [threshold, setThreshold] = useState(1);
  const [saving, setSaving] = useState(false);

  const fetchQuorum = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch("/quorum", { token });
      const data: QuorumData = res.data;
      setQuorumData(data);
      setSelectedIds(new Set(data.memberIds));
      setThreshold(data.threshold);
    } catch {
      addToast("Failed to load quorum configuration", "error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchQuorum();
  }, [isAuthenticated, fetchQuorum, router]);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const saveQuorum = async () => {
    setSaving(true);
    try {
      const res: any = await apiFetch("/quorum", {
        method: "PUT",
        body: JSON.stringify({ memberIds: Array.from(selectedIds), threshold }),
        token: token!,
      });
      setQuorumData((prev) => prev ? { ...prev, ...res.data, memberIds: res.data.memberIds, health: res.data.health } : prev);
      addToast("Root quorum updated", "success");
    } catch (err: any) {
      addToast(err?.message || "Failed to save quorum configuration", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) return null;

  const filteredMembers = quorumData?.members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.email?.toLowerCase().includes(q) ||
      m.name?.toLowerCase().includes(q) ||
      m.role?.toLowerCase().includes(q)
    );
  }) || [];

  const health = quorumData?.health;
  const severityIcon =
    health?.severity === "critical" || health?.severity === "warning"
      ? AlertTriangle
      : health?.severity === "success"
        ? CheckCircle
        : Info;

  const severityColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    critical: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200", text: "text-red-800 dark:text-red-200", icon: "text-red-600" },
    warning: { bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200", text: "text-amber-800 dark:text-amber-200", icon: "text-amber-600" },
    info: { bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-200", text: "text-blue-800 dark:text-blue-200", icon: "text-blue-600" },
    success: { bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200", text: "text-emerald-800 dark:text-emerald-200", icon: "text-emerald-600" },
  };

  const sc = severityColors[health?.severity || "warning"] || severityColors.warning;
  const SeverityIcon = severityIcon;
  const quorumCount = selectedIds.size;

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
          {filteredMembers.map((m) => {
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500 mb-1">Approval Threshold</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{threshold}/{quorumCount}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={threshold <= 1}
                onClick={() => setThreshold((t) => Math.max(1, t - 1))}
              >
                −
              </Button>
              <span className="text-sm font-medium w-4 text-center">{threshold}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={threshold >= quorumCount}
                onClick={() => setThreshold((t) => Math.min(quorumCount, t + 1))}
              >
                +
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={`border ${sc.border} ${sc.bg}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <SeverityIcon className={`w-5 h-5 ${sc.icon} shrink-0 mt-0.5`} />
            <div>
              <p className={`text-sm font-semibold ${sc.text}`}>Quorum health</p>
              <p className={`text-sm font-medium mt-0.5 ${sc.text}`}>
                {health?.label || "Single point of failure"}
              </p>
              <p className={`text-xs mt-1 ${sc.text} opacity-80`}>
                {health?.message || "One compromised key gives full root access. Add root users to enable a quorum. Recommended minimum setup: 2/3."}
              </p>
              <a
                href="#"
                className={`inline-flex items-center gap-1 text-xs font-medium mt-2 ${sc.text} hover:opacity-80`}
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
