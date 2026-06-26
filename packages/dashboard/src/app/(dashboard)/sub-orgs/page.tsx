"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Layers, Plus, Copy, Trash2, Pencil, ExternalLink } from "lucide-react";

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
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [subOrgId, setSubOrgId] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editSubOrg, setEditSubOrg] = useState<SubOrg | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const fetchSubOrgs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch("/sub-orgs?limit=50", { token });
      setSubOrgs(res.data || []);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token]);

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

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sub-Orgs</h1>
          <p className="text-sm text-slate-500">Manage sub-organizations under your account</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setNewName(""); setNewEmail(""); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New Sub-Org
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-sm"><label className="text-xs font-medium text-slate-500 mb-1 block">Sub-org ID</label><Input value={subOrgId} onChange={e => setSubOrgId(e.target.value)} placeholder="Enter sub-org ID..." className="font-mono text-xs" /></div>
        <Button className="mt-5" size="sm" onClick={() => { if (subOrgId.trim()) router.push(`/settings`); else addToast("Enter a sub-org ID", "info"); }}><ExternalLink className="w-3.5 h-3.5 mr-1" /> Go to sub-org</Button>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <Table
              columns={[
                { key: "name", header: "Name", render: (s: SubOrg) => <span className="font-medium text-sm">{s.name}</span> },
                { key: "id", header: "ID", render: (s: SubOrg) => <div className="flex items-center gap-1"><span className="font-mono text-[11px]">{s.id.slice(0, 8)}...</span><button onClick={() => { navigator.clipboard.writeText(s.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div> },
                { key: "rootUser", header: "Root User", render: (s: SubOrg) => <span className="text-xs">{s.rootUserEmail || "—"}</span> },
                { key: "users", header: "Users", render: (s: SubOrg) => <span className="text-sm font-medium">{s.userCount}</span> },
                { key: "wallets", header: "Wallets", render: (s: SubOrg) => <span className="text-sm font-medium">{s.walletCount}</span> },
                { key: "createdAt", header: "Created", render: (s: SubOrg) => <span className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</span> },
                { key: "actions", header: "", render: (s: SubOrg) => (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditSubOrg(s); setNewName(s.name); setShowEdit(true); }}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => deleteSubOrg(s.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                )},
              ]}
              data={subOrgs} loading={false} emptyMessage="No sub-orgs found."
            />
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Sub-Organization">
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Sub-org name" /></div>
          <div className="space-y-1"><label className="text-sm font-medium">Root User Email (optional)</label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="admin@suborg.com" /></div>
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
