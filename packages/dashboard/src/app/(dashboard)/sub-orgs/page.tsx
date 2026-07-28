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
import { Layers, Plus, Copy, Trash2, Pencil, ExternalLink, ChevronRight, ArrowRight } from "lucide-react";

interface SubOrg {
  id: string;
  name: string;
  rootUserId?: string;
  rootUserEmail?: string;
  userCount: number;
  walletCount: number;
  createdAt: string;
}

export default function SubOrgsPage() {
  const router = useRouter();
  const { isAuthenticated, token, login, org, user } = useAuth();
  const { addToast } = useToast();
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editSubOrg, setEditSubOrg] = useState<SubOrg | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [impersonateId, setImpersonateId] = useState<string | null>(null);

  // Go-to sub-org input
  const [gotoSubOrgId, setGotoSubOrgId] = useState("");
  const [gotoError, setGotoError] = useState("");

  const fetchSubOrgs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/sub-orgs?limit=${limit}&offset=${offset}`, { token });
      setSubOrgs(res.data || []);
      setTotal(res.total || 0);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchSubOrgs(); }, [isAuthenticated, fetchSubOrgs, router]);

  const createSubOrg = async () => {
    if (!newName.trim()) { addToast("Name required", "error"); return; }
    setSaveLoading(true);
    try {
      await apiFetch("/sub-orgs", { method: "POST", body: JSON.stringify({ name: newName, rootUserEmail: newEmail || undefined }), token: token! });
      setShowCreate(false); setNewName(""); setNewEmail("");
      addToast("Sub-organization created", "success"); fetchSubOrgs();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaveLoading(false); }
  };

  const renameSubOrg = async () => {
    if (!editSubOrg || !newName.trim()) return;
    setSaveLoading(true);
    try {
      await apiFetch(`/sub-orgs/${editSubOrg.id}`, { method: "PATCH", body: JSON.stringify({ name: newName }), token: token! });
      setShowEdit(false); setEditSubOrg(null);
      addToast("Renamed", "success"); fetchSubOrgs();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaveLoading(false); }
  };

  const deleteSubOrg = async (id: string) => {
    if (!confirm("Delete this sub-organization and all its data?")) return;
    try {
      await apiFetch(`/sub-orgs/${id}`, { method: "DELETE", token: token! });
      addToast("Deleted", "success"); fetchSubOrgs();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const handleGoToSubOrg = () => {
    const trimmed = gotoSubOrgId.trim();
    if (!trimmed) { setGotoError("Enter a Sub-org ID"); return; }
    if (!/^[a-f0-9-]{36}$/i.test(trimmed)) { setGotoError("Invalid UUID format"); return; }
    setGotoError("");
    router.push(`/sub-orgs/${trimmed}`);
  };

  const viewSubOrg = async (subOrg: SubOrg) => {
    setImpersonateId(subOrg.id);
    try {
      const res: any = await apiFetch(`/sub-orgs/${subOrg.id}/impersonate`, { method: "POST", token: token! });
      localStorage.setItem("wrankey_parent_token", token!);
      localStorage.setItem("wrankey_parent_user", JSON.stringify(user));
      localStorage.setItem("wrankey_parent_org", JSON.stringify(org));
      localStorage.setItem("wrankey_parent_org_name", org?.name || "");
      login(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role }, { id: res.org.id, name: res.org.name });
      addToast(`Switched to "${subOrg.name}"`, "success");
      router.push("/");
    } catch (err: any) { addToast(err.message || "Failed to switch", "error"); }
    finally { setImpersonateId(null); }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sub-Orgs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Each sub-org is a user container with their own isolated wallets, users, and policies. User wallets live here.</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setNewName(""); setNewEmail(""); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New Sub-Org
        </Button>
      </div>

      {/* Go to Sub-Org ID */}
      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Sub-org ID</label>
              <div className="flex gap-2">
                <Input
                  value={gotoSubOrgId}
                  onChange={e => { setGotoSubOrgId(e.target.value); setGotoError(""); }}
                  placeholder="Paste a sub-org UUID to navigate directly..."
                  className="flex-1 h-10 text-xs font-mono"
                  onKeyDown={e => e.key === "Enter" && handleGoToSubOrg()}
                />
                <Button onClick={handleGoToSubOrg} className="h-10 px-4">
                  <ArrowRight className="w-4 h-4 mr-1.5" /> Go to sub-org
                </Button>
              </div>
              {gotoError && <p className="text-[11px] text-red-500 mt-1">{gotoError}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <>
              <Table
                columns={[
                  { key: "name", header: "Name", render: (s: SubOrg) => (
                    <button onClick={() => router.push(`/sub-orgs/${s.id}`)} className="font-medium text-sm text-brand-600 hover:text-brand-700 text-left">
                      {s.name} <ChevronRight className="w-3 h-3 inline" />
                    </button>
                  )},
                  { key: "id", header: "ID", render: (s: SubOrg) => (
                    <div className="flex items-center gap-1"><span className="font-mono text-[11px]">{s.id.slice(0, 8)}...{s.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(s.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div>
                  )},
                  { key: "rootUser", header: "Root User", render: (s: SubOrg) => <span className="text-xs">{s.rootUserEmail || "—"}</span> },
                  { key: "users", header: "Users", render: (s: SubOrg) => <span className="text-sm font-medium">{s.userCount}</span> },
                  { key: "wallets", header: "Wallets", render: (s: SubOrg) => <span className="text-sm font-medium">{s.walletCount}</span> },
                  { key: "createdAt", header: "Created", render: (s: SubOrg) => <span className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
                  { key: "actions", header: "", render: (s: SubOrg) => (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="secondary" className="h-7 text-[11px] px-2" onClick={() => viewSubOrg(s)} disabled={impersonateId === s.id}>
                        <ExternalLink className="w-3 h-3 mr-1" /> {impersonateId === s.id ? "..." : "Go to sub-org"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditSubOrg(s); setNewName(s.name); setShowEdit(true); }}><Pencil className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteSubOrg(s.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                    </div>
                  )},
                ]}
                data={subOrgs} loading={false} emptyMessage="No sub-organizations found. Create your first one to isolate customer data."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Sub-Organization">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Create an isolated workspace for a customer or team. Each sub-org has its own wallets, users, and policies.</p>
          <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Alice's Company" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Root User Email (optional)</label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="admin@company.com" /></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Button><Button onClick={createSubOrg} disabled={saveLoading} className="flex-1">{saveLoading ? "Creating..." : "Create"}</Button></div>
        </div>
      </Modal>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Rename Sub-Organization">
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={newName} onChange={e => setNewName(e.target.value)} /></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setShowEdit(false)} className="flex-1">Cancel</Button><Button onClick={renameSubOrg} disabled={saveLoading} className="flex-1">Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
