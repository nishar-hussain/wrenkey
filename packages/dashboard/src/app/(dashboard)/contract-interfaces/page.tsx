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
import { Plus, Search, Copy, Trash2, Edit3, Code2, FileCode, Play, X } from "lucide-react";

interface ContractInterface {
  id: string;
  name: string;
  address: string;
  notes: string;
  interfaceType: string;
  abi: any;
  createdAt: string;
}

function getFunctionCount(abi: any): number {
  if (!abi || !Array.isArray(abi)) return 0;
  return abi.filter((item: any) => item.type === "function").length;
}

function getFunctions(abi: any): Array<{ name: string; inputs: Array<{ name: string; type: string }> }> {
  if (!abi || !Array.isArray(abi)) return [];
  return abi
    .filter((item: any) => item.type === "function")
    .map((f: any) => ({
      name: f.name || "unknown",
      inputs: (f.inputs || []).map((i: any) => ({ name: i.name || "", type: i.type })),
    }));
}

export default function ContractInterfacesPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  const [interfaces, setInterfaces] = useState<ContractInterface[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ifaceName, setIfaceName] = useState("");
  const [ifaceNotes, setIfaceNotes] = useState("");
  const [ifaceAddress, setIfaceAddress] = useState("");
  const [ifaceType, setIfaceType] = useState("custom");
  const [ifaceAbi, setIfaceAbi] = useState("");
  const [abiPreview, setAbiPreview] = useState<Array<{ name: string; inputs: Array<{ name: string; type: string }> }>>([]);
  const [saving, setSaving] = useState(false);

  const [showDecode, setShowDecode] = useState<string | null>(null);
  const [decodeData, setDecodeData] = useState("");
  const [decodeResult, setDecodeResult] = useState<any>(null);
  const [decodeLoading, setDecodeLoading] = useState(false);

  const fetchInterfaces = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/contract-interfaces?limit=${limit}&offset=${offset}`, { token });
      setInterfaces(res.data || []);
      setTotal(res.total || 0);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchInterfaces();
  }, [isAuthenticated, fetchInterfaces, router]);

  const resetForm = () => {
    setIfaceName(""); setIfaceNotes(""); setIfaceAddress("");
    setIfaceType("custom"); setIfaceAbi(""); setAbiPreview([]);
    setEditingId(null);
  };

  const handleAbiChange = (val: string) => {
    setIfaceAbi(val);
    if (val.trim()) {
      try {
        const parsed = JSON.parse(val.trim());
        setAbiPreview(getFunctions(parsed));
      } catch { setAbiPreview([]); }
    } else {
      setAbiPreview([]);
    }
  };

  const openCreate = () => { resetForm(); setShowModal(true); };
  const openEdit = (iface: ContractInterface) => {
    setEditingId(iface.id);
    setIfaceName(iface.name);
    setIfaceNotes(iface.notes || "");
    setIfaceAddress(iface.address || "");
    setIfaceType(iface.interfaceType || "custom");
    const abiStr = typeof iface.abi === "string" ? iface.abi : JSON.stringify(iface.abi || [], null, 2);
    setIfaceAbi(abiStr);
    handleAbiChange(abiStr);
    setShowModal(true);
  };

  const saveInterface = async () => {
    if (!ifaceName.trim()) { addToast("Name required", "error"); return; }
    setSaving(true);
    try {
      const body: any = {
        name: ifaceName.trim(),
        notes: ifaceNotes.trim(),
        address: ifaceAddress.trim(),
        interfaceType: ifaceType,
        abi: ifaceAbi.trim(),
      };

      if (editingId) {
        await apiFetch(`/contract-interfaces/${editingId}`, { method: "PATCH", body: JSON.stringify(body), token: token! });
        addToast("Interface updated", "success");
      } else {
        await apiFetch("/contract-interfaces", { method: "POST", body: JSON.stringify(body), token: token! });
        addToast("Interface created", "success");
      }
      setShowModal(false);
      resetForm();
      fetchInterfaces();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaving(false); }
  };

  const deleteInterface = async (id: string) => {
    try {
      await apiFetch(`/contract-interfaces/${id}`, { method: "DELETE", token: token! });
      addToast("Interface deleted", "success");
      fetchInterfaces();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const decodeTransaction = async (id: string) => {
    if (!decodeData.trim()) { addToast("Calldata required", "error"); return; }
    setDecodeLoading(true);
    setDecodeResult(null);
    try {
      const res: any = await apiFetch(`/contract-interfaces/${id}/decode`, {
        method: "POST",
        body: JSON.stringify({ data: decodeData.trim() }),
        token: token!,
      });
      setDecodeResult(res);
    } catch (err: any) { addToast(err.message || "Decode failed", "error"); } finally { setDecodeLoading(false); }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Interface", render: (i: ContractInterface) => (
      <div>
        <p className="font-medium text-sm text-slate-900 dark:text-white">{i.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{getFunctionCount(i.abi)} functions</p>
      </div>
    )},
    { key: "address", header: "Contract Address", render: (i: ContractInterface) => i.address ? (
      <div className="flex items-center gap-1">
        <code className="font-mono text-[11px] text-slate-600 dark:text-slate-400">{i.address.slice(0, 8)}...{i.address.slice(-6)}</code>
        <button onClick={() => { navigator.clipboard.writeText(i.address); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600">
          <Copy className="w-3 h-3" />
        </button>
      </div>
    ) : <span className="text-xs text-slate-400">—</span> },
    { key: "type", header: "Type", render: (i: ContractInterface) => (
      <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${i.interfaceType === "erc20" ? "bg-blue-50 text-blue-700 border-blue-100" : i.interfaceType === "erc721" ? "bg-violet-50 text-violet-700 border-violet-100" : i.interfaceType === "erc1155" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
        {i.interfaceType?.toUpperCase()}
      </span>
    )},
    { key: "createdAt", header: "Created", render: (i: ContractInterface) => <span className="text-xs text-slate-500">{new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
    { key: "id", header: "ID", render: (i: ContractInterface) => (
      <div className="flex items-center gap-1"><span className="font-mono text-[11px] text-slate-400">{i.id.slice(0, 4)}····{i.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(i.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div>
    )},
    { key: "actions", header: "", render: (i: ContractInterface) => (
      <div className="flex items-center gap-0.5">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setShowDecode(i.id); setDecodeData(""); setDecodeResult(null); }}>
          <Play className="w-3 h-3 text-slate-400" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(i)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteInterface(i.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Smart Contract Interfaces</h1>
        <p className="text-sm text-slate-500 mt-0.5">Upload ABIs to decode transaction calldata and enable function-aware policies.</p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> New Interface
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search interfaces..." className="pl-9 text-sm" />
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
                data={interfaces.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.address.toLowerCase().includes(search.toLowerCase()))}
                loading={false}
                emptyMessage="No smart contract interfaces found. Upload your first ABI to decode transactions."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Contract Interface" : "New Smart Contract Interface"}>
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-sm text-slate-500">Upload a contract ABI to decode transaction calldata into human-readable function calls.</p>

          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={ifaceName} onChange={e => setIfaceName(e.target.value)} placeholder="e.g. USDC (ERC-20)" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Notes</label>
            <Input value={ifaceNotes} onChange={e => setIfaceNotes(e.target.value)} placeholder="Optional notes about this contract" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Contract Address</label>
            <Input value={ifaceAddress} onChange={e => setIfaceAddress(e.target.value)} placeholder="0x..." className="font-mono text-xs" />
            <p className="text-[10px] text-slate-400">Transactions to this address will be auto-decoded using the ABI below.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Interface Type</label>
            <select value={ifaceType} onChange={e => setIfaceType(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-900">
              <option value="custom">Custom</option>
              <option value="erc20">ERC-20</option>
              <option value="erc721">ERC-721</option>
              <option value="erc1155">ERC-1155</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">ABI / IDL JSON</label>
            <textarea
              value={ifaceAbi}
              onChange={e => handleAbiChange(e.target.value)}
              placeholder='[{"type":"function","name":"transfer","inputs":[{"name":"recipient","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[]}]'
              rows={8}
              className="w-full border rounded-md px-3 py-2 text-xs font-mono resize-none bg-slate-50 dark:bg-slate-800"
            />
          </div>

          {abiPreview.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 bg-white dark:bg-slate-900">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Detected Functions ({abiPreview.length})</p>
              <div className="space-y-1">
                {abiPreview.map((fn, i) => (
                  <div key={i} className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1">
                    <span className="text-brand-600 font-semibold">{fn.name}</span>
                    <span className="text-slate-400">({fn.inputs.map(i => `${i.type} ${i.name || "?"}`).join(", ")})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1">Cancel</Button>
            <Button onClick={saveInterface} disabled={saving} className="flex-1">
              {saving ? "Saving..." : editingId ? "Update Interface" : "Create Interface"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!showDecode} onClose={() => { setShowDecode(null); setDecodeData(""); setDecodeResult(null); }} title="Decode Transaction">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Paste calldata to decode it using this contract's ABI.</p>

          <div className="space-y-1">
            <label className="text-sm font-medium">Calldata (hex)</label>
            <textarea
              value={decodeData}
              onChange={e => setDecodeData(e.target.value)}
              placeholder="0xa9059cbb000000..."
              rows={4}
              className="w-full border rounded-md px-3 py-2 text-xs font-mono resize-none bg-slate-50 dark:bg-slate-800"
            />
          </div>

          <Button onClick={() => showDecode && decodeTransaction(showDecode)} disabled={decodeLoading} className="w-full">
            <Play className="w-4 h-4 mr-1.5" /> {decodeLoading ? "Decoding..." : "Decode"}
          </Button>

          {decodeResult && (
            <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/50 space-y-2">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Decoded</p>
              <div className="space-y-1 text-sm">
                <p><span className="text-slate-500">Function:</span> <span className="font-semibold text-slate-900">{decodeResult.functionName}</span></p>
                <p><span className="text-slate-500">Signature:</span> <code className="text-xs text-slate-600">{decodeResult.signature}</code></p>
                <p><span className="text-slate-500">Selector:</span> <code className="text-xs text-slate-600">{decodeResult.selector}</code></p>
              </div>
              {decodeResult.args && Object.keys(decodeResult.args).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-2">Arguments</p>
                  {Object.entries(decodeResult.args).map(([key, val]) => (
                    <p key={key} className="text-xs font-mono text-slate-700"><span className="text-slate-400">{key}:</span> {String(val)}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
