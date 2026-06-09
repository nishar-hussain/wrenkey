import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useArKey } from "@arkey/sdk/react";

export default function WalletDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client } = useArKey();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSign, setShowSign] = useState(false);
  const [txTo, setTxTo] = useState("");
  const [txValue, setTxValue] = useState("");
  const [signResult, setSignResult] = useState<any>(null);
  const [signError, setSignError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [w, a] = await Promise.all([
          client.getWallet(id!),
          client.getAccounts(id!),
        ]);
        setWallet(w);
        setAccounts(a.accounts || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignError("");
    try {
      const result = await client.signAndSend({
        walletId: id!,
        to: txTo,
        value: txValue,
      });
      setSignResult(result);
    } catch (err) {
      setSignError((err as Error).message);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!wallet) return <p className="text-gray-500">Wallet not found</p>;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-primary-600 text-sm mb-4 hover:underline">
        &larr; Back
      </button>
      <h2 className="text-2xl font-bold mb-1">{wallet.name}</h2>
      <p className="text-sm text-gray-500 mb-6">Owner: {wallet.ownerType} | Status: {wallet.status}</p>

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
            <button
              onClick={() => setShowSign(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium"
            >
              Sign & Send Transaction
            </button>
          ) : (
            <form onSubmit={handleSign}>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Address</label>
              <input
                type="text"
                value={txTo}
                onChange={(e) => setTxTo(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-3"
                placeholder="0x..."
                required
              />
              <label className="block text-sm font-medium text-gray-700 mb-1">Value (wei)</label>
              <input
                type="text"
                value={txValue}
                onChange={(e) => setTxValue(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
                placeholder="1000000"
                required
              />
              <div className="flex gap-3">
                <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">
                  Sign & Send
                </button>
                <button type="button" onClick={() => setShowSign(false)} className="px-4 py-2 text-gray-500 text-sm">
                  Cancel
                </button>
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
