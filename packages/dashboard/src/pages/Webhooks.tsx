import { useEffect, useState } from "react";
import { useArKey } from "@arkey/sdk/react";

export default function WebhooksPage() {
  const { client } = useArKey();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [createdHook, setCreatedHook] = useState<any>(null);

  const WEBHOOK_EVENTS = [
    "wallet.created", "transaction.submitted", "transaction.confirmed",
    "policy.triggered", "agent.created", "user.login",
  ];

  const loadWebhooks = async () => {
    try {
      const data = await client.getWebhooks();
      setWebhooks(data.webhooks || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => { loadWebhooks(); }, []);

  const handleCreate = async () => {
    try {
      const result = await client.createWebhook({ url, events });
      setCreatedHook(result);
      setUrl("");
      setEvents([]);
      setShowCreate(false);
      loadWebhooks();
    } catch (err) { console.error(err); }
  };

  const toggleEvent = (e: string) => {
    setEvents((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Webhooks</h2>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
          + Create Webhook
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Callback URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4" placeholder="https://example.com/webhook" />
          <label className="block text-sm font-medium text-gray-700 mb-2">Events</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {WEBHOOK_EVENTS.map((ev) => (
              <button key={ev} onClick={() => toggleEvent(ev)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  events.includes(ev) ? "bg-primary-100 border-primary-300 text-primary-700" : "bg-gray-50 border-gray-200 text-gray-500"
                }`}>{ev}</button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
          {createdHook && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-700">Webhook created!</p>
              <p className="text-xs text-green-600 mt-1">HMAC Secret: {createdHook.hmacSecret}</p>
            </div>
          )}
        </div>
      )}

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">URL</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Events</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Active</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {webhooks.map((w: any) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono truncate max-w-xs">{w.url}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(w.events || []).slice(0, 3).map((e: string) => (
                        <span key={e} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{e}</span>
                      ))}
                      {(w.events || []).length > 3 && <span className="text-xs text-gray-400">+{w.events.length - 3}</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4"><span className={`w-2 h-2 rounded-full inline-block ${w.active ? "bg-green-500" : "bg-gray-300"}`} /></td>
                  <td className="px-6 py-4">
                    <button onClick={async () => { await client.deleteWebhook(w.id); loadWebhooks(); }}
                      className="text-red-600 text-sm hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {webhooks.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No webhooks</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
