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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

interface Agent {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  user?: { email?: string };
}

const PERMISSION_OPTIONS = [
  { value: "*", label: "All Permissions" },
  { value: "wallet:read", label: "wallet:read" },
  { value: "wallet:create", label: "wallet:create" },
  { value: "wallet:write", label: "wallet:write" },
  { value: "wallet:sign", label: "wallet:sign" },
  { value: "transaction:read", label: "transaction:read" },
  { value: "policy:read", label: "policy:read" },
  { value: "policy:write", label: "policy:write" },
  { value: "agent:read", label: "agent:read" },
  { value: "agent:write", label: "agent:write" },
  { value: "webhook:read", label: "webhook:read" },
  { value: "webhook:write", label: "webhook:write" },
  { value: "user:read", label: "user:read" },
  { value: "user:write", label: "user:write" },
];

export default function AgentsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>(["wallet:sign"]);
  const [createLoading, setCreateLoading] = useState(false);
  const [credentials, setCredentials] = useState<any>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/agents?limit=${limit}&offset=${offset}`, { token });
      setAgents(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load agents", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createAgent = async () => {
    if (!newName.trim()) {
      addToast("Agent name is required", "error");
      return;
    }
    setCreateLoading(true);
    try {
      const res: any = await apiFetch("/agents", {
        method: "POST",
        body: JSON.stringify({ name: newName, permissions: newPermissions }),
        token: token!,
      });
      setCredentials(res.credentials);
      addToast("Agent created", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to create agent", "error");
    } finally { setCreateLoading(false); }
  };

  const deleteAgent = async (id: string) => {
    try {
      await apiFetch(`/agents/${id}`, { method: "DELETE", token: token! });
      addToast("Agent revoked", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to revoke agent", "error");
    }
  };

  const togglePermission = (perm: string) => {
    if (perm === "*") {
      setNewPermissions(["*"]);
      return;
    }
    setNewPermissions((prev) => {
      const withoutStar = prev.filter((p) => p !== "*");
      if (withoutStar.includes(perm)) {
        return withoutStar.filter((p) => p !== perm);
      }
      return [...withoutStar, perm];
    });
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
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={agents} loading={false} emptyMessage="No agents created." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCredentials(null); setNewPermissions(["wallet:sign"]); }} title="Create Agent">
        {!credentials ? (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1">
              <label className="text-sm font-medium">Agent Name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Trading Bot" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
              <div className="border rounded-md p-3 space-y-1 max-h-48 overflow-y-auto">
                {PERMISSION_OPTIONS.map((perm) => (
                  <label key={perm.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPermissions.includes(perm.value)}
                      onChange={() => togglePermission(perm.value)}
                      className="rounded border-slate-300"
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
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
            <Button onClick={() => { setShowCreate(false); setCredentials(null); setNewName(""); setNewPermissions(["wallet:sign"]); }} variant="secondary" className="w-full">Close</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}