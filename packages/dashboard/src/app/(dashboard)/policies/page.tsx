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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Plus, Search, Copy, Trash2, Edit3, Shield, X, GripVertical } from "lucide-react";

const CONDITION_TYPES = [
  { value: "LESS_THAN", label: "Less than" },
  { value: "GREATER_THAN", label: "Greater than" },
  { value: "EQUAL", label: "Equal to" },
  { value: "INCLUDE", label: "Includes" },
  { value: "NOT_INCLUDE", label: "Excludes" },
  { value: "REGEX_MATCH", label: "Regex match" },
  { value: "BEFORE", label: "Before date" },
  { value: "AFTER", label: "After date" },
  { value: "WINDOW", label: "Time window" },
];

const CONDITION_FIELDS = [
  { value: "params.value", label: "Transaction value" },
  { value: "params.to", label: "Recipient address" },
  { value: "params.chain", label: "Blockchain" },
  { value: "params.walletId", label: "Wallet ID" },
  { value: "params.gasLimit", label: "Gas limit" },
  { value: "params.userId", label: "User ID" },
  { value: "params.data", label: "Calldata" },
  { value: "user.role", label: "User role" },
  { value: "wallet.ownerType", label: "Wallet type" },
];

interface Condition {
  type: string;
  field: string;
  value?: string | number;
  values?: (string | number)[];
}

interface Policy {
  id: string;
  name: string;
  effect: string;
  conditions: Condition[];
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

function humanizeCondition(c: Condition): string {
  const fieldLabel = CONDITION_FIELDS.find(f => f.value === c.field)?.label || c.field;
  const typeLabel = CONDITION_TYPES.find(t => t.value === c.type)?.label || c.type;
  const val = c.values ? c.values.join(", ") : String(c.value ?? "");
  return `${fieldLabel} ${typeLabel.toLowerCase()} ${val}`;
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
  const [policyEffect, setPolicyEffect] = useState<"EFFECT_ALLOW" | "EFFECT_DENY">("EFFECT_ALLOW");
  const [policyConsensus, setPolicyConsensus] = useState<"ANY" | "ALL" | "REQUIRES_CONSENSUS">("ANY");
  const [policyPriority, setPolicyPriority] = useState(0);
  const [policyActive, setPolicyActive] = useState(true);
  const [policyConditions, setPolicyConditions] = useState<Condition[]>([]);
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
    setPolicyEffect("EFFECT_ALLOW");
    setPolicyConsensus("ANY");
    setPolicyPriority(0);
    setPolicyActive(true);
    setPolicyConditions([]);
    setEditingId(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };
  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setPolicyName(p.name);
    setPolicyEffect(p.effect as any);
    setPolicyConsensus(p.consensus as any);
    setPolicyPriority(p.priority);
    setPolicyActive(p.active);
    setPolicyConditions((p.conditions || []).map((c: any) => ({
      type: c.type || "",
      field: c.field || "",
      value: c.value !== undefined ? c.value : undefined,
      values: c.values !== undefined ? c.values : undefined,
    })));
    setShowModal(true);
  };

  const addCondition = () => {
    setPolicyConditions([...policyConditions, { type: "EQUAL", field: "params.chain", value: "" }]);
  };

  const removeCondition = (idx: number) => {
    setPolicyConditions(policyConditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, field: keyof Condition, value: any) => {
    const updated = [...policyConditions];
    if (field === "type") {
      const needsValues = ["INCLUDE", "NOT_INCLUDE", "WINDOW"].includes(value);
      updated[idx] = { ...updated[idx], type: value, value: needsValues ? undefined : (updated[idx].value ?? ""), values: needsValues ? (updated[idx].values ?? []) : undefined };
    } else if (field === "value") {
      updated[idx] = { ...updated[idx], value };
    } else if (field === "values") {
      updated[idx] = { ...updated[idx], values: typeof value === "string" ? value.split(",").map((s: string) => s.trim()) : value };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setPolicyConditions(updated);
  };

  const savePolicy = async () => {
    if (!policyName.trim()) { addToast("Name required", "error"); return; }
    setSaving(true);
    try {
      const conditions = policyConditions.filter(c => c.field && (c.value !== undefined && c.value !== "" || c.values && c.values.length > 0)).map(c => {
        const clean: any = { type: c.type, field: c.field };
        if (c.values && c.values.length > 0) clean.values = c.values;
        else if (c.value !== undefined && c.value !== "") clean.value = c.type === "LESS_THAN" || c.type === "GREATER_THAN" ? Number(c.value) : String(c.value);
        return clean;
      });

      const body: any = {
        name: policyName.trim(),
        effect: policyEffect,
        consensus: policyConsensus,
        priority: policyPriority,
        active: policyActive,
        conditions,
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

  const consensusLabel: Record<string, string> = {
    ANY: "Any match", ALL: "All must match", REQUIRES_CONSENSUS: "Requires approval",
  };

  const columns = [
    { key: "name", header: "Policy", render: (p: Policy) => (
      <div>
        <p className="font-medium text-sm text-slate-900 dark:text-white">{p.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>
            {p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}
          </span>
          <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
            {consensusLabel[p.consensus] || p.consensus}
          </span>
          {p.active === false && (
            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Inactive</span>
          )}
        </div>
      </div>
    )},
    { key: "conditions", header: "Conditions", render: (p: Policy) => (
      <div className="space-y-0.5">
        {(p.conditions || []).length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">No conditions (always matches)</span>
        ) : (p.conditions || []).slice(0, 3).map((c, i) => (
          <p key={i} className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-[240px]">{humanizeCondition(c as Condition)}</p>
        ))}
        {(p.conditions || []).length > 3 && <p className="text-[10px] text-slate-400">+{p.conditions.length - 3} more</p>}
      </div>
    )},
    { key: "priority", header: "Priority", render: (p: Policy) => <span className="text-sm font-mono text-slate-600">{p.priority}</span> },
    { key: "createdAt", header: "Created", render: (p: Policy) => <span className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
    { key: "id", header: "ID", render: (p: Policy) => (
      <div className="flex items-center gap-1"><span className="font-mono text-[11px] text-slate-400">{p.id.slice(0, 4)}····{p.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(p.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div>
    )},
    { key: "actions", header: "", render: (p: Policy) => (
      <div className="flex items-center gap-0.5">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deletePolicy(p.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
      </div>
    )},
  ];

  const needsValuesInput = (type: string) => ["INCLUDE", "NOT_INCLUDE", "WINDOW"].includes(type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-sm text-slate-500 mt-0.5">Transaction authorization engine — define who can do what, when, and how.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> New Policy
        </Button>
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
              <Table
                columns={columns}
                data={policies.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))}
                loading={false}
                emptyMessage="No policies found. Create your first policy to secure transactions."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Policy" : "New Policy"}>
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-sm text-slate-500">Policies are evaluated on every transaction. DENY rules take precedence over ALLOW rules.</p>

          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Treasury Spending Limit" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Effect</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPolicyEffect("EFFECT_ALLOW")}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${policyEffect === "EFFECT_ALLOW" ? "bg-emerald-50 border-emerald-300 text-emerald-700 ring-2 ring-emerald-100" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
              >
                <Shield className="w-4 h-4 inline mr-1.5" /> Allow
              </button>
              <button
                type="button"
                onClick={() => setPolicyEffect("EFFECT_DENY")}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${policyEffect === "EFFECT_DENY" ? "bg-red-50 border-red-300 text-red-700 ring-2 ring-red-100" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
              >
                <X className="w-4 h-4 inline mr-1.5" /> Deny
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Consensus</label>
              <select
                value={policyConsensus}
                onChange={e => setPolicyConsensus(e.target.value as any)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-900"
              >
                <option value="ANY">Any condition matches (OR)</option>
                <option value="ALL">All conditions must match (AND)</option>
                <option value="REQUIRES_CONSENSUS">Requires approval</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Priority</label>
              <Input
                type="number"
                value={policyPriority}
                onChange={e => setPolicyPriority(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="text-sm"
              />
              <p className="text-[10px] text-slate-400">Higher priority policies are evaluated first.</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Active</label>
            <button
              type="button"
              onClick={() => setPolicyActive(!policyActive)}
              className={`relative w-9 h-5 rounded-full transition-colors ${policyActive ? "bg-emerald-500" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${policyActive ? "left-4" : "left-0.5"}`} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Conditions</label>
              <button type="button" onClick={addCondition} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                <Plus className="w-3 h-3 inline mr-0.5" /> Add condition
              </button>
            </div>

            {policyConditions.length === 0 && (
              <div className="text-center py-6 border border-dashed border-slate-200 rounded-lg">
                <p className="text-xs text-slate-400">No conditions yet. Add one to define what this policy checks.</p>
                <p className="text-[10px] text-slate-400 mt-1">A policy with no conditions applies to all transactions.</p>
              </div>
            )}

            {policyConditions.map((cond, idx) => (
              <div key={idx} className="p-3 border border-slate-200 rounded-lg space-y-2 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <select
                    value={cond.type}
                    onChange={e => updateCondition(idx, "type", e.target.value)}
                    className="text-xs border rounded px-2 py-1.5 bg-white flex-1"
                  >
                    {CONDITION_TYPES.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </select>
                  <select
                    value={cond.field}
                    onChange={e => updateCondition(idx, "field", e.target.value)}
                    className="text-xs border rounded px-2 py-1.5 bg-white flex-1"
                  >
                    <option value="">Field...</option>
                    {CONDITION_FIELDS.map(cf => (
                      <option key={cf.value} value={cf.value}>{cf.label}</option>
                    ))}
                    <option value="params.userId">User ID</option>
                  </select>
                  {needsValuesInput(cond.type) ? (
                    <Input
                      value={(cond.values || []).join(", ")}
                      onChange={e => updateCondition(idx, "values", e.target.value)}
                      placeholder="val1, val2, ..."
                      className="text-xs h-8 flex-1"
                    />
                  ) : (
                    <Input
                      value={cond.value !== undefined ? String(cond.value) : ""}
                      onChange={e => updateCondition(idx, "value", e.target.value)}
                      placeholder="value"
                      className="text-xs h-8 flex-1"
                    />
                  )}
                  <button onClick={() => removeCondition(idx)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {cond.field && (cond.value || (cond.values && cond.values.length > 0)) && (
                  <p className="text-[10px] text-slate-500 font-mono">{humanizeCondition(cond)}</p>
                )}
              </div>
            ))}
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
