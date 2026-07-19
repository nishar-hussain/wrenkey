"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Users, Shield, Bot, Plus, Copy, Search, ChevronDown, User, Settings, AlertTriangle, Tag as TagIcon, Check } from "lucide-react";

interface TagRow {
  id: string;
  name: string;
  type: string;
  usageCount: number;
}

interface TeamMember {
  id: string;
  name?: string;
  email?: string;
  role: string;
  tags: string[];
  createdAt: string;
  apiKeyCount?: number;
  _count?: { sessions: number };
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
  const [agentName, setAgentName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [credentials, setCredentials] = useState<any>(null);
  const [inviteResult, setInviteResult] = useState<any>(null);

  const [newUserTags, setNewUserTags] = useState<string[]>([]);

  const [tagDropdownUserId, setTagDropdownUserId] = useState<string | null>(null);
  const [tagDropdownSearch, setTagDropdownSearch] = useState("");
  const [tagDropdownCoords, setTagDropdownCoords] = useState({ top: 0, left: 0 });
  const [allUserTags, setAllUserTags] = useState<TagRow[]>([]);
  const [tagSaveLoading, setTagSaveLoading] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({ users: 0, rootUsers: 0, serviceUsers: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowNewUserMenu(false);
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) setTagDropdownUserId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAvailableTags = useCallback(async () => {
    if (!token) return;
    try {
      const res: any = await apiFetch("/tags?type=user&limit=200", { token });
      setAllUserTags(res.data || []);
    } catch { /* silently fail */ }
  }, [token]);

  useEffect(() => { if (token) fetchAvailableTags(); }, [token, fetchAvailableTags]);

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
      const body: any = { email: newEmail, name: newName, role: "DEVELOPER" };
      if (newUserTags.length > 0) body.tags = newUserTags;
      const res: any = await apiFetch("/users", { method: "POST", body: JSON.stringify(body), token: token! });
      setInviteResult(res);
      if (res.emailStatus === "sent") {
        addToast("Invitation email sent", "success");
      } else if (res.emailStatus === "failed") {
        addToast(`Email failed: ${res.emailError || "Unknown error"}. Share the link manually.`, "error");
      } else {
        addToast("Invite created. No email configured — share the link manually.", "info");
      }
      fetchMembers();
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

  const openTagDropdown = (userId: string, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setTagDropdownCoords({ top: rect.bottom + 4 + window.scrollY, left: rect.left + window.scrollX });
    setTagDropdownUserId(tagDropdownUserId === userId ? null : userId);
    setTagDropdownSearch("");
  };

  const toggleTagOnUser = async (userId: string, tagName: string) => {
    const member = members.find(m => m.id === userId);
    if (!member) return;
    const currentTags = member.tags || [];
    const newTags = currentTags.includes(tagName)
      ? currentTags.filter(t => t !== tagName)
      : [...currentTags, tagName];
    setTagSaveLoading(true);
    try {
      const res: any = await apiFetch(`/users/${userId}`, { method: "PATCH", body: JSON.stringify({ tags: newTags }), token: token! });
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, tags: res.tags || newTags } : m));
    } catch (err: any) { addToast(err.message || "Failed to update tags", "error"); } finally { setTagSaveLoading(false); }
  };

  const filteredAvailableTags = allUserTags.filter(t =>
    !tagDropdownSearch || t.name.toLowerCase().includes(tagDropdownSearch.toLowerCase())
  );

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Team</h1>
        <span className="text-xs text-slate-400 flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Root user</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Users", value: stats.users, icon: Users, color: "blue" },
          { label: "Root Users", value: stats.rootUsers, icon: Shield, color: "violet", footer: <Link href="/team/root-quorum" className="text-[10px] text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Security Liability</Link> },
          { label: "Service Users", value: stats.serviceUsers, icon: Bot, color: "amber" },
          { label: "Approval Threshold", value: "1/1", icon: Settings, color: "slate", suffix: <Button variant="ghost" size="sm" className="h-6 text-xs hover:text-brand-600">Edit</Button>, footer: <Link href="/team/root-quorum" className="text-[10px] text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> Security Liability</Link> },
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
                {s.footer}
              </CardContent>
            </Card>
          );
        })}
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
              <button onClick={() => { setShowNewUserMenu(false);               setShowTeamMemberModal(true); setNewEmail(""); setNewName(""); setNewUserTags([]); }} className="w-full text-left p-3 rounded-md hover:bg-slate-50 flex items-start gap-3">
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
                      {(m.tags || []).length > 2 && <span className="text-[10px] text-slate-400">+{m.tags.length - 2}</span>}
                      <button onClick={(e) => { e.stopPropagation(); openTagDropdown(m.id, e); }} className="text-[10px] text-slate-400 hover:text-slate-600 border border-dashed border-slate-300 rounded px-1.5 py-0.5">
                        {m.tags.length > 0 ? "Edit Tags" : "Add Tag"}
                      </button>
                    </div>
                  )},
                  { key: "apiKeys", header: "API Keys", render: (m: TeamMember) => <span className="text-sm">{m.apiKeyCount || "—"}</span> },
                  { key: "createdAt", header: "Created", render: (m: TeamMember) => <span className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span> },
                  { key: "status", header: "Status", render: (m: TeamMember) => {
                    const isCurrentUser = m.id === user?.id;
                    const hasSession = (m._count?.sessions ?? 0) > 0;
                    const isActive = isCurrentUser || hasSession;
                    return (
                      <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${isActive ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-amber-700 bg-amber-50 border-amber-100"}`}>
                        {isCurrentUser ? "Active" : hasSession ? "Active" : "Invited"}
                      </span>
                    );
                  } },
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

      <Modal open={showTeamMemberModal} onClose={() => { setShowTeamMemberModal(false); setInviteResult(null); }} title={inviteResult ? "Invite Created" : "Add Team Member"}>
        {!inviteResult ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Invite a person to join your organization.</p>
            <div className="space-y-1"><label className="text-sm font-medium">Email</label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="person@example.com" /></div>
            <div className="space-y-1"><label className="text-sm font-medium">Name (optional)</label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" /></div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tags (optional)</label>
              <div className="flex flex-wrap gap-1 min-h-[32px] p-1.5 border border-slate-200 rounded-md">
                {newUserTags.length === 0 && <span className="text-xs text-slate-400">No tags selected</span>}
                {allUserTags.filter(t => newUserTags.includes(t.name)).map(t => (
                  <button key={t.id} onClick={() => setNewUserTags(prev => prev.filter(n => n !== t.name))} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100">
                    {t.name} <span className="text-brand-400">x</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 relative">
                <select
                  className="w-full text-xs border border-slate-200 rounded-md py-1.5 px-2 text-slate-600 bg-white"
                  value=""
                  onChange={(e) => {
                    if (e.target.value === "__manage__") { window.open("/tags", "_blank"); return; }
                    if (e.target.value && !newUserTags.includes(e.target.value)) {
                      setNewUserTags(prev => [...prev, e.target.value]);
                    }
                  }}
                >
                  <option value="">Add a tag...</option>
                  <option value="__manage__">-- Manage Tags --</option>
                  {allUserTags.filter(t => !newUserTags.includes(t.name)).map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2"><Button variant="secondary" onClick={() => setShowTeamMemberModal(false)} className="flex-1">Cancel</Button><Button onClick={createTeamMember} disabled={createLoading} className="flex-1">{createLoading ? "Adding..." : "Add Member"}</Button></div>
          </div>
        ) : (
          <div className="space-y-4">
            {inviteResult.emailStatus === "sent" ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm"><p className="font-medium text-green-700">Invitation sent!</p><p className="text-green-600 mt-1">An email has been sent to {newEmail}.</p></div>
            ) : inviteResult.emailStatus === "failed" ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm"><p className="font-medium text-amber-700">Email delivery failed</p><p className="text-amber-600 mt-1">{inviteResult.emailError || "Unknown error"}. Share the link below with the invited person.</p></div>
            ) : (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm"><p className="font-medium text-blue-700">No email configured</p><p className="text-blue-600 mt-1">Share the invite link below with the invited person.</p></div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Invite Link</label>
              <div className="flex gap-2">
                <Input value={inviteResult.inviteLink} readOnly className="font-mono text-xs flex-1" />
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(inviteResult.inviteLink); addToast("Link copied", "success"); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <Button onClick={() => { setShowTeamMemberModal(false); setInviteResult(null); setNewEmail(""); setNewName(""); setNewUserTags([]); }} variant="secondary" className="w-full">Close</Button>
          </div>
        )}
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

      {tagDropdownUserId && (() => {
        const member = members.find(m => m.id === tagDropdownUserId);
        if (!member) return null;
        const memberTags = member.tags || [];
        return (
          <div ref={tagDropdownRef} className="fixed z-[100] bg-white border border-slate-200 rounded-lg shadow-xl w-72" style={{ top: tagDropdownCoords.top, left: tagDropdownCoords.left }}>
            <div className="p-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 rounded-md border border-slate-200">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  value={tagDropdownSearch}
                  onChange={e => setTagDropdownSearch(e.target.value)}
                  placeholder="Search tags..."
                  className="flex-1 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none border-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {filteredAvailableTags.length === 0 ? (
                <div className="p-3 text-center">
                  <p className="text-xs text-slate-400">No tags found</p>
                  <Link href="/tags" className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-1 inline-block">Create a tag</Link>
                </div>
              ) : (
                filteredAvailableTags.map(tag => {
                  const isSelected = memberTags.includes(tag.name);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTagOnUser(tagDropdownUserId, tag.name)}
                      disabled={tagSaveLoading}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors ${isSelected ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "bg-brand-600 border-brand-600" : "border-slate-300"}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <span className="flex-1 truncate">{tag.name}</span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="p-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Selected: {memberTags.length}</span>
              <Link href="/tags" className="text-[10px] text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1" onClick={() => setTagDropdownUserId(null)}>
                <TagIcon className="w-3 h-3" /> Manage Tags
              </Link>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
