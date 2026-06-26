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
import { Plus, Search, Trash2, Globe, Activity, Scale, ArrowLeftRight, Bell } from "lucide-react";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  name: string;
  createdAt: string;
}

const EVENT_GROUPS = [
  {
    label: "Production Events",
    info: "",
    events: ["policy.created", "policy.deleted", "policy.triggered", "agent.created", "agent.revoked"],
  },
  {
    label: "Activities",
    info: "Deliver activity updates for the organization.",
    events: ["user.signup", "user.login", "agent.login"],
  },
  {
    label: "Confirmed Balances",
    info: "Deliver confirmed balance updates.",
    events: ["wallet.created", "wallet.imported"],
  },
  {
    label: "Finalized Balances",
    info: "Deliver finalized balance updates.",
    events: ["wallet.deleted", "wallet.exported", "account.created"],
  },
  {
    label: "Transactions",
    info: "Deliver transaction status updates.",
    events: ["transaction.submitted", "transaction.confirmed", "transaction.failed"],
  },
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
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [createdSecret, setCreatedSecret] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/webhooks?limit=${limit}&offset=${offset}`, { token });
      setWebhooks((res.data || []).map((w: any) => ({ ...w, name: w.url?.replace(/https?:\/\//, "").split("/")[0] || "Webhook" })));
      setTotal(res.total || 0);
    } catch { } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchData(); }, [isAuthenticated, fetchData, router]);

  const createWebhook = async () => {
    if (!formUrl || formEvents.length === 0) { addToast("URL and at least one event required", "error"); return; }
    setCreateLoading(true);
    try {
      const res: any = await apiFetch("/webhooks", { method: "POST", body: JSON.stringify({ url: formUrl, events: formEvents }), token: token! });
      setCreatedSecret(res.hmacSecret);
      addToast("Webhook created", "success"); fetchData();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setCreateLoading(false); }
  };

  const deleteWebhook = async (id: string) => {
    try { await apiFetch(`/webhooks/${id}`, { method: "DELETE", token: token! }); addToast("Webhook deleted", "success"); fetchData(); }
    catch (err: any) { addToast(err.message || "Failed", "error"); }
  };

  const toggleGroupEvents = (groupEvents: string[], checked: boolean) => {
    if (checked) setFormEvents([...new Set([...formEvents, ...groupEvents])]);
    else setFormEvents(formEvents.filter(e => !groupEvents.includes(e)));
  };

  if (!isAuthenticated) return null;

  const filteredWebhooks = search ? webhooks.filter(w => w.url.toLowerCase().includes(search.toLowerCase()) || w.name.toLowerCase().includes(search.toLowerCase())) : webhooks;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-sm text-slate-500">Webhook Endpoints</p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => { setShowCreate(true); setFormUrl(""); setFormEvents([]); setCreatedSecret(""); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New webhook
        </Button>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search webhooks..." className="pl-9 text-sm" />
        </div>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <Table
              columns={[
                { key: "name", header: "Name", render: (w: Webhook) => <span className="font-medium text-sm">{w.name}</span> },
                { key: "url", header: "Destination URL", render: (w: Webhook) => <span className="text-xs font-mono text-slate-500 truncate max-w-[200px] inline-block">{w.url}</span> },
                { key: "events", header: "Subscriptions", render: (w: Webhook) => <span className="text-xs text-slate-500">{w.events?.length || 0} events</span> },
                { key: "status", header: "Status", render: (w: Webhook) => <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${w.active ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-100"}`}>{w.active ? "Active" : "Inactive"}</span> },
                { key: "actions", header: "", render: (w: Webhook) => <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => deleteWebhook(w.id)}><Trash2 className="w-3 h-3" /></Button> },
              ]}
              data={filteredWebhooks} loading={false} emptyMessage="No webhook endpoints found."
            />
          )}
        </CardContent>
      </Card>

      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreatedSecret(""); setFormUrl(""); setFormEvents([]); }} title="Create Webhook">
        {createdSecret ? (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm"><p className="font-medium text-green-700">Webhook created!</p><p className="text-green-600 mt-1">Save the HMAC secret for verifying payloads.</p></div>
            <div className="space-y-1"><label className="text-sm font-medium">HMAC Secret</label><Input value={createdSecret} readOnly className="font-mono text-xs" /></div>
            <Button onClick={() => { setShowCreate(false); setCreatedSecret(""); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Configure the endpoint that receives webhook deliveries.</p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Production Events</label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://example.com/webhook" className="font-mono text-xs" />
            </div>

            <div className="space-y-3 max-h-[40vh] overflow-y-auto">
              {EVENT_GROUPS.map(group => {
                const allChecked = group.events.every(e => formEvents.includes(e));
                const someChecked = group.events.some(e => formEvents.includes(e)) && !allChecked;
                return (
                  <div key={group.label} className="border border-slate-100 dark:border-slate-800 rounded-lg p-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked; }}
                        onChange={e => toggleGroupEvents(group.events, e.target.checked)} className="rounded border-slate-300" />
                      <div>
                        <span className="text-sm font-medium">{group.label}</span>
                        {group.info && <p className="text-xs text-slate-400">{group.info}</p>}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setShowCreate(false); setFormUrl(""); setFormEvents([]); }} className="flex-1">Cancel</Button>
              <Button onClick={createWebhook} disabled={createLoading} className="flex-1">{createLoading ? "Creating..." : "Create Webhook"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
