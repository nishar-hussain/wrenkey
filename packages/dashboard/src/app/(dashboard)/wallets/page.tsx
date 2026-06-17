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
  tags: string[];
  accounts: Array<{ address: string; chainId: string; chain?: { name: string } }>;
  createdAt: string;
}

const CHAIN_OPTIONS = ["sepolia", "ethereum", "polygon", "arbitrum", "optimism", "base"];

export default function WalletsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChain, setNewChain] = useState("sepolia");
  const [newTags, setNewTags] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [importChain, setImportChain] = useState("sepolia");
  const [importLoading, setImportLoading] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      let qs = `/wallets?limit=${limit}&offset=${offset}`;
      if (statusFilter) qs += `&status=${statusFilter}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res: any = await apiFetch(qs, { token });
      setWallets(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load wallets", "error");
      setWallets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, limit, offset, search, statusFilter]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchWallets();
  }, [isAuthenticated, fetchWallets, router]);

  const createWallet = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      await apiFetch("/wallets", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          ownerType: "USER",
          chain: newChain,
          tags: newTags ? newTags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        }),
        token: token!,
      });
      setShowCreate(false);
      setNewName("");
      setNewChain("sepolia");
      setNewTags("");
      addToast("Wallet created", "success");
      fetchWallets();
    } catch (err: any) {
      addToast(err.message || "Failed to create wallet", "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const importWallet = async () => {
    if (!importName.trim() || !importMnemonic.trim()) {
      addToast("Name and mnemonic are required", "error");
      return;
    }
    const words = importMnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      addToast(`Invalid recovery phrase: expected 12 or 24 words, got ${words.length}`, "error");
      return;
    }
    setImportLoading(true);
    try {
      await apiFetch("/wallets/import", {
        method: "POST",
        body: JSON.stringify({
          name: importName,
          mnemonic: importMnemonic.trim(),
          ownerType: "USER",
          chain: importChain,
        }),
        token: token!,
      });
      setShowImport(false);
      setImportName("");
      setImportMnemonic("");
      setImportChain("sepolia");
      addToast("Wallet imported", "success");
      fetchWallets();
    } catch (err: any) {
      addToast(err.message || "Failed to import wallet", "error");
    } finally {
      setImportLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this wallet? This action cannot be undone.")) return;
    try {
      await apiFetch(`/wallets/${id}`, { method: "DELETE", token: token! });
      addToast("Wallet deleted", "success");
      fetchWallets();
    } catch (err: any) {
      addToast(err.message || "Failed to delete", "error");
    }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    {
      key: "tags",
      header: "Tags",
      render: (w: Wallet) =>
        w.tags?.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {w.tags.map((t, i) => (
              <span key={i} className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    { key: "ownerType", header: "Owner" },
    {
      key: "address",
      header: "Address",
      render: (w: Wallet) => {
        const addr = w.accounts?.[0]?.address;
        const chain = w.accounts?.[0]?.chain?.name || w.accounts?.[0]?.chainId || "sepolia";
        return addr ? (
          <span className="font-mono text-xs">
            {addr.slice(0, 8)}...{addr.slice(-6)}
            <span className="text-slate-400 ml-1">({chain})</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (w: Wallet) => <StatusBadge status={w.status} />,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (w: Wallet) => new Date(w.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      render: (w: Wallet) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => router.push(`/wallets/${w.id}`)}>
            View
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleDelete(w.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wallets</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setShowImport(true); setImportName(""); setImportMnemonic(""); setImportChain("sepolia"); }}>
            Import
          </Button>
          <Button onClick={() => { setShowCreate(true); setNewName(""); setNewChain("sepolia"); setNewTags(""); }}>
            Create Wallet
          </Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          placeholder="Search by name or address..."
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FROZEN">Frozen</option>
        </select>
        <Button variant="secondary" size="sm" onClick={fetchWallets}>
          Refresh
        </Button>
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
              <Table columns={columns} data={wallets} loading={false} emptyMessage="No wallets found. Create your first wallet." />
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Wallet">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet Name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Wallet" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Chain</label>
            <select
              value={newChain}
              onChange={(e) => setNewChain(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="trading, dev, cold" />
          </div>
          <Button onClick={createWallet} disabled={createLoading} className="w-full">
            {createLoading ? "Creating..." : "Create"}
          </Button>
        </div>
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Wallet">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
            <p className="font-medium text-amber-700">Import from recovery phrase</p>
            <p className="text-amber-600 mt-1">Enter your 12 or 24 word mnemonic phrase.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet Name</label>
            <Input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Imported Wallet" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Recovery Phrase (12 or 24 words)</label>
            <textarea
              value={importMnemonic}
              onChange={(e) => setImportMnemonic(e.target.value)}
              placeholder="word1 word2 word3 ..."
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm font-mono resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Chain</label>
            <select
              value={importChain}
              onChange={(e) => setImportChain(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={importWallet} disabled={importLoading} className="w-full">
            {importLoading ? "Importing..." : "Import"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
