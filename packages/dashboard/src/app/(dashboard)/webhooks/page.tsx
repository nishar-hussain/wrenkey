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
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

const EVENT_OPTIONS = [
  "user.signup", "user.login",
  "wallet.created", "wallet.imported", "wallet.deleted", "wallet.exported", "account.created",
  "transaction.submitted", "transaction.confirmed", "transaction.failed",
  "policy.created", "policy.deleted", "policy.triggered",
  "agent.created", "agent.revoked", "agent.login",
];

export default function WebhooksPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ url: "", events: [] as string[] });
  const [createLoading, setCreateLoading] = useState(false);
  const [createdSecret, setCreatedSecret] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/webhooks?limit=${limit}&offset=${offset}`, { token });
      setWebhooks(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load webhooks", "error");
    } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const createWebhook = async () => {
    if (!form.url || form.events.length === 0) {
      addToast("URL and at least one event are required", "error");
      return;
    }
    setCreateLoading(true);
    try {
      const res: any = await apiFetch("/webhooks", {
        method: "POST",
        body: JSON.stringify(form),
        token: token!,
      });
      setCreatedSecret(res.hmacSecret);
      addToast("Webhook created", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to create webhook", "error");
    } finally { setCreateLoading(false); }
  };

  const deleteWebhook = async (id: string) => {
    try {
      await apiFetch(`/webhooks/${id}`, { method: "DELETE", token: token! });
      addToast("Webhook deleted", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete webhook", "error");
    }
  };

  const toggleEvent = (event: string) => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const selectAllEvents = () => {
    setForm((prev) => ({
      ...prev,
      events: prev.events.length === EVENT_OPTIONS.length ? [] : [...EVENT_OPTIONS],
    }));
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "url", header: "URL", render: (w: Webhook) => <span className="text-xs">{w.url}</span> },
    { key: "events", header: "Events", render: (w: Webhook) => <span className="text-xs">{w.events.length} events</span> },
    { key: "active", header: "Active", render: (w: Webhook) => <StatusBadge status={String(w.active)} /> },
    { key: "createdAt", header: "Created", render: (w: Webhook) => new Date(w.createdAt).toLocaleDateString() },
    {
      key: "actions", header: "",
      render: (w: Webhook) => (
        <Button variant="destructive" size="sm" onClick={() => deleteWebhook(w.id)}>Delete</Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <Button onClick={() => setShowCreate(true)}>Create Webhook</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={webhooks} loading={false} emptyMessage="No webhooks configured." />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreatedSecret(""); setForm({ url: "", events: [] }); }} title="Create Webhook">
        {createdSecret ? (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm">
              <p className="font-medium text-green-700">Webhook created!</p>
              <p className="text-green-600 mt-1">Save the HMAC secret for verifying payloads.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">HMAC Secret</label>
              <Input value={createdSecret} readOnly className="font-mono text-xs" />
            </div>
            <Button onClick={() => { setShowCreate(false); setCreatedSecret(""); setForm({ url: "", events: [] }); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Callback URL</label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhook" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Events</label>
                <button onClick={selectAllEvents} className="text-xs text-blue-600 hover:text-blue-800">
                  {form.events.length === EVENT_OPTIONS.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md p-3 space-y-1">
                {EVENT_OPTIONS.map((event) => (
                  <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.events.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="rounded border-slate-300"
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={createWebhook} disabled={createLoading} className="w-full">Create</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}