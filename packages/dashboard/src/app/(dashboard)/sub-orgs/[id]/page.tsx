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
import { Layers, Users, Shield, Building2, ExternalLink, Copy, ArrowLeft, Wallet } from "lucide-react";

interface SubOrgDetail {
  id: string;
  name: string;
  rootUser: { id: string; email: string; name: string } | null;
  userCount: number;
  walletCount: number;
  policyCount: number;
  createdAt: string;
  parentOrgId: string;
}

export default function SubOrgDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, token, login, org, user } = useAuth();
  const { addToast } = useToast();

  const [detail, setDetail] = useState<SubOrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "wallets" | "users" | "policies">("overview");

  const [wallets, setWallets] = useState<any[]>([]);
  const [walletsTotal, setWalletsTotal] = useState(0);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletsOffset, setWalletsOffset] = useState(0);

  const [users, setUsers] = useState<any[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersOffset, setUsersOffset] = useState(0);

  const [policies, setPolicies] = useState<any[]>([]);
  const [policiesTotal, setPoliciesTotal] = useState(0);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesOffset, setPoliciesOffset] = useState(0);

  const [impersonating, setImpersonating] = useState(false);

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

  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/policies?limit=20&offset=${policiesOffset}`, { token: token! });
      setPolicies(res.data || []); setPoliciesTotal(res.total || 0);
    } catch { addToast("Failed to load policies", "error"); } finally { setPoliciesLoading(false); }
  };

  useEffect(() => {
    if (activeTab === "wallets") fetchWallets();
  }, [activeTab, walletsOffset]);

  useEffect(() => {
    if (activeTab === "users") fetchUsers();
  }, [activeTab, usersOffset]);

  useEffect(() => {
    if (activeTab === "policies") fetchPolicies();
  }, [activeTab, policiesOffset]);

  const impersistSubOrg = async () => {
    setImpersonating(true);
    try {
      const res: any = await apiFetch(`/sub-orgs/${id}/impersonate`, { method: "POST", token: token! });
      // Save parent org info before switching
      localStorage.setItem("wrankey_parent_token", token!);
      localStorage.setItem("wrankey_parent_user", JSON.stringify(user));
      localStorage.setItem("wrankey_parent_org", JSON.stringify(org));
      // Switch to sub-org
      login(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role }, { id: res.org.id, name: res.org.name });
      addToast("Switched to sub-org", "success");
      router.push("/");
    } catch (err: any) { addToast(err.message || "Failed to switch", "error"); }
    finally { setImpersonating(false); }
  };

  if (!isAuthenticated || loading) {
    return <div className="p-6 space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /></div>;
  }

  if (!detail) return null;

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "wallets" as const, label: `Wallets (${detail.walletCount})` },
    { key: "users" as const, label: `Users (${detail.userCount})` },
    { key: "policies" as const, label: `Policies (${detail.policyCount})` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/sub-orgs")}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{detail.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sub-organization detail</p>
        </div>
        <Button onClick={impersistSubOrg} disabled={impersonating}>
          <ExternalLink className="w-4 h-4 mr-1.5" /> {impersonating ? "Switching..." : "Go to Sub-Org"}
        </Button>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sub-Org ID</p><div className="flex items-center gap-1 mt-1"><code className="text-sm font-mono text-slate-600 select-all">{detail.id.slice(0, 8)}...</code><button onClick={() => { navigator.clipboard.writeText(detail.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Root User</p><p className="text-sm text-slate-700 mt-1">{detail.rootUser?.email || "—"}</p></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Created</p><p className="text-sm text-slate-700 mt-1">{new Date(detail.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p></div>
            <div><p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent Org</p><p className="text-sm text-slate-700 mt-1 font-mono">{detail.parentOrgId?.slice(0, 8)}...</p></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: "Users", value: detail.userCount, icon: Users, color: "bg-blue-50 border-blue-100 text-blue-600" },
            { label: "Wallets", value: detail.walletCount, icon: Wallet, color: "bg-violet-50 border-violet-100 text-violet-600" },
            { label: "Policies", value: detail.policyCount, icon: Shield, color: "bg-emerald-50 border-emerald-100 text-emerald-600" },
          ].map(s => (
            <Card key={s.label} className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg border ${s.color} flex items-center justify-center`}><s.icon className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "wallets" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {walletsLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "Name", render: (w: any) => <span className="font-medium text-sm">{w.name}</span> },
                    { key: "type", header: "Type", render: (w: any) => <span className="text-xs text-slate-500 capitalize">{w.ownerType}</span> },
                    { key: "accounts", header: "Accounts", render: (w: any) => <span className="text-sm">{w._count?.accounts || 0}</span> },
                    { key: "status", header: "Status", render: (w: any) => <StatusBadge status={w.status} /> },
                    { key: "createdAt", header: "Created", render: (w: any) => <span className="text-xs text-slate-500">{new Date(w.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> },
                  ]}
                  data={wallets} loading={false} emptyMessage="No wallets in this sub-organization."
                />
                <Pagination limit={20} offset={walletsOffset} total={walletsTotal} onPageChange={(_, o) => setWalletsOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "users" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {usersLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "User", render: (u: any) => <div><p className="text-sm font-medium">{u.email || u.name || "—"}</p></div> },
                    { key: "role", header: "Role", render: (u: any) => <span className="text-xs capitalize text-slate-500">{u.role === "ORG_ADMIN" ? "Root User" : u.role?.replace(/_/g, " ").toLowerCase()}</span> },
                    { key: "status", header: "Status", render: (u: any) => <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${(u._count?.sessions || 0) > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}`}>{(u._count?.sessions || 0) > 0 ? "Active" : "Invited"}</span> },
                    { key: "createdAt", header: "Created", render: (u: any) => <span className="text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> },
                  ]}
                  data={users} loading={false} emptyMessage="No users in this sub-organization."
                />
                <Pagination limit={20} offset={usersOffset} total={usersTotal} onPageChange={(_, o) => setUsersOffset(o)} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "policies" && (
        <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {policiesLoading ? <div className="p-6"><Skeleton className="h-24 w-full" /></div> : (
              <>
                <Table
                  columns={[
                    { key: "name", header: "Policy", render: (p: any) => <div className="flex items-center gap-2"><span className="font-medium text-sm">{p.name}</span><span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${p.effect === "EFFECT_ALLOW" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}>{p.effect === "EFFECT_ALLOW" ? "ALLOW" : "DENY"}</span></div> },
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
