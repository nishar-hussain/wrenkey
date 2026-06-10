"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWranKey } from "@wrankey/sdk/react";

export default function WalletDetailPage() {
  const rawParams = useParams();
  const id = (rawParams as { id?: string })?.id;
  const { client } = useWranKey();
  const router = useRouter();
  const [wallet, setWallet] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSign, setShowSign] = useState(false);
  const [txTo, setTxTo] = useState("");
  const [txValue, setTxValue] = useState("");
  const [signResult, setSignResult] = useState<any>(null);
  const [signError, setSignError] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportedMnemonic, setExportedMnemonic] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [w, a] = await Promise.all([client.getWallet(id!), client.getAccounts(id!)]);
        setWallet(w);
        setAccounts(a.accounts || []);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    }
    if (id) load();
  }, [id]);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignError("");
    try {
      const result = await client.signAndSend({ walletId: id!, to: txTo, value: txValue });
      setSignResult(result);
    } catch (err) { setSignError((err as Error).message); }
  };

  const handleExport = async () => {
    try {
      const result = await client.exportWallet(id!);
      setExportedMnemonic(result.mnemonic);
      setShowExport(true);
    } catch (err) { alert((err as Error).message); }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!wallet) return <p className="text-gray-500">Wallet not found</p>;

  return (
    <div>
      <button onClick={() => router.back()} className="text-primary-600 text-sm mb-4 hover:underline">&larr; Back</button>
      <h2 className="text-2xl font-bold mb-1">{wallet.name}</h2>
      <p className="text-sm text-gray-500 mb-4">Owner: {wallet.ownerType} | Status: {wallet.status}</p>

      {showExport && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-medium text-yellow-800 mb-2">Seed Phrase (keep this private!)</p>
          <p className="text-sm font-mono text-yellow-900 break-all">{exportedMnemonic}</p>
          <button onClick={() => { setShowExport(false); setExportedMnemonic(""); }} className="mt-2 text-sm text-yellow-700 underline">Hide</button>
        </div>
      )}
      <button onClick={handleExport} className="mb-6 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Export Seed</button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Accounts</h3>
          {accounts.map((a: any) => (
            <div key={a.id} className="mb-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-mono font-medium">{a.address}</p>
              <p className="text-xs text-gray-500">{a.chain} | {a.derivationPath} | Index: {a.index}</p>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-gray-500 text-sm">No accounts</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="font-semibold mb-4">Send Transaction</h3>
          {!showSign ? (
            <button onClick={() => setShowSign(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">
              Sign & Send Transaction
            </button>
          ) : (
            <form onSubmit={handleSign}>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Address</label>
              <input type="text" value={txTo} onChange={(e) => setTxTo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3" placeholder="0x..." required />
              <label className="block text-sm font-medium text-gray-700 mb-1">Value (wei)</label>
              <input type="text" value={txValue} onChange={(e) => setTxValue(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4" placeholder="1000000" required />
              <div className="flex gap-3">
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">Sign & Send</button>
                <button type="button" onClick={() => setShowSign(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
              </div>
              {signError && <p className="mt-3 text-sm text-red-600">{signError}</p>}
              {signResult && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">Transaction sent!</p>
                  <p className="text-xs text-green-600 font-mono mt-1">Hash: {signResult.txHash}</p>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
