"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { ArrowLeft, Activity, FileCheck, Server, ShieldCheck, Cpu, Copy } from "lucide-react";

interface Deployment {
  id: string;
  appId: string;
  status: string;
  imageUrl: string;
  executableDigest: string;
  expectedPcrs: { pcr0: string; pcr1: string; pcr2: string };
  ingressPort: number;
  healthPort: number;
  cpuCount: number;
  memoryMib: number;
  replicaCount: number;
  healthyReplicas: number;
  totalReplicas: number;
  isLive: boolean;
  proofCounts: { appProofs: number; bootProofs: number };
  bootProofs: { id: string; bootedAt: string; attestationDoc: string; proofFormatVersion: string }[];
  createdAt: string;
  updatedAt: string;
}

interface Manifest {
  id: string;
  manifestJson: Record<string, unknown>;
  manifestHash: string;
  requiredApprovals: number;
  approvalsCount: number;
  approvals: { operatorId: string; alias: string; approvedAt: string }[];
  status: string;
  deploymentId?: string;
}

export default function DeploymentDetailPage({ params }: { params: { id: string } }) {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [appProofs, setAppProofs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const dep = await apiFetch<Deployment>(`/wvc/deployments/${params.id}`, { token });
      setDeployment(dep);

      if (dep.bootProofs?.length > 0) {
        // Fetch app proofs
        const proofs = await apiFetch<{ data: any[] }>(`/wvc/deployments/${params.id}/app-proofs?limit=10`, { token });
        setAppProofs(proofs.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch deployment:", err);
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  if (!isAuthenticated || loading) return null;

  if (!deployment) {
    return (
      <div className="p-8">
        <button onClick={() => router.push("/verifiable-compute")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Verifiable Compute
        </button>
        <p className="text-slate-500">Deployment not found.</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending_manifest: "bg-yellow-100 text-yellow-800",
    approved: "bg-blue-100 text-blue-800",
    provisioning: "bg-purple-100 text-purple-800",
    inactive: "bg-gray-100 text-gray-800",
    live: "bg-green-100 text-green-800",
    marked_for_deletion: "bg-orange-100 text-orange-800",
    deleted: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <button onClick={() => router.push(`/verifiable-compute/apps/${deployment.appId}`)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back to App
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deployment</h1>
          <p className="text-sm text-slate-500 font-mono">{deployment.id}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[deployment.status] || "bg-gray-100"}`}>
          {deployment.status.replace(/_/g, " ")}
        </span>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={Server} label="Replicas" value={`${deployment.healthyReplicas}/${deployment.totalReplicas}`} />
        <StatCard icon={Activity} label="App Proofs" value={String(deployment.proofCounts.appProofs)} />
        <StatCard icon={ShieldCheck} label="Boot Proofs" value={String(deployment.proofCounts.bootProofs)} />
        <StatCard icon={FileCheck} label="Is Live" value={deployment.isLive ? "Yes" : "No"} />
      </div>

      {/* Manifest & Resources */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6 space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><FileCheck className="w-5 h-5" /> Manifest</h2>
          {manifest ? (
            <>
              <Field label="Hash" value={manifest.manifestHash} mono />
              <Field label="Approvals" value={`${manifest.approvalsCount}/${manifest.requiredApprovals}`} />
              {manifest.approvals.length > 0 && (
                <div className="space-y-1">
                  {manifest.approvals.map((a, i) => (
                    <div key={i} className="text-sm text-slate-600">
                      {a.alias} — {new Date(a.approvedAt).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="Image URL" value={deployment.imageUrl} mono />
              <Field label="Executable Digest" value={deployment.executableDigest} mono />
            </>
          )}
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Cpu className="w-5 h-5" /> Resources & Config</h2>
          <Field label="CPU" value={`${deployment.cpuCount} cores`} />
          <Field label="Memory" value={`${deployment.memoryMib} MiB`} />
          <Field label="Ingress Port" value={String(deployment.ingressPort)} />
          <Field label="Health Port" value={String(deployment.healthPort)} />
          <Field label="Created" value={new Date(deployment.createdAt).toLocaleString()} />
        </div>
      </div>

      {/* Expected PCRs */}
      <div className="bg-white rounded-lg border p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Expected PCRs</h2>
        <Field label="PCR0" value={deployment.expectedPcrs.pcr0} mono />
        <Field label="PCR1" value={deployment.expectedPcrs.pcr1} mono />
        <Field label="PCR2" value={deployment.expectedPcrs.pcr2} mono />
      </div>

      {/* Boot Proofs */}
      <div className="bg-white rounded-lg border p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Boot Proofs</h2>
        {deployment.bootProofs.length === 0 ? (
          <p className="text-sm text-slate-500">No boot proofs recorded.</p>
        ) : (
          <div className="space-y-3">
            {deployment.bootProofs.map((bp) => (
              <div key={bp.id} className="border rounded p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Replica #{bp.id.slice(0, 8)}</span>
                  <span className="text-xs text-slate-500">{bp.proofFormatVersion}</span>
                </div>
                <Field label="Booted At" value={new Date(bp.bootedAt).toLocaleString()} />
                <Field label="Attestation Doc" value={`${bp.attestationDoc.slice(0, 60)}...`} mono />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent App Proofs */}
      <div className="bg-white rounded-lg border p-6 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Activity className="w-5 h-5" /> Recent App Proofs</h2>
        {appProofs.length === 0 ? (
          <p className="text-sm text-slate-500">No app proofs recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-left text-slate-500">
              <tr>
                <th className="pb-2">ID</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Format</th>
                <th className="pb-2">Issued At</th>
              </tr>
            </thead>
            <tbody>
              {appProofs.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 font-mono text-xs">{p.id.slice(0, 12)}...</td>
                  <td className="py-2">{p.payloadType}</td>
                  <td className="py-2">{p.proofFormatVersion}</td>
                  <td className="py-2">{new Date(p.issuedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-slate-500 whitespace-nowrap">{label}</span>
      <span className={`text-sm text-slate-900 text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
