"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";

interface WalletOption {
  id: string;
  name: string;
  status: string;
  accounts: Array<{
    id: string;
    address: string;
    chainId: string;
    chain?: { name: string; family?: string; symbol?: string };
  }>;
}

export default function SendTransactionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedWalletId = searchParams.get("walletId") || "";
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<any>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  const [form, setForm] = useState({
    walletId: "",
    to: "",
    value: "",
    chain: "sepolia",
    gasLimit: "21000",
    maxFeePerGas: "",
    maxPriorityFeePerGas: "",
    data: "",
    speed: "standard" as "slow" | "standard" | "fast",
  });

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch("/wallets?limit=100", { token });
      setWallets(res.data);
      const selectedId =
        preselectedWalletId && res.data.some((w: WalletOption) => w.id === preselectedWalletId)
          ? preselectedWalletId
          : res.data[0]?.id || "";
      if (selectedId) {
        const found = res.data.find((w: WalletOption) => w.id === selectedId);
        const accountChain = found?.accounts?.[0]?.chain?.name || "sepolia";
        setForm((prev) => ({ ...prev, walletId: selectedId, chain: accountChain }));
      }
    } catch (err: any) {
      addToast(err.message || "Failed to load wallets", "error");
    } finally {
      setLoading(false);
    }
  }, [token, preselectedWalletId]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchWallets();
  }, [isAuthenticated, fetchWallets, router]);

  const selectedWallet = wallets.find((w) => w.id === form.walletId);
  const selectedAccount =
    selectedWallet?.accounts.find((a) => a.chain?.name === form.chain) || selectedWallet?.accounts?.[0];
  const isStellar =
    selectedAccount?.chain?.family === "stellar" ||
    selectedAccount?.chain?.name?.startsWith("stellar") ||
    selectedAccount?.address?.startsWith("G") ||
    form.chain?.startsWith("stellar");

  const handleWalletChange = (walletId: string) => {
    const sel = wallets.find((w) => w.id === walletId);
    const accountChain = sel?.accounts?.[0]?.chain?.name || "sepolia";
    setForm((prev) => ({ ...prev, walletId, chain: accountChain }));
    setEstimatedFee(null);
    setSimResult(null);
  };

  const estimateFee = async () => {
    if (!form.to) return;
    setFeeLoading(true);
    try {
      const res: any = await apiFetch("/transactions/estimate-fee", {
        method: "POST",
        body: JSON.stringify({
          to: form.to,
          value: form.value || "0",
          data: form.data || undefined,
          chain: form.chain,
        }),
        token: token!,
      });
      setEstimatedFee(res);
    } catch (err: any) {
      addToast(err.message || "Failed to estimate fee", "error");
    } finally {
      setFeeLoading(false);
    }
  };

  const simulate = async () => {
    if (!form.walletId || !form.to) {
      addToast("Select a wallet and enter recipient address", "error");
      return;
    }
    setSimLoading(true);
    try {
      const payload: any = {
        walletId: form.walletId,
        to: form.to,
        chain: form.chain,
      };
      if (!isStellar) payload.gasLimit = form.gasLimit;
      if (form.value) payload.value = form.value;
      if (form.maxFeePerGas) payload.maxFeePerGas = form.maxFeePerGas;
      if (form.data) payload.data = form.data;
      const res: any = await apiFetch("/transactions/simulate", {
        method: "POST",
        body: JSON.stringify(payload),
        token: token!,
      });
      setSimResult(res);
    } catch (err: any) {
      addToast(err.message || "Simulation failed", "error");
    } finally {
      setSimLoading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.walletId || !form.to || !form.value) {
      addToast("Wallet, recipient, and value are required", "error");
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        walletId: form.walletId,
        to: form.to,
        value: form.value,
        chain: form.chain,
      };
      if (form.data) payload.data = form.data;
      if (!isStellar) {
        payload.gasLimit = form.gasLimit;
        payload.speed = form.speed;
        if (form.maxFeePerGas) payload.maxFeePerGas = form.maxFeePerGas;
        if (form.maxPriorityFeePerGas) payload.maxPriorityFeePerGas = form.maxPriorityFeePerGas;
      }

      const res: any = await apiFetch("/transactions/sign", {
        method: "POST",
        body: JSON.stringify(payload),
        token: token!,
      });

      if (res.allowed === false) {
        addToast(`Transaction blocked: ${res.reason}`, "error");
      } else if (res.requiresConsensus) {
        addToast(`Transaction requires approval (${res.approvalId})`, "info");
      } else if (res.confirmed) {
        addToast(`Transaction confirmed! Hash: ${res.txHash?.slice(0, 16)}...`, "success");
        if (res.explorerUrl) window.open(res.explorerUrl, "_blank");
        router.push(`/transactions/${res.transactionId}`);
      } else {
        addToast(`Transaction broadcast! Hash: ${res.txHash?.slice(0, 16)}... Check Explorer.`, "info");
        if (res.explorerUrl) window.open(res.explorerUrl, "_blank");
        router.push(`/transactions/${res.transactionId}`);
      }
    } catch (err: any) {
      addToast(err.message || "Failed to send transaction", "error");
    } finally {
      setSending(false);
    }
  };

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Send Transaction</h1>
        <p className="text-slate-400">Loading wallets...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Send Transaction</h1>
        <Button variant="secondary" onClick={() => router.push("/transactions")}>
          View Transactions
        </Button>
      </div>
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Wallet</label>
              <select
                value={form.walletId}
                onChange={(e) => handleWalletChange(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              >
                <option value="">Select wallet...</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.status === "FROZEN"}>
                    {w.name}{" "}
                    {w.status === "FROZEN"
                      ? "(FROZEN)"
                      : w.accounts?.[0]
                      ? `(${w.accounts[0].address.slice(0, 10)}...)`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedWallet && selectedWallet.accounts.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chain / Account</label>
                <select
                  value={form.chain}
                  onChange={(e) => setForm({ ...form, chain: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  {selectedWallet.accounts.map((acc) => (
                    <option key={acc.id} value={acc.chain?.name || acc.chainId}>
                      {acc.chain?.name || acc.chainId} ({acc.address.slice(0, 10)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {isStellar ? "To Address (Stellar Public Key)" : "To Address"}
              </label>
              <Input
                value={form.to}
                onChange={(e) => {
                  setForm({ ...form, to: e.target.value });
                  setEstimatedFee(null);
                  setSimResult(null);
                }}
                placeholder={isStellar ? "GD4FH6AKKQQDMZ4M666FZABPCEZL3BXL2BJITLJVDIPG4BJMN4F27BGC" : "0x..."}
                required
              />
            </div>

            {isStellar ? (
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Value (XLM)</label>
                  <Input
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="10"
                    required
                  />
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
                  <span className="font-medium text-slate-700">Stellar Network Fee:</span> Calculated automatically by Horizon network (~0.00001 XLM)
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Value</label>
                    <Input
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      placeholder="0.01"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Gas Limit</label>
                    <Input
                      value={form.gasLimit}
                      onChange={(e) => setForm({ ...form, gasLimit: e.target.value })}
                      placeholder="21000"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Speed</label>
                    <select
                      value={form.speed}
                      onChange={(e) => setForm({ ...form, speed: e.target.value as any })}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="slow">Slow</option>
                      <option value="standard">Standard</option>
                      <option value="fast">Fast</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Max Fee Per Gas (optional)</label>
                    <Input
                      value={form.maxFeePerGas}
                      onChange={(e) => setForm({ ...form, maxFeePerGas: e.target.value })}
                      placeholder="Auto"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Max Priority Fee (optional)</label>
                    <Input
                      value={form.maxPriorityFeePerGas}
                      onChange={(e) => setForm({ ...form, maxPriorityFeePerGas: e.target.value })}
                      placeholder="Auto"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium">
                {isStellar ? "Memo (optional)" : "Data / Calldata (optional)"}
              </label>
              <Input
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                placeholder={isStellar ? "Optional text memo (max 28 chars)" : "0x..."}
              />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={estimateFee} disabled={!form.to || feeLoading}>
                {feeLoading ? "Estimating..." : "Estimate Fee"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={simulate}
                disabled={!form.walletId || !form.to || simLoading}
              >
                {simLoading ? "Simulating..." : "Simulate"}
              </Button>
            </div>

            {estimatedFee && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <p className="font-medium text-blue-700">Estimated Fee</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-blue-600">
                  {estimatedFee.family === "stellar" ? (
                    <>
                      <div>
                        <span className="font-medium">Fee (Stroops):</span> {estimatedFee.feeStroops}
                      </div>
                      <div>
                        <span className="font-medium">Estimated Fee:</span> {estimatedFee.estimatedFee} {estimatedFee.currency || "XLM"}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="font-medium">Gas Limit:</span> {estimatedFee.gasLimit}
                      </div>
                      <div>
                        <span className="font-medium">Gas Price:</span> {estimatedFee.gasPrice} wei
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium">Total:</span> {estimatedFee.estimatedFee} {estimatedFee.currency || "ETH"}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {simResult && (
              <div
                className={`p-3 rounded-md text-sm ${
                  simResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
                }`}
              >
                <p className={`font-medium ${simResult.success ? "text-green-700" : "text-red-700"}`}>
                  Simulation: {simResult.success ? "Success" : "Failed"}
                </p>
                {simResult.error && <p className="text-red-600 text-xs mt-1">{simResult.error}</p>}
                {simResult.operation && (
                  <p className="text-xs mt-1 text-slate-600">
                    Operation: <span className="font-semibold">{simResult.operation}</span> (Destination{" "}
                    {simResult.destinationFunded ? "funded" : "unfunded"})
                  </p>
                )}
                {simResult.estimatedFeeXlm && (
                  <p className="text-xs mt-1 text-slate-600">Estimated Fee: {simResult.estimatedFeeXlm} XLM</p>
                )}
              </div>
            )}

            <Button type="submit" disabled={sending} className="w-full">
              {sending ? "Signing & Sending..." : "Sign & Send"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
