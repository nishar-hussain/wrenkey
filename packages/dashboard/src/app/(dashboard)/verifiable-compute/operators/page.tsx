"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Key, Plus, Trash2, Copy } from "lucide-react";

interface Operator {
  id: string;
  alias: string;
  publicKey: string;
  status: string;
  createdAt: string;
  app: { id: string; name: string };
}

export default function OperatorsRosterPage() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedApp, setSelectedApp] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newPublicKey, setNewPublicKey] = useState("");

  const fetchApps = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ data: { id: string; name: string }[] }>("/wvc/apps?limit=100", { token });
      setApps(res.data || []);
    } catch (err) {
      console.error("Failed to fetch apps:", err);
    }
  }, [token]);

  const fetchOperators = useCallback(async () => {
    if (!token || apps.length === 0) return;
    try {
      const allOps: Operator[] = [];
      for (const app of apps) {
        const res = await apiFetch<{ data: any[] }>(`/wvc/apps/${app.id}/operators`, { token });
        const ops = (res.data || []).map((op: any) => ({ ...op, app: { id: app.id, name: app.name } }));
        allOps.push(...ops);
      }
      setOperators(allOps);
    } catch (err) {
      console.error("Failed to fetch operators:", err);
    } finally {
      setLoading(false);
    }
  }, [token, apps]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchApps();
  }, [isAuthenticated, router, fetchApps]);

  useEffect(() => {
    if (apps.length > 0) fetchOperators();
  }, [apps, fetchOperators]);

  const handleAdd = async () => {
    if (!token || !selectedApp || !newAlias || !newPublicKey) return;
    try {
      await apiFetch(`/wvc/apps/${selectedApp}/operators`, {
        method: "POST",
        body: JSON.stringify({ alias: newAlias, publicKey: newPublicKey }),
        token,
      });
      setNewAlias("");
      setNewPublicKey("");
      setShowAdd(false);
      fetchOperators();
    } catch (err) {
      console.error("Failed to add operator:", err);
    }
  };

  const handleRevoke = async (appId: string, operatorId: string) => {
    if (!token) return;
    if (!confirm("Revoke this operator?")) return;
    try {
      await apiFetch(`/wvc/apps/${appId}/operators/${operatorId}`, { method: "DELETE", token });
      fetchOperators();
    } catch (err) {
      console.error("Failed to revoke operator:", err);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operators Roster</h1>
          <p className="text-sm text-slate-500">All WVC operators across your organization</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
          <Plus className="w-4 h-4" /> Add Operator
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Add New Operator</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-500 mb-1 block">App</label>
              <select value={selectedApp} onChange={(e) => setSelectedApp(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
                <option value="">Select app...</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-500 mb-1 block">Alias</label>
              <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="e.g. alice" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm text-slate-500 mb-1 block">Public Key (PEM)</label>
              <textarea value={newPublicKey} onChange={(e) => setNewPublicKey(e.target.value)} placeholder="-----BEGIN PUBLIC KEY-----..." rows={2} className="w-full border rounded px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <button onClick={handleAdd} disabled={!selectedApp || !newAlias || !newPublicKey} className="px-4 py-2 bg-brand-600 text-white rounded disabled:opacity-50">
            Register Operator
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading operators...</p>
      ) : operators.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No operators found. Add one to get started.</p>
        </div>
      ) : (
        <table className="w-full">
          <thead className="border-b text-left text-slate-500 text-sm">
            <tr>
              <th className="pb-2">Alias</th>
              <th className="pb-2">App</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Public Key</th>
              <th className="pb-2">Created</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op) => (
              <tr key={op.id} className="border-b last:border-0">
                <td className="py-3 font-medium">{op.alias}</td>
                <td className="py-3 text-sm">
                  <button onClick={() => router.push(`/verifiable-compute/apps/${op.app.id}`)} className="text-brand-600 hover:underline">
                    {op.app.name}
                  </button>
                </td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${op.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {op.status}
                  </span>
                </td>
                <td className="py-3 font-mono text-xs text-slate-500">{op.publicKey.slice(0, 32)}...</td>
                <td className="py-3 text-sm text-slate-500">{new Date(op.createdAt).toLocaleDateString()}</td>
                <td className="py-3">
                  {op.status === "active" && (
                    <button onClick={() => handleRevoke(op.app.id, op.id)} className="text-red-600 hover:text-red-800">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
