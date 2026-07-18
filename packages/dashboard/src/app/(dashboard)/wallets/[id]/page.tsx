"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ChainInfo {
  id: string;
  name: string;
  chainId: number;
  symbol: string;
  blockExplorerUrl?: string;
}

interface WalletDetail {
  id: string;
  name: string;
  ownerType: string;
  ownerId: string;
  status: string;
  tags: string[];
  wvcManaged?: boolean;
  devMode?: boolean;
  appProof?: any;
  accounts: Array<{
    id: string;
    chainId: string;
    chain: ChainInfo;
    address: string;
    derivationPath: string;
    index: number;
    createdAt: string;
  }>;
  createdAt: string;
}

interface ExportInfo {
  mnemonic?: string;
  encryptedMnemonic?: string;
  accounts: Array<{ chainId: string; address: string; derivationPath: string; index: number }>;
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

interface BalanceEntry {
  chainId: string;
  chain: string;
  address: string;
  balance: string;
  balanceWei: string;
  symbol: string;
}

function copyToClipboard(text: string, addToast: (msg: string, type: "success" | "error") => void) {
  navigator.clipboard.writeText(text).then(
    () => addToast("Copied to clipboard", "success"),
    () => addToast("Failed to copy", "error")
  );
}

const CHAIN_OPTIONS = ["sepolia", "ethereum", "polygon", "arbitrum", "optimism", "base"];

export default function WalletDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallet, setWallet] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [accountSearch, setAccountSearch] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccountChain, setNewAccountChain] = useState("sepolia");
  const [newAccountLoading, setNewAccountLoading] = useState(false);

  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);

  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState<ExportInfo | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportPassConfirm, setExportPassConfirm] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [activeParamId, setActiveParamId] = useState<string | null>(null);

  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [tokenBalances, setTokenBalances] = useState<any[]>([]);
  const [gasPrice, setGasPrice] = useState<any>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [securityLoading, setSecurityLoading] = useState<string | null>(null);

  const [quorumConfigured, setQuorumConfigured] = useState<boolean | null>(null);
  const [quorumCheckLoading, setQuorumCheckLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res: any = await apiFetch(`/wallets/${params.id}`, { token });
      setWallet(res);
    } catch (err: any) {
      setError(err.message || "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchData();
  }, [isAuthenticated, fetchData, router]);

  const fetchBalances = async () => {
    if (!token) return;
    setBalanceLoading(true);
    try {
      const [balRes, tokRes, gasRes] = await Promise.all([
        apiFetch(`/wallets/${params.id}/balance`, { token: token! }).catch(() => null),
        apiFetch(`/wallets/${params.id}/tokens`, { token: token! }).catch(() => null),
        apiFetch(`/wallets/${params.id}/gas-price`, { token: token! }).catch(() => null),
      ]);
      if (balRes) setBalances((balRes as any).balances || []);
      if (tokRes) setTokenBalances((tokRes as any).tokenBalances || []);
      if (gasRes) setGasPrice(gasRes);
    } catch (err: any) {
      addToast(err.message || "Failed to load balances", "error");
    } finally { setBalanceLoading(false); }
  };

  const fetchQuorumStatus = useCallback(async () => {
    if (!token) return;
    setQuorumCheckLoading(true);
    try {
      const quorumRes: any = await apiFetch("/quorum", { token }).catch(() => null);
      if (quorumRes) {
        setQuorumConfigured(quorumRes.memberIds && quorumRes.memberIds.length > 0);
      }
      const approvalRes: any = await apiFetch(`/approval-requests?status=PENDING&limit=50`, { token }).catch(() => null);
      if (approvalRes && approvalRes.data) {
        const walletApprovals = approvalRes.data.filter(
          (r: any) => r.targetId === params.id && r.status === "PENDING"
        );
        setPendingApproval(walletApprovals.length > 0 ? walletApprovals[0] : null);
      }
    } catch {
      setQuorumConfigured(false);
    } finally {
      setQuorumCheckLoading(false);
    }
  }, [token, params.id]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchQuorumStatus();
    }
  }, [isAuthenticated, fetchQuorumStatus]);

  const handleSecurityAction = async (action: "freeze" | "unfreeze" | "rotate") => {
    setSecurityLoading(action);
    try {
      const res: any = await apiFetch(`/wallets/${params.id}/${action}`, { method: "POST", token: token! });
      if (res && res.status === "AWAITING_APPROVAL") {
        const actionLabels: Record<string, string> = { freeze: "Freeze", unfreeze: "Unfreeze", rotate: "Rotate keys" };
        addToast(`Quorum approval required — ${res.approvedBy.length}/${res.requiredApprovals} approvals for ${actionLabels[action]}`, "info");
        fetchQuorumStatus();
      } else {
        addToast(`Wallet ${action}${action === "freeze" ? "d" : "d"} successfully`, "success");
        fetchData();
      }
    } catch (err: any) {
      addToast(err.message || `Failed to ${action} wallet`, "error");
    } finally { setSecurityLoading(null); }
  };

  const handleRevealSeedPhrase = async () => {
    setSeedLoading(true);
    try {
      const res: any = await apiFetch(`/wallets/${params.id}/export`, {
        method: "POST",
        body: JSON.stringify({}),
        token: token!,
      });
      if (res && res.status === "AWAITING_APPROVAL") {
        addToast(`Quorum approval required — ${res.approvedBy.length}/${res.requiredApprovals} approvals for seed phrase reveal`, "info");
        fetchQuorumStatus();
      } else {
        setSeedPhrase(res.mnemonic || "");
        setShowSeedPhrase(true);
      }
    } catch (err: any) {
      addToast(err.message || "Failed to reveal seed phrase", "error");
    } finally {
      setSeedLoading(false);
    }
  };

  const handleAddAccount = async () => {
    setNewAccountLoading(true);
    try {
      await apiFetch(`/wallets/${params.id}/accounts`, {
        method: "POST",
        body: JSON.stringify({ chain: newAccountChain }),
        token: token!,
      });
      setShowNewAccount(false);
      setNewAccountChain("sepolia");
      addToast("Account derived", "success");
      fetchData();
    } catch (err: any) {
      addToast(err.message || "Failed to derive account", "error");
    } finally {
      setNewAccountLoading(false);
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
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
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
      if (res && res.status === "AWAITING_APPROVAL") {
        addToast(`Quorum approval required — ${res.approvedBy.length}/${res.requiredApprovals} approvals for wallet export`, "info");
        setShowExport(false);
        setExportPassphrase("");
        setExportPassConfirm("");
        fetchQuorumStatus();
      } else {
        setExportData(res);
      }
    } catch (err: any) {
      addToast(err.message || "Failed to export wallet", "error");
    } finally {
      setExportLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editName.trim()) { addToast("Name is required", "error"); return; }
    setEditLoading(true);
    try {
      const body: any = { name: editName };
      const systemTags = wallet?.tags.filter((t) => t.startsWith("custom-token:")) || [];
      const userTags = editTags ? editTags.split(",").map((s) => s.trim()).filter(Boolean) : [];
      body.tags = [...systemTags, ...userTags];
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

  if (!isAuthenticated) return null;

  const filteredAccounts = wallet?.accounts.filter(
    (a) => !accountSearch || a.address.toLowerCase().includes(accountSearch.toLowerCase()) || a.chain.name.toLowerCase().includes(accountSearch.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 mb-4">{error || "Wallet not found"}</p>
        <Button variant="secondary" onClick={() => router.push("/wallets")}>Back to Wallets</Button>
      </div>
    );
  }

  const accountColumns = [
    {
      key: "chainName",
      header: "Accounts",
      render: (a: any) => (
        <span className="text-sm font-medium">{a.chain?.name ? a.chain.name.charAt(0).toUpperCase() + a.chain.name.slice(1) : a.chainId}</span>
      ),
    },
    {
      key: "address",
      header: "Address",
      render: (a: any) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{a.address.slice(0, 6)}&middot;&middot;&middot;&middot;{a.address.slice(-4)}</span>
          <button onClick={() => copyToClipboard(a.address, addToast)} className="text-slate-400 hover:text-slate-600 text-xs">&#x2398;</button>
        </div>
      ),
    },
    {
      key: "derivationPath",
      header: "Parameters",
      render: (a: any) => (
        <button
          onClick={() => setActiveParamId(activeParamId === a.id ? null : a.id)}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          title="View derivation details"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/wallets")} className="text-slate-400 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h1 className="text-xl font-bold">Wallet</h1>
          <h2 className="text-xl font-bold text-slate-700">{wallet.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push(`/transactions?walletId=${wallet.id}`)}>View Transactions</Button>
          <Button onClick={() => { setShowExport(true); setExportData(null); setExportPassphrase(""); setExportPassConfirm(""); }} disabled={quorumConfigured === false}>Export</Button>
          <Button variant="secondary" onClick={() => { setEditName(wallet.name); setEditTags(wallet.tags.filter((t) => !t.startsWith("custom-token:")).join(", ")); setShowEdit(true); }}>Edit</Button>
          <Button variant="secondary" onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
        </div>
      </div>

      {wallet.wvcManaged && (
        <div className={`mb-6 p-4 rounded-lg border ${wallet.devMode ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${wallet.devMode ? "text-amber-800" : "text-emerald-800"}`}>
              {wallet.devMode ? "WVC Dev Mode" : "WVC Verified"}
            </span>
          </div>
          <p className={`text-xs mt-1 ${wallet.devMode ? "text-amber-600" : "text-emerald-600"}`}>
            {wallet.devMode
              ? "This wallet uses the local WVC runtime. Signatures are development-only and not valid on-chain."
              : "This wallet is secured by a verifiable compute enclave. Signatures are cryptographically attested."}
          </p>
        </div>
      )}

      {quorumConfigured === false && !quorumCheckLoading && (
        <div className="mb-6 p-4 rounded-lg border bg-red-50 border-red-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-red-800">Root Quorum Required</span>
          </div>
          <p className="text-xs mt-1 text-red-600">
            Sensitive wallet operations (export, freeze, unfreeze, rotate) are disabled until an org admin sets up Root Quorum in{" "}
            <a href="/team/root-quorum" className="underline font-medium">Team &rarr; Root Quorum</a>.
          </p>
        </div>
      )}

      {pendingApproval && (
        <div className="mb-6 p-4 rounded-lg border bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-blue-800">Approval Pending</span>
          </div>
          <p className="text-xs mt-1 text-blue-600">
            A <span className="font-medium capitalize">{String(pendingApproval.actionType || "").replace("WALLET_", "").replace("_", " ").toLowerCase()}</span> approval is pending:{" "}
            <span className="font-mono">{pendingApproval.approvedBy?.length || 0}/{pendingApproval.requiredApprovals}</span> approved.{" "}
            <a href="/approvals" className="underline font-medium">View approvals &rarr;</a>
          </p>
        </div>
      )}

      {/* Seed Phrase Card */}
      <Card className="mb-6">
        <CardContent className="p-5">
          {!showSeedPhrase ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Seed Phrase</p>
                <p className="text-sm text-slate-500 mt-0.5">Your seed phrase is the key to your wallet. Save it in a secure location.</p>
              </div>
              <Button variant="secondary" onClick={handleRevealSeedPhrase} disabled={seedLoading || quorumConfigured === false}>
                {seedLoading ? "Loading..." : "Reveal"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium">Seed Phrase</p>
              <p className="text-sm text-slate-500">Your seed phrase is the key to your wallet. Save it in a secure location.</p>
              <div className="p-3 bg-slate-100 rounded-md font-mono text-sm break-words">
                {seedPhrase}
              </div>
              <Button variant="secondary" onClick={() => { setShowSeedPhrase(false); setSeedPhrase(""); }}>
                Done
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Bar */}
      <Card className="mb-6">
        <CardContent className="p-4 flex items-center gap-8 text-sm">
          <div>
            <span className="text-slate-500">ID</span>
            <p className="font-mono text-xs mt-0.5">{wallet.id.slice(0, 4)}&middot;&middot;&middot;&middot;{wallet.id.slice(-4)}</p>
          </div>
          <div>
            <span className="text-slate-500">Created</span>
            <p className="text-xs mt-0.5">{new Date(wallet.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
          </div>
        </CardContent>
      </Card>

      {/* Balances & Security */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Balances & Security</h3>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={fetchBalances} disabled={balanceLoading}>
                {balanceLoading ? "Loading..." : "Refresh Balances"}
              </Button>
              {wallet.status === "FROZEN" ? (
                <Button size="sm" variant="secondary" onClick={() => handleSecurityAction("unfreeze")} disabled={securityLoading === "unfreeze" || quorumConfigured === false}>
                  {securityLoading === "unfreeze" ? "Unfreezing..." : "Unfreeze"}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => handleSecurityAction("freeze")} disabled={securityLoading === "freeze" || quorumConfigured === false}>
                  {securityLoading === "freeze" ? "Freezing..." : "Freeze"}
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => handleSecurityAction("rotate")} disabled={securityLoading === "rotate" || quorumConfigured === false}>
                {securityLoading === "rotate" ? "Rotating..." : "Rotate Keys"}
              </Button>
            </div>
          </div>

          {balances.length > 0 ? (
            <div className="space-y-2">
              {balances.map((b) => (
                <div key={b.chainId} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                  <span className="capitalize text-slate-600">{b.chain}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-400">{b.address.slice(0, 8)}...{b.address.slice(-4)}</span>
                    <span className="font-medium">{b.balance} {b.symbol}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Click "Refresh Balances" to load on-chain balances.</p>
          )}

          {tokenBalances.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Token Balances</p>
              {tokenBalances.map((tb: any, i: number) => (
                <div key={i} className="text-sm">
                  <span className="text-slate-500 capitalize">{tb.chain}: </span>
                  {tb.tokens?.filter((t: any) => parseFloat(t.balance) > 0).map((t: any, j: number) => (
                    <span key={j} className="ml-2 font-medium">{t.balanceFormatted} {t.token.symbol}</span>
                  )) || <span className="text-slate-400">No tokens</span>}
                </div>
              ))}
            </div>
          )}

          {gasPrice && (
            <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
              <span className="text-slate-400">Gas Price: </span>
              <span className="font-mono">{gasPrice.standard || "—"} wei (standard)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accounts */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Accounts</h3>
          <span className="text-xs text-slate-400">({wallet.accounts.length})</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Input
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              placeholder="Search accounts..."
              className="w-48 text-sm"
            />
          </div>
          {!showNewAccount ? (
            <Button variant="secondary" size="sm" onClick={() => setShowNewAccount(true)}>
              New account
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={newAccountChain}
                onChange={(e) => setNewAccountChain(e.target.value)}
                className="border rounded-md px-2 py-1.5 text-sm"
              >
                {CHAIN_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <Button size="sm" onClick={handleAddAccount} disabled={newAccountLoading}>
                {newAccountLoading ? "Adding..." : "Add"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowNewAccount(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table columns={accountColumns} data={filteredAccounts} emptyMessage="No accounts derived." />
        </CardContent>
      </Card>

      {/* Private Keys */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Private Keys</h3>
            <span className="text-xs text-slate-400">({wallet.accounts.length})</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowNewAccount(true)}>
            New Private Key
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table
              columns={[
                {
                  key: "name",
                  header: "Key",
                  render: (a: any) => <span className="text-sm font-medium">{a.chain?.name ? a.chain.name.charAt(0).toUpperCase() + a.chain.name.slice(1) : "arkey"}</span>,
                },
                {
                  key: "id",
                  header: "Private ID",
                  render: (a: any) => <span className="font-mono text-xs text-slate-500">{a.id.slice(0, 4)}&middot;&middot;&middot;&middot;{a.id.slice(-4)}</span>,
                },
                {
                  key: "tags",
                  header: "Tags",
                  render: () => (
                    <button
                      onClick={() => { setEditName(wallet.name); setEditTags(wallet.tags.filter((t) => !t.startsWith("custom-token:")).join(", ")); setShowEdit(true); }}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      Add Tag
                    </button>
                  ),
                },
                {
                  key: "exported",
                  header: "Exported",
                  render: () => <span className="text-xs">{showSeedPhrase ? "Yes" : "No"}</span>,
                },
                {
                  key: "curve",
                  header: "Curve Type",
                  render: () => <span className="text-xs font-mono">SECP256K1</span>,
                },
                {
                  key: "createdAt",
                  header: "Created",
                  render: (a: any) => <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>,
                },
              ]}
              data={filteredAccounts}
              emptyMessage="No private keys derived."
            />
          </CardContent>
        </Card>
      </div>

      {/* Parameters Popover */}
      {activeParamId && (() => {
        const acc = wallet.accounts.find((a) => a.id === activeParamId);
        if (!acc) return null;
        return (
          <div className="fixed inset-0 z-30" onClick={() => setActiveParamId(null)}>
            <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 w-64 p-4 bg-white border border-slate-200 rounded-lg shadow-xl text-sm" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Curve Type</p>
                  <p className="font-mono text-slate-800 mt-0.5">SECP&middot;&middot;&middot;&middot;56K1</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Path Type</p>
                  <p className="font-mono text-slate-800 mt-0.5">{acc.derivationPath?.startsWith("m/44'") ? "BIP44" : acc.derivationPath?.startsWith("m/0'") ? "BIP32" : "Legacy"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium">Path</p>
                  <p className="font-mono text-slate-800 mt-0.5 break-all">{acc.derivationPath}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Export Modal (encrypted export) */}
      <Modal
        open={showExport}
        onClose={() => { setShowExport(false); setExportData(null); setExportPassphrase(""); setExportPassConfirm(""); }}
        title={`Export Wallet: ${wallet.name}`}
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
              <Input value={exportData.mnemonic || exportData.encryptedMnemonic || ""} readOnly className="font-mono text-sm" />
            </div>
            <Button onClick={() => { setShowExport(false); setExportData(null); setExportPassphrase(""); setExportPassConfirm(""); }} variant="secondary" className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
              <p className="font-medium text-amber-700">Export wallet seed phrase</p>
              <p className="text-amber-600 mt-1">Leave passphrase blank for plaintext export.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Passphrase (optional)</label>
              <Input type="password" value={exportPassphrase} onChange={(e) => setExportPassphrase(e.target.value)} placeholder="Min 8 characters" />
            </div>
            {exportPassphrase && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Confirm Passphrase</label>
                <Input type="password" value={exportPassConfirm} onChange={(e) => setExportPassConfirm(e.target.value)} placeholder="Re-enter passphrase" />
              </div>
            )}
            <Button onClick={handleExport} disabled={exportLoading} className="w-full">
              {exportLoading ? "Exporting..." : "Export Wallet"}
            </Button>
            <Button onClick={() => { setShowExport(false); setExportPassphrase(""); }} variant="secondary" className="w-full">Cancel</Button>
          </div>
        )}
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Wallet">
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm">
            <p className="font-medium text-red-700">Warning: This action cannot be undone!</p>
            <p className="text-red-600 mt-1">Deleting this wallet will permanently remove all associated accounts, spending limits, and transaction history.</p>
          </div>
          <p className="text-sm">Are you sure you want to delete <strong>{wallet.name}</strong>?</p>
          <div className="flex gap-2">
            <Button onClick={handleDelete} disabled={deleteLoading} className="flex-1">Yes, Delete</Button>
            <Button onClick={() => setShowDeleteConfirm(false)} variant="secondary" className="flex-1">Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Wallet">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Wallet Name</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
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
    </div>
  );
}
