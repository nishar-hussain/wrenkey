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
import { Key, Copy, Trash2, ChevronDown, ChevronUp, Download, Check, ExternalLink, Eye, EyeOff } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  publicKey?: string;
  permissions: string[];
  allowedIps: string[];
  expiresAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [providedPublicKey, setProvidedPublicKey] = useState("");
  const [creating, setCreating] = useState(false);

  // Success modal state
  const [createdKey, setCreatedKey] = useState<any>(null);
  const [showPrivate, setShowPrivate] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/api-keys?limit=${limit}&offset=${offset}`, { token });
      setKeys(res.data || []);
      setTotal(res.total || 0);
    } catch { addToast("Failed to load API keys", "error"); }
    finally { setLoading(false); }
  }, [token, limit, offset]);

  useEffect(() => { if (!isAuthenticated) { router.push("/login"); return; } fetchKeys(); }, [isAuthenticated, fetchKeys, router]);

  const createKey = async () => {
    if (!keyName.trim()) { addToast("API key name required", "error"); return; }
    setCreating(true);
    try {
      const body: any = { name: keyName.trim() };
      if (showAdvanced && providedPublicKey.trim()) {
        body.publicKey = providedPublicKey.trim();
      }
      const res: any = await apiFetch(`/api-keys`, { method: "POST", body: JSON.stringify(body), token: token! });
      setCreatedKey(res);
      setShowCreate(false);
      setKeyName("");
      setProvidedPublicKey("");
      setShowAdvanced(false);
      fetchKeys();
    } catch (err: any) { addToast(err.message || "Failed to create API key", "error"); }
    finally { setCreating(false); }
  };

  const deleteKey = async (id: string) => {
    if (!confirm("Delete this API key? This cannot be undone.")) return;
    try {
      await apiFetch(`/api-keys/${id}`, { method: "DELETE", token: token! });
      addToast("API key deleted", "success");
      fetchKeys();
    } catch (err: any) { addToast(err.message || "Failed to delete", "error"); }
  };

  const downloadJson = () => {
    if (!createdKey) return;
    const data = {
      id: createdKey.id,
      name: createdKey.name,
      publicKey: createdKey.publicKey,
      privateKey: createdKey.privateKey || "(generated via CLI — not stored server-side)",
      apiKey: createdKey.apiKey,
      permissions: createdKey.permissions,
      expiresAt: createdKey.expiresAt,
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wrankey-api-key-${createdKey.name.replace(/[^a-zA-Z0-9]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("Downloaded API key JSON", "success");
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programmatic access keys for developers and agents.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Key className="w-4 h-4 mr-1.5" /> New API Key
        </Button>
      </div>

      <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
          ) : (
            <>
              <Table
                columns={[
                  { key: "name", header: "Name", render: (k: ApiKey) => (
                    <div>
                      <p className="text-sm font-medium">{k.name}</p>
                      {k.publicKey && <p className="text-[11px] font-mono text-slate-400 mt-0.5">{k.publicKey.slice(0, 16)}…{k.publicKey.slice(-8)}</p>}
                    </div>
                  ) },
                  { key: "keyPrefix", header: "Prefix", render: (k: ApiKey) => <code className="text-xs font-mono text-slate-500">{k.keyPrefix}…</code> },
                  { key: "permissions", header: "Permissions", render: (k: ApiKey) => (
                    <div className="flex flex-wrap gap-1">
                      {k.permissions.map((p) => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{p}</span>)}
                    </div>
                  ) },
                  { key: "expiresAt", header: "Expires", render: (k: ApiKey) => k.expiresAt ? <span className="text-xs text-slate-500">{new Date(k.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> : <span className="text-xs text-slate-400">Never</span> },
                  { key: "createdAt", header: "Created", render: (k: ApiKey) => <span className="text-xs text-slate-500">{new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> },
                  { key: "actions", header: "", render: (k: ApiKey) => (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteKey(k.id)}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                  ) },
                ]}
                data={keys} loading={false} emptyMessage="No API keys yet. Create one to enable programmatic access."
              />
              <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => { setLimit(l); setOffset(o); }} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Modal — Step 1: Name + Advanced Settings */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setKeyName(""); setProvidedPublicKey(""); setShowAdvanced(false); }} title="Create API Key" size="md">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">API Key Name</label>
            <Input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. Production Server, CI/CD Pipeline"
              className="h-10"
            />
          </div>

          {/* Advanced Settings toggle */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced Settings
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Generate API key via CLI</p>
                <a
                  href="https://docs.wrankey.io/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                >
                  Visit documentation <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">API Public Key</label>
                <Input
                  value={providedPublicKey}
                  onChange={(e) => setProvidedPublicKey(e.target.value)}
                  placeholder="Paste your compressed public key (66 hex chars, starts with 02/03)..."
                  className="h-10 text-xs font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  Generate a keypair using the Wrankey CLI: <code className="bg-slate-200 px-1 rounded">wrankey keys generate</code>.
                  Paste the public key here. Your private key never leaves your machine.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowCreate(false); setKeyName(""); setProvidedPublicKey(""); setShowAdvanced(false); }} className="flex-1">
              Cancel
            </Button>
            <Button onClick={createKey} disabled={creating || !keyName.trim()} className="flex-1">
              {creating ? "Creating..." : "Continue"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Success Modal — shows after creation */}
      <Modal open={!!createdKey} onClose={() => setCreatedKey(null)} title="API Key Created" size="md">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-600">
            <Check className="w-5 h-5" />
            <span className="text-sm font-medium">Your API key has been created successfully.</span>
          </div>

          {/* Public Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">API Public Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono break-all">
                {createdKey?.publicKey}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(createdKey?.publicKey || ""); addToast("Copied", "success"); }}
                className="text-slate-400 hover:text-slate-600 p-2"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Private Key (only shown in normal mode) */}
          {createdKey?.privateKey && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">API Private Key</label>
                <button
                  onClick={() => setShowPrivate(!showPrivate)}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  {showPrivate ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono break-all">
                  {showPrivate ? createdKey?.privateKey : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                </code>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdKey?.privateKey || ""); addToast("Copied", "success"); }}
                  className="text-slate-400 hover:text-slate-600 p-2"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-amber-600">
                Save this private key now. It will not be shown again.
              </p>
            </div>
          )}

          {/* Advanced mode note */}
          {createdKey?.advanced && !createdKey?.privateKey && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-700">
                This key uses your CLI-generated keypair. Authenticate by signing each request with your private key
                and sending the signature in the <code className="font-mono">X-Stamp</code> header.
              </p>
            </div>
          )}

          {/* Download JSON */}
          <Button onClick={downloadJson} variant="secondary" className="w-full">
            <Download className="w-4 h-4 mr-1.5" /> Download JSON
          </Button>

          {/* Done */}
          <Button onClick={() => setCreatedKey(null)} className="w-full">
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}
