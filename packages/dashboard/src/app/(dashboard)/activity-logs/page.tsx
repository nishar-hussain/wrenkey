"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Activity, X } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  resource?: string;
  details?: any;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  userId?: string;
}

const ACTION_GROUPS: Record<string, string[]> = {
  Auth: ["SIGNUP", "LOGIN", "LOGOUT"],
  Wallet: ["WALLET_CREATE", "WALLET_IMPORT", "WALLET_DELETE", "WALLET_FREEZE", "WALLET_UNFREEZE", "WALLET_EXPORT", "WALLET_ROTATE", "WALLET_SIGN_MESSAGE", "ACCOUNT_CREATE"],
  Transaction: ["TX_SIGN", "TX_BROADCAST", "TX_SIMULATE", "TX_RETRY", "TX_CANCEL", "TX_REPLACE"],
  Policy: ["POLICY_EVAL", "POLICY_DENY"],
  Agent: ["AGENT_CREATE", "AGENT_DELETE"],
  Org: ["ORG_CREATE", "ORG_UPDATE"],
  User: ["USER_CREATE", "USER_UPDATE", "USER_DELETE"],
  Approval: ["APPROVAL_REQUEST"],
};

function groupForAction(action: string): string {
  for (const [group, actions] of Object.entries(ACTION_GROUPS)) {
    if (actions.includes(action)) return group;
  }
  return "Other";
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export default function ActivityLogsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const allGroups = Object.keys(ACTION_GROUPS);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const res: any = await apiFetch(`/audit-logs?${params.toString()}`, { token });
      let data = res.data || [];
      if (selectedGroup && ACTION_GROUPS[selectedGroup]) {
        data = data.filter((log: AuditLog) => ACTION_GROUPS[selectedGroup].includes(log.action));
      }
      setLogs(data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load activity logs", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset, selectedGroup]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData, router, autoRefresh]);

  if (!isAuthenticated) return null;

  const groupColors: Record<string, string> = {
    Auth: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30",
    Wallet: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30",
    Transaction: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30",
    Policy: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/30",
    Agent: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/30",
    Org: "bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-900/30",
    User: "bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/30",
    Approval: "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900/30",
    Other: "bg-slate-50 text-slate-700 border-slate-100 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-900/30",
  };

  const columns = [
    {
      key: "action",
      header: "Event",
      render: (log: AuditLog) => {
        const group = groupForAction(log.action);
        return (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border ${groupColors[group] || groupColors.Other}`}>
            {log.action.replace(/_/g, " ")}
          </span>
        );
      },
    },
    {
      key: "details",
      header: "Details",
      render: (log: AuditLog) => {
        if (!log.details) return <span className="text-xs text-slate-400">—</span>;
        const entries = Object.entries(log.details).filter(([k]) => k !== "walletId" && k !== "orgId" && k !== "userId");
        if (entries.length === 0) return <span className="text-xs text-slate-400">—</span>;
        return (
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {entries.slice(0, 3).map(([k, v]) => (
              <span key={k} className="mr-2">
                <span className="font-medium">{k}:</span> {typeof v === "string" && v.length > 40 ? `${v.slice(0, 8)}...${v.slice(-6)}` : String(v)}
              </span>
            ))}
            {entries.length > 3 && <span className="text-slate-400">+{entries.length - 3} more</span>}
          </span>
        );
      },
    },
    {
      key: "ip",
      header: "IP",
      render: (log: AuditLog) => log.ip ? <span className="font-mono text-[11px] text-slate-500">{log.ip}</span> : <span className="text-xs text-slate-400">—</span>,
    },
    {
      key: "createdAt",
      header: "Time",
      render: (log: AuditLog) => (
        <span className="text-xs text-slate-500 font-mono whitespace-nowrap">{formatTime(log.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-sm text-slate-500">Real-time audit trail of all platform events</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={selectedGroup === "" ? "default" : "secondary"}
            onClick={() => { setSelectedGroup(""); setOffset(0); }}
          >
            All
          </Button>
          {allGroups.map((group) => (
            <Button
              key={group}
              size="sm"
              variant={selectedGroup === group ? "default" : "secondary"}
              onClick={() => { setSelectedGroup(selectedGroup === group ? "" : group); setOffset(0); }}
            >
              {group}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          variant={autoRefresh ? "default" : "secondary"}
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          <Activity className="w-3.5 h-3.5 mr-1.5" />
          {autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
        </Button>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table
                columns={columns}
                data={logs}
                loading={false}
                emptyMessage={selectedGroup ? `No ${selectedGroup} events recorded.` : "No activity recorded yet."}
              />
              <Pagination
                limit={limit}
                offset={offset}
                total={total}
                onPageChange={(l, o) => { setLimit(l); setOffset(o); }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
