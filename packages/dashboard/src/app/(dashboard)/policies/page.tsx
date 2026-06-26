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
import { Plus, Search, Copy, Trash2 } from "lucide-react";

interface Policy {
  id: string;
  name: string;
  effect: string;
  createdAt: string;
}

interface ContractInterface {
  id: string;
  name: string;
  address: string;
  notes: string;
  interfaceType: string;
  abi: string;
  createdAt: string;
}

export default function PoliciesPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"policies" | "interfaces">("policies");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [interfaces, setInterfaces] = useState<ContractInterface[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [policyName, setPolicyName] = useState("");
  const [policyDesc, setPolicyDesc] = useState("");
  const [policyJson, setPolicyJson] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [showNewInterface, setShowNewInterface] = useState(false);
  const [ifaceName, setIfaceName] = useState("");
  const [ifaceNotes, setIfaceNotes] = useState("");
  const [ifaceAddress, setIfaceAddress] = useState("");
  const [ifaceType, setIfaceType] = useState("erc20");
  const [ifaceAbi, setIfaceAbi] = useState("");
  const [ifaceLoading, setIfaceLoading] = useState(false);

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
    fetchInterfaces();
  }, [isAuthenticated, fetchPolicies, router]);

  const fetchInterfaces = async () => {
    if (!token) return;
    try {
      const res: any = await apiFetch("/contract-interfaces?limit=50", { token });
      setInterfaces(res.data || []);
    } catch { addToast("Failed to load data", "error"); }
  };

  const createPolicy = async () => {
    if (!policyName.trim()) { addToast("Name required", "error"); return; }
    setCreateLoading(true);
    try {
      const body: any = { name: policyName, effect: "EFFECT_ALLOW", consensus: "ANY", priority: 0 };
      if (policyDesc) body.conditions = [{ type: "EQUAL", field: "params.chain", value: policyDesc }];
      await apiFetch("/policies", { method: "POST", body: JSON.stringify(body), token: token! });
      setShowNewPolicy(false); setPolicyName(""); setPolicyDesc(""); setPolicyJson("");
      addToast("Policy created", "success"); fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setCreateLoading(false); }
  };

  const deletePolicy = async (id: string) => {
    try {
      await apiFetch(`/policies/${id}`, { method: "DELETE", token: token! });
      addToast("Policy deleted", "success"); fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const createInterface = async () => {
    if (!ifaceName.trim()) { addToast("Name required", "error"); return; }
    setIfaceLoading(true);
    try {
      await apiFetch("/contract-interfaces", {
        method: "POST",
        body: JSON.stringify({
          name: ifaceName.trim(), notes: ifaceNotes.trim(),
          address: ifaceAddress.trim(), interfaceType: ifaceType,
          abi: ifaceAbi.trim() ? ifaceAbi.trim() : undefined,
        }),
        token: token!,
      });
      setShowNewInterface(false);
      setIfaceName(""); setIfaceNotes(""); setIfaceAddress(""); setIfaceAbi("");
      addToast("Interface added", "success");
      fetchInterfaces();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setIfaceLoading(false); }
  };

  const deleteInterface = async (id: string) => {
    try {
      await apiFetch(`/contract-interfaces/${id}`, { method: "DELETE", token: token! });
      addToast("Interface deleted", "success");
      fetchInterfaces();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const policyColumns = [
    { key: "name", header: "Name", render: (p: Policy) => <span className="font-medium text-sm">{p.name}</span> },
    { key: "description", header: "Description", render: (p: Policy) => <span className="text-xs text-slate-500">{p.effect === "EFFECT_ALLOW" ? "Allow" : "Deny"} rule — priority {p.effect.includes("ALLOW") ? "allow" : "block"}</span> },
    { key: "createdAt", header: "Created", render: (p: Policy) => <span className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</span> },
    { key: "id", header: "Policy ID", render: (p: Policy) => <div className="flex items-center gap-1"><span className="font-mono text-[11px]">{p.id.slice(0, 4)}····{p.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(p.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div> },
    { key: "actions", header: "", render: (p: Policy) => <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => deletePolicy(p.id)}><Trash2 className="w-3 h-3" /></Button> },
  ];

  const interfaceColumns = [
    { key: "name", header: "Name", render: (i: ContractInterface) => <span className="font-medium text-sm">{i.name}</span> },
    { key: "address", header: "Address", render: (i: ContractInterface) => i.address ? <span className="font-mono text-[11px]">{i.address.slice(0, 8)}...{i.address.slice(-6)}</span> : <span className="text-xs text-slate-400">—</span> },
    { key: "createdAt", header: "Created", render: (i: ContractInterface) => <span className="text-xs text-slate-500">{new Date(i.createdAt).toLocaleDateString()}</span> },
    { key: "actions", header: "", render: (i: ContractInterface) => <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => deleteInterface(i.id)}><Trash2 className="w-3 h-3" /></Button> },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Policies</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "policies", label: "Policies" },
          { key: "interfaces", label: "Smart Contract Interfaces" },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key as any); setSearch(""); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "policies" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={() => { setShowNewPolicy(true); setPolicyName(""); setPolicyDesc(""); setPolicyJson(""); }}>
              <Plus className="w-4 h-4 mr-1.5" /> New Policy
            </Button>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 text-sm" />
            </div>
          </div>

          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
              ) : (
                <Table columns={policyColumns} data={policies.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))} loading={false} emptyMessage="No policies found." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "interfaces" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={() => { setShowNewInterface(true); setIfaceName(""); setIfaceNotes(""); setIfaceAddress(""); setIfaceAbi(""); }}>
              <Plus className="w-4 h-4 mr-1.5" /> New Interface
            </Button>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 text-sm" />
            </div>
          </div>

          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              <Table columns={interfaceColumns} data={interfaces.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.address.includes(search))} loading={false} emptyMessage="No smart contract interfaces found." />
            </CardContent>
          </Card>
        </div>
      )}

      <Modal open={showNewPolicy} onClose={() => { setShowNewPolicy(false); setPolicyName(""); setPolicyDesc(""); setPolicyJson(""); }} title="New Policy">
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="Policy name" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Description</label><Input value={policyDesc} onChange={e => setPolicyDesc(e.target.value)} placeholder="What this policy enforces" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">JSON</label><textarea value={policyJson} onChange={e => setPolicyJson(e.target.value)} placeholder='{"type": "EQUAL", "field": "params.chain"}' rows={4} className="w-full border rounded-md px-3 py-2 text-xs font-mono resize-none" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">JSON</label><textarea value={policyJson} onChange={e => setPolicyJson(e.target.value)} placeholder='{"type": "LESS_THAN", "field": "params.value", "value": "100"}' rows={3} className="w-full border rounded-md px-3 py-2 text-xs font-mono resize-none" /></div>
          <Button onClick={createPolicy} disabled={createLoading} className="w-full">Submit</Button>
        </div>
      </Modal>

      <Modal open={showNewInterface} onClose={() => { setShowNewInterface(false); }} title="New Smart Contract Interface">
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={ifaceName} onChange={e => setIfaceName(e.target.value)} placeholder="Interface name" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Notes</label><Input value={ifaceNotes} onChange={e => setIfaceNotes(e.target.value)} placeholder="Optional notes" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Contract address</label><Input value={ifaceAddress} onChange={e => setIfaceAddress(e.target.value)} placeholder="0x..." className="font-mono text-xs" /></div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Select interface type</label>
            <select value={ifaceType} onChange={e => setIfaceType(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="erc20">ERC-20</option>
              <option value="erc721">ERC-721</option>
              <option value="erc1155">ERC-1155</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="space-y-1"><label className="text-sm font-medium">ABI / IDL JSON</label><textarea value={ifaceAbi} onChange={e => setIfaceAbi(e.target.value)} placeholder='[{"type":"function","name":"transfer",...}]' rows={6} className="w-full border rounded-md px-3 py-2 text-xs font-mono resize-none" /></div>
          <Button onClick={createInterface} disabled={ifaceLoading} className="w-full">Submit</Button>
        </div>
      </Modal>
    </div>
  );
}
