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
import { Plus, Search, Copy, Trash2, Edit3 } from "lucide-react";

interface Policy {
  id: string;
  name: string;
  effect: string;
  conditions: any;
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

export default function PoliciesPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyActive, setPolicyActive] = useState(true);
  const [policyJson, setPolicyJson] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPolicies = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/policies?limit=${limit}&offset=${offset}`, { token });
      setPolicies(res.data || []);
      setTotal(res.total || 0);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchPolicies();
  }, [isAuthenticated, fetchPolicies, router]);

  const resetForm = () => {
    setPolicyName("");
    setPolicyDescription("");
    setPolicyActive(true);
    setPolicyJson("");
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setPolicyJson(JSON.stringify({ effect: "EFFECT_ALLOW" }, null, 2));
    setShowModal(true);
  };

  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setPolicyName(p.name);
    setPolicyActive(p.active);

    const body: any = { effect: p.effect };
    if (p.consensus && p.consensus !== "ANY") body.consensus = p.consensus;
    const cond = (p.conditions as any)?.condition;
    if (cond) body.condition = cond;
    setPolicyJson(JSON.stringify(body, null, 2));
    setShowModal(true);
  };

  const savePolicy = async () => {
    if (!policyName.trim()) { addToast("Name required", "error"); return; }
    setSaving(true);
    try {
      let parsed: any;
      try { parsed = JSON.parse(policyJson); } catch { throw new Error("Invalid JSON"); }
      if (!parsed.effect) throw new Error("effect required");

      const body: any = {
        name: policyName.trim(),
        active: policyActive,
        priority: 0,
        effect: parsed.effect,
        consensus: parsed.consensus || "ANY",
        conditions: {
          condition: parsed.condition || "",
          description: policyDescription.trim(),
          isTurnkey: true,
        },
      };

      if (editingId) {
        await apiFetch(`/policies/${editingId}`, { method: "PATCH", body: JSON.stringify(body), token: token! });
        addToast("Policy updated", "success");
      } else {
        await apiFetch("/policies", { method: "POST", body: JSON.stringify(body), token: token! });
        addToast("Policy created", "success");
      }
      setShowModal(false);
      resetForm();
      fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaving(false); }
  };

  const deletePolicy = async (id: string) => {
    try {
      await apiFetch(`/policies/${id}`, { method: "DELETE", token: token! });
      addToast("Policy deleted", "success"); fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name", render: (p: Policy) => (
      <div>
        <p className="font-medium text-sm">{p.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
            p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30"
              : "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30"
          }`}>
            {p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}
          </span>
          {p.active === false && (
            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30">Inactive</span>
          )}
        </div>
      </div>
    )},
    {
      key: "conditions",
      header: "Conditions",
      render: (p: Policy) => (
        <code className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block truncate max-w-[260px]">
          {JSON.stringify({ effect: p.effect, consensus: p.consensus, condition: (p.conditions as any)?.condition || "" })}
        </code>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      render: (p: Policy) => (
        <span className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      ),
    },
    {
      key: "id",
      header: "ID",
      render: (p: Policy) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-[11px] text-slate-400">{p.id.slice(0, 4)}&middot;&middot;&middot;&middot;{p.id.slice(-4)}</span>
          <button onClick={() => { navigator.clipboard.writeText(p.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600">
            <Copy className="w-3 h-3" />
          </button>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (p: Policy) => (
        <div className="flex items-center gap-0.5">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deletePolicy(p.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-sm text-slate-500 mt-0.5">Define authorization rules as JSON.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> New Policy</Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search policies..." className="pl-9 text-sm" />
        </div>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <>
              <Table columns={columns} data={policies.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))} loading={false} emptyMessage="No policies found." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Policy" : "New Policy"}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Treasury Spending Limit" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input value={policyDescription} onChange={e => setPolicyDescription(e.target.value)} placeholder="Human-readable summary (optional)" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Policy JSON</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-900 shadow-inner">
              <textarea
                value={policyJson}
                onChange={e => setPolicyJson(e.target.value)}
                rows={12}
                className="w-full bg-transparent p-3 outline-none resize-none font-mono text-xs leading-relaxed text-emerald-400 focus:ring-0"
                placeholder='{"effect":"EFFECT_ALLOW","consensus":"approvers.any(user, user.id == &apos;<ID>&apos;)","condition":"activity.action == &apos;SIGN&apos;"}'
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fields: <code className="text-[11px]">effect</code> (EFFECT_ALLOW | EFFECT_DENY), <code className="text-[11px]">consensus</code> (CEL expression, optional), <code className="text-[11px]">condition</code> (CEL expression, optional)
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Policy Status</span>
              <span className="text-xs text-slate-400">Toggle whether this policy is active</span>
            </div>
            <button type="button" onClick={() => setPolicyActive(!policyActive)}
              className={`relative w-9 h-5 rounded-full transition-colors ${policyActive ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${policyActive ? "left-4" : "left-0.5"}`} />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1">Cancel</Button>
            <Button onClick={savePolicy} disabled={saving} className="flex-1">
              {saving ? "Saving..." : editingId ? "Update Policy" : "Create Policy"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
