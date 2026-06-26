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
import { Tag, Plus, Copy, Trash2, Pencil, Search } from "lucide-react";

interface TagRow {
  id: string;
  name: string;
  type: string;
  usageCount: number;
  createdAt: string;
}

export default function TagsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"user" | "wallet">("user");
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showCreateTag, setShowCreateTag] = useState(false);
  const [showEditTag, setShowEditTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [editTag, setEditTag] = useState<TagRow | null>(null);
  const [editNewName, setEditNewName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/tags?limit=200&type=${activeTab}`, { token });
      setTags(res.data || []);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, activeTab]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchTags(); }, [isAuthenticated, fetchTags, router]);

  const createTag = async () => {
    if (!newTagName.trim()) { addToast("Tag name required", "error"); return; }
    setSaveLoading(true);
    try {
      await apiFetch("/tags", { method: "POST", body: JSON.stringify({ name: newTagName.trim(), type: activeTab }), token: token! });
      setShowCreateTag(false); setNewTagName("");
      addToast("Tag created", "success"); fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaveLoading(false); }
  };

  const renameTag = async () => {
    if (!editNewName.trim() || !editTag) return;
    setSaveLoading(true);
    try {
      await apiFetch(`/tags/${editTag.id}`, { method: "PATCH", body: JSON.stringify({ name: editNewName.trim() }), token: token! });
      setShowEditTag(false); setEditTag(null); setEditNewName("");
      addToast("Tag renamed", "success"); fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaveLoading(false); }
  };

  const deleteTag = async (id: string, name: string) => {
    if (!confirm(`Delete tag "${name}"? It will be removed from all ${activeTab === "user" ? "users" : "wallets"}.`)) return;
    try {
      await apiFetch(`/tags/${id}`, { method: "DELETE", token: token! });
      addToast(`Tag "${name}" deleted`, "success"); fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const filteredTags = search ? tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search)) : tags;

  const columns = [
    { key: "name", header: "Tag name", render: (t: TagRow) => (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
        <Tag className="w-3 h-3" />{t.name}
      </span>
    )},
    { key: "id", header: "Tag ID", render: (t: TagRow) => (
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px]">{t.id.slice(0, 4)}····{t.id.slice(-4)}</span>
        <button onClick={() => { navigator.clipboard.writeText(t.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button>
      </div>
    )},
    { key: "usageCount", header: activeTab === "user" ? "Users" : "Wallets", render: (t: TagRow) => <span className="text-sm">{t.usageCount || "—"}</span> },
    { key: "createdAt", header: "Date created", render: (t: TagRow) => (
      <span className="text-xs text-slate-500">{new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
    )},
    { key: "actions", header: "", render: (t: TagRow) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-slate-500" onClick={() => { setEditTag(t); setEditNewName(t.name); setShowEditTag(true); }}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => deleteTag(t.id, t.name)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tags</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "user", label: "User Tags" },
          { key: "wallet", label: "Private Key Tags" },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key as any); setSearch(""); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => { setShowCreateTag(true); setNewTagName(""); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Create {activeTab === "user" ? "user" : "private key"} tag
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by tag name or ID..." className="pl-9 text-sm" />
        </div>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <Table columns={columns} data={filteredTags} loading={false} emptyMessage={`No ${activeTab === "user" ? "user" : "private key"} tags yet.`} />
          )}
        </CardContent>
      </Card>

      <Modal open={showCreateTag} onClose={() => { setShowCreateTag(false); setNewTagName(""); }} title={`Create ${activeTab === "user" ? "user" : "private key"} tag`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Tags help group {activeTab === "user" ? "users" : "private keys"} for applying consistent policies.</p>
          <div className="space-y-1"><label className="text-sm font-medium">Tag name</label><Input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="e.g. engineering" /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowCreateTag(false); setNewTagName(""); }} className="flex-1">Cancel</Button>
            <Button onClick={createTag} disabled={saveLoading} className="flex-1">{saveLoading ? "Creating..." : "Create"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showEditTag} onClose={() => setShowEditTag(false)} title="Edit tag">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Rename this tag across all {activeTab === "user" ? "users" : "wallets"}.</p>
          <div className="space-y-1"><label className="text-sm font-medium">Tag name</label><Input value={editNewName} onChange={e => setEditNewName(e.target.value)} /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowEditTag(false)} className="flex-1">Cancel</Button>
            <Button onClick={renameTag} disabled={saveLoading} className="flex-1">{saveLoading ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
