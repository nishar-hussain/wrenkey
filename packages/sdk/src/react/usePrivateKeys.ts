import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { PrivateKey, PaginatedResponse } from "../types.js";

export function usePrivateKeys() {
  const { client, isAuthenticated } = useWranKey();
  const [keys, setKeys] = useState<PrivateKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchKeys = useCallback(async (limit = 50, offset = 0, search?: string) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<PrivateKey> = await client.listPrivateKeys(limit, offset, search);
      setKeys(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const createKey = useCallback(async (walletId: string, name: string, chain?: string) => {
    if (!client) throw new Error("Client not initialized");
    const key = await client.createPrivateKey(walletId, name, chain);
    await fetchKeys();
    return key;
  }, [client, fetchKeys]);

  const exportKey = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.exportPrivateKey(id);
  }, [client]);

  const deleteKey = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    await client.deletePrivateKey(id);
    await fetchKeys();
  }, [client, fetchKeys]);

  return { keys, loading, error, total, fetchKeys, createKey, exportKey, deleteKey };
}
