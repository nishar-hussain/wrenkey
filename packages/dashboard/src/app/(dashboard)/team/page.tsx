"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/badge";
import { Users, Mail, ShieldAlert } from "lucide-react";

interface TeamMember {
  id: string;
  email?: string;
  phone?: string;
  role: string;
  createdAt: string;
}

export default function TeamPage() {
  const router = useRouter();
  const { isAuthenticated, token, org } = useAuth();
  const { addToast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 10;

  const fetchMembers = async (p: number) => {
    setLoading(true);
    try {
      const res: any = await apiFetch(`/users?limit=${limit}&offset=${(p - 1) * limit}`, { token: token! });
      setMembers(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      addToast(err.message || "Failed to load team", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchMembers(page);
  }, [isAuthenticated, page]);

  if (!isAuthenticated) return null;

  const roleBadge = (role: string) => {
    if (role === "ORG_ADMIN") return <Badge variant="default">Admin</Badge>;
    if (role === "DEVELOPER") return <Badge variant="secondary">Developer</Badge>;
    return <Badge variant="outline">{role}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {org?.name || "Organization"} — {total} member{total !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" />
          <span>Team admin: {org?.name || "—"}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <span className="font-semibold">All Members</span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <>
              <Table
                headers={["Member", "Role", "Joined"]}
                rows={members.map((m) => [
                  <div key={m.id} className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-medium">
                      {(m.email || m.phone || "?")?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.email || m.phone || "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{m.id.slice(0, 8)}...</p>
                    </div>
                  </div>,
                  roleBadge(m.role),
                  new Date(m.createdAt).toLocaleDateString(),
                ])}
              />
              <div className="mt-4">
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(total / limit)}
                  onPageChange={(p) => setPage(p)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
