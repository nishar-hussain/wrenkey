import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { ApprovalRequest, PaginatedResponse } from "../types.js";

export function useApprovalRequests() {
  const { client, isAuthenticated } = useWranKey();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchRequests = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<ApprovalRequest> = await client.listApprovalRequests(limit, offset);
      setRequests(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const approveRequest = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    const result = await client.approveRequest(id);
    await fetchRequests();
    return result;
  }, [client, fetchRequests]);

  const rejectRequest = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    const result = await client.rejectRequest(id);
    await fetchRequests();
    return result;
  }, [client, fetchRequests]);

  return { requests, loading, error, total, fetchRequests, approveRequest, rejectRequest };
}
