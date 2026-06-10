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

interface Policy {
  id: string;
  name: string;
  effect: string;
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

export default function PoliciesPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", effect: "EFFECT_ALLOW", consensus: "ANY", priority: 0 });
  const [createLoading, setCreateLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/policies?limit=${limit}&offset=${offset}`, { token });
      setPolicies(res.data);
      setTotal(res.total);
    } catch { setPolicies([]); setTotal(0); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createPolicy = async () => {
    if (!form.name) return;
    setCreateLoading(true);
    try {
      await apiFetch("/policies", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000000 }],
        }),
        token: token!,
      });
      setShowCreate(false);
      setForm({ name: "", effect: "EFFECT_ALLOW", consensus: "ANY", priority: 0 });
      fetchData();
    } catch {} finally { setCreateLoading(false); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    { key: "effect", header: "Effect", render: (p: Policy) => <StatusBadge status={p.effect} /> },
    { key: "consensus", header: "Consensus" },
    { key: "priority", header: "Priority", render: (p: Policy) => String(p.priority) },
    { key: "active", header: "Active", render: (p: Policy) => <StatusBadge status={String(p.active)} /> },
    { key: "createdAt", header: "Created", render: (p: Policy) => new Date(p.createdAt).toLocaleDateString() },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Policies</h1>
        <Button onClick={() => setShowCreate(true)}>Create Policy</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table columns={columns} data={policies} loading={loading} emptyMessage="No policies defined." />
          <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Policy">
        <div className="space-y-4">
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
          <Button onClick={createPolicy} disabled={createLoading} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}
