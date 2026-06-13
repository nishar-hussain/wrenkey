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
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  allowedIps: string[];
  expiresAt?: string;
  createdAt: string;
}

export default function ApiKeysPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", permissions: "*", allowedIps: "" });
  const [createLoading, setCreateLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ apiKey: string; keyPrefix: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/api-keys?limit=${limit}&offset=${offset}`, { token });
      setKeys(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load API keys", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createKey = async () => {
    if (!form.name.trim()) {
      addToast("Name is required", "error");
      return;
    }
    setCreateLoading(true);
    try {
      const permissions = form.permissions === "*" ? ["*"] : form.permissions.split(",").map((s: string) => s.trim()).filter(Boolean);
      const allowedIps = form.allowedIps ? form.allowedIps.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      const res: any = await apiFetch("/api-keys", {
        method: "POST", body: JSON.stringify({ name: form.name, permissions, allowedIps }), token: token!,
      });
      setCreatedKey({ apiKey: res.apiKey, keyPrefix: res.keyPrefix });
      addToast("API key created", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to create API key", "error");
    } finally { setCreateLoading(false); }
  };

  const deleteKey = async (id: string) => {
    try {
      await apiFetch(`/api-keys/${id}`, { method: "DELETE", token: token! });
      addToast("API key deleted", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete API key", "error");
    }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    { key: "keyPrefix", header: "Prefix", render: (k: ApiKey) => <span className="font-mono text-xs">{k.keyPrefix}...</span> },
    { key: "permissions", header: "Permissions", render: (k: ApiKey) => <span className="text-xs">{k.permissions.join(", ")}</span> },
    { key: "expiresAt", header: "Expires", render: (k: ApiKey) => k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Never" },
    { key: "createdAt", header: "Created", render: (k: ApiKey) => new Date(k.createdAt).toLocaleDateString() },
    {
      key: "actions", header: "",
      render: (k: ApiKey) => <Button variant="destructive" size="sm" onClick={() => deleteKey(k.id)}>Delete</Button>,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Button onClick={() => setShowCreate(true)}>Create Key</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={keys} loading={false} emptyMessage="No API keys." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreatedKey(null); }} title="Create API Key">
        {createdKey ? (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm">
              <p className="font-medium text-green-700">Key created! Save it now.</p>
              <p className="text-green-600 mt-1">This key will not be shown again.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">API Key</label>
              <Input value={createdKey.apiKey} readOnly className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Prefix</label>
              <Input value={createdKey.keyPrefix} readOnly />
            </div>
            <Button onClick={() => { setShowCreate(false); setCreatedKey(null); setForm({ name: "", permissions: "*", allowedIps: "" }); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Production key" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Permissions (comma-separated, or * for all)</label>
              <Input value={form.permissions} onChange={(e) => setForm({ ...form, permissions: e.target.value })} placeholder="wallet:sign, policy:read" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Allowed IPs (comma-separated, empty = any)</label>
              <Input value={form.allowedIps} onChange={(e) => setForm({ ...form, allowedIps: e.target.value })} placeholder="10.0.0.1, 10.0.0.2" />
            </div>
            <Button onClick={createKey} disabled={createLoading} className="w-full">Create</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}