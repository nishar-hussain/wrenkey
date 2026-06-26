"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { Users, Shield, Bot, Plus, Copy, Search, ChevronDown, User, Settings } from "lucide-react";

interface TeamMember {
  id: string;
  name?: string;
  email?: string;
  role: string;
  tags: string[];
  createdAt: string;
  apiKeyCount?: number;
}

export default function TeamPage() {
  const router = useRouter();
  const { isAuthenticated, token, org, user } = useAuth();
  const { addToast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [showNewUserMenu, setShowNewUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [showTeamMemberModal, setShowTeamMemberModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("DEVELOPER");
  const [agentName, setAgentName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [credentials, setCredentials] = useState<any>(null);

  const [stats, setStats] = useState({ users: 0, rootUsers: 0, serviceUsers: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowNewUserMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (search) params.set("search", search);
      const res: any = await apiFetch(`/users?${params}`, { token });
      const data = res.data || [];
      const totalUsers = res.total || data.length;

      const agentsRes: any = await apiFetch("/agents?limit=100", { token }).catch(() => ({ data: [] }));
      const agentUserIds = new Set((agentsRes.data || []).map((a: any) => a.userId));
      const agentList = agentsRes.data || [];

      setMembers(data.map((m: any) => ({
        ...m,
        apiKeyCount: agentUserIds.has(m.id) ? 1 : 0,
      })));

      const rootUsers = data.filter((m: any) => m.role === "ORG_ADMIN").length;
      const serviceUsers = agentList.length;
      setStats({ users: totalUsers, rootUsers, serviceUsers });
      setTotal(totalUsers);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, limit, offset, search]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchMembers(); }, [isAuthenticated, fetchMembers, router]);

  const createTeamMember = async () => {
    if (!newEmail.trim()) { addToast("Email required", "error"); return; }
    setCreateLoading(true);
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify({ email: newEmail, name: newName, role: newRole }), token: token! });
      setShowTeamMemberModal(false); setNewEmail(""); setNewName("");
      addToast("Team member added", "success"); fetchMembers();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setCreateLoading(false); }
  };

  const createService = async () => {
    if (!agentName.trim()) { addToast("Agent name required", "error"); return; }
    setCreateLoading(true);
    try {
      const res: any = await apiFetch("/agents", { method: "POST", body: JSON.stringify({ name: agentName, permissions: ["wallet:sign", "wallet:read"] }), token: token! });
      setCredentials(res.credentials);
      addToast("Service user created", "success"); fetchMembers();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setCreateLoading(false); }
  };

  if (!isAuthenticated) return null;

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      ORG_ADMIN: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/30",
      DEVELOPER: "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30",
      AGENT: "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30",
      AUDITOR: "bg-slate-50 text-slate-600 border-slate-100",
    };
    const label: Record<string, string> = { ORG_ADMIN: "Root", DEVELOPER: "Basic", AGENT: "Service", AUDITOR: "Auditor" };
    return (
      <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${map[role] || map.AUDITOR}`}>
        {label[role] || role}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team</h1>
        <span className="text-xs text-slate-400 flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Root user</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Users", value: stats.users, icon: Users, color: "blue" },
          { label: "Root Users", value: stats.rootUsers, icon: Shield, color: "violet" },
          { label: "Service Users", value: stats.serviceUsers, icon: Bot, color: "amber" },
          { label: "Approval Threshold", value: "1/1", icon: Settings, color: "slate", suffix: <Button variant="ghost" size="sm" className="h-6 text-xs hover:text-brand-600">Edit</Button> },
        ].map(s => {
          const Icon = s.icon;
          const colors: Record<string, string> = {
            blue: "bg-blue-50 border-blue-100 text-blue-600",
            violet: "bg-violet-50 border-violet-100 text-violet-600",
            amber: "bg-amber-50 border-amber-100 text-amber-600",
            slate: "bg-slate-50 border-slate-100 text-slate-600",
          };
          return (
            <Card key={s.label} className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg border ${colors[s.color]} flex items-center justify-center`}><Icon className="w-4 h-4" /></div>
                  {s.suffix}
                </div>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Organization ID</span>
        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded select-all">{org?.id?.slice(0, 4)}····{org?.id?.slice(-4)}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search..." className="pl-9 text-sm" />
        </div>
        <div className="relative" ref={menuRef}>
          <Button onClick={() => setShowNewUserMenu(!showNewUserMenu)}>
            <Plus className="w-4 h-4 mr-1.5" /> New User <ChevronDown className="w-3.5 h-3.5 ml-1" />
          </Button>
          {showNewUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-2">
              <button onClick={() => { setShowNewUserMenu(false); setShowTeamMemberModal(true); setNewEmail(""); setNewName(""); }} className="w-full text-left p-3 rounded-md hover:bg-slate-50 flex items-start gap-3">
                <User className="w-4 h-4 text-slate-500 mt-0.5" />
                <div><p className="text-sm font-medium">Team Member</p><p className="text-xs text-slate-400">A person on your team</p></div>
              </button>
              <button onClick={() => { setShowNewUserMenu(false); setShowServiceModal(true); setAgentName(""); setCredentials(null); }} className="w-full text-left p-3 rounded-md hover:bg-slate-50 flex items-start gap-3">
                <Bot className="w-4 h-4 text-slate-500 mt-0.5" />
                <div><p className="text-sm font-medium">Service</p><p className="text-xs text-slate-400">Programmatic API access</p></div>
              </button>
            </div>
          )}
        </div>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <>
              <Table
                columns={[
                  { key: "user", header: "User", render: (m: TeamMember) => (
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-medium shrink-0">{(m.email || "?").charAt(0).toUpperCase()}</div>
                      <div><p className="text-sm font-medium">{m.email || m.name || "—"}</p></div>
                    </div>
                  )},
                  { key: "id", header: "User ID", render: (m: TeamMember) => <div className="flex items-center gap-1"><span className="font-mono text-[11px]">{m.id.slice(0, 4)}····{m.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(m.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div> },
                  { key: "tags", header: "Tags", render: (m: TeamMember) => (
                    <div className="flex items-center gap-1 flex-wrap">
                      {(m.tags || []).slice(0, 2).map((t: string, i: number) => <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{t}</span>)}
                      <button className="text-[10px] text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 rounded px-1.5 py-0.5">Add Tag</button>
                    </div>
                  )},
                  { key: "role", header: "Access Level", render: (m: TeamMember) => roleBadge(m.role) },
                  { key: "apiKeys", header: "API Keys", render: (m: TeamMember) => <span className="text-sm">{m.apiKeyCount || "—"}</span> },
                  { key: "createdAt", header: "Created", render: (m: TeamMember) => <span className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span> },
                  { key: "status", header: "Status", render: () => <span className="inline-flex items-center text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Active</span> },
                ]}
                data={members}
                loading={false}
                emptyMessage="No team members found."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showTeamMemberModal} onClose={() => setShowTeamMemberModal(false)} title="Add Team Member">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Invite a person to join your organization.</p>
          <div className="space-y-1"><label className="text-sm font-medium">Email</label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="person@example.com" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Name (optional)</label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Role</label><select value={newRole} onChange={e => setNewRole(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm"><option value="DEVELOPER">Developer</option><option value="ORG_ADMIN">Admin</option><option value="AUDITOR">Auditor</option></select></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setShowTeamMemberModal(false)} className="flex-1">Cancel</Button><Button onClick={createTeamMember} disabled={createLoading} className="flex-1">{createLoading ? "Adding..." : "Add Member"}</Button></div>
        </div>
      </Modal>

      <Modal open={showServiceModal} onClose={() => { setShowServiceModal(false); setCredentials(null); }} title="Add Service User">
        {!credentials ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Create a service account for programmatic API access via agents.</p>
            <div className="space-y-1"><label className="text-sm font-medium">Service Name</label><Input value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="e.g. Trading Bot" /></div>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setShowServiceModal(false)} className="flex-1">Cancel</Button><Button onClick={createService} disabled={createLoading} className="flex-1">{createLoading ? "Creating..." : "Create Service"}</Button></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm"><p className="font-medium text-green-700">Service created!</p><p className="text-green-600 mt-1">Save the API key — it won&apos;t be shown again.</p></div>
            <div className="space-y-1"><label className="text-sm font-medium">User ID</label><Input value={credentials.userId} readOnly /></div>
            <div className="space-y-1"><label className="text-sm font-medium">API Key</label><Input value={credentials.apiKey} readOnly className="font-mono text-xs" /></div>
            <Button onClick={() => { setShowServiceModal(false); setCredentials(null); }} variant="secondary" className="w-full">Close</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
