import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { SpendingLimit, PaginatedResponse } from "../types.js";

export function useSpendingLimits() {
  const { client, isAuthenticated } = useWranKey();
  const [limits, setLimits] = useState<SpendingLimit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchLimits = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<SpendingLimit> = await client.listSpendingLimits(limit, offset);
      setLimits(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  const createLimit = useCallback(async (data: { name: string; walletId?: string; chainId?: string; maxPerTx?: string; maxDaily?: string; maxMonthly?: string; allowlist?: string[]; denylist?: string[] }) => {
    if (!client) throw new Error("Client not initialized");
    const limit = await client.createSpendingLimit(data);
    await fetchLimits();
    return limit;
  }, [client, fetchLimits]);

  const updateLimit = useCallback(async (id: string, data: Partial<SpendingLimit>) => {
    if (!client) throw new Error("Client not initialized");
    const limit = await client.updateSpendingLimit(id, data);
    await fetchLimits();
    return limit;
  }, [client, fetchLimits]);

  const deleteLimit = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    await client.deleteSpendingLimit(id);
    await fetchLimits();
  }, [client, fetchLimits]);

  return { limits, loading, error, total, fetchLimits, createLimit, updateLimit, deleteLimit };
}
