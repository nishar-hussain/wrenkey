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
import { useToast } from "@/components/ui/Toast";
import { Users, Shield, Wallet, Key, Activity, Copy, ArrowLeft, CheckCircle2 } from "lucide-react";

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

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } }, [isAuthenticated, router]);

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

  useEffect(() => { if (activeTab === "wallets") fetchWallets(); }, [activeTab, walletsOffset]);
  useEffect(() => { if (activeTab === "users") fetchUsers(); }, [activeTab, usersOffset]);
  useEffect(() => { if (activeTab === "privateKeys") fetchPrivateKeys(); }, [activeTab, privateKeysOffset]);
  useEffect(() => { if (activeTab === "activities") fetchActivities(); }, [activeTab, activitiesOffset]);
  useEffect(() => { if (activeTab === "policies") fetchPolicies(); }, [activeTab, policiesOffset]);

  if (!isAuthenticated || loading) {
    return <div className="p-6 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /></div>;
  }

  if (!detail) return null;

  const tabs = [
    { key: "users" as const, label: `Users (${detail.userCount})` },
    { key: "wallets" as const, label: `Wallets (${detail.walletCount})` },
    { key: "privateKeys" as const, label: `Private Keys (${detail.privateKeyCount})` },
    { key: "activities" as const, label: `Activities (${detail.activityCount})` },
    { key: "policies" as const, label: `Policies (${detail.policyCount})` },
  ];

  const formatAction = (action: string) => {
    return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sub-orgs")}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      </div>

      {/* Header — matches Turnkey's sub-org header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{detail.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sub-organization detail</p>
        </div>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sub-Org ID</p>
              <div className="flex items-center gap-1 mt-1">
                <code className="text-sm font-mono text-slate-600 select-all">{detail.id.slice(0, 8)}…{detail.id.slice(-4)}</code>
                <button onClick={() => { navigator.clipboard.writeText(detail.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Root User</p>
              <p className="text-sm text-slate-700 mt-1">{detail.rootUser?.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</p>
              <p className="text-sm text-slate-700 mt-1">{new Date(detail.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent Org</p>
              <p className="text-sm text-slate-700 mt-1 font-mono">{detail.parentOrgId?.slice(0, 8)}…</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</p>
              <p className="text-sm text-emerald-600 mt-1 font-medium">Active</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs — matches Turnkey's tab layout */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
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
                      <code className="text-xs font-mono text-slate-500">{u.id?.slice(0, 8)}…{u.id?.slice(-4)}</code>
                    ) },
                    { key: "role", header: "Access Level", render: (u: any) => (
                      <span className="text-xs capitalize text-slate-500">{u.role === "ORG_ADMIN" ? "Root" : u.role?.replace(/_/g, " ").toLowerCase()}</span>
                    ) },
                    { key: "status", header: "Status", render: (u: any) => (
                      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${(u._count?.sessions || 0) > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>{(u._count?.sessions || 0) > 0 ? "Active" : "Invited"}</span>
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
                    { key: "id", header: "Wallet ID", render: (w: any) => <code className="text-xs font-mono text-slate-500">{w.id?.slice(0, 8)}…{w.id?.slice(-4)}</code> },
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

      {/* Private Keys tab — matches Turnkey's private keys view */}
      {activeTab === "privateKeys" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {privateKeysLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "Key", render: (k: any) => <span className="text-sm font-medium">{k.name}</span> },
                    { key: "id", header: "Private ID", render: (k: any) => <code className="text-xs font-mono text-slate-500">{k.id?.slice(0, 8)}…{k.id?.slice(-4)}</code> },
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

      {/* Activities tab — matches Turnkey's activity view */}
      {activeTab === "activities" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {activitiesLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "action", header: "Type", render: (a: any) => <span className="text-sm font-medium">{formatAction(a.action)}</span> },
                    { key: "id", header: "ID", render: (a: any) => <code className="text-xs font-mono text-slate-500">{a.id?.slice(0, 8)}…{a.id?.slice(-4)}</code> },
                    { key: "user", header: "Initiator", render: (a: any) => (
                      <div>
                        <p className="text-xs font-medium">{a.user?.name || a.user?.email?.split("@")[0] || "—"}</p>
                        {a.user?.email && <p className="text-[11px] text-slate-400">{a.user.email}</p>}
                      </div>
                    ) },
                    { key: "status", header: "Status", render: (a: any) => (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Completed</span>
                    ) },
                    { key: "createdAt", header: "Date Created", render: (a: any) => <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span> },
                  ]}
                  data={activities} loading={false} emptyMessage="No activities in this sub-organization."
                />
                <Pagination limit={20} offset={activitiesOffset} total={activitiesTotal} onPageChange={(_, o) => setActivitiesOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Policies tab */}
      {activeTab === "policies" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {policiesLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "Policy", render: (p: any) => (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>{p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}</span>
                      </div>
                    ) },
                    { key: "consensus", header: "Consensus", render: (p: any) => <span className="text-xs text-slate-500">{p.consensus}</span> },
                    { key: "priority", header: "Priority", render: (p: any) => <span className="text-sm font-mono">{p.priority}</span> },
                    { key: "active", header: "Active", render: (p: any) => <span className={`text-xs ${p.active !== false ? "text-emerald-600" : "text-slate-400"}`}>{p.active !== false ? "Yes" : "No"}</span> },
                  ]}
                  data={policies} loading={false} emptyMessage="No policies in this sub-organization."
                />
                <Pagination limit={20} offset={policiesOffset} total={policiesTotal} onPageChange={(_, o) => setPoliciesOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
