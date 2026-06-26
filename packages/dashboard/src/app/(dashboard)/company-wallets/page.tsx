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
import { Building2, Plus, Copy } from "lucide-react";

interface CompanyWallet {
  id: string;
  name: string;
  status: string;
  tags: string[];
  accounts: Array<{ address: string; chain?: { name: string; symbol: string } }>;
  createdAt: string;
}

export default function CompanyWalletsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<CompanyWallet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChain, setNewChain] = useState("sepolia");
  const [createLoading, setCreateLoading] = useState(false);
  const [createdPhrase, setCreatedPhrase] = useState("");

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/wallets?limit=${limit}&offset=${offset}&ownerType=ORG`, { token });
      setWallets(res.data); setTotal(res.total);
    } catch { setWallets([]); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchWallets(); }, [isAuthenticated, fetchWallets, router]);

  const createWallet = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    try {
      const res: any = await apiFetch("/wallets", {
        method: "POST", body: JSON.stringify({ name: newName, ownerType: "ORG", chain: newChain, tags: ["company"] }), token: token!,
      });
      if (res.recoveryPhrase) setCreatedPhrase(res.recoveryPhrase);
      else { setShowCreate(false); addToast("Company wallet created", "success"); fetchWallets(); }
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setCreateLoading(false); }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Company Wallets</h1>
          <p className="text-sm text-slate-500">Programmatic wallets for treasury and operations</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setNewName(""); setCreatedPhrase(""); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Create Company Wallet
        </Button>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : wallets.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-1">No company wallets yet</p>
              <p className="text-xs text-slate-400 mb-4">Create a treasury wallet for your organization</p>
              <Button size="sm" onClick={() => { setShowCreate(true); setNewName(""); setCreatedPhrase(""); }}>Create Company Wallet</Button>
            </div>
          ) : (
            <>
              <Table
                columns={[
                  { key: "name", header: "Wallet", render: (w: CompanyWallet) => <div><p className="font-medium text-sm">{w.name}</p><p className="text-[10px] text-slate-400 font-mono">{w.accounts?.[0]?.address?.slice(0, 10)}...</p></div> },
                  { key: "chain", header: "Chain", render: (w: CompanyWallet) => <span className="text-xs">{w.accounts?.[0]?.chain?.name || "—"}</span> },
                  { key: "address", header: "Address", render: (w: CompanyWallet) => <span className="font-mono text-[11px]">{w.accounts?.[0]?.address?.slice(0, 8)}...{w.accounts?.[0]?.address?.slice(-6)}</span> },
                  { key: "status", header: "Status", render: (w: CompanyWallet) => <StatusBadge status={w.status} /> },
                  { key: "actions", header: "", render: (w: CompanyWallet) => <Button size="sm" variant="secondary" onClick={() => router.push(`/wallets/${w.id}`)}>Manage</Button> },
                ]}
                data={wallets} loading={false} emptyMessage="No company wallets"
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => setOffset(o)} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreatedPhrase(""); }} title="Create Company Wallet">
        {createdPhrase ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Save this recovery phrase!</p>
              <p className="text-amber-600 mt-1">This is the ONLY time it will be shown.</p>
            </div>
            <div className="p-3 bg-slate-100 rounded-md font-mono text-sm break-words">{createdPhrase}</div>
            <Button onClick={() => { setShowCreate(false); setCreatedPhrase(""); addToast("Company wallet created", "success"); fetchWallets(); }} className="w-full">I&apos;ve Saved the Recovery Phrase</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-violet-50 border border-violet-200 rounded-md text-sm">
              <p className="font-medium text-violet-700">Company Treasury Wallet</p>
              <p className="text-violet-600 mt-1">Owned by the organization. Accessible to team members with proper permissions.</p>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium">Wallet Name</label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Treasury Main" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Chain</label><select value={newChain} onChange={e => setNewChain(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">{["sepolia","ethereum","polygon","arbitrum","optimism","base"].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <Button onClick={createWallet} disabled={createLoading} className="w-full">{createLoading ? "Creating..." : "Create"}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
