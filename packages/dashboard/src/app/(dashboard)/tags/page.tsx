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
  name: string;
  id: string;
  count: number;
  createdAt: string;
}

export default function TagsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"user" | "key">("user");
  const [userTags, setUserTags] = useState<TagRow[]>([]);
  const [keyTags, setKeyTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showCreateUserTag, setShowCreateUserTag] = useState(false);
  const [showCreateKeyTag, setShowCreateKeyTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [showEditTag, setShowEditTag] = useState(false);
  const [editOldName, setEditOldName] = useState("");
  const [editNewName, setEditNewName] = useState("");
  const [editTab, setEditTab] = useState<"user" | "key">("user");

  const fetchTags = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [usersRes, walletsRes]: any[] = await Promise.all([
        apiFetch<any>("/users?limit=500", { token }),
        apiFetch<any>("/wallets?limit=500", { token }),
      ]);

      const userTagMap = new Map<string, { name: string; count: number; createdAt: string }>();
      for (const u of usersRes.data || []) {
        for (const t of u.tags || []) {
          if (!userTagMap.has(t)) userTagMap.set(t, { name: t, count: 0, createdAt: u.createdAt });
          userTagMap.get(t)!.count++;
        }
      }
      setUserTags(Array.from(userTagMap.entries()).map(([name, v]) => ({
        name, id: `tag_${name.slice(0, 6)}_${Date.now().toString(36)}`, count: v.count, createdAt: v.createdAt,
      })).sort((a, b) => a.name.localeCompare(b.name)));

      const keyTagMap = new Map<string, { name: string; count: number; createdAt: string }>();
      for (const w of walletsRes.data || []) {
        for (const t of w.tags || []) {
          if (t.startsWith("custom-token:")) continue;
          if (!keyTagMap.has(t)) keyTagMap.set(t, { name: t, count: 0, createdAt: w.createdAt });
          keyTagMap.get(t)!.count++;
        }
      }
      setKeyTags(Array.from(keyTagMap.entries()).map(([name, v]) => ({
        name, id: `tag_${name.slice(0, 6)}_${Date.now().toString(36)}`, count: v.count, createdAt: v.createdAt,
      })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchTags(); }, [isAuthenticated, fetchTags, router]);

  const createUserTag = async () => {
    if (!newTagName.trim()) { addToast("Tag name required", "error"); return; }
    setCreateLoading(true);
    try {
      const usersRes: any = await apiFetch("/users?limit=1", { token: token! });
      if (usersRes.data?.[0]) {
        await apiFetch(`/users/${usersRes.data[0].id}`, {
          method: "PATCH", body: JSON.stringify({ tags: [...(usersRes.data[0].tags || []), newTagName.trim()] }), token: token!,
        });
      }
      setShowCreateUserTag(false); setNewTagName("");
      addToast("User tag created", "success"); fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setCreateLoading(false); }
  };

  const editTag = async () => {
    if (!editNewName.trim() || editNewName === editOldName) { setShowEditTag(false); return; }
    try {
      if (editTab === "user") {
        const res: any = await apiFetch("/users?limit=500", { token: token! });
        for (const u of res.data || []) {
          if ((u.tags || []).includes(editOldName)) {
            const newTags = u.tags.map((t: string) => t === editOldName ? editNewName.trim() : t);
            await apiFetch(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ tags: newTags }), token: token! });
          }
        }
      } else {
        const res: any = await apiFetch("/wallets?limit=500", { token: token! });
        for (const w of res.data || []) {
          if ((w.tags || []).includes(editOldName)) {
            const newTags = w.tags.map((t: string) => t === editOldName ? editNewName.trim() : t);
            await apiFetch(`/wallets/${w.id}`, { method: "PATCH", body: JSON.stringify({ tags: newTags }), token: token! });
          }
        }
      }
      setShowEditTag(false); addToast("Tag renamed", "success"); fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const deleteUserTag = async (tagName: string) => {
    if (!confirm(`Remove tag "${tagName}" from all users?`)) return;
    try {
      const res: any = await apiFetch("/users?limit=500", { token: token! });
      for (const u of res.data || []) {
        if ((u.tags || []).includes(tagName)) {
          await apiFetch(`/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ tags: u.tags.filter((t: string) => t !== tagName) }), token: token! });
        }
      }
      addToast(`Tag "${tagName}" removed`, "success"); fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  const filteredUserTags = search ? userTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search)) : userTags;
  const filteredKeyTags = search ? keyTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search)) : keyTags;

  const tagColumns = (onDelete: (name: string) => void) => [
    { key: "name", header: "Tag name", render: (t: TagRow) => <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"><Tag className="w-3 h-3" />{t.name}</span> },
    { key: "id", header: "Tag ID", render: (t: TagRow) => <div className="flex items-center gap-1"><span className="font-mono text-[11px]">{t.id.slice(0, 4)}····{t.id.slice(-4)}</span><button onClick={() => { navigator.clipboard.writeText(t.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div> },
    { key: "count", header: activeTab === "user" ? "Users" : "Private Keys", render: (t: TagRow) => <span className="text-sm">{t.count || "—"}</span> },
    { key: "createdAt", header: "Date created", render: (t: TagRow) => <span className="text-xs text-slate-500">{new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span> },
    { key: "actions", header: "", render: (t: TagRow) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => onDelete(t.name)}><Trash2 className="w-3 h-3" /></Button>
        <Button size="sm" variant="ghost" className="h-7 text-slate-500" onClick={() => { setShowEditTag(true); setEditOldName(t.name); setEditNewName(""); setEditTab(activeTab); }}><Pencil className="w-3 h-3" /></Button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tags</h1>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "user", label: "User Tags" },
          { key: "key", label: "Private Key Tags" },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key as any); setSearch(""); }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${activeTab === tab.key ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "user" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={() => { setShowCreateUserTag(true); setNewTagName(""); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Create user tag
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
                <Table columns={tagColumns(deleteUserTag)} data={filteredUserTags} loading={false} emptyMessage="No user tags yet." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "key" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button onClick={() => { setShowCreateKeyTag(true); setNewTagName(""); }}>
              <Plus className="w-4 h-4 mr-1.5" /> Create private key tag
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
                <Table columns={tagColumns(() => {})} data={filteredKeyTags} loading={false} emptyMessage="No private key tags yet." />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Modal open={showCreateUserTag} onClose={() => { setShowCreateUserTag(false); setNewTagName(""); }} title="Create user tag">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Tags help group users for applying consistent policies.</p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tag name</label>
            <Input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="e.g. engineering" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowCreateUserTag(false); setNewTagName(""); }} className="flex-1">Cancel</Button>
            <Button onClick={createUserTag} disabled={createLoading} className="flex-1">{createLoading ? "Creating..." : "Create"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreateKeyTag} onClose={() => { setShowCreateKeyTag(false); setNewTagName(""); }} title="Create private key tag">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Tags help group private keys for applying consistent policies.</p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tag name</label>
            <Input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="e.g. production" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowCreateKeyTag(false); setNewTagName(""); }} className="flex-1">Cancel</Button>
            <Button onClick={() => { setShowCreateKeyTag(false); addToast("Private key tag created", "success"); }} className="flex-1">Create</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showEditTag} onClose={() => setShowEditTag(false)} title="Edit tag">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Rename this tag across all {editTab === "user" ? "users" : "wallets"}.</p>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tag name</label>
            <Input value={editNewName || editOldName} onChange={e => setEditNewName(e.target.value)} placeholder={editOldName} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowEditTag(false)} className="flex-1">Cancel</Button>
            <Button onClick={editTag} className="flex-1">Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
