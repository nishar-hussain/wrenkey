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
import { Building2, Plus } from "lucide-react";

interface CompanyWallet {
  id: string;
  name: string;
  status: string;
  tags: string[];
  accounts: Array<{ address: string; chain?: { name: string; symbol: string } }>;
  createdAt: string;
}

const CHAIN_OPTIONS = ["sepolia", "ethereum", "polygon", "arbitrum", "optimism", "base"];

function getCoinTypeForChain(chain: string): string {
  const map: Record<string, string> = { ethereum: "60", sepolia: "60", polygon: "60", arbitrum: "60", optimism: "60", base: "60" };
  return map[chain] || "60";
}

function generateDerivationPath(chain: string, derivation: string, index: number): string {
  const coinType = getCoinTypeForChain(chain);
  switch (derivation) {
    case "BIP44": return `m/44'/${coinType}'/0'/0/${index}`;
    case "BIP32": return `m/0'/${index}`;
    case "Legacy": return `m/44'/${coinType}'/0'/${index}`;
    default: return `m/44'/${coinType}'/0'/0/${index}`;
  }
}

interface DerivedAccount {
  id: string;
  chain: string;
  address: string;
  derivationPath: string;
}

export default function CompanyWalletsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<"wallets" | "private-keys">("wallets");

  // Wallets state
  const [wallets, setWallets] = useState<CompanyWallet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [newName, setNewName] = useState("");
  const [createdWalletId, setCreatedWalletId] = useState("");
  const [chooseChain, setChooseChain] = useState("sepolia");
  const [derivedAccounts, setDerivedAccounts] = useState<DerivedAccount[]>([]);
  const [stepLoading, setStepLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chooseDerivation, setChooseDerivation] = useState("BIP44");
  const [chooseDerivationPath, setChooseDerivationPath] = useState("m/44'/60'/0'/0");

  const [showExport, setShowExport] = useState(false);
  const [exportWalletId, setExportWalletId] = useState("");
  const [exportWalletName, setExportWalletName] = useState("");
  const [exportData, setExportData] = useState<{ mnemonic?: string; encryptedMnemonic?: string; accounts: Array<{ chainId: string; address: string; derivationPath: string; index: number }> } | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportPassConfirm, setExportPassConfirm] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  // Private keys state
  const [pKeys, setPKeys] = useState<any[]>([]);
  const [pKeysTotal, setPKeysTotal] = useState(0);
  const [pKeysLoading, setPKeysLoading] = useState(false);
  const [pKeysSearch, setPKeysSearch] = useState("");

  // Create private key state
  const [showCreatePk, setShowCreatePk] = useState(false);
  const [createPkName, setCreatePkName] = useState("");
  const [createPkWalletId, setCreatePkWalletId] = useState("");
  const [createPkChain, setCreatePkChain] = useState("sepolia");
  const [createPkLoading, setCreatePkLoading] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/wallets?limit=${limit}&offset=${offset}&ownerType=ORG`, { token });
      setWallets(res.data); setTotal(res.total);
    } catch { addToast("Failed to load data", "error"); setWallets([]); } finally { setLoading(false); }
  }, [token, limit, offset]);

  const fetchPrivateKeys = useCallback(async () => {
    if (!token) return;
    setPKeysLoading(true);
    try {
      let qs = `/private-keys?limit=${limit}&offset=${offset}`;
      if (pKeysSearch) qs += `&search=${encodeURIComponent(pKeysSearch)}`;
      const res: any = await apiFetch(qs, { token });
      setPKeys(res.data); setPKeysTotal(res.total);
    } catch { setPKeys([]); } finally { setPKeysLoading(false); }
  }, [token, limit, offset, pKeysSearch]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    if (activeTab === "wallets") fetchWallets();
    else fetchPrivateKeys();
  }, [isAuthenticated, activeTab, fetchWallets, fetchPrivateKeys, router]);

  // Wallet creation
  const resetCreate = () => {
    setShowCreate(false);
    setCreateStep(1);
    setNewName("");
    setCreatedWalletId("");
    setChooseChain("sepolia");
    setDerivedAccounts([]);
    setShowAdvanced(false);
    setChooseDerivation("BIP44");
    setChooseDerivationPath("m/44'/60'/0'/0");
  };

  const handleStep1Create = async () => {
    if (!newName.trim()) return;
    setStepLoading(true);
    try {
      const res: any = await apiFetch("/wallets", {
        method: "POST",
        body: JSON.stringify({ name: newName, ownerType: "ORG", tags: ["company"], skipInitialAccount: true }),
        token: token!,
      });
      setCreatedWalletId(res.walletId);
      setCreateStep(2);
    } catch (err: any) {
      addToast(err.message || "Failed to create wallet", "error");
    } finally { setStepLoading(false); }
  };

  const handleStep2Continue = async () => {
    setStepLoading(true);
    try {
      const body: any = { chain: chooseChain };
      if (showAdvanced) body.derivationPath = `${chooseDerivationPath}/0`;
      const res: any = await apiFetch(`/wallets/${createdWalletId}/accounts`, {
        method: "POST", body: JSON.stringify(body), token: token!,
      });
      setDerivedAccounts((prev) => [...prev, { id: res.id, chain: chooseChain, address: res.address, derivationPath: res.derivationPath }]);
      setCreateStep(3);
    } catch (err: any) { addToast(err.message || "Failed to derive account", "error"); }
    finally { setStepLoading(false); }
  };

  const handleFinalCreate = () => { resetCreate(); addToast("Wallet created", "success"); fetchWallets(); };
  const handleAddAnother = () => { setCreateStep(2); setChooseChain("sepolia"); setShowAdvanced(false); setChooseDerivation("BIP44"); setChooseDerivationPath(generateDerivationPath("sepolia", "BIP44", 0).replace(/\/\d+$/, "")); };

  const handleRemoveAccount = async (accountId: string, index: number) => {
    try {
      await apiFetch(`/wallets/${createdWalletId}/accounts/${accountId}`, { method: "DELETE", token: token! });
      setDerivedAccounts((prev) => prev.filter((_, i) => i !== index));
    } catch (err: any) { addToast(err.message || "Failed to remove account", "error"); }
  };

  const handleExport = async () => {
    if (exportPassphrase) {
      if (exportPassphrase !== exportPassConfirm) { addToast("Passphrases do not match", "error"); return; }
      if (exportPassphrase.length < 8) { addToast("Passphrase must be at least 8 characters", "error"); return; }
    }
    setExportLoading(true);
    try {
      const body: any = {};
      if (exportPassphrase) body.passphrase = exportPassphrase;
      const res: any = await apiFetch(`/wallets/${exportWalletId}/export`, { method: "POST", body: JSON.stringify(body), token: token! });
      setExportData(res);
    } catch (err: any) { addToast(err.message || "Failed to export wallet", "error"); }
    finally { setExportLoading(false); }
  };

  // Create private key
  const handleCreatePk = async () => {
    if (!createPkName.trim() || !createPkWalletId) { addToast("Name and wallet are required", "error"); return; }
    setCreatePkLoading(true);
    try {
      await apiFetch("/private-keys", {
        method: "POST",
        body: JSON.stringify({ name: createPkName, walletId: createPkWalletId, chain: createPkChain }),
        token: token!,
      });
      setShowCreatePk(false); setCreatePkName(""); setCreatePkWalletId(""); setCreatePkChain("sepolia");
      addToast("Private key created", "success");
      fetchPrivateKeys();
    } catch (err: any) { addToast(err.message || "Failed", "error"); }
    finally { setCreatePkLoading(false); }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab("wallets")}
            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${activeTab === "wallets" ? "border-black text-black" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Company Wallets
          </button>
          <button
            onClick={() => setActiveTab("private-keys")}
            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${activeTab === "private-keys" ? "border-black text-black" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Private Keys
          </button>
        </div>
        {activeTab === "wallets" ? (
          <Button onClick={() => { resetCreate(); setShowCreate(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> New Wallet
          </Button>
        ) : (
          <Button onClick={() => { setShowCreatePk(true); setCreatePkName(""); setCreatePkWalletId(""); setCreatePkChain("sepolia"); apiFetch("/wallets?limit=100", { token: token! }).then((res: any) => setWallets(res.data)).catch(() => {}); }}>
            New Private Key
          </Button>
        )}
      </div>

      {activeTab === "wallets" ? (
        <>
          <p className="text-sm text-slate-500 -mt-4">Programmatic wallets for treasury and operations</p>
          <Card className="border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
              ) : wallets.length === 0 ? (
                <div className="text-center py-16">
                  <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-1">No company wallets yet</p>
                  <p className="text-xs text-slate-400 mb-4">Create a treasury wallet for your organization</p>
                  <Button size="sm" onClick={() => { resetCreate(); setShowCreate(true); }}>New Wallet</Button>
                </div>
              ) : (
                <>
                  <Table
                    columns={[
                      { key: "name", header: "Wallet", render: (w: CompanyWallet) => <div><p className="font-medium text-sm">{w.name}</p><p className="text-[10px] text-slate-400 font-mono">{w.accounts?.[0]?.address?.slice(0, 10)}...</p></div> },
                      { key: "chain", header: "Chain", render: (w: CompanyWallet) => <span className="text-xs">{w.accounts?.[0]?.chain?.name || "—"}</span> },
                      { key: "address", header: "Address", render: (w: CompanyWallet) => <span className="font-mono text-[11px]">{w.accounts?.[0]?.address?.slice(0, 8)}...{w.accounts?.[0]?.address?.slice(-6)}</span> },
                      { key: "status", header: "Status", render: (w: CompanyWallet) => <StatusBadge status={w.status} /> },
                      { key: "actions", header: "", render: (w: CompanyWallet) => (
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => router.push(`/wallets/${w.id}`)}>Manage</Button>
                          <Button size="sm" variant="secondary" onClick={() => {
                            setShowExport(true); setExportWalletId(w.id); setExportWalletName(w.name);
                            setExportData(null); setExportPassphrase(""); setExportPassConfirm("");
                          }}>Export</Button>
                        </div>
                      )},
                    ]}
                    data={wallets} loading={false} emptyMessage="No company wallets"
                  />
                  <Pagination limit={limit} offset={offset} total={total} onPageChange={(l, o) => setOffset(o)} />
                </>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-500 -mt-4">All private keys across your company wallets</p>
          <div className="flex gap-3">
            <Input value={pKeysSearch} onChange={(e) => { setPKeysSearch(e.target.value); setOffset(0); }} placeholder="Search keys..." className="max-w-xs" />
            <Button variant="secondary" size="sm" onClick={fetchPrivateKeys}>Refresh</Button>
          </div>
          <Card className="border border-slate-100">
            <CardContent className="p-0">
              {pKeysLoading ? (
                <div className="p-6 space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
              ) : (
                <>
                  <Table
                    columns={[
                      {
                        key: "name",
                        header: "Key",
                        render: (k: any) => <div><p className="text-sm font-medium">{k.name}</p><p className="text-[10px] text-slate-400">{k.wallet?.name}</p></div>,
                      },
                      { key: "publicKey", header: "Private ID", render: (k: any) => <span className="font-mono text-xs text-slate-500">{k.id.slice(0, 4)}&middot;&middot;&middot;&middot;{k.id.slice(-4)}</span> },
                      { key: "tags", header: "Tags", render: (k: any) => k.tags?.length > 0 ? <div className="flex gap-1 flex-wrap">{k.tags.map((t: string, i: number) => <span key={i} className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">{t}</span>)}</div> : <span className="text-xs text-blue-500">Add Tag</span> },
                      { key: "exported", header: "Exported", render: (k: any) => <span className="text-xs text-slate-500">{k.exported ? "Yes" : "No"}</span> },
                      { key: "curve", header: "Curve Type", render: () => <span className="text-xs font-mono">SECP256K1</span> },
                      { key: "createdAt", header: "Created", render: (k: any) => <span className="text-xs text-slate-500">{new Date(k.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> },
                      { key: "actions", header: "", render: (k: any) => <Button size="sm" variant="secondary" onClick={() => router.push(`/private-keys/${k.id}`)}>View</Button> },
                    ]}
                    data={pKeys} loading={false} emptyMessage="No private keys found."
                  />
                  <Pagination limit={limit} offset={offset} total={pKeysTotal} onPageChange={(l, o) => setOffset(o)} />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Create Wallet Modal ── */}
      <Modal open={showCreate} onClose={resetCreate} title={createStep === 1 ? "New Wallet" : createStep === 2 ? `Add account to "${newName}"` : `Accounts for "${newName}"`}>
        {createStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-1"><label className="text-sm font-medium">Wallet name</label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Wallet" /></div>
            <Button onClick={handleStep1Create} disabled={stepLoading} className="w-full">{stepLoading ? "Creating..." : "Create Wallet"}</Button>
          </div>
        )}
        {createStep === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Select account type</label>
              <select value={chooseChain} onChange={(e) => { setChooseChain(e.target.value); setChooseDerivationPath(generateDerivationPath(e.target.value, chooseDerivation, 0).replace(/\/\d+$/, "")); }} className="w-full border rounded-md px-3 py-2 text-sm">
                {CHAIN_OPTIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
              <span className={`transform transition-transform ${showAdvanced ? "rotate-90" : ""}`}>&#9654;</span> Advanced Settings
            </button>
            {showAdvanced && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                <div className="space-y-1"><label className="text-xs font-medium text-slate-500">Curve</label><Input value="SECP256K1" readOnly className="bg-white text-sm font-mono" /></div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Derivation</label>
                  <select value={chooseDerivation} onChange={(e) => { setChooseDerivation(e.target.value); setChooseDerivationPath(generateDerivationPath(chooseChain, e.target.value, 0).replace(/\/\d+$/, "")); }} className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                    <option value="BIP44">BIP44</option><option value="BIP32">BIP32</option><option value="Legacy">Legacy</option>
                  </select>
                </div>
                <div className="space-y-1"><label className="text-xs font-medium text-slate-500">Path</label><Input value={chooseDerivationPath} onChange={(e) => setChooseDerivationPath(e.target.value)} placeholder="m/44'/60'/0'/0" className="bg-white text-sm font-mono" /></div>
              </div>
            )}
            <Button onClick={handleStep2Continue} disabled={stepLoading} className="w-full">{stepLoading ? "Deriving..." : "Continue"}</Button>
          </div>
        )}
        {createStep === 3 && (
          <div className="space-y-4">
            {derivedAccounts.length > 0 ? (
              <div className="space-y-3">
                {derivedAccounts.map((acc, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-md flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{acc.chain.charAt(0).toUpperCase() + acc.chain.slice(1)}</p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{acc.derivationPath}</p>
                      <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{acc.address}</p>
                    </div>
                    <button onClick={() => handleRemoveAccount(acc.id, i)} className="ml-2 p-1 text-slate-400 hover:text-red-500 flex-shrink-0" title="Remove account">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (<p className="text-sm text-slate-400 text-center py-4">No accounts added yet.</p>)}
            <Button onClick={handleAddAnother} variant="secondary" className="w-full">Add another account</Button>
            <Button onClick={handleFinalCreate} className="w-full">Create Wallet</Button>
          </div>
        )}
      </Modal>

      {/* ── Create Private Key Modal ── */}
      <Modal open={showCreatePk} onClose={() => setShowCreatePk(false)} title="Create Private Key">
        <div className="space-y-4">
          <div className="space-y-1"><label className="text-sm font-medium">Private Key Name</label><Input value={createPkName} onChange={(e) => setCreatePkName(e.target.value)} placeholder="My Key" /></div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet</label>
            <select value={createPkWalletId} onChange={(e) => setCreatePkWalletId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="">Select wallet</option>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><label className="text-sm font-medium">SECP256K1</label><Input value="SECP256K1" readOnly className="bg-slate-50 text-sm" /></div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Asset Addresses</label>
            <select value={createPkChain} onChange={(e) => setCreatePkChain(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
              {CHAIN_OPTIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <Button onClick={handleCreatePk} disabled={createPkLoading} className="w-full">{createPkLoading ? "Creating..." : "Continue"}</Button>
        </div>
      </Modal>

      {/* ── Export Modal ── */}
      <Modal open={showExport} onClose={() => { setShowExport(false); setExportData(null); setExportPassphrase(""); setExportPassConfirm(""); }} title={`Export Wallet: ${exportWalletName}`}>
        {exportData ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm"><p className="font-medium text-amber-700">Warning: Never share your recovery phrase!</p><p className="text-amber-600 mt-1">Anyone with this can access your wallet.</p></div>
            <div className="space-y-1"><label className="text-sm font-medium">{exportPassphrase ? "Encrypted Recovery Phrase" : "Recovery Phrase"}</label><Input value={exportData.mnemonic || exportData.encryptedMnemonic || ""} readOnly className="font-mono text-sm" /></div>
            {exportData.accounts.length > 0 && <div><p className="text-sm font-medium mb-2">Accounts ({exportData.accounts.length})</p><div className="space-y-1 text-xs font-mono">{exportData.accounts.map((acc, i) => <div key={i} className="p-2 bg-slate-50 rounded">{acc.address} [{acc.derivationPath}]</div>)}</div></div>}
            <Button onClick={() => { setShowExport(false); setExportData(null); setExportPassphrase(""); setExportPassConfirm(""); }} variant="secondary" className="w-full">Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm"><p className="font-medium text-amber-700">Export wallet seed phrase</p><p className="text-amber-600 mt-1">Leave passphrase blank for plaintext export.</p></div>
            <div className="space-y-1"><label className="text-sm font-medium">Passphrase (optional, for encrypted export)</label><Input type="password" value={exportPassphrase} onChange={(e) => setExportPassphrase(e.target.value)} placeholder="Min 8 characters" /></div>
            {exportPassphrase && <div className="space-y-1"><label className="text-sm font-medium">Confirm Passphrase</label><Input type="password" value={exportPassConfirm} onChange={(e) => setExportPassConfirm(e.target.value)} placeholder="Re-enter passphrase" /></div>}
            <Button onClick={handleExport} disabled={exportLoading} className="w-full">{exportLoading ? "Exporting..." : "Export Wallet"}</Button>
            <Button onClick={() => { setShowExport(false); setExportPassphrase(""); }} variant="secondary" className="w-full">Cancel</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
