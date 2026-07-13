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
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Cloud, Trash2 } from "lucide-react";

interface WvcApp {
  id: string;
  name: string;
  description: string;
  requiredApprovals: number;
  liveDeploymentId: string | null;
  quorumKeyId: string | null;
  createdAt: string;
  _count?: { deployments: number; operators: number };
}

export default function VerifiableCloudPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [apps, setApps] = useState<WvcApp[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newApprovals, setNewApprovals] = useState(2);
  const [createLoading, setCreateLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/wvc/apps?limit=${limit}&offset=${offset}`, { token });
      setApps(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      addToast(err.message || "Failed to load WVC apps", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createApp = async () => {
    if (!newName.trim()) { addToast("App name is required", "error"); return; }
    setCreateLoading(true);
    try {
      await apiFetch("/wvc/apps", {
        method: "POST",
        body: JSON.stringify({ name: newName, description: newDesc, requiredApprovals: newApprovals }),
        token: token!,
      });
      addToast("WVC app created", "success");
      setShowCreate(false); setNewName(""); setNewDesc(""); setNewApprovals(2);
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to create app", "error");
    } finally { setCreateLoading(false); }
  };

  const deleteApp = async (appId: string) => {
    if (!confirm("Delete this app and all its deployments, proofs, and operators? This cannot be undone.")) return;
    try {
      await apiFetch(`/wvc/apps/${appId}`, { method: "DELETE", token: token! });
      addToast("App deleted", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete app", "error");
    }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name", render: (a: WvcApp) => (
      <button className="text-left font-medium text-brand-600 hover:underline" onClick={() => router.push(`/verifiable-compute/apps/${a.id}`)}>{a.name}</button>
    ) },
    { key: "description", header: "Description", render: (a: WvcApp) => <span className="text-sm text-slate-500">{a.description || "—"}</span> },
    { key: "approvals", header: "Required Approvals", render: (a: WvcApp) => a.requiredApprovals },
    { key: "deployments", header: "Deployments", render: (a: WvcApp) => a._count?.deployments ?? 0 },
    { key: "operators", header: "Operators", render: (a: WvcApp) => a._count?.operators ?? 0 },
    { key: "live", header: "Live Deployment", render: (a: WvcApp) => a.liveDeploymentId ? <span className="font-mono text-xs text-green-600">{a.liveDeploymentId.slice(0, 8)}…</span> : <span className="text-slate-400">—</span> },
    { key: "createdAt", header: "Created", render: (a: WvcApp) => new Date(a.createdAt).toLocaleDateString() },
    { key: "actions", header: "", render: (a: WvcApp) => (
      <button onClick={() => deleteApp(a.id)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="Delete App">
        <Trash2 className="h-4 w-4" />
      </button>
    ) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Cloud className="h-6 w-6" /> Verifiable Compute</h1>
          <p className="text-sm text-slate-500 mt-1">Manage WVC apps, operator approvals, deployments, and proofs. Local dev proofs are clearly marked until AWS Nitro runtime is connected.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Create App</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Cloud className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 mb-1">No WVC apps yet.</p>
              <p className="text-xs text-slate-400 max-w-md mb-4">Create an app to manage WVC deployments, operator approvals, and proof-producing workloads.</p>
              <Button onClick={() => setShowCreate(true)}>Create your first app</Button>
            </div>
          ) : (
            <>
              <Table columns={columns} data={apps} loading={false} emptyMessage="No WVC apps found." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setNewName(""); setNewDesc(""); setNewApprovals(2); }} title="Create WVC App">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">App Name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="wallet-signer" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Production wallet signing enclave" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Required Operator Approvals</label>
            <Input type="number" min={1} max={10} value={newApprovals} onChange={(e) => setNewApprovals(parseInt(e.target.value) || 2)} />
            <p className="text-xs text-slate-400">Threshold of operators who must approve each deployment manifest.</p>
          </div>
          <Button onClick={createApp} disabled={createLoading} className="w-full">{createLoading ? "Creating…" : "Create App"}</Button>
        </div>
      </Modal>
    </div>
  );
}
