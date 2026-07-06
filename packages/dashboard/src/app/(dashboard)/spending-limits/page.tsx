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

interface SpendingLimit {
  id: string;
  name: string;
  walletId: string;
  maxPerTx?: string;
  maxDaily?: string;
  maxMonthly?: string;
  allowlist: string[];
  denylist: string[];
  active: boolean;
  wallet?: { name: string };
}

export default function SpendingLimitsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [limits, setLimits] = useState<SpendingLimit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [toggleLoading, setToggleLoading] = useState<Record<string, boolean>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [wallets, setWallets] = useState<Array<{ id: string; name: string }>>([]);
  const [createForm, setCreateForm] = useState({ name: "", walletId: "", maxPerTx: "", maxDaily: "", maxMonthly: "", allowlist: "", denylist: "" });
  const [createLoading, setCreateLoading] = useState(false);

  const fetchLimits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/spending-limits?limit=${limit}&offset=${offset}`, { token });
      setLimits(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load spending limits", "error");
      setLimits([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchLimits();
  }, [isAuthenticated, fetchLimits, router]);

  const toggleLimit = async (id: string, active: boolean) => {
    setToggleLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/spending-limits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
        token: token!,
      });
      addToast(active ? "Limit enabled" : "Limit disabled", "success");
      fetchLimits();
    } catch (err: any) {
      addToast(err.message || "Failed to toggle limit", "error");
    } finally {
      setToggleLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const openCreate = async () => {
    try {
      const res: any = await apiFetch(`/wallets?limit=100`, { token: token! });
      setWallets(res.data || []);
    } catch { /* non-critical */ }
    setCreateForm({ name: "", walletId: "", maxPerTx: "", maxDaily: "", maxMonthly: "", allowlist: "", denylist: "" });
    setShowCreate(true);
  };

  const createLimit = async () => {
    if (!createForm.name || !createForm.walletId) { addToast("Name and wallet are required", "error"); return; }
    setCreateLoading(true);
    try {
      await apiFetch("/spending-limits", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name,
          walletId: createForm.walletId,
          maxPerTx: createForm.maxPerTx || undefined,
          maxDaily: createForm.maxDaily || undefined,
          maxMonthly: createForm.maxMonthly || undefined,
          allowlist: createForm.allowlist ? createForm.allowlist.split(",").map((s) => s.trim()) : [],
          denylist: createForm.denylist ? createForm.denylist.split(",").map((s) => s.trim()) : [],
        }),
        token: token!,
      });
      addToast("Spending limit created", "success");
      setShowCreate(false);
      fetchLimits();
    } catch (err: any) {
      addToast(err.message || "Failed to create limit", "error");
    } finally { setCreateLoading(false); }
  };

  const deleteLimit = async (id: string) => {
    try {
      await apiFetch(`/spending-limits/${id}`, { method: "DELETE", token: token! });
      addToast("Limit deleted", "success");
      fetchLimits();
    } catch (err: any) { addToast(err.message || "Failed to delete", "error"); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    {
      key: "maxPerTx",
      header: "Max Per Tx",
      render: (sl: SpendingLimit) => sl.maxPerTx || "—",
    },
    {
      key: "maxDaily",
      header: "Max Daily",
      render: (sl: SpendingLimit) => sl.maxDaily || "—",
    },
    {
      key: "maxMonthly",
      header: "Max Monthly",
      render: (sl: SpendingLimit) => sl.maxMonthly || "—",
    },
    {
      key: "denylist",
      header: "Denylist",
      render: (sl: SpendingLimit) =>
        sl.denylist?.length > 0 ? (
          <span className="text-xs">{sl.denylist.length} addresses</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "active",
      header: "Status",
      render: (sl: SpendingLimit) => (
        <Button
          size="sm"
          variant={sl.active ? "default" : "secondary"}
          disabled={toggleLoading[sl.id]}
          onClick={() => toggleLimit(sl.id, !sl.active)}
        >
          {sl.active ? "Active" : "Disabled"}
        </Button>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (sl: SpendingLimit) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => router.push(`/wallets/${sl.walletId}`)}>View Wallet</Button>
          <Button size="sm" variant="destructive" onClick={() => deleteLimit(sl.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Spending Limits</h1>
        <Button onClick={openCreate}>Create Limit</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table
                columns={columns}
                data={limits}
                loading={false}
                emptyMessage="No spending limits configured. Add them from wallet detail pages."
              />
              <Pagination
                limit={limit}
                offset={offset}
                total={total}
                onPageChange={(l, o) => {
                  setLimit(l);
                  setOffset(o);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Spending Limit">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Daily tx limit" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet</label>
            <select value={createForm.walletId} onChange={(e) => setCreateForm({ ...createForm, walletId: e.target.value })}
              className="w-full border rounded-md p-2 text-sm bg-background">
              <option value="">Select a wallet</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><label className="text-sm font-medium">Max Per Tx</label><Input value={createForm.maxPerTx} onChange={(e) => setCreateForm({ ...createForm, maxPerTx: e.target.value })} placeholder="1.0" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Max Daily</label><Input value={createForm.maxDaily} onChange={(e) => setCreateForm({ ...createForm, maxDaily: e.target.value })} placeholder="10.0" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Max Monthly</label><Input value={createForm.maxMonthly} onChange={(e) => setCreateForm({ ...createForm, maxMonthly: e.target.value })} placeholder="100.0" /></div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Allowlist (comma-separated addresses)</label>
            <Input value={createForm.allowlist} onChange={(e) => setCreateForm({ ...createForm, allowlist: e.target.value })} placeholder="0xabc, 0xdef" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Denylist (comma-separated addresses)</label>
            <Input value={createForm.denylist} onChange={(e) => setCreateForm({ ...createForm, denylist: e.target.value })} placeholder="0x123, 0x456" />
          </div>
          <Button onClick={createLimit} disabled={createLoading} className="w-full">{createLoading ? "Creating..." : "Create Limit"}</Button>
        </div>
      </Modal>
    </div>
  );
}
