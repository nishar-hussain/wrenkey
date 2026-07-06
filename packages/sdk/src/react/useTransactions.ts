import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { Transaction, PaginatedResponse } from "../types.js";

export function useTransactions() {
  const { client, isAuthenticated } = useWranKey();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchTransactions = useCallback(async (limit = 50, offset = 0, filters?: { walletId?: string; status?: string; chain?: string; search?: string }) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<Transaction> = await client.listTransactions(limit, offset, filters);
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
    chain?: string; gasLimit?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string;
    data?: string; speed?: "slow" | "standard" | "fast"; sponsored?: boolean;
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

  const estimateFee = useCallback(async (tx: { to: string; value?: string; data?: string; chain?: string }) => {
    if (!client) throw new Error("Client not initialized");
    return client.estimateFee(tx);
  }, [client]);

  const simulateTransaction = useCallback(async (params: { walletId: string; to: string; value?: string; data?: string; chain?: string }) => {
    if (!client) throw new Error("Client not initialized");
    return client.simulateTransaction(params);
  }, [client]);

  const retryTransaction = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    const result = await client.retryTransaction(id);
    await fetchTransactions();
    return result;
  }, [client, fetchTransactions]);

  const cancelTransaction = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    const result = await client.cancelTransaction(id);
    await fetchTransactions();
    return result;
  }, [client, fetchTransactions]);

  const speedUpTransaction = useCallback(async (id: string, gasMultiplier?: number) => {
    if (!client) throw new Error("Client not initialized");
    const result = await client.speedUpTransaction(id, gasMultiplier);
    await fetchTransactions();
    return result;
  }, [client, fetchTransactions]);

  const signMessage = useCallback(async (params: { walletId: string; message: string; chain?: string }) => {
    if (!client) throw new Error("Client not initialized");
    return client.signMessage(params);
  }, [client]);

  const getNonce = useCallback(async (address: string, chain?: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.getNonce(address, chain);
  }, [client]);

  return {
    transactions, loading, error, total,
    fetchTransactions, signAndSend, getTransaction, estimateFee, simulateTransaction,
    retryTransaction, cancelTransaction, speedUpTransaction, signMessage, getNonce,
  };
}
