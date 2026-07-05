"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, Plus } from "lucide-react";

interface AppDetail {
  id: string;
  name: string;
  description: string;
  requiredApprovals: number;
  quorumKeyId: string | null;
  liveDeploymentId: string | null;
  createdAt: string;
  liveDeployment?: any;
  quorumKey?: any;
  deployments?: any[];
  operators?: any[];
  keyCeremonies?: any[];
}

export default function WvcAppDetailPage() {
  const router = useRouter();
  const params = useParams();
  const appId = params.id as string;
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "deployments" | "operators">("overview");

  // Deployment creation state
  const [showCreateDeploy, setShowCreateDeploy] = useState(false);
  const [deployForm, setDeployForm] = useState({
    imageUrl: "", executablePath: "/app/wvc-app", executableDigest: "",
    expectedPcr0: "", expectedPcr1: "", expectedPcr2: "",
    ingressPort: 3000, healthPort: 3000, cpuCount: 2, memoryMib: 1024, replicaCount: 3,
  });
  const [deployLoading, setDeployLoading] = useState(false);

  // Manifest view/approval state
  const [viewingManifest, setViewingManifest] = useState<any>(null);

  // Add operator state
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [operatorForm, setOperatorForm] = useState({ alias: "", publicKey: "" });
  const [operatorLoading, setOperatorLoading] = useState(false);

  const fetchApp = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/wvc/apps/${appId}`, { token });
      setApp(res);
    } catch (err: any) {
      addToast(err.message || "Failed to load app", "error");
    } finally { setLoading(false); }
  }, [token, appId]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchApp();
  }, [isAuthenticated, fetchApp, router]);

  if (!isAuthenticated) return null;

  const createDeployment = async () => {
    setDeployLoading(true);
    try {
      await apiFetch(`/wvc/apps/${appId}/deployments`, {
        method: "POST",
        body: JSON.stringify(deployForm),
        token: token!,
      });
      addToast("Deployment created — pending manifest approval", "success");
      setShowCreateDeploy(false);
      fetchApp();
    } catch (err: any) {
      addToast(err.message || "Failed to create deployment", "error");
    } finally { setDeployLoading(false); }
  };

  const viewManifest = async (manifestId: string) => {
    try {
      const res: any = await apiFetch(`/wvc/manifests/${manifestId}`, { token: token! });
      setViewingManifest(res);
    } catch (err: any) {
      addToast(err.message || "Failed to load manifest", "error");
    }
  };

  const provisionDeployment = async (deploymentId: string) => {
    try {
      await apiFetch(`/wvc/deployments/${deploymentId}/provision`, { method: "POST", token: token! });
      addToast("Deployment provisioned", "success");
      fetchApp();
    } catch (err: any) { addToast(err.message || "Failed to provision", "error"); }
  };

  const setDeploymentLive = async (deploymentId: string) => {
    try {
      await apiFetch(`/wvc/deployments/${deploymentId}/set-live`, { method: "POST", token: token! });
      addToast("Deployment is now live", "success");
      fetchApp();
    } catch (err: any) { addToast(err.message || "Failed to set live", "error"); }
  };

  const addOperator = async () => {
    if (!operatorForm.alias || !operatorForm.publicKey) { addToast("Alias and public key required", "error"); return; }
    setOperatorLoading(true);
    try {
      await apiFetch(`/wvc/apps/${appId}/operators`, {
        method: "POST",
        body: JSON.stringify(operatorForm),
        token: token!,
      });
      addToast("Operator added", "success");
      setShowAddOperator(false); setOperatorForm({ alias: "", publicKey: "" });
      fetchApp();
    } catch (err: any) { addToast(err.message || "Failed to add operator", "error"); }
    finally { setOperatorLoading(false); }
  };

  const revokeOperator = async (operatorId: string) => {
    try {
      await apiFetch(`/wvc/apps/${appId}/operators/${operatorId}`, { method: "DELETE", token: token! });
      addToast("Operator revoked", "success");
      fetchApp();
    } catch (err: any) { addToast(err.message || "Failed to revoke", "error"); }
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!app) return <p className="text-sm text-slate-500">App not found.</p>;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "deployments", label: `Deployments (${app.deployments?.length ?? 0})` },
    { key: "operators", label: `Operators (${app.operators?.length ?? 0})` },
  ] as const;

  return (
    <div>
      <button onClick={() => router.push("/verifiable-cloud")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to apps
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{app.name}</h1>
          <p className="text-sm text-slate-500">{app.description || "No description"}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Required Approvals</p>
            <p className="text-2xl font-bold mt-1">{app.requiredApprovals}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Live Deployment</p>
            <p className="text-sm font-mono mt-1">{app.liveDeploymentId ? app.liveDeploymentId.slice(0, 12) + "…" : "No live deployment"}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Quorum Key</p>
            <p className="text-sm mt-1">{app.quorumKey ? `Generation ${app.quorumKey.generation}` : "Not bootstrapped"}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Created</p>
            <p className="text-sm mt-1">{new Date(app.createdAt).toLocaleString()}</p>
          </CardContent></Card>
        </div>
      )}

      {tab === "deployments" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => setShowCreateDeploy(true)}><Plus className="h-4 w-4 mr-1" /> New Deployment</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table
              columns={[
                { key: "id", header: "ID", render: (d: any) => <span className="font-mono text-xs">{d.id.slice(0, 8)}…</span> },
                { key: "status", header: "Status", render: (d: any) => <StatusBadge status={d.status} /> },
                { key: "image", header: "Image", render: (d: any) => <span className="text-xs font-mono truncate max-w-[200px] block">{d.imageUrl}</span> },
                { key: "replicas", header: "Replicas", render: (d: any) => d.replicaCount },
                { key: "createdAt", header: "Created", render: (d: any) => new Date(d.createdAt).toLocaleDateString() },
                {
                  key: "actions", header: "",
                  render: (d: any) => (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => viewManifest(d.manifestId)}>Manifest</Button>
                      {d.status === "approved" && <Button size="sm" onClick={() => provisionDeployment(d.id)}>Provision</Button>}
                      {d.status === "inactive" && <Button size="sm" onClick={() => setDeploymentLive(d.id)}>Set Live</Button>}
                    </div>
                  ),
                },
              ]}
              data={app.deployments || []}
              loading={false}
              emptyMessage="No deployments yet."
            />
          </CardContent></Card>
        </div>
      )}

      {tab === "operators" && (
        <div>
          <div className="flex justify-end mb-3">
            <Button onClick={() => setShowAddOperator(true)}><Plus className="h-4 w-4 mr-1" /> Add Operator</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table
              columns={[
                { key: "alias", header: "Alias" },
                { key: "publicKey", header: "Public Key", render: (o: any) => <span className="font-mono text-xs truncate max-w-[300px] block">{o.publicKey.slice(0, 48)}…</span> },
                { key: "status", header: "Status", render: (o: any) => <StatusBadge status={o.status} /> },
                { key: "createdAt", header: "Added", render: (o: any) => new Date(o.createdAt).toLocaleDateString() },
                {
                  key: "actions", header: "",
                  render: (o: any) => o.status === "active" ? <Button size="sm" variant="destructive" onClick={() => revokeOperator(o.id)}>Revoke</Button> : null,
                },
              ]}
              data={app.operators || []}
              loading={false}
              emptyMessage="No operators added."
            />
          </CardContent></Card>
          <p className="text-xs text-slate-400 mt-2">Operators generate P256 keys locally via <code className="bg-slate-100 px-1 rounded">wvc operator init</code> and approve manifests via the CLI — private keys never touch the browser.</p>
        </div>
      )}

      {/* Create Deployment Modal */}
      <Modal open={showCreateDeploy} onClose={() => setShowCreateDeploy(false)} title="Create Deployment">
        <div className="space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <label className="text-sm font-medium">Image URL (with digest)</label>
            <Input value={deployForm.imageUrl} onChange={(e) => setDeployForm({ ...deployForm, imageUrl: e.target.value })} placeholder="ghcr.io/wrankey/signer:v1@sha256:…" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Executable Path</label>
            <Input value={deployForm.executablePath} onChange={(e) => setDeployForm({ ...deployForm, executablePath: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Executable Digest (SHA-256)</label>
            <Input value={deployForm.executableDigest} onChange={(e) => setDeployForm({ ...deployForm, executableDigest: e.target.value })} placeholder="sha256:…" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">PCR0</label>
              <Input value={deployForm.expectedPcr0} onChange={(e) => setDeployForm({ ...deployForm, expectedPcr0: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">PCR1</label>
              <Input value={deployForm.expectedPcr1} onChange={(e) => setDeployForm({ ...deployForm, expectedPcr1: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">PCR2</label>
              <Input value={deployForm.expectedPcr2} onChange={(e) => setDeployForm({ ...deployForm, expectedPcr2: e.target.value })} className="font-mono text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1"><label className="text-sm font-medium">Ingress</label><Input type="number" value={deployForm.ingressPort} onChange={(e) => setDeployForm({ ...deployForm, ingressPort: parseInt(e.target.value) || 3000 })} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Health</label><Input type="number" value={deployForm.healthPort} onChange={(e) => setDeployForm({ ...deployForm, healthPort: parseInt(e.target.value) || 3000 })} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">CPU</label><Input type="number" value={deployForm.cpuCount} onChange={(e) => setDeployForm({ ...deployForm, cpuCount: parseInt(e.target.value) || 2 })} /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Mem (MiB)</label><Input type="number" value={deployForm.memoryMib} onChange={(e) => setDeployForm({ ...deployForm, memoryMib: parseInt(e.target.value) || 1024 })} /></div>
          </div>
          <div className="space-y-1"><label className="text-sm font-medium">Replicas</label><Input type="number" value={deployForm.replicaCount} onChange={(e) => setDeployForm({ ...deployForm, replicaCount: parseInt(e.target.value) || 3 })} /></div>
          <Button onClick={createDeployment} disabled={deployLoading} className="w-full">{deployLoading ? "Creating…" : "Create Deployment"}</Button>
        </div>
      </Modal>

      {/* Manifest View Modal */}
      {viewingManifest && (
        <Modal open={!!viewingManifest} onClose={() => setViewingManifest(null)} title="Manifest">
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-slate-400">Approvals:</span> {viewingManifest.approvalsCount}/{viewingManifest.requiredApprovals}</div>
              <div><span className="text-slate-400">Status:</span> {viewingManifest.status}</div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Manifest Hash</p>
              <p className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded break-all">{viewingManifest.manifestHash}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Manifest JSON</p>
              <pre className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded max-h-64 overflow-y-auto">{JSON.stringify(viewingManifest.manifestJson, null, 2)}</pre>
            </div>
            <p className="text-xs text-slate-400">Approvals are signed via the CLI: <code className="bg-slate-100 px-1 rounded">wvc manifest approve {viewingManifest.id} --operator &lt;alias&gt;</code></p>
          </div>
        </Modal>
      )}

      {/* Add Operator Modal */}
      <Modal open={showAddOperator} onClose={() => setShowAddOperator(false)} title="Add Operator">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Alias</label>
            <Input value={operatorForm.alias} onChange={(e) => setOperatorForm({ ...operatorForm, alias: e.target.value })} placeholder="alice" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Public Key (PEM)</label>
            <textarea value={operatorForm.publicKey} onChange={(e) => setOperatorForm({ ...operatorForm, publicKey: e.target.value })}
              placeholder="-----BEGIN PUBLIC KEY-----&#10;…&#10;-----END PUBLIC KEY-----"
              className="w-full text-xs font-mono border rounded-md p-2 h-32 resize-none bg-background" />
          </div>
          <Button onClick={addOperator} disabled={operatorLoading} className="w-full">{operatorLoading ? "Adding…" : "Add Operator"}</Button>
        </div>
      </Modal>
    </div>
  );
}
