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
import { Layers, Copy, ChevronRight, ArrowRight } from "lucide-react";

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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [showEdit, setShowEdit] = useState(false);
  const [editSubOrg, setEditSubOrg] = useState<SubOrg | null>(null);
  const [newName, setNewName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

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
    setGotoError("");
    router.push(`/sub-orgs/${trimmed}`);
  };

  const formatId = (id: string) => `${id.slice(0, 4)}\u00b7\u00b7\u00b7\u00b7${id.slice(-4)}`;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sub-Orgs</h1>
      </div>

      {/* Go to Sub-Org ID — flat input bar matching image */}
      <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Input
              value={gotoSubOrgId}
              onChange={e => { setGotoSubOrgId(e.target.value); setGotoError(""); }}
              placeholder="Sub-org ID"
              className="flex-1 h-10 text-sm bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              onKeyDown={e => e.key === "Enter" && handleGoToSubOrg()}
            />
            <Button
              onClick={handleGoToSubOrg}
              variant="secondary"
              className="h-10 px-4 whitespace-nowrap flex items-center gap-1.5"
            >
              Go to sub-org <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
          {gotoError && <p className="text-[11px] text-red-500 mt-1">{gotoError}</p>}
        </CardContent>
      </Card>

      <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <>
              <Table
                columns={[
                  { key: "name", header: "Name", sortable: true, render: (s: SubOrg) => (
                    <button
                      onClick={() => router.push(`/sub-orgs/${s.id}`)}
                      className="flex items-center gap-2 font-medium text-sm text-slate-800 dark:text-slate-100 hover:text-brand-600 text-left"
                    >
                      <span className="flex items-center justify-center w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex-shrink-0">
                        <Layers className="w-3.5 h-3.5" />
                      </span>
                      {s.name}
                    </button>
                  )},
                  { key: "id", header: "ID", render: (s: SubOrg) => (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[11px] text-slate-500">{formatId(s.id)}</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(s.id); addToast("Copied", "success"); }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )},
                  { key: "rootUser", header: "Root User", render: (s: SubOrg) => <span className="text-sm text-slate-600">{s.rootUserEmail || "—"}</span> },
                  { key: "users", header: "Users", render: (s: SubOrg) => <span className="text-sm font-medium text-slate-700">{s.userCount}</span> },
                  { key: "wallets", header: "Wallets", render: (s: SubOrg) => <span className="text-sm font-medium text-slate-700">{s.walletCount}</span> },
                  { key: "createdAt", header: "Created", sortable: true, render: (s: SubOrg) => (
                    <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(s.createdAt)}</span>
                  )},
                  { key: "chevron", header: "", render: (s: SubOrg) => (
                    <button
                      onClick={() => router.push(`/sub-orgs/${s.id}`)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )},
                ]}
                data={subOrgs} loading={false} emptyMessage="No sub-organizations found. Create your first one to isolate customer data."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Rename Sub-Organization">
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium">Name</label><Input value={newName} onChange={e => setNewName(e.target.value)} /></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setShowEdit(false)} className="flex-1">Cancel</Button><Button onClick={renameSubOrg} disabled={saveLoading} className="flex-1">Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
