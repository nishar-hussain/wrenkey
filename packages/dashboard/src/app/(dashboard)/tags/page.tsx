"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Tag, Plus, Trash2 } from "lucide-react";

interface TagCount {
  name: string;
  wallets: number;
  users: number;
  agents: number;
}

export default function TagsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [tags, setTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [walletsRes, usersRes, agentsRes] = await Promise.all([
        apiFetch<any>("/wallets?limit=500", { token }),
        apiFetch<any>("/users?limit=500", { token }),
        apiFetch<any>("/agents?limit=500", { token }),
      ]);
      const tagMap = new Map<string, TagCount>();
      for (const w of walletsRes.data || []) {
        for (const t of w.tags || []) {
          if (t.startsWith("custom-token:")) continue;
          const e = tagMap.get(t) || { name: t, wallets: 0, users: 0, agents: 0 };
          e.wallets++; tagMap.set(t, e);
        }
      }
      for (const u of usersRes.data || []) {
        for (const t of u.tags || []) {
          const e = tagMap.get(t) || { name: t, wallets: 0, users: 0, agents: 0 };
          e.users++; tagMap.set(t, e);
        }
      }
      for (const a of agentsRes.data || []) {
        for (const t of a.user?.tags || []) {
          const e = tagMap.get(t) || { name: t, wallets: 0, users: 0, agents: 0 };
          e.agents++; tagMap.set(t, e);
        }
      }
      setTags(Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: any) {
      addToast(err.message || "Failed to load tags", "error");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchTags();
  }, [isAuthenticated, fetchTags, router]);

  const deleteTag = async (tagName: string) => {
    if (!confirm(`Remove tag "${tagName}" from all resources?`)) return;
    try {
      const walletRes: any = await apiFetch("/wallets?limit=500", { token: token! });
      for (const w of walletRes.data || []) {
        if ((w.tags || []).includes(tagName)) {
          await apiFetch(`/wallets/${w.id}`, { method: "PATCH", body: JSON.stringify({ tags: w.tags.filter((t: string) => t !== tagName) }), token: token! });
        }
      }
      addToast(`Tag "${tagName}" removed`, "success");
      fetchTags();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tags</h1>
      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <Table
              columns={[
                { key: "name", header: "Tag", render: (t: TagCount) => <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"><Tag className="w-3 h-3" />{t.name}</span> },
                { key: "wallets", header: "Wallets", render: (t: TagCount) => <span className="text-sm font-medium">{t.wallets || "—"}</span> },
                { key: "users", header: "Users", render: (t: TagCount) => <span className="text-sm font-medium">{t.users || "—"}</span> },
                { key: "agents", header: "Agents", render: (t: TagCount) => <span className="text-sm font-medium">{t.agents || "—"}</span> },
                { key: "actions", header: "", render: (t: TagCount) => <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => deleteTag(t.name)}><Trash2 className="w-3 h-3" /></Button> },
              ]}
              data={tags} loading={false} emptyMessage="No tags found." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
