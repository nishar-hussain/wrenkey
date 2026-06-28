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
import { Plus, Search, Trash2, Edit3, Globe, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  name: string;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  event: string;
  status: string;
  attemptCount: number;
  lastAttemptAt: string;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

const EVENT_GROUPS = [
  {
    label: "Production Events",
    info: "Policy and agent lifecycle events.",
    events: ["policy.created", "policy.deleted", "policy.triggered", "agent.created", "agent.revoked", "agent.login"],
  },
  {
    label: "Activities",
    info: "Deliver activity updates for the organization.",
    events: ["user.signup", "user.login"],
  },
  {
    label: "Wallet Lifecycle",
    info: "Wallet creation, deletion, and security events.",
    events: ["wallet.created", "wallet.imported", "wallet.deleted", "wallet.exported", "wallet.frozen", "wallet.unfrozen", "wallet.rotated"],
  },
  {
    label: "Account Events",
    info: "Account creation and deletion.",
    events: ["account.created", "account.deleted"],
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

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdSecret, setCreatedSecret] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/webhooks?limit=${limit}&offset=${offset}`, { token });
      setWebhooks((res.data || []).map((w: any) => ({ ...w, name: w.url?.replace(/https?:\/\//, "").split("/")[0] || "Webhook" })));
      setTotal(res.total || 0);
    } catch { addToast("Failed to load data", "error"); } finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchData(); }, [isAuthenticated, fetchData, router]);

  const fetchDeliveries = async (webhookId: string) => {
    setDeliveryLoading(true);
    try {
      const res: any = await apiFetch(`/webhooks/${webhookId}/deliveries?limit=50`, { token: token! });
      setDeliveries(res.data || []);
      setDeliveryTotal(res.total || 0);
    } catch { addToast("Failed to load deliveries", "error"); } finally { setDeliveryLoading(false); }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDeliveries([]); }
    else { setExpandedId(id); fetchDeliveries(id); }
  };

  const resetForm = () => {
    setFormUrl(""); setFormEvents([]); setFormActive(true);
    setCreatedSecret(""); setEditingId(null);
  };

  const openCreate = () => { resetForm(); setShowModal(true); };
  const openEdit = (w: Webhook) => {
    setEditingId(w.id);
    setFormUrl(w.url);
    setFormEvents([...w.events]);
    setFormActive(w.active);
    setCreatedSecret("");
    setShowModal(true);
  };

  const saveWebhook = async () => {
    if (!formUrl || formEvents.length === 0) { addToast("URL and at least one event required", "error"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/webhooks/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ url: formUrl, events: formEvents, active: formActive }),
          token: token!,
        });
        addToast("Webhook updated", "success");
      } else {
        const res: any = await apiFetch("/webhooks", {
          method: "POST",
          body: JSON.stringify({ url: formUrl, events: formEvents }),
          token: token!,
        });
        setCreatedSecret(res.hmacSecret);
      }
      if (!editingId) return;
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err: any) { addToast(err.message || "Failed", "error"); } finally { setSaving(false); }
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

  const deliveryStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      DELIVERED: "bg-emerald-50 text-emerald-700 border-emerald-100",
      FAILED: "bg-red-50 text-red-700 border-red-100",
      RETRYING: "bg-amber-50 text-amber-700 border-amber-100",
      PENDING: "bg-slate-50 text-slate-500 border-slate-200",
    };
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${map[status] || map.PENDING}`}>
        {status === "DELIVERED" && <CheckCircle className="w-2.5 h-2.5" />}
        {status === "FAILED" && <XCircle className="w-2.5 h-2.5" />}
        {status === "RETRYING" && <RefreshCw className="w-2.5 h-2.5" />}
        {status === "PENDING" && <Clock className="w-2.5 h-2.5" />}
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-sm text-slate-500 mt-0.5">Real-time event notifications with HMAC-signed payloads and automatic retry.</p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={openCreate}>
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
            <div>
              <Table
                columns={[
                  { key: "name", header: "Name", render: (w: Webhook) => (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => toggleExpand(w.id)} className="p-0.5 text-slate-400 hover:text-slate-600">
                        {expandedId === w.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-medium text-sm">{w.name}</span>
                    </div>
                  )},
                  { key: "url", header: "Destination URL", render: (w: Webhook) => <span className="text-xs font-mono text-slate-500 truncate max-w-[240px] inline-block">{w.url}</span> },
                  { key: "events", header: "Subscriptions", render: (w: Webhook) => <span className="text-xs text-slate-500">{w.events?.length || 0} events</span> },
                  { key: "status", header: "Status", render: (w: Webhook) => (
                    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${w.active ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-100"}`}>
                      {w.active ? "Active" : "Inactive"}
                    </span>
                  )},
                  { key: "actions", header: "", render: (w: Webhook) => (
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(w)}><Edit3 className="w-3 h-3 text-slate-400" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteWebhook(w.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                    </div>
                  )},
                ]}
                data={filteredWebhooks} loading={false} emptyMessage="No webhook endpoints found."
              />

              {expandedId && (
                <div className="border-t border-slate-100 dark:border-slate-800 p-4 bg-slate-50/30 dark:bg-slate-900/30">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Delivery History</h4>
                    <button onClick={() => fetchDeliveries(expandedId)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                      <RefreshCw className="w-3 h-3 inline mr-1" /> Refresh
                    </button>
                  </div>
                  {deliveryLoading ? (
                    <div className="space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
                  ) : deliveries.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No deliveries recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-400 uppercase">Event</th>
                            <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-400 uppercase">Status</th>
                            <th className="text-center py-2 px-2 text-[10px] font-semibold text-slate-400 uppercase">Attempts</th>
                            <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-400 uppercase">Last Attempt</th>
                            <th className="text-left py-2 px-2 text-[10px] font-semibold text-slate-400 uppercase">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveries.map(d => (
                            <tr key={d.id} className="border-b border-slate-50 dark:border-slate-800/50">
                              <td className="py-2 px-2 font-mono text-[10px] text-slate-600">{d.event}</td>
                              <td className="py-2 px-2">{deliveryStatusBadge(d.status)}</td>
                              <td className="py-2 px-2 text-center text-slate-500">{d.attemptCount}</td>
                              <td className="py-2 px-2 text-[10px] text-slate-400">{d.lastAttemptAt ? new Date(d.lastAttemptAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                              <td className="py-2 px-2 text-[10px] text-red-500 max-w-[180px] truncate">{d.lastError || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingId ? "Edit Webhook" : "Create Webhook"}>
        {createdSecret && !editingId ? (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm"><p className="font-medium text-green-700">Webhook created!</p><p className="text-green-600 mt-1">Save the HMAC secret — it won't be shown again.</p></div>
            <div className="space-y-1"><label className="text-sm font-medium">HMAC Secret</label><Input value={createdSecret} readOnly className="font-mono text-xs" /></div>
            <Button onClick={() => { setShowModal(false); resetForm(); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <p className="text-sm text-slate-500">Configure the endpoint that receives webhook deliveries. Every payload is signed with HMAC-SHA256.</p>

            <div className="space-y-1">
              <label className="text-sm font-medium">Destination URL</label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://api.example.com/webhooks/wrankey" className="font-mono text-xs" />
            </div>

            {editingId && (
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Active</label>
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${formActive ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${formActive ? "left-4" : "left-0.5"}`} />
                </button>
              </div>
            )}

            <div className="space-y-3">
              <label className="text-sm font-medium">Event Subscriptions</label>
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
              <Button variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1">Cancel</Button>
              <Button onClick={saveWebhook} disabled={saving} className="flex-1">
                {saving ? "Saving..." : editingId ? "Update Webhook" : "Create Webhook"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
