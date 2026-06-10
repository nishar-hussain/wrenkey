"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
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

  const [form, setForm] = useState({
    walletId: "",
    to: "",
    value: "",
    chain: "arc",
    gasLimit: "21000",
    maxFeePerGas: "",
    data: "",
  });

  const fetchWallets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch("/wallets?limit=100", { token });
      setWallets(res.data);
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) { router.push("/login"); return; }
    fetchWallets();
  }, [isAuthenticated, fetchWallets, router]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.walletId || !form.to || !form.value) return;
    setSending(true);
    try {
      const payload: any = {
        walletId: form.walletId, to: form.to, value: form.value,
        chain: form.chain, gasLimit: form.gasLimit,
      };
      if (form.maxFeePerGas) payload.maxFeePerGas = form.maxFeePerGas;
      if (form.data) payload.data = form.data;

      const res: any = await apiFetch("/transactions/sign", {
        method: "POST", body: JSON.stringify(payload), token: token!,
      });
      addToast(`Transaction sent! Hash: ${res.txHash?.slice(0, 16)}...`, "success");
      setForm({ walletId: "", to: "", value: "", chain: "arc", gasLimit: "21000", maxFeePerGas: "", data: "" });
    } catch (err: any) {
      addToast(err.message, "error");
    } finally { setSending(false); }
  };

  if (!isAuthenticated) return null;

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
            <Input label="To Address" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="0x..." required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Value (ARC units)" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0.01" required />
              <Input label="Gas Limit" value={form.gasLimit} onChange={(e) => setForm({ ...form, gasLimit: e.target.value })} placeholder="21000" />
            </div>
            <Input label="Max Fee Per Gas (optional)" value={form.maxFeePerGas} onChange={(e) => setForm({ ...form, maxFeePerGas: e.target.value })} placeholder="Auto" />
            <Input label="Data / Calldata (optional)" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} placeholder="0x..." />
            <Button type="submit" loading={sending} className="w-full">Sign & Send</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
