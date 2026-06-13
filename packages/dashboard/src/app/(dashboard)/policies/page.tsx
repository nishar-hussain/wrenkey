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

interface Policy {
  id: string;
  name: string;
  effect: string;
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

const CONDITION_TYPES = ["LESS_THAN", "GREATER_THAN", "EQUAL", "INCLUDE", "NOT_INCLUDE", "REGEX_MATCH", "BEFORE", "AFTER", "WINDOW"];
const FIELDS = [
  { value: "params.value", label: "Amount (value)" },
  { value: "params.to", label: "Recipient (to)" },
  { value: "params.chain", label: "Chain" },
  { value: "params.gasLimit", label: "Gas Limit" },
  { value: "user.role", label: "User Role" },
];

export default function PoliciesPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", effect: "EFFECT_ALLOW", consensus: "ANY", priority: 0 });
  const [conditions, setConditions] = useState<Array<{ type: string; field: string; value: string }>>([
    { type: "LESS_THAN", field: "params.value", value: "1000000" },
  ]);
  const [createLoading, setCreateLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/policies?limit=${limit}&offset=${offset}`, { token });
      setPolicies(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load policies", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const togglePolicyActive = async (policy: Policy) => {
    try {
      await apiFetch(`/policies/${policy.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !policy.active }),
        token: token!,
      });
      addToast(`Policy ${policy.active ? "disabled" : "enabled"}`, "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to update policy", "error");
    }
  };

  const createPolicy = async () => {
    if (!form.name) {
      addToast("Name is required", "error");
      return;
    }
    setCreateLoading(true);
    try {
      const parsedConditions = conditions
        .filter((c) => c.type && c.field && c.value)
        .map((c) => ({
          type: c.type,
          field: c.field,
          value: c.type === "INCLUDE" || c.type === "NOT_INCLUDE" ? c.value.split(",").map((s: string) => s.trim()) : c.value,
        }));

      await apiFetch("/policies", {
        method: "POST",
        body: JSON.stringify({ ...form, conditions: parsedConditions }),
        token: token!,
      });
      setShowCreate(false);
      setForm({ name: "", effect: "EFFECT_ALLOW", consensus: "ANY", priority: 0 });
      setConditions([{ type: "LESS_THAN", field: "params.value", value: "1000000" }]);
      addToast("Policy created", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to create policy", "error");
    } finally { setCreateLoading(false); }
  };

  const deletePolicy = async (id: string) => {
    try {
      await apiFetch(`/policies/${id}`, { method: "DELETE", token: token! });
      addToast("Policy deleted", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete policy", "error");
    }
  };

  const addCondition = () => {
    setConditions([...conditions, { type: "LESS_THAN", field: "params.value", value: "" }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, field: string, value: string) => {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    { key: "effect", header: "Effect", render: (p: Policy) => <StatusBadge status={p.effect} /> },
    { key: "consensus", header: "Consensus" },
    { key: "priority", header: "Priority", render: (p: Policy) => String(p.priority) },
    {
      key: "active", header: "Active",
      render: (p: Policy) => (
        <button onClick={() => togglePolicyActive(p)} className="cursor-pointer">
          <StatusBadge status={String(p.active)} />
        </button>
      ),
    },
    { key: "createdAt", header: "Created", render: (p: Policy) => new Date(p.createdAt).toLocaleDateString() },
    {
      key: "actions", header: "",
      render: (p: Policy) => <Button variant="destructive" size="sm" onClick={() => deletePolicy(p.id)}>Delete</Button>,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Policies</h1>
        <Button onClick={() => setShowCreate(true)}>Create Policy</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={policies} loading={false} emptyMessage="No policies defined." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setConditions([{ type: "LESS_THAN", field: "params.value", value: "1000000" }]); }} title="Create Policy">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Allow small transfers" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Effect</label>
            <select value={form.effect} onChange={(e) => setForm({ ...form, effect: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="EFFECT_ALLOW">Allow</option>
              <option value="EFFECT_DENY">Deny</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Consensus</label>
            <select value={form.consensus} onChange={(e) => setForm({ ...form, consensus: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="ANY">Any</option>
              <option value="ALL">All</option>
              <option value="REQUIRES_CONSENSUS">Requires Consensus</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Conditions</label>
              <Button size="sm" variant="secondary" type="button" onClick={addCondition}>+ Add</Button>
            </div>
            <div className="space-y-3">
              {conditions.map((cond, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2 bg-slate-50">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Condition {i + 1}</span>
                    {conditions.length > 1 && (
                      <button onClick={() => removeCondition(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                  <select value={cond.type} onChange={(e) => updateCondition(i, "type", e.target.value)}
                    className="w-full border rounded-md px-2 py-1 text-xs">
                    {CONDITION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={cond.field} onChange={(e) => updateCondition(i, "field", e.target.value)}
                    className="w-full border rounded-md px-2 py-1 text-xs">
                    {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <Input
                    value={cond.value}
                    onChange={(e) => updateCondition(i, "value", e.target.value)}
                    placeholder={cond.type === "INCLUDE" || cond.type === "NOT_INCLUDE" ? "value1,value2,..." : "e.g. 1000"}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <Button onClick={createPolicy} disabled={createLoading} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}