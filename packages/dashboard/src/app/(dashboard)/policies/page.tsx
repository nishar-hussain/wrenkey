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
import { Plus, Search, Copy, Trash2, Edit3, X, HelpCircle, FileCode, Code2, Layout } from "lucide-react";

interface Policy {
  id: string;
  name: string;
  effect: string;
  conditions: any;
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

// ─── Visual builder types ────────────────────────────────────────────

type ConsensusType = "anyone" | "specific_user" | "tagged_users" | "root_users" | "multiple_tagged" | "credential_type";

interface VisualConsensus {
  type: ConsensusType;
  userId?: string;
  tagName?: string;
  requiredCount?: number;
  credentialType?: string;
}

interface ConditionRule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

const ACTIVITY_RESOURCES = [
  { value: "WALLET", label: "Wallet" },
  { value: "USER", label: "User" },
  { value: "POLICY", label: "Policy" },
  { value: "PRIVATE_KEY", label: "Private Key" },
  { value: "CREDENTIAL", label: "Credential" },
  { value: "ORGANIZATION", label: "Organization" },
  { value: "WEBHOOK_ENDPOINT", label: "Webhook" },
  { value: "CONTRACT_INTERFACE", label: "Contract Interface" },
];

const ACTIVITY_ACTIONS = [
  { value: "CREATE", label: "Create" },
  { value: "SIGN", label: "Sign" },
  { value: "DELETE", label: "Delete" },
  { value: "UPDATE", label: "Update" },
  { value: "EXPORT", label: "Export" },
  { value: "IMPORT", label: "Import" },
];

const CONDITION_FIELD_GROUPS = [
  {
    label: "Activity",
    options: [
      { value: "activity.resource", label: "Activity Resource", type: "select", selectOptions: ACTIVITY_RESOURCES },
      { value: "activity.action", label: "Activity Action", type: "select", selectOptions: ACTIVITY_ACTIONS },
      { value: "activity.type", label: "Activity Type", type: "text" },
      { value: "activity.kind", label: "Activity Kind", type: "text" },
    ],
  },
  {
    label: "Transaction",
    options: [
      { value: "eth.tx.to", label: "Contract / Recipient Address", type: "text" },
      { value: "eth.tx.chain_id", label: "Chain ID", type: "text" },
      { value: "eth.tx.function_name", label: "Function Name", type: "text" },
      { value: "eth.tx.function_signature", label: "Function Selector", type: "text" },
      { value: "eth.tx.value", label: "Transaction Value (wei)", type: "number" },
    ],
  },
  {
    label: "Wallet",
    options: [
      { value: "wallet.id", label: "Wallet ID", type: "text" },
      { value: "wallet.ownerType", label: "Wallet Type", type: "text" },
    ],
  },
  {
    label: "User",
    options: [
      { value: "user.id", label: "User ID", type: "text" },
      { value: "user.role", label: "User Role", type: "text" },
      { value: "user.tags", label: "User Tag", type: "text" },
    ],
  },
];

const OPERATORS = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
  { value: "in", label: "is one of" },
  { value: "contains", label: "contains" },
];

function buildConsensusCel(c: VisualConsensus): string {
  switch (c.type) {
    case "anyone": return "";
    case "specific_user": return c.userId ? `approvers.any(user, user.id == '${c.userId}')` : "";
    case "tagged_users": return c.tagName ? `approvers.any(user, user.tags.contains('${c.tagName}'))` : "";
    case "root_users": return "approvers.any(user, user.role == 'ORG_ADMIN')";
    case "multiple_tagged": return c.tagName && c.requiredCount ? `approvers.filter(user, user.tags.contains('${c.tagName}')).count() >= ${c.requiredCount}` : "";
    case "credential_type": return c.credentialType ? `credentials.any(credential, credential.type == '${c.credentialType}')` : "";
    default: return "";
  }
}

function buildConditionCel(rules: ConditionRule[]): string {
  if (rules.length === 0) return "";
  return rules.map(r => {
    if (r.operator === "contains") {
      return `${r.field}.contains('${r.value}')`;
    }
    if (r.operator === "in") {
      return `'${r.value}' in ${r.field}`;
    }
    return `${r.field} ${r.operator} '${r.value}'`;
  }).join(" && ");
}

function jsonToVisual(policy: Policy): { consensus: VisualConsensus; rules: ConditionRule[] } {
  const consensus: VisualConsensus = { type: "anyone" };
  const rules: ConditionRule[] = [];
  const isTurnkey = policy.conditions && !Array.isArray(policy.conditions) && policy.conditions.isTurnkey;

  if (isTurnkey) {
    const cel = policy.consensus || "";
    if (cel.includes("user.id ==")) consensus.type = "specific_user";
    else if (cel.includes("user.tags.contains") && cel.includes(".count()")) {
      consensus.type = "multiple_tagged";
      const countMatch = cel.match(/\.count\(\)\s*>=\s*(\d+)/);
      if (countMatch) consensus.requiredCount = parseInt(countMatch[1]);
      const tagMatch = cel.match(/contains\('([^']+)'\)/);
      if (tagMatch) consensus.tagName = tagMatch[1];
    }
    else if (cel.includes("user.tags.contains")) {
      consensus.type = "tagged_users";
      const tagMatch = cel.match(/contains\('([^']+)'\)/);
      if (tagMatch) consensus.tagName = tagMatch[1];
    }
    else if (cel.includes("ORG_ADMIN")) consensus.type = "root_users";
    else if (cel.includes("credential.type")) {
      consensus.type = "credential_type";
      const ctMatch = cel.match(/credential\.type\s*==\s*'([^']+)'/);
      if (ctMatch) consensus.credentialType = ctMatch[1];
    } else if (cel.length > 0) consensus.type = "specific_user";

    const condCel = (policy.conditions as any).condition || "";
    if (condCel) {
      const parts = condCel.split(" && ");
      for (const part of parts) {
        const trimmed = part.trim();
        const containsMatch = trimmed.match(/^([\w.]+)\.contains\('([^']+)'\)$/);
        if (containsMatch) {
          rules.push({ id: crypto.randomUUID(), field: containsMatch[1], operator: "contains", value: containsMatch[2] });
          continue;
        }
        const inMatch = trimmed.match(/^'([^']+)'\s+in\s+([\w.]+)$/);
        if (inMatch) {
          rules.push({ id: crypto.randomUUID(), field: inMatch[2], operator: "in", value: inMatch[1] });
          continue;
        }
        const cmpMatch = trimmed.match(/^([\w.]+)\s*(==|!=|>|<|>=|<=)\s*'([^']+)'$/);
        if (cmpMatch) {
          rules.push({ id: crypto.randomUUID(), field: cmpMatch[1], operator: cmpMatch[2], value: cmpMatch[3] });
        }
      }
    }
  }

  return { consensus, rules };
}

// ─── Presets ──────────────────────────────────────────────────────────

const POLICY_PRESETS = [
  { label: "Allow user to create wallets", effect: "EFFECT_ALLOW", consensus: { type: "specific_user" as ConsensusType, userId: "" }, rules: [{ id: "p1", field: "activity.resource", operator: "==", value: "WALLET" }, { id: "p2", field: "activity.action", operator: "==", value: "CREATE" }] },
  { label: "Allow user to sign transactions", effect: "EFFECT_ALLOW", consensus: { type: "specific_user" as ConsensusType, userId: "" }, rules: [{ id: "p1", field: "activity.action", operator: "==", value: "SIGN" }] },
  { label: "Tag-based signing", effect: "EFFECT_ALLOW", consensus: { type: "tagged_users" as ConsensusType, tagName: "" }, rules: [{ id: "p1", field: "activity.action", operator: "==", value: "SIGN" }] },
  { label: "Two-person approval (tag)", effect: "EFFECT_ALLOW", consensus: { type: "multiple_tagged" as ConsensusType, tagName: "", requiredCount: 2 }, rules: [{ id: "p1", field: "activity.action", operator: "==", value: "SIGN" }] },
  { label: "Restrict to contract + function", effect: "EFFECT_ALLOW", consensus: { type: "specific_user" as ConsensusType, userId: "" }, rules: [{ id: "p1", field: "eth.tx.to", operator: "==", value: "" }, { id: "p2", field: "eth.tx.function_name", operator: "==", value: "" }] },
  { label: "Testnet only", effect: "EFFECT_ALLOW", consensus: { type: "specific_user" as ConsensusType, userId: "" }, rules: [{ id: "p1", field: "eth.tx.chain_id", operator: "==", value: "11155111" }] },
  { label: "Passkey-only signing", effect: "EFFECT_ALLOW", consensus: { type: "credential_type" as ConsensusType, credentialType: "CREDENTIAL_TYPE_WEBAUTHN_AUTHENTICATOR" }, rules: [{ id: "p1", field: "activity.action", operator: "==", value: "SIGN" }] },
  { label: "Deny all deletes", effect: "EFFECT_DENY", consensus: { type: "anyone" as ConsensusType }, rules: [{ id: "p1", field: "activity.action", operator: "==", value: "DELETE" }] },
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  // Form
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyEffect, setPolicyEffect] = useState<"EFFECT_ALLOW" | "EFFECT_DENY">("EFFECT_ALLOW");
  const [policyActive, setPolicyActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Visual builder
  const [consensus, setConsensus] = useState<VisualConsensus>({ type: "anyone" });
  const [conditions, setConditions] = useState<ConditionRule[]>([]);

  // JSON editor (advanced)
  const [policyJson, setPolicyJson] = useState("");

  const [contractInterfaces, setContractInterfaces] = useState<any[]>([]);

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

  const fetchContractInterfaces = async () => {
    try {
      const res: any = await apiFetch("/contract-interfaces?limit=100", { token: token! });
      setContractInterfaces(res.data || []);
    } catch { /* silently fail */ }
  };

  const resetForm = () => {
    setPolicyName("");
    setPolicyDescription("");
    setPolicyEffect("EFFECT_ALLOW");
    setPolicyActive(true);
    setConsensus({ type: "anyone" });
    setConditions([]);
    setPolicyJson("");
    setShowAdvanced(false);
    setShowHelpPanel(false);
    setEditingId(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); fetchContractInterfaces(); };

  const openEdit = (p: Policy) => {
    setEditingId(p.id);
    setPolicyName(p.name);
    setPolicyEffect(p.effect as any);
    setPolicyActive(p.active);

    const isTurnkey = p.conditions && !Array.isArray(p.conditions) && p.conditions.isTurnkey;
    if (isTurnkey) {
      setPolicyDescription((p.conditions as any).description || "");
      const visual = jsonToVisual(p);
      setConsensus(visual.consensus);
      setConditions(visual.rules);
      // Also populate JSON for advanced mode
      const jsonVal: any = { effect: p.effect };
      if (p.consensus && p.consensus !== "ANY") jsonVal.consensus = p.consensus;
      const cond = (p.conditions as any).condition;
      if (cond) jsonVal.condition = cond;
      setPolicyJson(JSON.stringify(jsonVal, null, 2));
    } else {
      // Legacy — migrate to visual
      setConsensus({ type: "anyone" });
      setConditions([]);
      setPolicyJson(JSON.stringify({ effect: p.effect, conditions: p.conditions }, null, 2));
    }
    setShowModal(true);
    fetchContractInterfaces();
  };

  const addRule = () => {
    setConditions([...conditions, { id: crypto.randomUUID(), field: "activity.resource", operator: "==", value: "" }]);
  };

  const removeRule = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const updateRule = (id: string, key: keyof ConditionRule, value: string) => {
    setConditions(conditions.map(c => c.id === id ? { ...c, [key]: value } : c));
  };

  const applyPreset = (preset: typeof POLICY_PRESETS[number]) => {
    setPolicyEffect(preset.effect as "EFFECT_ALLOW" | "EFFECT_DENY");
    setConsensus(structuredClone(preset.consensus));
    setConditions(structuredClone(preset.rules));
    setShowHelpPanel(false);
    addToast(`"${preset.label}" preset loaded`, "success");
  };

  const insertContractRef = (ci: any, fn: any) => {
    const newRules = [...conditions,
      { id: crypto.randomUUID(), field: "eth.tx.to", operator: "==", value: ci.address || "" },
      { id: crypto.randomUUID(), field: "eth.tx.function_name", operator: "==", value: fn.name },
    ];
    setConditions(newRules);
    addToast(`Added ${fn.name} reference`, "success");
  };

  const savePolicy = async () => {
    if (!policyName.trim()) { addToast("Name required", "error"); return; }
    setSaving(true);
    try {
      let effect = policyEffect;
      let consensusStr = "";
      let conditionStr = "";

      if (showAdvanced) {
        let parsed: any;
        try { parsed = JSON.parse(policyJson); } catch { throw new Error("Invalid JSON"); }
        if (!parsed.effect) throw new Error("effect required");
        effect = parsed.effect;
        consensusStr = parsed.consensus || "";
        conditionStr = parsed.condition || "";
      } else {
        consensusStr = buildConsensusCel(consensus);
        conditionStr = buildConditionCel(conditions);
      }

      const body: any = {
        name: policyName.trim(),
        active: policyActive,
        priority: 0,
        effect,
        consensus: consensusStr || "ANY",
        conditions: { condition: conditionStr, description: policyDescription.trim(), isTurnkey: true },
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

  const getFieldOption = (value: string) => {
    for (const group of CONDITION_FIELD_GROUPS) {
      const opt = group.options.find(o => o.value === value);
      if (opt) return opt;
    }
    return null;
  };

  const columns = [
    { key: "name", header: "Policy", render: (p: Policy) => (
      <div>
        <p className="font-medium text-sm text-slate-900 dark:text-white">{p.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>
            {p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}
          </span>
          {p.active === false && (
            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Inactive</span>
          )}
        </div>
      </div>
    )},
    { key: "conditions", header: "Conditions", render: (p: Policy) => {
      const isTurnkey = p.conditions && !Array.isArray(p.conditions) && p.conditions.isTurnkey;
      if (isTurnkey) {
        return <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono truncate max-w-[260px]">{p.conditions.condition || "always"}</p>;
      }
      return <span className="text-[11px] text-slate-400">Legacy format</span>;
    }},
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-sm text-slate-500 mt-0.5">Define who can do what — visually or with raw JSON.</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" /> New Policy</Button>
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
              <Table columns={columns} data={policies.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))} loading={false} emptyMessage="No policies found." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Policy" : "New Policy"} size="xl">
        <div className="max-h-[75vh] overflow-y-auto pr-1">
          <div className="flex gap-6">
            {/* ─── Left Column: Form ─── */}
            <div className="flex-1 space-y-5 min-w-[380px]">

              {/* Name & Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Name</label>
                <Input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Treasury Spending Limit" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Description (optional)</label>
                <Input value={policyDescription} onChange={e => setPolicyDescription(e.target.value)} placeholder="Human-readable summary" />
              </div>

              {/* Effect */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">Effect</label>
                <div className="flex gap-2">
                  {(["EFFECT_ALLOW", "EFFECT_DENY"] as const).map(e => (
                    <button key={e} type="button" onClick={() => setPolicyEffect(e)}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border-2 transition-all ${
                        policyEffect === e
                          ? e === "EFFECT_ALLOW" ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {e === "EFFECT_ALLOW" ? "Allow" : "Deny"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Builder Mode</span>
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => setShowAdvanced(false)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${!showAdvanced ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    <Layout className="w-3 h-3 inline mr-1" />Visual
                  </button>
                  <button onClick={() => setShowAdvanced(true)} className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${showAdvanced ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    <Code2 className="w-3 h-3 inline mr-1" />JSON
                  </button>
                </div>
              </div>

              {!showAdvanced ? (
                <>
                  {/* ─── Consensus (Who) ─── */}
                  <div className="space-y-3 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Who can act</p>
                    <select value={consensus.type} onChange={e => setConsensus({ type: e.target.value as ConsensusType })}
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                      <option value="anyone">Anyone in the organization</option>
                      <option value="specific_user">Specific user</option>
                      <option value="tagged_users">Users with a tag</option>
                      <option value="root_users">Root users only</option>
                      <option value="multiple_tagged">Multiple users with same tag</option>
                      <option value="credential_type">Specific credential type</option>
                    </select>

                    {consensus.type === "specific_user" && (
                      <Input value={consensus.userId || ""} onChange={e => setConsensus({ ...consensus, userId: e.target.value })}
                        placeholder="Paste user ID here" className="text-xs font-mono" />
                    )}
                    {consensus.type === "tagged_users" && (
                      <Input value={consensus.tagName || ""} onChange={e => setConsensus({ ...consensus, tagName: e.target.value })}
                        placeholder="Tag name (e.g. engineering)" className="text-xs" />
                    )}
                    {consensus.type === "multiple_tagged" && (
                      <div className="flex gap-2">
                        <Input value={consensus.tagName || ""} onChange={e => setConsensus({ ...consensus, tagName: e.target.value })}
                          placeholder="Tag name" className="text-xs flex-1" />
                        <Input value={consensus.requiredCount?.toString() || "2"} onChange={e => setConsensus({ ...consensus, requiredCount: parseInt(e.target.value) || 2 })}
                          type="number" placeholder="Count" className="text-xs w-20" />
                      </div>
                    )}
                    {consensus.type === "credential_type" && (
                      <select value={consensus.credentialType || ""} onChange={e => setConsensus({ ...consensus, credentialType: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="">Select credential type...</option>
                        <option value="CREDENTIAL_TYPE_WEBAUTHN_AUTHENTICATOR">Passkey (WebAuthn)</option>
                        <option value="CREDENTIAL_TYPE_API_KEY_P256">API Key P-256</option>
                        <option value="CREDENTIAL_TYPE_API_KEY_SECP256K1">API Key SECP256K1</option>
                        <option value="CREDENTIAL_TYPE_EMAIL">Email OTP</option>
                        <option value="CREDENTIAL_TYPE_OAUTH">OAuth</option>
                      </select>
                    )}
                  </div>

                  {/* ─── Conditions (What) ─── */}
                  <div className="space-y-3 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Conditions</p>
                      <Button size="sm" variant="ghost" onClick={addRule} className="h-7 text-xs text-brand-600 hover:text-brand-700">+ Add Rule</Button>
                    </div>

                    {conditions.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-lg">
                        No conditions — matches everything. Add rules to restrict when this policy applies.
                      </p>
                    )}

                    {conditions.map((rule, idx) => {
                      const fieldOpt = getFieldOption(rule.field);
                      const isSelect = fieldOpt?.type === "select" && fieldOpt.selectOptions;
                      return (
                        <div key={rule.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2 group">
                          <span className="text-[10px] text-slate-400 shrink-0 w-5">{idx + 1}</span>
                          <select value={rule.field} onChange={e => updateRule(rule.id, "field", e.target.value)}
                            className="flex-1 text-xs border rounded px-2 py-1.5 bg-slate-50 min-w-0">
                            {CONDITION_FIELD_GROUPS.map(g => (
                              <optgroup key={g.label} label={g.label}>
                                {g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </optgroup>
                            ))}
                          </select>
                          <select value={rule.operator} onChange={e => updateRule(rule.id, "operator", e.target.value)}
                            className="text-xs border rounded px-2 py-1.5 bg-slate-50 w-24">
                            {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {isSelect ? (
                            <select value={rule.value} onChange={e => updateRule(rule.id, "value", e.target.value)}
                              className="flex-1 text-xs border rounded px-2 py-1.5 bg-slate-50 min-w-0">
                              <option value="">Select...</option>
                              {fieldOpt!.selectOptions!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <Input value={rule.value} onChange={e => updateRule(rule.id, "value", e.target.value)}
                              placeholder={fieldOpt?.type === "number" ? "0" : "value"}
                              className="flex-1 h-7 text-xs font-mono" />
                          )}
                          <button onClick={() => removeRule(rule.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    {/* Live preview */}
                    <div className="mt-2 p-2 bg-slate-900 rounded-lg">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider">Generated CEL</span>
                      <code className="block text-[10px] text-emerald-400 font-mono mt-0.5 break-all">
                        {buildConditionCel(conditions) || "(always matches)"}
                      </code>
                    </div>
                  </div>
                </>
              ) : (
                /* ─── JSON Editor ─── */
                <div className="space-y-1">
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-900 shadow-inner">
                    <div className="flex justify-between items-center bg-slate-850 px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono text-slate-400">
                      <span>JSON Editor</span>
                      <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase font-semibold">CEL format</span>
                    </div>
                    <textarea value={policyJson} onChange={e => setPolicyJson(e.target.value)} rows={14}
                      className="w-full bg-transparent p-3 outline-none resize-none font-mono text-xs leading-relaxed text-emerald-400 focus:ring-0"
                      placeholder='{"effect":"EFFECT_ALLOW","consensus":"approvers.any(user, user.id == \u0027<ID>\u0027)","condition":"activity.action == \u0027SIGN\u0027"}' />
                  </div>
                </div>
              )}

              {/* Active Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-700">Policy Status</span>
                  <span className="text-[10px] text-slate-400">Toggle whether this policy is active</span>
                </div>
                <button type="button" onClick={() => setPolicyActive(!policyActive)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${policyActive ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${policyActive ? "left-4" : "left-0.5"}`} />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1">Cancel</Button>
                <Button onClick={savePolicy} disabled={saving} className="flex-1">
                  {saving ? "Saving..." : editingId ? "Update Policy" : "Create Policy"}
                </Button>
              </div>
            </div>

            {/* ─── Right Column: Help ─── */}
            {!showAdvanced && (
              <div className="w-[300px] border-l border-slate-100 pl-6 space-y-4 shrink-0 flex flex-col">
                <button onClick={() => setShowHelpPanel(!showHelpPanel)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold underline flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showHelpPanel ? "Hide Presets" : "Policy Presets"}
                </button>

                {showHelpPanel && (
                  <div className="space-y-2 overflow-y-auto max-h-[50vh] pr-1">
                    {POLICY_PRESETS.map((preset, idx) => (
                      <button key={idx} onClick={() => applyPreset(preset)}
                        className="w-full text-left p-2.5 border border-slate-100 rounded-lg hover:border-brand-200 hover:bg-brand-50/50 transition-all">
                        <p className="text-xs font-semibold text-slate-800">{preset.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{preset.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"} · {preset.consensus.type.replace("_", " ")}</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Contract Interface References */}
                <div className="border-t border-slate-100 pt-4 mt-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Contract Interfaces</p>
                  {contractInterfaces.length === 0 ? (
                    <p className="text-[11px] text-slate-400">
                      No interfaces. <a href="/contract-interfaces" className="text-brand-600 underline" target="_blank">Upload one</a> first.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {contractInterfaces.map(ci => {
                        const fns = Array.isArray(ci.abi) ? ci.abi.filter((a: any) => a.type === "function") : [];
                        return (
                          <div key={ci.id} className="border border-slate-100 rounded-lg p-2 bg-white">
                            <p className="text-[11px] font-semibold text-slate-700">{ci.name}</p>
                            {ci.address && <code className="text-[9px] text-slate-400 font-mono">{ci.address.slice(0, 8)}...</code>}
                            {fns.slice(0, 5).map((fn: any, i: number) => (
                              <button key={i} onClick={() => insertContractRef(ci, fn)}
                                className="block w-full text-left text-[10px] font-mono text-brand-600 hover:text-brand-700 hover:bg-brand-50 rounded px-1 py-0.5 mt-0.5">
                                {fn.name}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
