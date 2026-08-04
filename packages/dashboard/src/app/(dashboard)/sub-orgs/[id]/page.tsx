"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Layers, Copy, ChevronRight, Users, Wallet, Key, Activity, Shield, Clock, Plus, Edit3, Trash2 } from "lucide-react";

interface SubOrgDetail {
  id: string;
  name: string;
  rootUser: { id: string; email: string; name: string } | null;
  userCount: number;
  walletCount: number;
  policyCount: number;
  privateKeyCount: number;
  activityCount: number;
  createdAt: string;
  parentOrgId: string;
  wallets?: { walletId: string; name: string; status: string; tags: string[]; accounts: any[] }[];
}

export default function SubOrgDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  const [detail, setDetail] = useState<SubOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"users" | "wallets" | "privateKeys" | "activities" | "policies">("users");

  const [wallets, setWallets] = useState<any[]>([]);
  const [walletsTotal, setWalletsTotal] = useState(0);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletsOffset, setWalletsOffset] = useState(0);

  const [users, setUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersOffset, setUsersOffset] = useState(0);

  const [privateKeys, setPrivateKeys] = useState<any[]>([]);
  const [privateKeysTotal, setPrivateKeysTotal] = useState(0);
  const [privateKeysLoading, setPrivateKeysLoading] = useState(false);
  const [privateKeysOffset, setPrivateKeysOffset] = useState(0);

  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesOffset, setActivitiesOffset] = useState(0);

  const [policies, setPolicies] = useState<any[]>([]);
  const [policiesTotal, setPoliciesTotal] = useState(0);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesOffset, setPoliciesOffset] = useState(0);

  // Policy create/edit modal state
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyActive, setPolicyActive] = useState(true);
  const [policyJson, setPolicyJson] = useState("");
  const [policySaving, setPolicySaving] = useState(false);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } }, [isAuthenticated, router]);
  // Read URL hash on mount to activate the correct tab (e.g. #activities)
  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as typeof activeTab;
    const validTabs: Array<typeof activeTab> = ["users", "wallets", "privateKeys", "activities", "policies"];
    if (validTabs.includes(hash)) setActiveTab(hash);
  }, []);


  const fetchDetail = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/settings`, { token });
      setDetail(res);
    } catch { addToast("Failed to load sub-org details", "error"); router.push("/sub-orgs"); }
    finally { setLoading(false); }
  }, [token, id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const fetchWallets = async () => {
    setWalletsLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/wallets?limit=20&offset=${walletsOffset}`, { token: token! });
      setWallets(res.data || []); setWalletsTotal(res.total || 0);
    } catch { addToast("Failed to load wallets", "error"); } finally { setWalletsLoading(false); }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/users?limit=20&offset=${usersOffset}`, { token: token! });
      setUsers(res.data || []); setUsersTotal(res.total || 0);
    } catch { addToast("Failed to load users", "error"); } finally { setUsersLoading(false); }
  };

  const fetchPrivateKeys = async () => {
    setPrivateKeysLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/private-keys?limit=20&offset=${privateKeysOffset}`, { token: token! });
      setPrivateKeys(res.data || []); setPrivateKeysTotal(res.total || 0);
    } catch { addToast("Failed to load private keys", "error"); } finally { setPrivateKeysLoading(false); }
  };

  const fetchActivities = async () => {
    setActivitiesLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/activities?limit=20&offset=${activitiesOffset}`, { token: token! });
      setActivities(res.data || []); setActivitiesTotal(res.total || 0);
    } catch { addToast("Failed to load activities", "error"); } finally { setActivitiesLoading(false); }
  };

  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/policies?limit=20&offset=${policiesOffset}`, { token: token! });
      setPolicies(res.data || []); setPoliciesTotal(res.total || 0);
    } catch { addToast("Failed to load policies", "error"); } finally { setPoliciesLoading(false); }
  };

  const resetPolicyForm = () => {
    setPolicyName(""); setPolicyDescription(""); setPolicyActive(true); setPolicyJson(""); setEditingPolicyId(null);
  };

  const openCreatePolicy = () => {
    resetPolicyForm();
    setPolicyJson(JSON.stringify({ effect: "EFFECT_ALLOW" }, null, 2));
    setShowPolicyModal(true);
  };

  const openEditPolicy = (p: any) => {
    setEditingPolicyId(p.id);
    setPolicyName(p.name);
    setPolicyActive(p.active !== false);
    setPolicyDescription((p.conditions as any)?.description || "");
    const body: any = { effect: p.effect };
    if (p.consensus && p.consensus !== "ANY") body.consensus = p.consensus;
    const cond = (p.conditions as any)?.condition;
    if (cond) body.condition = cond;
    setPolicyJson(JSON.stringify(body, null, 2));
    setShowPolicyModal(true);
  };

  const savePolicy = async () => {
    if (!policyName.trim()) { addToast("Name required", "error"); return; }
    setPolicySaving(true);
    try {
      let parsed: any;
      try { parsed = JSON.parse(policyJson); } catch { throw new Error("Invalid JSON"); }
      if (!parsed.effect) throw new Error("effect required");

      const body: any = {
        name: policyName.trim(),
        active: policyActive,
        priority: 0,
        effect: parsed.effect,
        consensus: parsed.consensus || "ANY",
        conditions: {
          condition: parsed.condition || "",
          description: policyDescription.trim(),
          isTurnkey: true,
        },
        description: policyDescription.trim(),
      };

      if (editingPolicyId) {
        await apiFetch(`/sub-orgs/${id}/policies/${editingPolicyId}`, { method: "PATCH", body: JSON.stringify(body), token: token! });
        addToast("Policy updated", "success");
      } else {
        await apiFetch(`/sub-orgs/${id}/policies`, { method: "POST", body: JSON.stringify(body), token: token! });
        addToast("Policy created", "success");
      }
      setShowPolicyModal(false);
      resetPolicyForm();
      fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setPolicySaving(false); }
  };

  const deletePolicy = async (policyId: string) => {
    try {
      await apiFetch(`/sub-orgs/${id}/policies/${policyId}`, { method: "DELETE", token: token! });
      addToast("Policy deleted", "success"); fetchPolicies();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  useEffect(() => { if (activeTab === "wallets") fetchWallets(); }, [activeTab, walletsOffset]);
  useEffect(() => { if (activeTab === "users") fetchUsers(); }, [activeTab, usersOffset]);
  useEffect(() => { if (activeTab === "privateKeys") fetchPrivateKeys(); }, [activeTab, privateKeysOffset]);
  useEffect(() => { if (activeTab === "activities") fetchActivities(); }, [activeTab, activitiesOffset]);
  useEffect(() => { if (activeTab === "policies") fetchPolicies(); }, [activeTab, policiesOffset]);

  if (!isAuthenticated || loading) {
    return <div className="p-6 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /></div>;
  }

  if (!detail) return null;

  const formatId = (rawId: string) => `${rawId.slice(0, 4)}\u00b7\u00b7\u00b7\u00b7${rawId.slice(-4)}`;

  const formatActivityType = (action: string) =>
    action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" });
  };

  const tabs = [
    { key: "users" as const, label: "Users", count: detail.userCount, icon: Users },
    { key: "wallets" as const, label: "Wallets", count: detail.walletCount, icon: Wallet },
    { key: "privateKeys" as const, label: "Private Keys", count: detail.privateKeyCount, icon: Key },
    { key: "activities" as const, label: "Activities", count: detail.activityCount, icon: Activity },
    { key: "policies" as const, label: "Policies", count: detail.policyCount, icon: Shield },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <button onClick={() => router.push("/sub-orgs")} className="hover:text-slate-700 transition-colors">
          Sub-Orgs
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-700 font-medium">{detail.name}</span>
      </nav>

      {/* Header Card */}
      <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm">
            <Layers className="w-4 h-4" />
            <span>Sub-Org</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-5">{detail.name}</h1>

          {/* Info row */}
          <div className="flex items-start gap-10 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-400 mb-1">ID</p>
              <div className="flex items-center gap-1">
                <code className="text-sm font-mono text-slate-600 dark:text-slate-300">{formatId(detail.id)}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(detail.id); addToast("Copied", "success"); }}
                  className="text-slate-400 hover:text-slate-600 ml-0.5"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Root User</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{detail.rootUser?.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Approval Threshold</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">1</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              <span className={`text-xs ml-0.5 ${activeTab === tab.key ? "text-brand-500" : "text-slate-400"}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Users tab */}
      {activeTab === "users" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {usersLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "User", render: (u: any) => (
                      <div>
                        <p className="text-sm font-medium">{u.name || u.email?.split("@")[0] || "—"}</p>
                        {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                      </div>
                    ) },
                    { key: "userId", header: "User ID", render: (u: any) => (
                      <code className="text-xs font-mono text-slate-500">{formatId(u.id || "0000000000000000")}</code>
                    ) },
                    { key: "role", header: "Access Level", render: (u: any) => (
                      <span className="text-xs capitalize text-slate-500">{u.role === "ORG_ADMIN" ? "Root" : u.role?.replace(/_/g, " ").toLowerCase()}</span>
                    ) },
                    { key: "status", header: "Status", render: (u: any) => (
                      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${(u._count?.sessions || 0) > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>
                        {(u._count?.sessions || 0) > 0 ? "Active" : "Invited"}
                      </span>
                    ) },
                    { key: "createdAt", header: "Created", render: (u: any) => <span className="text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
                  ]}
                  data={users} loading={false} emptyMessage="No users in this sub-organization."
                />
                <Pagination limit={20} offset={usersOffset} total={usersTotal} onPageChange={(_, o) => setUsersOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Wallets tab */}
      {activeTab === "wallets" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {walletsLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "Wallet", render: (w: any) => (
                      <div>
                        <p className="text-sm font-medium">{w.name}</p>
                        {w.tags?.length > 0 && <div className="flex gap-1 mt-0.5">{w.tags.filter((t: string) => !t.startsWith("wvc-") && !t.startsWith("sub-org-")).map((t: string) => <span key={t} className="text-[10px] text-slate-400 bg-slate-50 px-1 rounded">{t}</span>)}</div>}
                      </div>
                    ) },
                    { key: "id", header: "Wallet ID", render: (w: any) => <code className="text-xs font-mono text-slate-500">{formatId(w.id || "0000000000000000")}</code> },
                    { key: "accounts", header: "Accounts", render: (w: any) => <span className="text-sm">{w._count?.accounts || 0}</span> },
                    { key: "status", header: "Status", render: (w: any) => <StatusBadge status={w.status} /> },
                    { key: "createdAt", header: "Created", render: (w: any) => <span className="text-xs text-slate-500">{new Date(w.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
                  ]}
                  data={wallets} loading={false} emptyMessage="This sub-org doesn't have wallets yet."
                />
                <Pagination limit={20} offset={walletsOffset} total={walletsTotal} onPageChange={(_, o) => setWalletsOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Private Keys tab */}
      {activeTab === "privateKeys" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {privateKeysLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "Key", render: (k: any) => <span className="text-sm font-medium">{k.name}</span> },
                    { key: "id", header: "Private ID", render: (k: any) => <code className="text-xs font-mono text-slate-500">{formatId(k.id || "0000000000000000")}</code> },
                    { key: "tags", header: "Tags", render: (k: any) => (
                      <div className="flex gap-1">
                        {(k.tags || []).filter((t: string) => !t.startsWith("sub-org-")).map((t: string) => <span key={t} className="text-[10px] text-slate-400 bg-slate-50 px-1 rounded">{t}</span>)}
                        {(!k.tags || k.tags.length === 0) && <span className="text-xs text-slate-300">—</span>}
                      </div>
                    ) },
                    { key: "exported", header: "Exported", render: (k: any) => <span className={`text-xs ${k.exported ? "text-amber-600" : "text-slate-400"}`}>{k.exported ? "Yes" : "No"}</span> },
                    { key: "curve", header: "Curve Type", render: (k: any) => <span className="text-xs font-mono text-slate-500">{k.curve}</span> },
                    { key: "createdAt", header: "Created", render: (k: any) => <span className="text-xs text-slate-500">{new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
                  ]}
                  data={privateKeys} loading={false} emptyMessage="No private keys in this sub-organization."
                />
                <Pagination limit={20} offset={privateKeysOffset} total={privateKeysTotal} onPageChange={(_, o) => setPrivateKeysOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activities tab */}
      {activeTab === "activities" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {activitiesLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "type", header: "Type", render: (a: any) => (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-700">{formatActivityType(a.action)}</span>
                      </div>
                    ) },
                    { key: "id", header: "ID", render: (a: any) => (
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[11px] text-slate-500">{formatId(a.id || "0000000000000000")}</span>
                        <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(a.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ) },
                    { key: "initiator", header: "Initiator", render: (a: any) => (
                      <div>
                        <p className="text-xs font-medium text-slate-700">{a.user?.name || a.user?.email?.split("@")[0] || "—"}</p>
                        {a.user?.email && <p className="text-[11px] text-slate-400">{a.user.email}</p>}
                      </div>
                    ) },
                    { key: "approvals", header: "Approvals", render: (_a: any) => (
                      <span className="text-sm text-slate-600">1/1</span>
                    ) },
                    { key: "createdAt", header: "Date Created", sortable: true, render: (a: any) => (
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(a.createdAt)}</span>
                    ) },
                    { key: "yourAction", header: "Your Action", render: (_a: any) => (
                      <span className="text-sm text-slate-400">—</span>
                    ) },
                    { key: "status", header: "Status", render: (_a: any) => (
                      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Completed
                      </span>
                    ) },
                    { key: "chevron", header: "", render: (a: any) => (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/sub-orgs/${id}/activities/${a.id}`); }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) },
                  ]}
                  data={activities} loading={false} emptyMessage="No activities in this sub-organization."
                  onRowClick={(a: any) => router.push(`/sub-orgs/${id}/activities/${a.id}`)}
                />
                <Pagination limit={20} offset={activitiesOffset} total={activitiesTotal} onPageChange={(_, o) => setActivitiesOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Policies tab */}
      {activeTab === "policies" && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button onClick={openCreatePolicy}><Plus className="w-4 h-4 mr-1.5" /> New Policy</Button>
          </div>
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              {policiesLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
                <>
                  <Table
                    columns={[
                      { key: "name", header: "Policy", render: (p: any) => (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{p.name}</span>
                          <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>
                            {p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}
                          </span>
                          {p.active === false && (
                            <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Inactive</span>
                          )}
                        </div>
                      ) },
                      { key: "consensus", header: "Consensus", render: (p: any) => <span className="text-xs text-slate-500">{p.consensus}</span> },
                      { key: "priority", header: "Priority", render: (p: any) => <span className="text-sm font-mono">{p.priority}</span> },
                      { key: "active", header: "Active", render: (p: any) => <span className={`text-xs ${p.active !== false ? "text-emerald-600" : "text-slate-400"}`}>{p.active !== false ? "Yes" : "No"}</span> },
                      { key: "actions", header: "", render: (p: any) => (
                        <div className="flex items-center gap-0.5">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditPolicy(p)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deletePolicy(p.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                        </div>
                      ) },
                    ]}
                    data={policies} loading={false} emptyMessage="No policies in this sub-organization."
                  />
                  <Pagination limit={20} offset={policiesOffset} total={policiesTotal} onPageChange={(_, o) => setPoliciesOffset(o)} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Policy create/edit modal */}
      <Modal open={showPolicyModal} onClose={() => { setShowPolicyModal(false); resetPolicyForm(); }} title={editingPolicyId ? "Edit Policy" : "New Policy"}>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input value={policyName} onChange={e => setPolicyName(e.target.value)} placeholder="e.g. Daily Spending Limit" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input value={policyDescription} onChange={e => setPolicyDescription(e.target.value)} placeholder="Human-readable summary (optional)" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Policy JSON</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-900 shadow-inner">
              <textarea
                value={policyJson}
                onChange={e => setPolicyJson(e.target.value)}
                rows={12}
                className="w-full bg-transparent p-3 outline-none resize-none font-mono text-xs leading-relaxed text-emerald-400 focus:ring-0"
                placeholder='{"effect":"EFFECT_ALLOW","consensus":"approvers.any(user, user.id == &apos;<ID>&apos;)","condition":"activity.action == &apos;SIGN&apos;"}'
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fields: <code className="text-[11px]">effect</code> (EFFECT_ALLOW | EFFECT_DENY), <code className="text-[11px]">consensus</code> (CEL expression, optional), <code className="text-[11px]">condition</code> (CEL expression, optional)
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Policy Status</span>
              <span className="text-xs text-slate-400">Toggle whether this policy is active</span>
            </div>
            <button type="button" onClick={() => setPolicyActive(!policyActive)}
              className={`relative w-9 h-5 rounded-full transition-colors ${policyActive ? "bg-emerald-500" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${policyActive ? "left-4" : "left-0.5"}`} />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowPolicyModal(false); resetPolicyForm(); }} className="flex-1">Cancel</Button>
            <Button onClick={savePolicy} disabled={policySaving} className="flex-1">
              {policySaving ? "Saving..." : editingPolicyId ? "Update Policy" : "Create Policy"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
