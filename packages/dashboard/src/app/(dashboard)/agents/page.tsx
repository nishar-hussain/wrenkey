"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";

interface Agent {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  user?: { email?: string };
}

export default function AgentsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [credentials, setCredentials] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/agents?limit=${limit}&offset=${offset}`, { token });
      setAgents(res.data);
      setTotal(res.total);
    } catch { setAgents([]); setTotal(0); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createAgent = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      const res: any = await apiFetch("/agents", {
        method: "POST",
        body: JSON.stringify({ name: newName, permissions: ["wallet:sign"] }),
        token: token!,
      });
      setCredentials(res.credentials);
      fetchData();
    } catch {} finally { setCreateLoading(false); }
  };

  const deleteAgent = async (id: string) => {
    await apiFetch(`/agents/${id}`, { method: "DELETE", token: token! });
    fetchData();
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    { key: "user", header: "Email", render: (a: Agent) => a.user?.email || "-" },
    { key: "status", header: "Status", render: (a: Agent) => <StatusBadge status={a.status} /> },
    { key: "createdAt", header: "Created", render: (a: Agent) => new Date(a.createdAt).toLocaleDateString() },
    {
      key: "actions", header: "",
      render: (a: Agent) => (
        <Button variant="destructive" size="sm" onClick={() => deleteAgent(a.id)}>Revoke</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Button onClick={() => setShowCreate(true)}>Create Agent</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table columns={columns} data={agents} loading={loading} emptyMessage="No agents created." />
          <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCredentials(null); }} title="Create Agent">
        {!credentials ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Agent Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Trading Bot" />
            </div>
            <Button onClick={createAgent} disabled={createLoading} className="w-full">Create</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm">
              <p className="font-medium text-green-700">Agent created!</p>
              <p className="text-green-600 mt-1">Save the API key - it won&apos;t be shown again.</p>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">User ID</label>
                <Input value={credentials.userId} readOnly />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">API Key</label>
                <Input value={credentials.apiKey} readOnly className="font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Key Prefix</label>
                <Input value={credentials.keyPrefix} readOnly />
              </div>
            </div>
            <Button onClick={() => { setShowCreate(false); setCredentials(null); setNewName(""); }} variant="secondary" className="w-full">Close</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
