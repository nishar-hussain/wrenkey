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

interface Wallet {
  id: string;
  name: string;
  ownerType: string;
  status: string;
  tags: string[];
  accounts: Array<{ address: string; chainId: string; chain?: { name: string } }>;
  wvcManaged?: boolean;
  devMode?: boolean;
  appProof?: any;
  createdAt: string;
}

const CHAIN_OPTIONS = ["sepolia", "ethereum", "polygon", "arbitrum", "optimism", "base", "stellar-testnet", "stellar-pubnet"];

const STELLAR_CHAINS = new Set(["stellar-testnet", "stellar-pubnet"]);

function isStellarChain(chain: string): boolean {
  return STELLAR_CHAINS.has(chain);
}

function prettyChainName(chain: string): string {
  if (chain.startsWith("stellar-")) {
    return "Stellar " + chain.slice("stellar-".length);
  }
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

function getCoinTypeForChain(chain: string): string {
  const map: Record<string, string> = { ethereum: "60", sepolia: "60", polygon: "60", arbitrum: "60", optimism: "60", base: "60", "stellar-testnet": "148", "stellar-pubnet": "148" };
  return map[chain] || "60";
}

function generateDerivationPath(chain: string, derivation: string, index: number): string {
  // Stellar uses ed25519 (SLIP-0010) — every level must be hardened. SEP-0005 path.
  if (isStellarChain(chain)) {
    return `m/44'/148'/0'/${index}'`;
  }
  const coinType = getCoinTypeForChain(chain);
  switch (derivation) {
    case "BIP44":
      return `m/44'/${coinType}'/0'/0/${index}`;
    case "BIP32":
      return `m/0'/${index}`;
    case "Legacy":
      return `m/44'/${coinType}'/0'/${index}`;
    default:
      return `m/44'/${coinType}'/0'/0/${index}`;
  }
}

/** Strip the trailing address index (hardened or not) to get the account-level base path. */
function stripIndex(path: string): string {
  return path.replace(/\/\d+'?$/, "");
}

interface DerivedAccount {
  id: string;
  chain: string;
  address: string;
  derivationPath: string;
}

export default function WalletsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);
  const [createOwnerType, setCreateOwnerType] = useState<"USER" | "ORG">("USER");
  const [newName, setNewName] = useState("");
  const [createdWalletId, setCreatedWalletId] = useState("");
  const [chooseChain, setChooseChain] = useState("sepolia");
  const [derivedAccounts, setDerivedAccounts] = useState<DerivedAccount[]>([]);
  const [stepLoading, setStepLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chooseDerivation, setChooseDerivation] = useState("BIP44");
  const [chooseDerivationPath, setChooseDerivationPath] = useState("m/44'/60'/0'/0");

  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [importChain, setImportChain] = useState("sepolia");
  const [importLoading, setImportLoading] = useState(false);

  const [showExport, setShowExport] = useState(false);
  const [exportWalletId, setExportWalletId] = useState("");
  const [exportWalletName, setExportWalletName] = useState("");
  const [exportData, setExportData] = useState<{ mnemonic?: string; encryptedMnemonic?: string; accounts: Array<{ chainId: string; address: string; derivationPath: string; index: number }> } | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportPassConfirm, setExportPassConfirm] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      let qs = `/wallets?limit=${limit}&offset=${offset}`;
      if (statusFilter) qs += `&status=${statusFilter}`;
      if (ownerFilter) qs += `&ownerType=${ownerFilter}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res: any = await apiFetch(qs, { token });
      setWallets(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load wallets", "error");
      setWallets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, limit, offset, search, statusFilter, ownerFilter]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchWallets();
  }, [isAuthenticated, fetchWallets, router]);

  const resetCreate = () => {
    const walletToDelete = createdWalletId;
    setShowCreate(false);
    setCreateStep(1);
    setNewName("");
    setCreatedWalletId("");
    setChooseChain("sepolia");
    setDerivedAccounts([]);
    setShowAdvanced(false);
    setChooseDerivation("BIP44");
    setChooseDerivationPath("m/44'/60'/0'/0");

    // If a wallet was created but the user cancelled before completing
    // the flow, delete it so no orphaned wallet appears.
    if (walletToDelete) {
      apiFetch(`/wallets/${walletToDelete}`, { method: "DELETE", token: token! })
        .then(() => fetchWallets())
        .catch(() => {});
    }
  };

  const openCreate = (ownerType: "USER" | "ORG") => {
    resetCreate();
    setCreateOwnerType(ownerType);
    setShowCreate(true);
  };

  const handleStep1Create = async () => {
    if (!newName.trim()) return;
    setStepLoading(true);
    try {
      const res: any = await apiFetch("/wallets", {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          ownerType: createOwnerType,
          skipInitialAccount: true,
        }),
        token: token!,
      });
      setCreatedWalletId(res.walletId);
      setCreateStep(2);
    } catch (err: any) {
      addToast(err.message || "Failed to create wallet", "error");
    } finally {
      setStepLoading(false);
    }
  };

  const handleStep2Continue = async () => {
    setStepLoading(true);
    try {
      const body: any = { chain: chooseChain };
      if (showAdvanced) {
        body.derivationPath = `${chooseDerivationPath}/0`;
      }
      const res: any = await apiFetch(`/wallets/${createdWalletId}/accounts`, {
        method: "POST",
        body: JSON.stringify(body),
        token: token!,
      });
      setDerivedAccounts((prev) => [...prev, { id: res.id, chain: chooseChain, address: res.address, derivationPath: res.derivationPath }]);
      setCreateStep(3);
    } catch (err: any) {
      addToast(err.message || "Failed to derive account", "error");
    } finally {
      setStepLoading(false);
    }
  };

  const handleFinalCreate = () => {
    setCreatedWalletId(""); // mark complete so resetCreate doesn't delete
    resetCreate();
    addToast("Wallet created", "success");
    fetchWallets();
  };

  const handleAddAnother = () => {
    setCreateStep(2);
    setChooseChain("sepolia");
    setShowAdvanced(false);
    setChooseDerivation("BIP44");
    setChooseDerivationPath(stripIndex(generateDerivationPath("sepolia", "BIP44", 0)));
  };

  const handleRemoveAccount = async (accountId: string, index: number) => {
    try {
      await apiFetch(`/wallets/${createdWalletId}/accounts/${accountId}`, {
        method: "DELETE",
        token: token!,
      });
      setDerivedAccounts((prev) => prev.filter((_, i) => i !== index));
    } catch (err: any) {
      addToast(err.message || "Failed to remove account", "error");
    }
  };

  const importWallet = async () => {
    if (!importName.trim() || !importMnemonic.trim()) {
      addToast("Name and mnemonic are required", "error");
      return;
    }
    const words = importMnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      addToast(`Invalid recovery phrase: expected 12 or 24 words, got ${words.length}`, "error");
      return;
    }
    setImportLoading(true);
    try {
      await apiFetch("/wallets/import", {
        method: "POST",
        body: JSON.stringify({
          name: importName,
          mnemonic: importMnemonic.trim(),
          ownerType: "USER",
          chain: importChain,
        }),
        token: token!,
      });
      setShowImport(false);
      setImportName("");
      setImportMnemonic("");
      setImportChain("sepolia");
      addToast("Wallet imported", "success");
      fetchWallets();
    } catch (err: any) {
      addToast(err.message || "Failed to import wallet", "error");
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    if (exportPassphrase) {
      if (exportPassphrase !== exportPassConfirm) {
        addToast("Passphrases do not match", "error");
        return;
      }
      if (exportPassphrase.length < 8) {
        addToast("Passphrase must be at least 8 characters", "error");
        return;
      }
    }
    setExportLoading(true);
    try {
      const body: any = {};
      if (exportPassphrase) body.passphrase = exportPassphrase;
      const res: any = await apiFetch(`/wallets/${exportWalletId}/export`, {
        method: "POST",
        body: JSON.stringify(body),
        token: token!,
      });
      setExportData(res);
    } catch (err: any) {
      addToast(err.message || "Failed to export wallet", "error");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this wallet? This action cannot be undone.")) return;
    try {
      await apiFetch(`/wallets/${id}`, { method: "DELETE", token: token! });
      addToast("Wallet deleted", "success");
      fetchWallets();
    } catch (err: any) {
      addToast(err.message || "Failed to delete", "error");
    }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    {
      key: "tags",
      header: "Tags",
      render: (w: Wallet) => {
        const userTags = (w.tags || []).filter((t) => t !== "wvc-managed");
        return userTags.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {userTags.map((t, i) => (
              <span key={i} className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        );
      },
    },
    {
      key: "security",
      header: "Security",
      render: (w: Wallet) =>
        w.wvcManaged ? (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${w.devMode ? "bg-amber-50 text-amber-700 border-amber-100" : "bg-emerald-50 text-emerald-700 border-emerald-100"}`}>
            {w.devMode ? "WVC Dev" : "WVC Verified"}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Self-custodial</span>
        ),
    },
    {
      key: "ownerType",
      header: "Owner",
      render: (w: Wallet) => (
        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${
          w.ownerType === "ORG"
            ? "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900/30"
            : "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-950/30 dark:text-slate-400 dark:border-slate-900/30"
        }`}>
          {w.ownerType === "ORG" ? "Company" : "Personal"}
        </span>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (w: Wallet) => {
        const addr = w.accounts?.[0]?.address;
        const chain = w.accounts?.[0]?.chain?.name || w.accounts?.[0]?.chainId || "sepolia";
        return addr ? (
          <span className="font-mono text-xs">
            {addr.slice(0, 8)}...{addr.slice(-6)}
            <span className="text-slate-400 ml-1">({chain})</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (w: Wallet) => <StatusBadge status={w.status} />,
    },
    {
      key: "createdAt",
      header: "Created",
      render: (w: Wallet) => new Date(w.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      render: (w: Wallet) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => router.push(`/wallets/${w.id}`)}>
            View
          </Button>
          <Button size="sm" variant="secondary" onClick={() => {
            setShowExport(true);
            setExportWalletId(w.id);
            setExportWalletName(w.name);
            setExportData(null);
            setExportPassphrase("");
            setExportPassConfirm("");
          }}>
            Export
          </Button>
          <Button size="sm" variant="secondary" onClick={() => handleDelete(w.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Wallets</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setShowImport(true); setImportName(""); setImportMnemonic(""); setImportChain("sepolia"); }}>
            Import
          </Button>
          <Button variant="secondary" onClick={() => openCreate("ORG")}>
            New Wallet
          </Button>
          <Button onClick={() => openCreate("USER")}>
            Create Wallet
          </Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
          placeholder="Search by name or address..."
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="FROZEN">Frozen</option>
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => { setOwnerFilter(e.target.value); setOffset(0); }}
          className="border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">All Wallets</option>
          <option value="USER">Personal</option>
          <option value="ORG">Company</option>
        </select>
        <Button variant="secondary" size="sm" onClick={fetchWallets}>
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table columns={columns} data={wallets} loading={false} emptyMessage="No wallets found. Create your first wallet." />
              <Pagination
                limit={limit}
                offset={offset}
                total={total}
                onPageChange={(l, o) => {
                  setLimit(l);
                  setOffset(o);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Multi-step Create Wallet Modal ── */}
      <Modal open={showCreate} onClose={resetCreate} title={createStep === 1 ? "New Wallet" : createStep === 2 ? `Add account to "${newName}"` : `Accounts for "${newName}"`}>
        {createStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Wallet name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Wallet" />
            </div>
            <Button onClick={handleStep1Create} disabled={stepLoading} className="w-full">
              {stepLoading ? "Creating..." : "Create Wallet"}
            </Button>
          </div>
        )}

        {createStep === 2 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Select account type</label>
              <select
                value={chooseChain}
onChange={(e) => {
                   setChooseChain(e.target.value);
                   setChooseDerivationPath(stripIndex(generateDerivationPath(e.target.value, chooseDerivation, 0)));
                 }}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {CHAIN_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {prettyChainName(c)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <span className={`transform transition-transform ${showAdvanced ? "rotate-90" : ""}`}>&#9654;</span>
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Curve</label>
                  <Input value={isStellarChain(chooseChain) ? "ED25519 (SLIP-10)" : "SECP256K1"} readOnly className="bg-white text-sm font-mono" />
                </div>

                {!isStellarChain(chooseChain) && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Derivation</label>
                    <select
                      value={chooseDerivation}
                      onChange={(e) => {
                        setChooseDerivation(e.target.value);
                        setChooseDerivationPath(stripIndex(generateDerivationPath(chooseChain, e.target.value, 0)));
                      }}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                    >
                      <option value="BIP44">BIP44</option>
                      <option value="BIP32">BIP32</option>
                      <option value="Legacy">Legacy</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Path</label>
                  <Input
                    value={chooseDerivationPath}
                    onChange={(e) => setChooseDerivationPath(e.target.value)}
                    placeholder={isStellarChain(chooseChain) ? "m/44'/148'/0'" : "m/44'/60'/0'/0"}
                    className="bg-white text-sm font-mono"
                  />
                  {isStellarChain(chooseChain) && (
                    <p className="text-[10px] text-slate-400">Stellar uses SEP-0005 hardened ed25519 derivation.</p>
                  )}
                </div>
              </div>
            )}

            <Button onClick={handleStep2Continue} disabled={stepLoading} className="w-full">
              {stepLoading ? "Deriving..." : "Continue"}
            </Button>
          </div>
        )}

        {createStep === 3 && (
          <div className="space-y-4">
            {derivedAccounts.length > 0 ? (
              <div className="space-y-3">
                {derivedAccounts.map((acc, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-md flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{prettyChainName(acc.chain)}</p>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">{acc.derivationPath}</p>
                      <p className="text-xs font-mono text-slate-400 mt-0.5 truncate">{acc.address}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveAccount(acc.id, i)}
                      className="ml-2 p-1 text-slate-400 hover:text-red-500 flex-shrink-0"
                      title="Remove account"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No accounts added yet.</p>
            )}
            <Button onClick={handleAddAnother} variant="secondary" className="w-full">
              Add another account
            </Button>
            <Button onClick={handleFinalCreate} className="w-full">
              Create Wallet
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Wallet">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
            <p className="font-medium text-amber-700">Import from recovery phrase</p>
            <p className="text-amber-600 mt-1">Enter your 12 or 24 word mnemonic phrase.</p>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet Name</label>
            <Input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Imported Wallet" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Recovery Phrase (12 or 24 words)</label>
            <textarea
              value={importMnemonic}
              onChange={(e) => setImportMnemonic(e.target.value)}
              placeholder="word1 word2 word3 ..."
              rows={3}
              className="w-full border rounded-md px-3 py-2 text-sm font-mono resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Chain</label>
            <select
              value={importChain}
              onChange={(e) => setImportChain(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {prettyChainName(c)}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={importWallet} disabled={importLoading} className="w-full">
            {importLoading ? "Importing..." : "Import"}
          </Button>
        </div>
      </Modal>

      {/* ── Export Modal ── */}
      <Modal
        open={showExport}
        onClose={() => {
          setShowExport(false);
          setExportData(null);
          setExportPassphrase("");
          setExportPassConfirm("");
        }}
        title={`Export Wallet: ${exportWalletName}`}
      >
        {exportData ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Warning: Never share your recovery phrase!</p>
              <p className="text-amber-600 mt-1">Anyone with this can access your wallet.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                {exportPassphrase ? "Encrypted Recovery Phrase" : "Recovery Phrase"}
              </label>
              <Input
                value={exportData.mnemonic || exportData.encryptedMnemonic || ""}
                readOnly
                className="font-mono text-sm"
              />
            </div>
            {exportData.accounts.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Accounts ({exportData.accounts.length})</p>
                <div className="space-y-1 text-xs font-mono">
                  {exportData.accounts.map((acc, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded">
                      {acc.address} [{acc.derivationPath}]
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              onClick={() => {
                setShowExport(false);
                setExportData(null);
                setExportPassphrase("");
                setExportPassConfirm("");
              }}
              variant="secondary"
              className="w-full"
            >
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Export wallet seed phrase</p>
              <p className="text-amber-600 mt-1">
                This will reveal the seed phrase. Leave passphrase blank for plaintext export.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Passphrase (optional, for encrypted export)</label>
              <Input
                type="password"
                value={exportPassphrase}
                onChange={(e) => setExportPassphrase(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
            {exportPassphrase && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Confirm Passphrase</label>
                <Input
                  type="password"
                  value={exportPassConfirm}
                  onChange={(e) => setExportPassConfirm(e.target.value)}
                  placeholder="Re-enter passphrase"
                />
              </div>
            )}
            <Button onClick={handleExport} disabled={exportLoading} className="w-full">
              {exportLoading ? "Exporting..." : "Export Wallet"}
            </Button>
            <Button onClick={() => { setShowExport(false); setExportPassphrase(""); }} variant="secondary" className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
