"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { CheckCircle, Clock, Copy, ChevronRight, Search } from "lucide-react";

interface ActivityItem {
  id: string;
  type: string;
  action: string;
  initiator: string;
  initiatorEmail: string;
  approvals: number;
  denials: number;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export default function ActivityLogsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"pending" | "history">("history");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/activities?limit=${limit}&offset=${offset}`, { token });
      setActivities(res.data || []);
      setTotal(res.total || 0);
      setPendingCount(res.pendingCount || 0);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchData(); }, [isAuthenticated, fetchData, router]);

  if (!isAuthenticated) return null;

  const filteredActivities = search ? activities.filter(a => a.type.toLowerCase().includes(search.toLowerCase()) || a.initiatorEmail.toLowerCase().includes(search.toLowerCase()) || a.id.includes(search)) : activities;

  const columns = [
    { key: "type", header: "Type", render: (a: ActivityItem) => <span className="text-sm font-medium text-slate-700 capitalize">{a.type}</span> },
    { key: "id", header: "ID", render: (a: ActivityItem) => (
      <div className="flex items-center gap-1"><span className="font-mono text-[11px] text-slate-500">{a.id.slice(0, 4)}····{a.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(a.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div>
    )},
    { key: "initiator", header: "Initiator", render: (a: ActivityItem) => (
      <div><p className="text-sm font-medium">{a.initiator}</p><p className="text-[11px] text-slate-400">{a.initiatorEmail}</p></div>
    )},
    { key: "approvals", header: "Approvals", render: (a: ActivityItem) => <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle className="w-3.5 h-3.5" />{a.approvals}</span> },
    { key: "denials", header: "Denials", render: (a: ActivityItem) => <span className="text-sm text-slate-500">{a.denials}</span> },
    { key: "createdAt", header: "Created", render: (a: ActivityItem) => <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" })}</span> },
    { key: "updatedAt", header: "Updated", render: (a: ActivityItem) => <span className="text-xs text-slate-500 whitespace-nowrap">{new Date(a.updatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" })}</span> },
    { key: "action", header: "Your Action", render: () => <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Approved</span> },
    { key: "status", header: "Status", render: (a: ActivityItem) => (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${a.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${a.status === "Completed" ? "bg-emerald-500" : "bg-amber-500"}`} />{a.status}
      </span>
    )},
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Log</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "pending", label: "Pending", count: pendingCount },
          { key: "history", label: "History", count: undefined },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] flex items-center gap-1.5 ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
            {tab.count != null && tab.count > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === "pending" && (
        <Card className="border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="w-12 h-12 text-slate-300 mb-4" />
            <h2 className="text-lg font-semibold text-slate-600 mb-2">Pending Activities</h2>
            <p className="text-sm text-slate-500 mb-1">You&apos;re All Caught Up</p>
            <p className="text-xs text-slate-400 mb-4">View your previous activities in History.</p>
            <Button variant="secondary" size="sm" onClick={() => setActiveTab("history")}>View History <ChevronRight className="w-3.5 h-3.5 ml-1" /></Button>
          </CardContent>
        </Card>
      )}

      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 text-sm" />
          </div>
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
              ) : (
                <>
                  <Table columns={columns} data={filteredActivities} loading={false} emptyMessage="No activity recorded yet." />
                  <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => setOffset(o)} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
