"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";
import { ChevronRight, User as UserIcon, Copy, Key, ShieldCheck, Globe } from "lucide-react";

interface SubOrgUserDetail {
  id: string;
  name: string;
  email: string | null;
  role: string;
  tags: string[];
  status: "Active" | "Invited";
  createdAt: string;
  updatedAt: string;
  authenticators: {
    id: string;
    name: string;
    credentialId: string;
    createdAt: string;
    lastUsedAt: string;
  }[];
  apiKeys: {
    id: string;
    name: string;
    publicKey: string;
    createdAt: string;
    lastUsedAt: string;
  }[];
  oauthProviders: {
    id: string;
    provider: string;
    subjectId: string;
    createdAt: string;
    lastUsedAt: string;
  }[];
}

export default function SubOrgUserDetailPage() {
  const router = useRouter();
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  const [detail, setDetail] = useState<SubOrgUserDetail | null>(null);
  const [subOrgName, setSubOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // Fetch sub-org settings to get sub-org name
      const subOrgRes: any = await apiFetch(`/sub-orgs/${id}/settings`, { token });
      setSubOrgName(subOrgRes.name || "Sub-Org");

      // Fetch user details
      const userRes: any = await apiFetch(`/sub-orgs/${id}/users/${userId}`, { token });
      setDetail(userRes);
    } catch {
      addToast("Failed to load user details", "error");
      router.push(`/sub-orgs/${id}`);
    } finally {
      setLoading(false);
    }
  }, [token, id, userId, router, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!isAuthenticated || loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!detail) return null;

  const formatId = (rawId: string) =>
    rawId.length > 8 ? `${rawId.slice(0, 4)}\u00b7\u00b7\u00b7\u00b7${rawId.slice(-4)}` : rawId;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const copyToClipboard = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    addToast(label, "success");
  };

  const isRoot = detail.role === "ORG_ADMIN";
  const displayRole = isRoot ? "Root" : detail.role.replace(/_/g, " ").toLowerCase();

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <button onClick={() => router.push("/sub-orgs")} className="hover:text-slate-700 transition-colors">
          Sub-Orgs
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <button onClick={() => router.push(`/sub-orgs/${id}`)} className="hover:text-slate-700 transition-colors">
          {subOrgName}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <button onClick={() => router.push(`/sub-orgs/${id}#users`)} className="hover:text-slate-700 transition-colors">
          Users
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-700 font-medium">{detail.name}</span>
      </nav>

      {/* Header Card */}
      <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-slate-500 mb-2 text-sm">
            <div className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <UserIcon className="w-4 h-4" />
            </div>
            <span>User</span>
          </div>

          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{detail.name}</h1>
          </div>

          {detail.email && <p className="text-sm text-slate-500 mb-4">{detail.email}</p>}

          <div className="flex items-center gap-2 mb-6">
            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800 capitalize">
              {displayRole}
            </span>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-5 border-t border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">User ID</p>
              <div className="flex items-center gap-1">
                <code className="text-xs font-mono text-slate-700 dark:text-slate-200">{formatId(detail.id)}</code>
                <button
                  onClick={() => copyToClipboard(detail.id, "User ID copied")}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Created</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{formatDate(detail.createdAt)}</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Last Updated</p>
              <p className="text-xs text-slate-700 dark:text-slate-200">{formatDate(detail.updatedAt)}</p>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1 font-medium">Status</p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    detail.status === "Active" ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{detail.status}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authenticators */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Authenticators</h2>
        <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            <Table
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (a: any) => (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium">{a.name}</span>
                    </div>
                  ),
                },
                {
                  key: "credentialId",
                  header: "Credential ID",
                  render: (a: any) => <code className="text-xs font-mono text-slate-500">{a.credentialId}</code>,
                },
                {
                  key: "createdAt",
                  header: "Created",
                  render: (a: any) => <span className="text-xs text-slate-500">{formatDate(a.createdAt)}</span>,
                },
                {
                  key: "lastUsedAt",
                  header: "Last Used",
                  render: (a: any) => <span className="text-xs text-slate-500">{formatDate(a.lastUsedAt)}</span>,
                },
              ]}
              data={detail.authenticators || []}
              emptyMessage="No authenticators registered."
            />
          </CardContent>
        </Card>
      </div>

      {/* API Keys */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">API Keys</h2>
        <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            <Table
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (k: any) => (
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium">{k.name}</span>
                    </div>
                  ),
                },
                {
                  key: "publicKey",
                  header: "Public Key",
                  render: (k: any) => (
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono text-slate-500">{formatId(k.publicKey)}</code>
                      <button
                        onClick={() => copyToClipboard(k.publicKey, "Public Key copied")}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  ),
                },
                {
                  key: "createdAt",
                  header: "Created",
                  render: (k: any) => <span className="text-xs text-slate-500">{formatDate(k.createdAt)}</span>,
                },
                {
                  key: "lastUsedAt",
                  header: "Last Used",
                  render: (k: any) => <span className="text-xs text-slate-500">{formatDate(k.lastUsedAt)}</span>,
                },
              ]}
              data={detail.apiKeys || []}
              emptyMessage="No API keys registered."
            />
          </CardContent>
        </Card>
      </div>

      {/* OAuth Providers */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">OAuth Providers</h2>
        <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            <Table
              columns={[
                {
                  key: "provider",
                  header: "Provider",
                  render: (o: any) => (
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-medium">{o.provider}</span>
                    </div>
                  ),
                },
                {
                  key: "subjectId",
                  header: "Subject ID",
                  render: (o: any) => <code className="text-xs font-mono text-slate-500">{o.subjectId}</code>,
                },
                {
                  key: "createdAt",
                  header: "Created",
                  render: (o: any) => <span className="text-xs text-slate-500">{formatDate(o.createdAt)}</span>,
                },
                {
                  key: "lastUsedAt",
                  header: "Last Used",
                  render: (o: any) => <span className="text-xs text-slate-500">{formatDate(o.lastUsedAt)}</span>,
                },
              ]}
              data={detail.oauthProviders || []}
              emptyMessage="No OAuth providers registered."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
