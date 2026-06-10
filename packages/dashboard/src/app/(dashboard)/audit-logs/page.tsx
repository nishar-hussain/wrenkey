"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";

interface AuditLog {
  id: string;
  action: string;
  resource?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/audit-logs?limit=${limit}&offset=${offset}`, { token });
      setLogs(res.data);
      setTotal(res.total);
    } catch { setLogs([]); setTotal(0); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  if (!isAuthenticated) return null;

  const columns = [
    { key: "action", header: "Action", render: (log: AuditLog) => <span className="font-medium">{log.action}</span> },
    { key: "resource", header: "Resource", render: (log: AuditLog) => log.resource ? <span className="font-mono text-xs">{log.resource.slice(0, 16)}...</span> : "-" },
    { key: "ip", header: "IP", render: (log: AuditLog) => log.ip || "-" },
    { key: "createdAt", header: "Timestamp", render: (log: AuditLog) => new Date(log.createdAt).toLocaleString() },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Logs</h1>
      <Card>
        <CardContent className="p-0">
          <Table columns={columns} data={logs} loading={loading} emptyMessage="No audit logs yet." />
          <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
        </CardContent>
      </Card>
    </div>
  );
}
