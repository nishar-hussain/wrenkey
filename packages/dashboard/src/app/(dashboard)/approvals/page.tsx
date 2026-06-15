"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

interface ApprovalRequest {
  id: string;
  transactionId: string;
  requestedBy: string;
  approvedBy: string[];
  rejectedBy: string[];
  requiredApprovals: number;
  status: string;
  transaction?: { to: string; value: string; chain: string; riskScore?: number };
  createdAt: string;
}

export default function ApprovalsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/approval-requests?limit=${limit}&offset=${offset}`, { token });
      setRequests(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/approval-requests/${id}/approve`, { method: "POST", token: token! });
      addToast("Approved", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Approval failed", "error");
    } finally { setActionLoading(null); }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/approval-requests/${id}/reject`, { method: "POST", token: token! });
      addToast("Rejected", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Rejection failed", "error");
    } finally { setActionLoading(null); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "id", header: "ID", render: (r: ApprovalRequest) => <span className="font-mono text-xs">{r.id.slice(0, 8)}...</span> },
    {
      key: "tx", header: "Transaction",
      render: (r: ApprovalRequest) => (
        <div>
          {r.transaction ? (
            <>
              <span className="font-mono text-xs">{r.transaction.to.slice(0, 10)}...</span>
              <span className="text-xs text-slate-500 ml-2">{r.transaction.value} {r.transaction.chain}</span>
            </>
          ) : <span className="text-slate-400">-</span>}
        </div>
      ),
    },
    {
      key: "risk", header: "Risk",
      render: (r: ApprovalRequest) => r.transaction?.riskScore ? (
        <span className={r.transaction.riskScore > 70 ? "text-red-500 font-bold" : "text-slate-500"}>
          {r.transaction.riskScore}
        </span>
      ) : "-",
    },
    {
      key: "progress", header: "Progress",
      render: (r: ApprovalRequest) => <span>{r.approvedBy.length}/{r.requiredApprovals}</span>,
    },
    { key: "status", header: "Status", render: (r: ApprovalRequest) => <StatusBadge status={r.status} /> },
    { key: "createdAt", header: "Created", render: (r: ApprovalRequest) => new Date(r.createdAt).toLocaleDateString() },
    {
      key: "actions", header: "",
      render: (r: ApprovalRequest) =>
        r.status === "PENDING" ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleApprove(r.id)} disabled={actionLoading === r.id}>Approve</Button>
            <Button size="sm" variant="secondary" onClick={() => handleReject(r.id)} disabled={actionLoading === r.id}>Reject</Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Approval Requests</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={requests} loading={false} emptyMessage="No approval requests." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
