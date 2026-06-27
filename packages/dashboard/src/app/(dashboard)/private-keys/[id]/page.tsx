"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

interface PrivateKeyDetail {
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
  addresses: Array<{ id: string; address: string; chain: { name: string; chainId: number } }>;
}

const CHAIN_OPTIONS = ["sepolia", "ethereum", "polygon", "arbitrum", "optimism", "base"];

export default function PrivateKeyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [pk, setPk] = useState<PrivateKeyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [addressSearch, setAddressSearch] = useState("");
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newChain, setNewChain] = useState("sepolia");
  const [addLoading, setAddLoading] = useState(false);

  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchPk = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/private-keys/${params.id}`, { token });
      setPk(res);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchPk();
  }, [isAuthenticated, fetchPk, router]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res: any = await apiFetch(`/private-keys/${params.id}/export`, {
        method: "POST",
        body: JSON.stringify({}),
        token: token!,
      });
      setExportData(res);
    } catch (err: any) {
      addToast(err.message || "Export failed", "error");
    } finally {
      setExportLoading(false);
    }
  };

  const handleAddAddress = async () => {
    setAddLoading(true);
    try {
      await apiFetch(`/private-keys/${params.id}/addresses`, {
        method: "POST",
        body: JSON.stringify({ chain: newChain }),
        token: token!,
      });
      setShowAddAddress(false);
      setNewChain("sepolia");
      addToast("Address added", "success");
      fetchPk();
    } catch (err: any) {
      addToast(err.message || "Failed", "error");
    } finally {
      setAddLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editName.trim()) return;
    setEditLoading(true);
    try {
      const body: any = { name: editName };
      if (editTags) body.tags = editTags.split(",").map((s) => s.trim()).filter(Boolean);
      await apiFetch(`/private-keys/${params.id}`, { method: "PATCH", body: JSON.stringify(body), token: token! });
      setShowEdit(false);
      addToast("Updated", "success");
      fetchPk();
    } catch (err: any) {
      addToast(err.message || "Failed", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await apiFetch(`/private-keys/${params.id}`, { method: "DELETE", token: token! });
      addToast("Deleted", "success");
      router.push("/private-keys");
    } catch (err: any) {
      addToast(err.message || "Failed", "error");
      setDeleteLoading(false);
    }
  };

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => addToast("Copied", "success"),
      () => addToast("Failed to copy", "error")
    );
  }

  if (!isAuthenticated) return null;

  if (loading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /></div>;
  }

  if (error || !pk) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 mb-4">{error || "Not found"}</p>
        <Button variant="secondary" onClick={() => router.push("/private-keys")}>Back</Button>
      </div>
    );
  }

  const filteredAddresses = pk.addresses.filter(
    (a) => !addressSearch || a.address.toLowerCase().includes(addressSearch.toLowerCase()) || a.chain.name.toLowerCase().includes(addressSearch.toLowerCase())
  );

  const addressColumns = [
    {
      key: "chain",
      header: "Asset Type",
      render: (a: any) => <span className="text-sm font-medium">{a.chain.name.charAt(0).toUpperCase() + a.chain.name.slice(1)}</span>,
    },
    {
      key: "address",
      header: "Address",
      render: (a: any) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">{a.address.slice(0, 6)}&middot;&middot;&middot;&middot;{a.address.slice(-4)}</span>
          <button onClick={() => copyToClipboard(a.address)} className="text-slate-400 hover:text-slate-600 text-xs">&#x2398;</button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/private-keys")} className="text-slate-400 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <div>
            <h1 className="text-xl font-bold">{pk.name}</h1>
            <p className="text-xs text-slate-400">{pk.wallet?.name} &middot; Root user</p>
          </div>
        </div>
        <Button onClick={() => { setShowExport(true); setExportData(null); }}>Export</Button>
      </div>

      {/* Export Private Key Card */}
      <Card className="mb-6">
        <CardContent className="p-5">
          {!exportData ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Export Private Key</p>
                <p className="text-sm text-slate-500 mt-0.5">Your key material makes up your private key. Save it in a secure location.</p>
              </div>
              <Button variant="secondary" onClick={handleExport} disabled={exportLoading}>
                {exportLoading ? "Loading..." : "Export"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium">Export Private Key</p>
              <p className="text-sm text-slate-500">Your key material makes up your private key. Save it in a secure location.</p>
              <div className="p-3 bg-slate-100 rounded-md font-mono text-xs break-all">
                {exportData.privateKey}
              </div>
              <Button variant="secondary" onClick={() => { setShowExport(false); setExportData(null); }}>
                Done
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${pk.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"}`}>
              {pk.status}
            </span>
            <button onClick={() => { setEditName(pk.name); setEditTags(pk.tags.join(", ")); setShowEdit(true); }} className="text-xs text-blue-500 hover:text-blue-700">Add Tag</button>
            <div>
              <span className="text-slate-500">Private ID</span>
              <p className="font-mono text-xs mt-0.5">{pk.id.slice(0, 4)}&middot;&middot;&middot;&middot;{pk.id.slice(-4)}</p>
            </div>
            <div>
              <span className="text-slate-500">Public ID</span>
              <p className="font-mono text-xs mt-0.5">{pk.publicKey.slice(0, 4)}&middot;&middot;&middot;&middot;{pk.publicKey.slice(-4)}</p>
            </div>
            <div>
              <span className="text-slate-500">Curve Type</span>
              <p className="font-mono text-xs mt-0.5">SECP256K1</p>
            </div>
            <div>
              <span className="text-slate-500">Exported</span>
              <p className="text-xs mt-0.5">{pk.exported ? "Yes" : "No"}</p>
            </div>
            <div>
              <span className="text-slate-500">Created</span>
              <p className="text-xs mt-0.5">{new Date(pk.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Addresses */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Addresses ({pk.addresses.length})</h3>
        <div className="flex items-center gap-3">
          <Input value={addressSearch} onChange={(e) => setAddressSearch(e.target.value)} placeholder="Search addresses..." className="w-48 text-sm" />
          {!showAddAddress ? (
            <Button variant="secondary" size="sm" onClick={() => setShowAddAddress(true)}>Add Address</Button>
          ) : (
            <div className="flex items-center gap-2">
              <select value={newChain} onChange={(e) => setNewChain(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm">
                {CHAIN_OPTIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
              <Button size="sm" onClick={handleAddAddress} disabled={addLoading}>{addLoading ? "Adding..." : "Add"}</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowAddAddress(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table columns={addressColumns} data={filteredAddresses} emptyMessage="No addresses." />
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button variant="secondary" onClick={() => setShowDelete(true)} className="text-red-500">Delete Private Key</Button>
      </div>

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Private Key">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="tag1, tag2" />
          </div>
          <Button onClick={handleEdit} disabled={editLoading} className="w-full">{editLoading ? "Saving..." : "Save"}</Button>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Private Key">
        <div className="space-y-4">
          <p className="text-sm">Are you sure you want to delete <strong>{pk.name}</strong>?</p>
          <div className="flex gap-2">
            <Button onClick={handleDelete} disabled={deleteLoading} className="flex-1">Delete</Button>
            <Button onClick={() => setShowDelete(false)} variant="secondary" className="flex-1">Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal open={showExport} onClose={() => { setShowExport(false); setExportData(null); }} title={`Export Private Key: ${pk.name}`}>
        {exportData ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Warning: Never share your private key!</p>
              <p className="text-amber-600 mt-1">Anyone with this can access your wallet.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Private Key</label>
              <Input value={exportData.privateKey} readOnly className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Public Key</label>
              <Input value={exportData.publicKey} readOnly className="font-mono text-xs" />
            </div>
            <Button onClick={() => { setShowExport(false); setExportData(null); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Export private key</p>
              <p className="text-amber-600 mt-1">This will reveal your private key material.</p>
            </div>
            <Button onClick={handleExport} disabled={exportLoading} className="w-full">
              {exportLoading ? "Exporting..." : "Export Private Key"}
            </Button>
            <Button onClick={() => setShowExport(false)} variant="secondary" className="w-full">Cancel</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
