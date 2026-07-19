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
import { Plus, Search, Copy, Trash2, Edit3, X, HelpCircle, FileCode } from "lucide-react";

const CONDITION_TYPES = [
  { value: "LESS_THAN", label: "Less than" },
  { value: "GREATER_THAN", label: "Greater than" },
  { value: "EQUAL", label: "Equal to" },
  { value: "INCLUDE", label: "Includes" },
  { value: "NOT_INCLUDE", label: "Excludes" },
  { value: "REGEX_MATCH", label: "Regex match" },
  { value: "BEFORE", label: "Before date" },
  { value: "AFTER", label: "After date" },
  { value: "WINDOW", label: "Time window" },
];

const CONDITION_FIELDS = [
  { value: "params.value", label: "Transaction value" },
  { value: "params.to", label: "Recipient address" },
  { value: "params.chain", label: "Blockchain" },
  { value: "params.walletId", label: "Wallet ID" },
  { value: "params.gasLimit", label: "Gas limit" },
  { value: "params.userId", label: "User ID" },
  { value: "params.data", label: "Calldata" },
  { value: "user.role", label: "User role" },
  { value: "wallet.ownerType", label: "Wallet type" },
];

interface Condition {
  type: string;
  field: string;
  value?: string | number;
  values?: (string | number)[];
}

interface Policy {
  id: string;
  name: string;
  effect: string;
  conditions: any; // Can be Condition[] or Turnkey conditions object
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

function humanizeCondition(c: Condition): string {
  const fieldLabel = CONDITION_FIELDS.find(f => f.value === c.field)?.label || c.field;
  const typeLabel = CONDITION_TYPES.find(t => t.value === c.type)?.label || c.type;
  const val = c.values ? c.values.join(", ") : String(c.value ?? "");
  return `${fieldLabel} ${typeLabel.toLowerCase()} ${val}`;
}

const POLICY_EXAMPLES = [
  {
    title: "Allow user to create wallets",
    description: "Grants a specific user permission to create wallets.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.resource == 'WALLET' && activity.action == 'CREATE'"
    }
  },
  {
    title: "Allow users with tag to create users",
    description: "Grants permission to any user with the specified tag.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.tags.contains('<TAG>'))",
      condition: "activity.resource == 'USER' && activity.action == 'CREATE'"
    }
  },
  {
    title: "Require two tagged users for policy creation",
    description: "Requires at least two users sharing a tag to approve policy changes.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.filter(user, user.tags.contains('<TAG>')).count() >= 2",
      condition: "activity.resource == 'POLICY' && activity.action == 'CREATE'"
    }
  },
  {
    title: "Deny deletes from tagged users",
    description: "Prevents users with a specific tag from performing any delete actions.",
    json: {
      effect: "EFFECT_DENY",
      consensus: "approvers.any(user, user.tags.contains('<TAG>'))",
      condition: "activity.action == 'DELETE'"
    }
  },
  {
    title: "Allow user to create sub-orgs",
    description: "Grants an API-only user permission to create sub-organizations.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.resource == 'ORGANIZATION' && activity.action == 'CREATE'"
    }
  },
  {
    title: "Allow only passkeys for signing",
    description: "Restricts transaction signing to passkey-authenticated requests only. Replaces <USER_ID> with the specific user you want to allow.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "credentials.any(credential, credential.type == 'CREDENTIAL_TYPE_WEBAUTHN_AUTHENTICATOR') && approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.kind == 'SIGN_TRANSACTION'"
    }
  },
  {
    title: "Allow signing with a specific wallet",
    description: "Grants a user permission to sign transactions using a specific wallet.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.action == 'SIGN' && wallet.id == '<WALLET_ID>'"
    }
  },
  {
    title: "Limit ERC-20 transfer amount (ABI-based)",
    description: "Allows ERC-20 transfers with a maximum amount, using uploaded Smart Contract Interface. Requires an ABI upload for the contract.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "eth.tx.function_name == 'transfer' && eth.tx.to == '<CONTRACT_ADDRESS>' && eth.tx.contract_call_args['amount'] < 1000000000000000000"
    }
  },
  {
    title: "Restrict to specific contract function",
    description: "Only allows transactions calling a specific function on a specific contract. Useful for DEX interactions.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.action == 'SIGN' && eth.tx.to == '<CONTRACT_ADDRESS>' && eth.tx.function_signature == '0xa9059cbb'"
    }
  },
  {
    title: "Allow testnet only transactions",
    description: "Only allows Ethereum transactions on Sepolia testnet.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.action == 'SIGN' && eth.tx.chain_id == 11155111"
    }
  },
  {
    title: "Require two approvers for signing",
    description: "Enforces a two-person approval requirement for all signing operations using tag-based quorum.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.filter(user, user.tags.contains('<TAG>')).count() >= 2",
      condition: "activity.action == 'SIGN'"
    }
  },
  {
    title: "Deny all except allowlisted address",
    description: "Explicitly deny all signing unless allowed by another policy. Use this as a safety net combined with an ALLOW policy for specific addresses.",
    json: {
      effect: "EFFECT_DENY",
      condition: "activity.action == 'SIGN' && eth.tx.to != '<ALLOWED_ADDRESS>'"
    }
  },
  {
    title: "Allow Solana transfers below limit",
    description: "Allows SOL transfers below a specified amount in lamports (1 SOL = 1,000,000,000 lamports).",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.resource == 'WALLET' && activity.action == 'SIGN' && wallet.id == '<SOLANA_WALLET_ID>'"
    }
  },
  {
    title: "Allow signing on all EVM chains",
    description: "Grants broad signing permission for all EVM-compatible chains. Combine with specific address or value limits for production use.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "approvers.any(user, user.id == '<USER_ID>')",
      condition: "activity.action == 'SIGN'"
    }
  },
  {
    title: "Allow specific credential public key",
    description: "Only allows requests authenticated with a specific credential public key.",
    json: {
      effect: "EFFECT_ALLOW",
      consensus: "credentials.any(credential, credential.id == '<CREDENTIAL_ID>')",
      condition: "activity.action == 'SIGN'"
    }
  }
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
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // UI states
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [showContractRefs, setShowContractRefs] = useState(false);
  const [contractInterfaces, setContractInterfaces] = useState<Array<{ id: string; name: string; address: string; abi: any }>>([]);

  // Form inputs
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyJson, setPolicyJson] = useState("");
  const [policyEffect, setPolicyEffect] = useState<"EFFECT_ALLOW" | "EFFECT_DENY">("EFFECT_ALLOW");
  const [policyConsensus, setPolicyConsensus] = useState<"ANY" | "ALL" | "REQUIRES_CONSENSUS">("ANY");
  const [policyPriority, setPolicyPriority] = useState(0);
  const [policyActive, setPolicyActive] = useState(true);
  const [policyConditions, setPolicyConditions] = useState<Condition[]>([]);
  const [saving, setSaving] = useState(false);

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
  }, [isAuthenticated, fetchPolicies, router]);

  const resetForm = () => {
    setPolicyName("");
    setPolicyDescription("");
    setPolicyJson(`{\n  "effect": "EFFECT_ALLOW",\n  "consensus": "approvers.any(user, user.id == '<USER_ID>')",\n  "condition": "activity.resource == 'WALLET' && activity.action == 'CREATE'"\n}`);
    setPolicyEffect("EFFECT_ALLOW");
    setPolicyConsensus("ANY");
    setPolicyPriority(0);
    setPolicyActive(true);
    setPolicyConditions([]);
    setEditingId(null);
    setShowHelpPanel(false);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
    fetchContractInterfaces();
  };
  
  const fetchContractInterfaces = async () => {
    try {
      const res: any = await apiFetch("/contract-interfaces?limit=50", { token: token! });
      setContractInterfaces(res.data || []);
    } catch { /* silently fail */ }
  };
  
  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setPolicyName(p.name);
    setPolicyPriority(p.priority);
    setPolicyActive(p.active);

    const isTurnkey = p.conditions && !Array.isArray(p.conditions) && (p.conditions as any).isTurnkey;
    if (isTurnkey) {
      const condObj = p.conditions as any;
      setPolicyDescription(condObj.description || "");
      const jsonVal = {
        effect: p.effect,
        consensus: p.consensus !== "ANY" ? p.consensus : undefined,
        condition: condObj.condition || undefined,
      };
      setPolicyJson(JSON.stringify(jsonVal, null, 2));
    } else {
      // Legacy structured policy — convert to JSON editor format
      setPolicyDescription("");
      const legacyConditions = (p.conditions || []).map((c: any) => {
        const clean: any = { type: c.type, field: c.field };
        if (c.values) clean.values = c.values;
        else if (c.value !== undefined) clean.value = c.value;
        return clean;
      });
      setPolicyJson(JSON.stringify({
        effect: p.effect,
        consensus: p.consensus,
        conditions: legacyConditions
      }, null, 2));
    }
    setShowModal(true);
  };

  const addCondition = () => {
    setPolicyConditions([...policyConditions, { type: "EQUAL", field: "params.chain", value: "" }]);
  };

  const removeCondition = (idx: number) => {
    setPolicyConditions(policyConditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx: number, field: keyof Condition, value: any) => {
    const updated = [...policyConditions];
    if (field === "type") {
      const needsValues = ["INCLUDE", "NOT_INCLUDE", "WINDOW"].includes(value);
      updated[idx] = { ...updated[idx], type: value, value: needsValues ? undefined : (updated[idx].value ?? ""), values: needsValues ? (updated[idx].values ?? []) : undefined };
    } else if (field === "value") {
      updated[idx] = { ...updated[idx], value };
    } else if (field === "values") {
      updated[idx] = { ...updated[idx], values: typeof value === "string" ? value.split(",").map((s: string) => s.trim()) : value };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setPolicyConditions(updated);
  };

  const savePolicy = async () => {
    if (!policyName.trim()) { addToast("Name required", "error"); return; }
    setSaving(true);
    try {
      let jsonParsed;
      try {
        jsonParsed = JSON.parse(policyJson);
      } catch (e) {
        throw new Error("Invalid JSON rule format");
      }
      if (!jsonParsed.effect) {
        throw new Error("JSON rule must specify 'effect' (EFFECT_ALLOW or EFFECT_DENY)");
      }

      const body: any = {
        name: policyName.trim(),
        active: policyActive,
        priority: policyPriority,
        effect: jsonParsed.effect,
        consensus: jsonParsed.consensus || "ANY",
        conditions: {
          condition: jsonParsed.condition || "",
          description: policyDescription.trim(),
          isTurnkey: true
        },
      };

      if (editingId) {
        await apiFetch(`/policies/${editingId}`, { method: "PATCH", body: JSON.stringify(body), token: token! });
        addToast("Policy updated", "success");
      } else {
        await apiFetch("/policies", { method: "POST", body: JSON.stringify(body), token: token! });
        addToast("Policy created", "success");
      }
      setShowModal(false);
      resetForm();
      fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaving(false); }
  };

  const deletePolicy = async (id: string) => {
    try {
      await apiFetch(`/policies/${id}`, { method: "DELETE", token: token! });
      addToast("Policy deleted", "success"); fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const consensusLabel: Record<string, string> = {
    ANY: "Any match", ALL: "All must match", REQUIRES_CONSENSUS: "Requires approval",
  };

  const columns = [
    { key: "name", header: "Policy", render: (p: Policy) => (
      <div>
        <p className="font-medium text-sm text-slate-900 dark:text-white">{p.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>
            {p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}
          </span>
          <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100">
            {consensusLabel[p.consensus] || p.consensus}
          </span>
          {p.active === false && (
            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Inactive</span>
          )}
        </div>
      </div>
    )},
    { key: "conditions", header: "Conditions / Expressions", render: (p: Policy) => {
      const isTurnkey = p.conditions && !Array.isArray(p.conditions) && p.conditions.isTurnkey;
      if (isTurnkey) {
        return (
          <div className="space-y-0.5">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-[240px]">{p.conditions.condition || "always"}</p>
            {p.conditions.description && (
              <p className="text-[10px] text-slate-400 italic truncate max-w-[240px]">{p.conditions.description}</p>
            )}
          </div>
        );
      }
      return (
        <div className="space-y-0.5">
          {(p.conditions || []).length === 0 ? (
            <span className="text-[11px] text-slate-400 italic">No conditions (always matches)</span>
          ) : (p.conditions || []).slice(0, 3).map((c: any, i: number) => (
            <p key={i} className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-[240px]">{humanizeCondition(c as Condition)}</p>
          ))}
          {(p.conditions || []).length > 3 && <p className="text-[10px] text-slate-400">+{p.conditions.length - 3} more</p>}
        </div>
      );
    }},
    { key: "priority", header: "Priority", render: (p: Policy) => <span className="text-sm font-mono text-slate-600">{p.priority}</span> },
    { key: "createdAt", header: "Created", render: (p: Policy) => <span className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
    { key: "id", header: "ID", render: (p: Policy) => (
      <div className="flex items-center gap-1"><span className="font-mono text-[11px] text-slate-400">{p.id.slice(0, 4)}····{p.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(p.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div>
    )},
    { key: "actions", header: "", render: (p: Policy) => (
      <div className="flex items-center gap-0.5">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deletePolicy(p.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
      </div>
    )},
  ];

  const needsValuesInput = (type: string) => ["INCLUDE", "NOT_INCLUDE", "WINDOW"].includes(type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-sm text-slate-500 mt-0.5">Transaction authorization engine — define who can do what, when, and how.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> New Policy
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search policies..." className="pl-9 text-sm" />
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
                data={policies.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))}
                loading={false}
                emptyMessage="No policies found. Create your first policy to secure transactions."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Policy" : "New Policy"} size={showHelpPanel ? "xl" : "md"}>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex gap-6">
            {/* Form Side */}
            <div className="flex-1 space-y-4 min-w-[320px]">

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Name</label>
                <Input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Treasury Spending Limit" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
                <Input value={policyDescription} onChange={e => setPolicyDescription(e.target.value)} placeholder="e.g. Allow developers to sign on specific wallets" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">JSON Rule</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowContractRefs(!showContractRefs); if (!showContractRefs) fetchContractInterfaces(); }}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium underline flex items-center gap-1"
                    >
                      <FileCode className="w-3 h-3" />
                      Contract Refs
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHelpPanel(!showHelpPanel)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-semibold underline flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {showHelpPanel ? "Hide Examples" : "Policy Examples"}
                    </button>
                  </div>
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-900 shadow-inner">
                  <div className="flex justify-between items-center bg-slate-850 px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono text-slate-400">
                    <span>JSON Editor</span>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase font-semibold">CEL format</span>
                  </div>
                  <textarea
                    value={policyJson}
                    onChange={e => setPolicyJson(e.target.value)}
                    rows={12}
                    className="w-full bg-transparent p-3 outline-none resize-none font-mono text-xs leading-relaxed text-emerald-400 dark:text-emerald-300 focus:ring-0"
                    placeholder="Type or paste your JSON policy here..."
                  />
                </div>
              </div>

              {showContractRefs && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600">Uploaded Contract Interfaces</p>
                    <button onClick={() => setShowContractRefs(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  {contractInterfaces.length === 0 ? (
                    <p className="text-[11px] text-slate-400">No contract interfaces uploaded yet. <a href="/contract-interfaces" className="text-brand-600 underline" target="_blank">Upload an ABI</a> to use function references in policies.</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {contractInterfaces.map((ci: any) => {
                        const functions = Array.isArray(ci.abi) ? ci.abi.filter((a: any) => a.type === "function") : [];
                        return (
                          <div key={ci.id} className="text-xs border border-slate-200 bg-white rounded p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-slate-700">{ci.name}</span>
                              {ci.address && <code className="text-[9px] font-mono text-slate-400">{ci.address.slice(0, 6)}...</code>}
                            </div>
                            {functions.length > 0 && (
                              <div className="space-y-0.5">
                                {functions.map((fn: any, i: number) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      const snippet = `eth.tx.to == '${ci.address || "<ADDRESS>"}' && eth.tx.function_name == '${fn.name}'`;
                                      const current = policyJson.trim();
                                      if (current) {
                                        try {
                                          const parsed = JSON.parse(current);
                                          parsed.condition = parsed.condition ? `${parsed.condition} && ${snippet}` : snippet;
                                          setPolicyJson(JSON.stringify(parsed, null, 2));
                                        } catch {
                                          setPolicyJson(`${current}\n// ${snippet}`);
                                        }
                                      }
                                    }}
                                    className="block w-full text-left text-[10px] font-mono text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded px-1 py-0.5"
                                  >
                                    {fn.name}({fn.inputs ? fn.inputs.map((i: any) => i.type).join(", ") : ""})
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Policy Status</span>
                  <span className="text-[10px] text-slate-400">Toggle whether this policy is active in the engine</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPolicyActive(!policyActive)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${policyActive ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${policyActive ? "left-4" : "left-0.5"}`} />
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1">Cancel</Button>
                <Button onClick={savePolicy} disabled={saving} className="flex-1">
                  {saving ? "Saving..." : editingId ? "Update Policy" : "Create Policy"}
                </Button>
              </div>
            </div>

            {/* Help/Examples Sidebar */}
            {showHelpPanel && (
              <div className="w-[360px] border-l border-slate-100 pl-6 space-y-4 shrink-0 flex flex-col">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-slate-900">Policy Presets</span>
                    <span className="text-[10px] text-slate-400">Click Use to quickly load into the editor</span>
                  </div>
                  <button onClick={() => setShowHelpPanel(false)} className="text-slate-400 hover:text-slate-600 rounded p-1 hover:bg-slate-50">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-1">
                  {POLICY_EXAMPLES.map((ex, idx) => (
                    <div key={idx} className="p-3 border border-slate-100 rounded-lg hover:border-brand-200 hover:bg-slate-50/50 transition-all space-y-2 group">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-semibold text-xs text-slate-800 leading-tight group-hover:text-brand-700 transition-colors">{ex.title}</h4>
                        <button
                          type="button"
                          onClick={() => {
                            setPolicyName(ex.title);
                            setPolicyDescription(ex.description);
                            setPolicyJson(JSON.stringify(ex.json, null, 2));
                            addToast("Loaded preset template", "success");
                          }}
                          className="text-[10px] text-brand-600 hover:text-brand-700 font-bold uppercase tracking-wider shrink-0 bg-brand-50 group-hover:bg-brand-100 px-2 py-0.5 rounded transition-all"
                        >
                          Use
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">{ex.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
