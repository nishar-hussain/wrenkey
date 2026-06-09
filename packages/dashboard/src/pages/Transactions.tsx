import { useEffect, useState } from "react";
import { useArKey } from "@arkey/sdk/react";

export default function TransactionsPage() {
  const { client } = useArKey();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const walletsData = await client.getWallets();
        const wallets = walletsData.wallets || [];
        const allTxs: any[] = [];
        for (const w of wallets) {
          for (const a of w.accounts || []) {
            try {
              const txs = await client.getAccountTransactions(a.id);
              allTxs.push(...(txs.transactions || []));
            } catch {}
          }
        }
        setTransactions(allTxs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Transactions</h2>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Hash</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">To</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Value</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {transactions.map((tx: any) => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-mono text-gray-600">
                  {tx.txHash ? `${tx.txHash.slice(0, 10)}...` : "Pending"}
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-600">
                  {tx.to.slice(0, 10)}...
                </td>
                <td className="px-6 py-4 text-sm">{tx.value}</td>
                <td className="px-6 py-4">
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    tx.status === "CONFIRMED" ? "bg-green-100 text-green-700" :
                    tx.status === "FAILED" ? "bg-red-100 text-red-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>
                    {tx.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(tx.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No transactions</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
