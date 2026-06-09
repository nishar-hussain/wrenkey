import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useArKey } from "@arkey/sdk/react";

export default function WalletsPage() {
  const { client } = useArKey();
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [walletName, setWalletName] = useState("");
  const [error, setError] = useState("");

  const loadWallets = async () => {
    try {
      const data = await client.getWallets();
      setWallets(data.wallets || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWallets(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await client.createWallet({ name: walletName });
      setWalletName("");
      setShowCreate(false);
      loadWallets();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Wallets</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          + Create Wallet
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl p-6">
          <form onSubmit={handleCreate}>
            <label className="block text-sm font-medium text-gray-700 mb-2">Wallet Name</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={walletName}
                onChange={(e) => setWalletName(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="My Arc Wallet"
                required
              />
              <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium">
                Create
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-500">
                Cancel
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Name</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Owner</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Addresses</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Created</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {wallets.map((w: any) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{w.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{w.ownerType}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">
                    {w.accounts?.[0]?.address?.slice(0, 10)}...
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/wallets/${w.id}`} className="text-primary-600 text-sm hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {wallets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No wallets yet. Create your first wallet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
