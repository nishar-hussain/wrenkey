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

interface PrivateKeyEntry {
  id: string;
  walletId: string;
  name: string;
  curve: string;
  tags: string[];
  publicKey: string;
  exported: boolean;
  status: string;
  createdAt: string;
  wallet: { name: string };
  addresses: Array<{ address: string; chain: { name: string } }>;
}

const CHAIN_OPTIONS = ["sepolia", "ethereum", "polygon", "arbitrum", "optimism", "base"];

export default function PrivateKeysPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [keys, setKeys] = useState<PrivateKeyEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createWalletId, setCreateWalletId] = useState("");
  const [createChain, setCreateChain] = useState("sepolia");
  const [createLoading, setCreateLoading] = useState(false);
  const [wallets, setWallets] = useState<Array<{ id: string; name: string }>>([]);

  const fetchKeys = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      let qs = `/private-keys?limit=${limit}&offset=${offset}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res: any = await apiFetch(qs, { token });
      setKeys(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load private keys", "error");
    } finally {
      setLoading(false);
    }
  }, [token, limit, offset, search]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchKeys();
    apiFetch("/wallets?limit=100", { token: token! }).then((res: any) => setWallets(res.data)).catch(() => {});
  }, [isAuthenticated, fetchKeys, router]);

  const handleCreate = async () => {
    if (!createName.trim() || !createWalletId) {
      addToast("Name and wallet are required", "error");
      return;
    }
    setCreateLoading(true);
    try {
      await apiFetch("/private-keys", {
        method: "POST",
        body: JSON.stringify({ name: createName, walletId: createWalletId, chain: createChain }),
        token: token!,
      });
      setShowCreate(false);
      setCreateName("");
      setCreateWalletId("");
      setCreateChain("sepolia");
      addToast("Private key created", "success");
      fetchKeys();
    } catch (err: any) {
      addToast(err.message || "Failed", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  const columns = [
    {
      key: "name",
      header: "Key",
      render: (k: PrivateKeyEntry) => (
        <div>
          <p className="text-sm font-medium">{k.name}</p>
          <p className="text-[10px] text-slate-400">{k.wallet?.name}</p>
        </div>
      ),
    },
    {
      key: "publicKey",
      header: "Private ID",
      render: (k: PrivateKeyEntry) => (
        <span className="font-mono text-xs text-slate-500">{k.id.slice(0, 4)}&middot;&middot;&middot;&middot;{k.id.slice(-4)}</span>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      render: (k: PrivateKeyEntry) => (
        k.tags?.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {k.tags.map((t, i) => (
              <span key={i} className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-blue-500">Add Tag</span>
        )
      ),
    },
    {
      key: "exported",
      header: "Exported",
      render: (k: PrivateKeyEntry) => (
        <span className="text-xs text-slate-500">{k.exported ? "Yes" : "No"}</span>
      ),
    },
    {
      key: "curve",
      header: "Curve Type",
      render: () => <span className="text-xs font-mono">SECP256K1</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (k: PrivateKeyEntry) => (
        <span className="text-xs text-slate-500">
          {new Date(k.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (k: PrivateKeyEntry) => (
        <Button size="sm" variant="secondary" onClick={() => router.push(`/private-keys/${k.id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Private Keys</h1>
          <p className="text-sm text-slate-500 mt-1">All derived private keys across your wallets</p>
        </div>
        <Button onClick={async () => {
          setShowCreate(true);
          setCreateName("");
          setCreateChain("sepolia");
          try {
            const res: any = await apiFetch("/wallets?limit=100", { token: token! });
            const wList = res.data || [];
            if (wList.length > 0) setCreateWalletId(wList[0].id);
          } catch {}
        }}>
          New Private Key
        </Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          placeholder="Search keys..."
          className="max-w-xs"
        />
        <Button variant="secondary" size="sm" onClick={fetchKeys}>Refresh</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={keys} loading={false} emptyMessage="No private keys found." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Private Key">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Private Key Name</label>
            <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="My Key" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">SECP256K1</label>
            <Input value="SECP256K1" readOnly className="bg-slate-50 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Asset Addresses</label>
            <select
              value={createChain}
              onChange={(e) => setCreateChain(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleCreate} disabled={createLoading} className="w-full">
            {createLoading ? "Creating..." : "Continue"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
