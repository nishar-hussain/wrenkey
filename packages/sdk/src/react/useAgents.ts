import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { Agent, PaginatedResponse } from "../types.js";

export function useAgents() {
  const { client, isAuthenticated } = useWranKey();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchAgents = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<Agent> = await client.listAgents(limit, offset);
      setAgents(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const createAgent = useCallback(async (name: string, options?: { email?: string; permissions?: string[]; tags?: string[] }) => {
    if (!client) throw new Error("Client not initialized");
    const agent = await client.createAgent(name, options);
    await fetchAgents();
    return agent;
  }, [client, fetchAgents]);

  const getAgent = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.getAgent(id);
  }, [client]);

  const deleteAgent = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    await client.deleteAgent(id);
    await fetchAgents();
  }, [client, fetchAgents]);

  return {
    agents, loading, error, total,
    fetchAgents, createAgent, getAgent, deleteAgent,
  };
}
