import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { Chain, PaginatedResponse } from "../types.js";

export function useChains() {
  const { client, isAuthenticated } = useWranKey();
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchChains = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<Chain> = await client.listChains(limit, offset);
      setChains(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchChains();
  }, [fetchChains]);

  return { chains, loading, error, total, fetchChains };
}
