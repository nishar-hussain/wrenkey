"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Layers, Copy, ExternalLink } from "lucide-react";

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
  const { isAuthenticated, token, org } = useAuth();
  const { addToast } = useToast();
  const [subOrgs, setSubOrgs] = useState<SubOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [subOrgId, setSubOrgId] = useState("");

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    async function load() {
      setLoading(true);
      try {
        const res: any = await apiFetch("/orgs", { token: token! });
        const current = Array.isArray(res) ? res[0] : res;
        if (current) {
          const [usersRes, walletsRes] = await Promise.all([
            apiFetch<any>("/users?limit=1", { token: token! }),
            apiFetch<any>("/wallets?limit=1", { token: token! }),
          ]);
          const adminUser = await apiFetch<any>(`/users?limit=1`, { token: token! }).then(r => r.data?.[0]).catch(() => null);
          setSubOrgs([{
            id: current.id,
            name: current.name || "Default Org",
            rootUserId: adminUser?.id,
            rootUserEmail: adminUser?.email,
            userCount: usersRes.total || 0,
            walletCount: walletsRes.total || 0,
            createdAt: current.createdAt || new Date().toISOString(),
          }]);
        }
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, router, token]);

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sub-Orgs</h1>
          <p className="text-sm text-slate-500">Manage sub-organizations under your account</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 max-w-sm">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Sub-org ID</label>
          <Input value={subOrgId} onChange={e => setSubOrgId(e.target.value)} placeholder="Enter sub-org ID..." className="font-mono text-xs" />
        </div>
        <Button className="mt-5" size="sm" onClick={() => { if (subOrgId.trim()) router.push(`/settings`); else addToast("Enter a sub-org ID", "info"); }}>
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> Go to sub-org
        </Button>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : subOrgs.length === 0 ? (
            <div className="text-center py-16">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No sub-orgs found.</p>
              <p className="text-xs text-slate-400 mt-1">Create a sub-organization to manage separate teams and wallets.</p>
            </div>
          ) : (
            <Table
              columns={[
                { key: "name", header: "Name", render: (s: SubOrg) => <span className="font-medium text-sm">{s.name}</span> },
                { key: "id", header: "ID", render: (s: SubOrg) => <div className="flex items-center gap-1"><span className="font-mono text-[11px]">{s.id.slice(0, 8)}...</span><button onClick={() => { navigator.clipboard.writeText(s.id); addToast("Copied", "success"); }} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button></div> },
                { key: "rootUser", header: "Root User", render: (s: SubOrg) => <span className="text-xs">{s.rootUserEmail || "—"}</span> },
                { key: "users", header: "Users", render: (s: SubOrg) => <span className="text-sm font-medium">{s.userCount}</span> },
                { key: "wallets", header: "Wallets", render: (s: SubOrg) => <span className="text-sm font-medium">{s.walletCount}</span> },
                { key: "createdAt", header: "Created", render: (s: SubOrg) => <span className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleDateString()}</span> },
              ]}
              data={subOrgs}
              loading={false}
              emptyMessage="No sub-orgs found."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
