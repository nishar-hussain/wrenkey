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

interface Wallet {
  id: string;
  name: string;
  ownerType: string;
  status: string;
  accounts: Array<{ address: string; chain: string }>;
  createdAt: string;
}

export default function WalletsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/wallets?limit=${limit}&offset=${offset}`, { token });
      setWallets(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load wallets", "error");
      setWallets([]);
      setTotal(0);
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchWallets();
  }, [isAuthenticated, fetchWallets, router]);

  const createWallet = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      await apiFetch("/wallets", { method: "POST", body: JSON.stringify({ name: newName, ownerType: "USER" }), token: token! });
      setShowCreate(false);
      setNewName("");
      addToast("Wallet created", "success");
      fetchWallets();
    } catch (err: any) {
      addToast(err.message || "Failed to create wallet", "error");
    } finally { setCreateLoading(false); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    { key: "ownerType", header: "Owner Type" },
    {
      key: "address", header: "Address",
      render: (w: Wallet) => <span className="font-mono text-xs">{w.accounts?.[0]?.address?.slice(0, 12)}...{w.accounts?.[0]?.address?.slice(-6)}</span>,
    },
    { key: "chain", header: "Chain", render: (w: Wallet) => w.accounts?.[0]?.chain || "arc" },
    { key: "status", header: "Status", render: (w: Wallet) => <StatusBadge status={w.status} /> },
    {
      key: "createdAt", header: "Created",
      render: (w: Wallet) => new Date(w.createdAt).toLocaleDateString(),
    },
    {
      key: "actions", header: "",
      render: (w: Wallet) => (
        <Button size="sm" variant="secondary" onClick={() => router.push(`/wallets/${w.id}`)}>View</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wallets</h1>
        <Button onClick={() => setShowCreate(true)}>Create Wallet</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={wallets} loading={false} emptyMessage="No wallets found. Create your first wallet." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Wallet">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet Name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Wallet" />
          </div>
          <Button onClick={createWallet} disabled={createLoading} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}