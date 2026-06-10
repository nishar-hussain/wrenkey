import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { Policy, PaginatedResponse } from "../types.js";

export function usePolicies() {
  const { client, isAuthenticated } = useWranKey();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchPolicies = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<Policy> = await client.listPolicies(limit, offset);
      setPolicies(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const createPolicy = useCallback(async (data: { name: string; effect: string; conditions?: unknown[]; consensus?: string; priority?: number }) => {
    if (!client) throw new Error("Client not initialized");
    const policy = await client.createPolicy(data);
    await fetchPolicies();
    return policy;
  }, [client, fetchPolicies]);

  const updatePolicy = useCallback(async (id: string, data: Partial<Policy>) => {
    if (!client) throw new Error("Client not initialized");
    const policy = await client.updatePolicy(id, data);
    await fetchPolicies();
    return policy;
  }, [client, fetchPolicies]);

  const deletePolicy = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    await client.deletePolicy(id);
    await fetchPolicies();
  }, [client, fetchPolicies]);

  return {
    policies, loading, error, total,
    fetchPolicies, createPolicy, updatePolicy, deletePolicy,
  };
}
