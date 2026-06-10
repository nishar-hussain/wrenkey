import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { Transaction, PaginatedResponse } from "../types.js";

export function useTransactions() {
  const { client, isAuthenticated } = useWranKey();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchTransactions = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<Transaction> = await client.listTransactions(limit, offset);
      setTransactions(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const signAndSend = useCallback(async (tx: {
    walletId: string; to: string; value: string;
    chain?: string; gasLimit?: string; maxFeePerGas?: string; data?: string;
  }) => {
    if (!client) throw new Error("Client not initialized");
    const result = await client.signAndSend(tx);
    await fetchTransactions();
    return result;
  }, [client, fetchTransactions]);

  const getTransaction = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.getTransaction(id);
  }, [client]);

  const getNonce = useCallback(async (address: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.getNonce(address);
  }, [client]);

  return {
    transactions, loading, error, total,
    fetchTransactions, signAndSend, getTransaction, getNonce,
  };
}
