import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { WvcApp, PaginatedResponse } from "../types.js";

export function useWvcApps() {
  const { client, isAuthenticated } = useWranKey();
  const [apps, setApps] = useState<WvcApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchApps = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<WvcApp> = await client.listWvcApps(limit, offset);
      setApps(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const createApp = useCallback(async (name: string, options?: { description?: string; requiredApprovals?: number }) => {
    if (!client) throw new Error("Client not initialized");
    const app = await client.createWvcApp(name, options);
    await fetchApps();
    return app;
  }, [client, fetchApps]);

  const getApp = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.getWvcApp(id);
  }, [client]);

  return {
    apps, loading, error, total,
    fetchApps, createApp, getApp,
  };
}
