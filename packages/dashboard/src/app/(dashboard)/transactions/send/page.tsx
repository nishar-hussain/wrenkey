"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/Toast";

interface WalletOption {
  id: string;
  name: string;
  accounts: Array<{ id: string; address: string; chain: string }>;
}

export default function SendTransactionPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState<any>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  const [form, setForm] = useState({
    walletId: "",
    to: "",
    value: "",
    chain: "arc",
    gasLimit: "21000",
    maxFeePerGas: "",
    data: "",
  });

  const [sponsorGas, setSponsorGas] = useState(false);

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch("/wallets?limit=100", { token });
      setWallets(res.data);
    } catch (err: any) {
      addToast(err.message || "Failed to load wallets", "error");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchWallets();
  }, [isAuthenticated, fetchWallets, router]);

  const estimateFee = async () => {
    if (!form.to) return;
    setFeeLoading(true);
    try {
      const res: any = await apiFetch("/transactions/estimate-fee", {
        method: "POST",
        body: JSON.stringify({ to: form.to, value: form.value || "0", data: form.data || undefined }),
        token: token!,
      });
      setEstimatedFee(res);
    } catch (err: any) {
      addToast(err.message || "Failed to estimate fee", "error");
    } finally { setFeeLoading(false); }
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
        walletId: form.walletId, to: form.to, value: form.value,
        chain: form.chain, gasLimit: form.gasLimit,
      };
      if (form.maxFeePerGas) payload.maxFeePerGas = form.maxFeePerGas;
      if (form.data) payload.data = form.data;
      if (sponsorGas) payload.sponsorGas = true;

      const res: any = await apiFetch("/transactions/sign", {
        method: "POST", body: JSON.stringify(payload), token: token!,
      });

      if (res.allowed === false) {
        addToast(`Transaction blocked: ${res.reason}`, "error");
      } else {
        addToast(`Transaction sent! Hash: ${res.txHash?.slice(0, 16)}...`, "success");
        setForm({ walletId: "", to: "", value: "", chain: "arc", gasLimit: "21000", maxFeePerGas: "", data: "" });
        setEstimatedFee(null);
        setSponsorGas(false);
      }
    } catch (err: any) {
      addToast(err.message || "Failed to send transaction", "error");
    } finally { setSending(false); }
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
        <Button variant="secondary" onClick={() => router.push("/transactions")}>View Transactions</Button>
      </div>
      <Card className="max-w-2xl">
        <CardContent>
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Wallet</label>
              <select value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm" required>
                <option value="">Select wallet...</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.accounts?.[0] ? `(${w.accounts[0].address.slice(0, 10)}...)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To Address</label>
              <Input value={form.to} onChange={(e) => { setForm({ ...form, to: e.target.value }); setEstimatedFee(null); }} placeholder="0x..." required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Value (ARC)</label>
                <Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0.01" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Gas Limit</label>
                <Input value={form.gasLimit} onChange={(e) => setForm({ ...form, gasLimit: e.target.value })} placeholder="21000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Max Fee Per Gas (optional)</label>
                <Input value={form.maxFeePerGas} onChange={(e) => setForm({ ...form, maxFeePerGas: e.target.value })} placeholder="Auto" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Gas Sponsorship</label>
                <label className="flex items-center gap-2 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sponsorGas}
                    onChange={(e) => setSponsorGas(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-600">Sponsor gas fees</span>
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Data / Calldata (optional)</label>
              <Input value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} placeholder="0x..." />
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={estimateFee} disabled={!form.to || feeLoading}>
                {feeLoading ? "Estimating..." : "Estimate Fee"}
              </Button>
            </div>

            {estimatedFee && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <p className="font-medium text-blue-700">Estimated Fee</p>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-blue-600">
                  <div><span className="font-medium">Gas Limit:</span> {estimatedFee.gasLimit}</div>
                  <div><span className="font-medium">Base Fee:</span> {estimatedFee.baseFeePerGas} wei</div>
                  <div className="col-span-2"><span className="font-medium">Total:</span> {estimatedFee.estimatedFee} {estimatedFee.currency || "ETH"}</div>
                </div>
              </div>
            )}

            <Button type="submit" disabled={sending} className="w-full">
              {sending ? "Signing & Sending..." : sponsorGas ? "Send with Sponsored Gas" : "Sign & Send"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}