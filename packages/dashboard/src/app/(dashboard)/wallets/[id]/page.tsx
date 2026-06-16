"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/skeleton";

interface ChainInfo {
  id: string;
  name: string;
  chainId: number;
  symbol: string;
  blockExplorerUrl?: string;
}

interface BalanceEntry {
  chainId: string;
  chain: string;
  address: string;
  balance: string;
  balanceWei: string;
  symbol: string;
}

interface TokenBalance {
  token: { address: string; name: string; symbol: string; decimals: number };
  balance: string;
  balanceFormatted: string;
}

interface TokenBalanceEntry {
  address: string;
  chain: string;
  chainId: number;
  tokens: TokenBalance[];
}

interface ExportInfo {
  mnemonic?: string;
  encryptedMnemonic?: string;
  accounts: Array<{ chainId: string; address: string; derivationPath: string; index: number }>;
}

interface WalletDetail {
  id: string;
  name: string;
  ownerType: string;
  ownerId: string;
  status: string;
  tags: string[];
  accounts: Array<{
    id: string;
    chainId: string;
    chain: ChainInfo;
    address: string;
    derivationPath: string;
    index: number;
  }>;
  createdAt: string;
}

interface TxItem {
  id: string;
  txHash?: string;
  to: string;
  value: string;
  nonce?: number;
  status: string;
  riskScore?: number;
  createdAt: string;
}

interface SpendingLimitItem {
  id: string;
  name: string;
  maxPerTx?: string;
  maxDaily?: string;
  maxMonthly?: string;
  allowlist: string[];
  denylist: string[];
  active: boolean;
}

interface GasPrice {
  chain: string;
  slow: string;
  standard: string;
  fast: string;
}

function copyToClipboard(text: string, addToast: (msg: string, type: "success" | "error") => void) {
  navigator.clipboard.writeText(text).then(
    () => addToast("Copied to clipboard", "success"),
    () => addToast("Failed to copy", "error")
  );
}

function explorerUrl(address: string, chain?: ChainInfo): string | null {
  if (!chain?.blockExplorerUrl) return null;
  return `${chain.blockExplorerUrl}/address/${address}`;
}

function txExplorerUrl(txHash: string, chain?: ChainInfo): string | null {
  if (!chain?.blockExplorerUrl) return null;
  return `${chain.blockExplorerUrl}/tx/${txHash}`;
}

export default function WalletDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceEntry[]>([]);
  const [spendingLimits, setSpendingLimits] = useState<SpendingLimitItem[]>([]);
  const [gasPrice, setGasPrice] = useState<GasPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "security">("overview");

  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState<ExportInfo | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportPassConfirm, setExportPassConfirm] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const [showSpendingLimitModal, setShowSpendingLimitModal] = useState(false);
  const [editingSpendingLimit, setEditingSpendingLimit] = useState<SpendingLimitItem | null>(null);
  const [slName, setSlName] = useState("");
  const [slMaxPerTx, setSlMaxPerTx] = useState("");
  const [slMaxDaily, setSlMaxDaily] = useState("");
  const [slMaxMonthly, setSlMaxMonthly] = useState("");
  const [slDenylist, setSlDenylist] = useState("");
  const [slLoading, setSlLoading] = useState(false);

  const [showFreezeConfirm, setShowFreezeConfirm] = useState(false);
  const [freezeLoading, setFreezeLoading] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [txActionLoading, setTxActionLoading] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [walletRes, txRes, balRes, tokenRes, slRes, gpRes]: any[] = await Promise.all([
        apiFetch(`/wallets/${params.id}`, { token }),
        apiFetch(`/transactions?limit=50&chain=&walletId=${params.id}`, { token }),
        apiFetch(`/wallets/${params.id}/balance`, { token }).catch(() => null),
        apiFetch(`/wallets/${params.id}/tokens`, { token }).catch(() => null),
        apiFetch(`/spending-limits?limit=20&walletId=${params.id}`, { token }).catch(() => null),
        apiFetch(`/wallets/${params.id}/gas-price`, { token }).catch(() => null),
      ]);
      setWallet(walletRes);
      setTransactions(txRes.data);
      if (balRes?.balances) setBalances(balRes.balances);
      if (tokenRes?.tokenBalances) setTokenBalances(tokenRes.tokenBalances);
      if (slRes?.data) setSpendingLimits(slRes.data);
      if (gpRes) setGasPrice(gpRes);
    } catch (err: any) {
      setError(err.message || "Failed to load wallet");
      addToast(err.message || "Failed to load wallet", "error");
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchData, router]);

  const handleFreeze = async () => {
    setFreezeLoading(true);
    try {
      const action = wallet?.status === "FROZEN" ? "unfreeze" : "freeze";
      await apiFetch(`/wallets/${params.id}/${action}`, { method: "POST", token: token! });
      addToast(action === "freeze" ? "Wallet frozen" : "Wallet unfrozen", "success");
      setShowFreezeConfirm(false);
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Action failed", "error");
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm("Rotate will generate a new seed phrase. Old accounts will be replaced. Continue?")) return;
    try {
      await apiFetch(`/wallets/${params.id}/rotate`, { method: "POST", token: token! });
      addToast("Wallet rotated successfully", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Rotation failed", "error");
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await apiFetch(`/wallets/${params.id}`, { method: "DELETE", token: token! });
      addToast("Wallet deleted", "success");
      router.push("/wallets");
    } catch (err: any) {
      addToast(err.message || "Failed to delete", "error");
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleEdit = async () => {
    if (!editName.trim()) {
      addToast("Name is required", "error");
      return;
    }
    setEditLoading(true);
    try {
      const body: any = { name: editName };
      body.tags = editTags
        ? editTags.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      await apiFetch(`/wallets/${params.id}`, { method: "PATCH", body: JSON.stringify(body), token: token! });
      addToast("Wallet updated", "success");
      setShowEdit(false);
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to update", "error");
    } finally {
      setEditLoading(false);
    }
  };

  const deriveNewAccount = async () => {
    try {
      const chain = prompt("Chain name (default: arc):") || "arc";
      await apiFetch(`/wallets/${params.id}/accounts`, {
        method: "POST",
        body: JSON.stringify({ chain }),
        token: token!,
      });
      addToast("Account derived successfully", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to derive account", "error");
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
      const res: any = await apiFetch(`/wallets/${params.id}/export`, {
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

  const openEditSpendingLimit = (sl: SpendingLimitItem) => {
    setEditingSpendingLimit(sl);
    setSlName(sl.name);
    setSlMaxPerTx(sl.maxPerTx || "");
    setSlMaxDaily(sl.maxDaily || "");
    setSlMaxMonthly(sl.maxMonthly || "");
    setSlDenylist(sl.denylist.join(", "));
    setShowSpendingLimitModal(true);
  };

  const openCreateSpendingLimit = () => {
    setEditingSpendingLimit(null);
    setSlName("");
    setSlMaxPerTx("");
    setSlMaxDaily("");
    setSlMaxMonthly("");
    setSlDenylist("");
    setShowSpendingLimitModal(true);
  };

  const saveSpendingLimit = async () => {
    if (!slName.trim()) {
      addToast("Name required", "error");
      return;
    }
    setSlLoading(true);
    try {
      const body: any = {
        walletId: params.id as string,
        name: slName,
        maxPerTx: slMaxPerTx || undefined,
        maxDaily: slMaxDaily || undefined,
        maxMonthly: slMaxMonthly || undefined,
        denylist: slDenylist ? slDenylist.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };

      if (editingSpendingLimit) {
        await apiFetch(`/spending-limits/${editingSpendingLimit.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
          token: token!,
        });
        addToast("Spending limit updated", "success");
      } else {
        await apiFetch("/spending-limits", {
          method: "POST",
          body: JSON.stringify(body),
          token: token!,
        });
        addToast("Spending limit created", "success");
      }
      setShowSpendingLimitModal(false);
      setEditingSpendingLimit(null);
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to save limit", "error");
    } finally {
      setSlLoading(false);
    }
  };

  const toggleSpendingLimit = async (id: string, active: boolean) => {
    try {
      await apiFetch(`/spending-limits/${id}`, { method: "PATCH", body: JSON.stringify({ active }), token: token! });
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed", "error");
    }
  };

  const deleteSpendingLimit = async (id: string) => {
    if (!confirm("Delete this spending limit?")) return;
    try {
      await apiFetch(`/spending-limits/${id}`, { method: "DELETE", token: token! });
      addToast("Spending limit deleted", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to delete limit", "error");
    }
  };

  const txAction = async (txId: string, action: "retry" | "cancel" | "speed-up") => {
    setTxActionLoading((prev) => ({ ...prev, [txId]: true }));
    try {
      if (action === "speed-up") {
        await apiFetch(`/transactions/${txId}/speed-up`, {
          method: "POST",
          body: JSON.stringify({ gasMultiplier: 1.2 }),
          token: token!,
        });
      } else {
        await apiFetch(`/transactions/${txId}/${action}`, { method: "POST", token: token! });
      }
      addToast(`Transaction ${action === "speed-up" ? "sped up" : action === "cancel" ? "cancelled" : "retrying"}`, "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || `Failed to ${action} transaction`, "error");
    } finally {
      setTxActionLoading((prev) => ({ ...prev, [txId]: false }));
    }
  };

  const getChainForAccount = (chainId: string): ChainInfo | undefined => {
    return wallet?.accounts.find((a) => a.chainId === chainId)?.chain;
  };

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 mb-4">{error || "Wallet not found"}</p>
        <Button variant="secondary" onClick={() => router.push("/wallets")}>
          Back to Wallets
        </Button>
      </div>
    );
  }

  const accountColumns = [
    { key: "index", header: "#" },
    {
      key: "chainName",
      header: "Chain",
      render: (a: any) => a.chain?.name || a.chainId,
    },
    {
      key: "address",
      header: "Address",
      render: (a: any) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs break-all">{a.address}</span>
          <button
            onClick={() => copyToClipboard(a.address, addToast)}
            className="text-slate-400 hover:text-slate-600 text-xs flex-shrink-0"
            title="Copy address"
          >
            &#x2398;
          </button>
          {a.chain?.blockExplorerUrl && (
            <a
              href={explorerUrl(a.address, a.chain)!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 text-xs flex-shrink-0"
              title="View on explorer"
            >
              &#x2197;
            </a>
          )}
        </div>
      ),
    },
    {
      key: "derivationPath",
      header: "Path",
      render: (a: any) => <span className="font-mono text-xs">{a.derivationPath}</span>,
    },
  ];

  const txColumns = [
    {
      key: "txHash",
      header: "Tx Hash",
      render: (tx: TxItem) =>
        tx.txHash ? (
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs">{tx.txHash.slice(0, 10)}...</span>
            <button
              onClick={() => copyToClipboard(tx.txHash!, addToast)}
              className="text-slate-400 hover:text-slate-600 text-xs"
              title="Copy tx hash"
            >
              &#x2398;
            </button>
            {wallet?.accounts?.[0]?.chain?.blockExplorerUrl && (
              <a
                href={txExplorerUrl(tx.txHash, wallet.accounts[0].chain)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 text-xs"
                title="View on explorer"
              >
                &#x2197;
              </a>
            )}
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "to",
      header: "To",
      render: (tx: TxItem) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{tx.to.slice(0, 8)}...</span>
          <button
            onClick={() => copyToClipboard(tx.to, addToast)}
            className="text-slate-400 hover:text-slate-600 text-xs"
            title="Copy address"
          >
            &#x2398;
          </button>
        </div>
      ),
    },
    { key: "value", header: "Value" },
    { key: "nonce", header: "Nonce", render: (tx: TxItem) => tx.nonce ?? "-" },
    {
      key: "status",
      header: "Status",
      render: (tx: TxItem) => <StatusBadge status={tx.status} />,
    },
    {
      key: "riskScore",
      header: "Risk",
      render: (tx: TxItem) =>
        tx.riskScore != null ? (
          <span className={tx.riskScore > 70 ? "text-red-500 font-bold" : "text-slate-500"}>
            {tx.riskScore}
          </span>
        ) : (
          "-"
        ),
    },
    {
      key: "createdAt",
      header: "Date",
      render: (tx: TxItem) => new Date(tx.createdAt).toLocaleString(),
    },
    {
      key: "actions",
      header: "",
      render: (tx: TxItem) => {
        const canAct = ["PENDING", "SIGNED", "BROADCAST", "FAILED"].includes(tx.status);
        const loading = txActionLoading[tx.id];
        return canAct ? (
          <div className="flex gap-1">
            {tx.status === "FAILED" && (
              <Button size="sm" variant="secondary" disabled={loading} onClick={() => txAction(tx.id, "retry")}>
                Retry
              </Button>
            )}
            {["PENDING", "SIGNED", "BROADCAST"].includes(tx.status) && (
              <>
                <Button size="sm" variant="secondary" disabled={loading} onClick={() => txAction(tx.id, "cancel")}>
                  Cancel
                </Button>
                <Button size="sm" variant="secondary" disabled={loading} onClick={() => txAction(tx.id, "speed-up")}>
                  Speed Up
                </Button>
              </>
            )}
          </div>
        ) : null;
      },
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{wallet.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Status: <StatusBadge status={wallet.status} /> | Owner: {wallet.ownerType}
          </p>
          {wallet.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {wallet.tags.map((t, i) => (
                <span key={i} className="text-xs bg-slate-200 px-1.5 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => router.push("/wallets")}>
            Back
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setEditName(wallet.name);
              setEditTags(wallet.tags.join(", "));
              setShowEdit(true);
            }}
          >
            Edit
          </Button>
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </Button>
          <Button
            variant={wallet.status === "FROZEN" ? "secondary" : "secondary"}
            onClick={() => setShowFreezeConfirm(true)}
          >
            {wallet.status === "FROZEN" ? "Unfreeze" : "Freeze"}
          </Button>
          <Button variant="secondary" onClick={handleRotate}>
            Rotate
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setShowExport(true);
              setExportData(null);
              setExportPassphrase("");
              setExportPassConfirm("");
            }}
          >
            Export
          </Button>
          <Button onClick={deriveNewAccount}>Derive Account</Button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {(["overview", "transactions", "security"] as const).map((tab) => (
          <Button
            key={tab}
            variant={activeTab === tab ? "default" : "secondary"}
            size="sm"
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {balances.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Native Balances</h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {balances.map((b, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 font-mono break-all">{b.address}</p>
                        <button
                          onClick={() => copyToClipboard(b.address, addToast)}
                          className="text-slate-400 hover:text-slate-600 text-xs"
                          title="Copy address"
                        >
                          &#x2398;
                        </button>
                      </div>
                      <p className="text-2xl font-bold mt-1">
                        {parseFloat(b.balance).toFixed(6)}{" "}
                        <span className="text-sm text-slate-500">
                          {b.symbol} ({b.chain})
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {tokenBalances.length > 0 && tokenBalances.some((tb) => tb.tokens.length > 0) && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Token Balances</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {tokenBalances
                    .filter((tb) => tb.tokens.length > 0)
                    .map((tb, i) => (
                      <div key={i}>
                        <p className="text-xs text-slate-500 font-mono mb-2">
                          {tb.address.slice(0, 12)}... ({tb.chain})
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {tb.tokens.map((t, j) => (
                            <div key={j} className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                              <div>
                                <p className="font-medium text-sm">{t.token.symbol}</p>
                                <p className="text-xs text-slate-400">{t.token.name}</p>
                              </div>
                              <p className="font-mono text-sm font-medium">
                                {parseFloat(t.balanceFormatted).toFixed(4)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="font-semibold">Accounts ({wallet.accounts.length})</h2>
            </CardHeader>
            <CardContent className="p-0">
              <Table columns={accountColumns} data={wallet.accounts} emptyMessage="No accounts derived." />
            </CardContent>
          </Card>

          {gasPrice && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Gas Price ({gasPrice.chain})</h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-slate-500">Slow</p>
                    <p className="font-mono text-sm">{gasPrice.slow}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Standard</p>
                    <p className="font-mono text-sm">{gasPrice.standard}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Fast</p>
                    <p className="font-mono text-sm">{gasPrice.fast}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "transactions" && (
        <Card>
          <CardContent className="p-0">
            <Table columns={txColumns} data={transactions} emptyMessage="No transactions yet." />
          </CardContent>
        </Card>
      )}

      {activeTab === "security" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Spending Limits</h2>
                <Button size="sm" onClick={openCreateSpendingLimit}>
                  Add Limit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {spendingLimits.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No spending limits configured. Add limits to control transaction authorization.
                </p>
              ) : (
                <div className="space-y-3">
                  {spendingLimits.map((sl) => (
                    <div key={sl.id} className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-medium">{sl.name}</p>
                        <div className="text-xs text-slate-500 space-x-3 mt-1">
                          {sl.maxPerTx && <span>Max/tx: {sl.maxPerTx}</span>}
                          {sl.maxDaily && <span>Max/day: {sl.maxDaily}</span>}
                          {sl.maxMonthly && <span>Max/mo: {sl.maxMonthly}</span>}
                          {sl.denylist.length > 0 && (
                            <span>Denied: {sl.denylist.length} addrs</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditSpendingLimit(sl)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={sl.active ? "default" : "secondary"}
                          onClick={() => toggleSpendingLimit(sl.id, !sl.active)}
                        >
                          {sl.active ? "Active" : "Disabled"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => deleteSpendingLimit(sl.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">Wallet Security Actions</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium">Freeze Wallet</p>
                    <p className="text-slate-500">Block all transactions temporarily</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowFreezeConfirm(true)}
                  >
                    {wallet.status === "FROZEN" ? "Unfreeze" : "Freeze"}
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium">Rotate Keys</p>
                    <p className="text-slate-500">
                      Generate new seed phrase and migrate accounts
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={handleRotate}>
                    Rotate
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium">Export Recovery Phrase</p>
                    <p className="text-slate-500">
                      Reveal or password-protect your seed phrase
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowExport(true);
                      setExportData(null);
                      setExportPassphrase("");
                      setExportPassConfirm("");
                    }}
                  >
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Wallet">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Wallet name" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="trading, dev, cold" />
          </div>
          <Button onClick={handleEdit} disabled={editLoading} className="w-full">
            {editLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Modal>

      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Wallet">
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm">
            <p className="font-medium text-red-700">Warning: This action cannot be undone!</p>
            <p className="text-red-600 mt-1">
              Deleting this wallet will permanently remove all associated accounts, spending limits, and transaction history.
            </p>
          </div>
          <p className="text-sm">
            Are you sure you want to delete <strong>{wallet.name}</strong>?
          </p>
          <div className="flex gap-2">
            <Button onClick={handleDelete} disabled={deleteLoading} className="flex-1" variant="default">
              {deleteLoading ? "Deleting..." : "Yes, Delete"}
            </Button>
            <Button onClick={() => setShowDeleteConfirm(false)} variant="secondary" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showFreezeConfirm}
        onClose={() => setShowFreezeConfirm(false)}
        title={wallet.status === "FROZEN" ? "Unfreeze Wallet" : "Freeze Wallet"}
      >
        <div className="space-y-4">
          <p className="text-sm">
            {wallet.status === "FROZEN"
              ? "Unfreeze will allow transactions on this wallet again."
              : "Freezing will block all future transactions on this wallet until unfrozen."}
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleFreeze}
              disabled={freezeLoading}
              className="flex-1"
              variant={wallet.status === "FROZEN" ? "default" : "default"}
            >
              {freezeLoading
                ? "Processing..."
                : wallet.status === "FROZEN"
                ? "Unfreeze"
                : "Freeze"}
            </Button>
            <Button onClick={() => setShowFreezeConfirm(false)} variant="secondary" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showExport}
        onClose={() => {
          setShowExport(false);
          setExportData(null);
          setExportPassphrase("");
        }}
        title="Export Wallet"
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
            <Button onClick={() => setShowExport(false)} variant="secondary" className="w-full">
              Cancel
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={showSpendingLimitModal}
        onClose={() => {
          setShowSpendingLimitModal(false);
          setEditingSpendingLimit(null);
        }}
        title={editingSpendingLimit ? "Edit Spending Limit" : "Add Spending Limit"}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={slName}
              onChange={(e) => setSlName(e.target.value)}
              placeholder="e.g. Dev Wallet Cap"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Max Per Transaction</label>
              <Input
                value={slMaxPerTx}
                onChange={(e) => setSlMaxPerTx(e.target.value)}
                placeholder="e.g. 1.0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Max Daily Total</label>
              <Input
                value={slMaxDaily}
                onChange={(e) => setSlMaxDaily(e.target.value)}
                placeholder="e.g. 10.0"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Max Monthly Total</label>
            <Input
              value={slMaxMonthly}
              onChange={(e) => setSlMaxMonthly(e.target.value)}
              placeholder="e.g. 100.0"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Denylist Addresses (comma-separated)</label>
            <Input
              value={slDenylist}
              onChange={(e) => setSlDenylist(e.target.value)}
              placeholder="0x..., 0x..."
            />
          </div>
          {editingSpendingLimit && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => deleteSpendingLimit(editingSpendingLimit!.id)}
              >
                Delete Limit
              </Button>
            </div>
          )}
          <Button onClick={saveSpendingLimit} disabled={slLoading} className="w-full">
            {slLoading ? "Saving..." : editingSpendingLimit ? "Update" : "Create"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
