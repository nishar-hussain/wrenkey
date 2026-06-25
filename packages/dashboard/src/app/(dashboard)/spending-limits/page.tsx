"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/Toast";

interface SpendingLimit {
  id: string;
  name: string;
  walletId: string;
  maxPerTx?: string;
  maxDaily?: string;
  maxMonthly?: string;
  allowlist: string[];
  denylist: string[];
  active: boolean;
  wallet?: { name: string };
}

export default function SpendingLimitsPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const { addToast } = useToast();
  const [limits, setLimits] = useState<SpendingLimit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [toggleLoading, setToggleLoading] = useState<Record<string, boolean>>({});

  const fetchLimits = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res: any = await apiFetch(`/spending-limits?limit=${limit}&offset=${offset}`, { token });
      setLimits(res.data);
      setTotal(res.total);
    } catch (err: any) {
      addToast(err.message || "Failed to load spending limits", "error");
      setLimits([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, limit, offset]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    fetchLimits();
  }, [isAuthenticated, fetchLimits, router]);

  const toggleLimit = async (id: string, active: boolean) => {
    setToggleLoading((prev) => ({ ...prev, [id]: true }));
    try {
      await apiFetch(`/spending-limits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
        token: token!,
      });
      addToast(active ? "Limit enabled" : "Limit disabled", "success");
      fetchLimits();
    } catch (err: any) {
      addToast(err.message || "Failed to toggle limit", "error");
    } finally {
      setToggleLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  if (!isAuthenticated) return null;

  const columns = [
    { key: "name", header: "Name" },
    {
      key: "maxPerTx",
      header: "Max Per Tx",
      render: (sl: SpendingLimit) => sl.maxPerTx || "—",
    },
    {
      key: "maxDaily",
      header: "Max Daily",
      render: (sl: SpendingLimit) => sl.maxDaily || "—",
    },
    {
      key: "maxMonthly",
      header: "Max Monthly",
      render: (sl: SpendingLimit) => sl.maxMonthly || "—",
    },
    {
      key: "denylist",
      header: "Denylist",
      render: (sl: SpendingLimit) =>
        sl.denylist?.length > 0 ? (
          <span className="text-xs">{sl.denylist.length} addresses</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "active",
      header: "Status",
      render: (sl: SpendingLimit) => (
        <Button
          size="sm"
          variant={sl.active ? "default" : "secondary"}
          disabled={toggleLoading[sl.id]}
          onClick={() => toggleLimit(sl.id, !sl.active)}
        >
          {sl.active ? "Active" : "Disabled"}
        </Button>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (sl: SpendingLimit) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => router.push(`/wallets/${sl.walletId}`)}
        >
          View Wallet
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Spending Limits</h1>
        <Button variant="secondary" onClick={() => router.push("/wallets")}>
          Go to Wallets
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <Table
                columns={columns}
                data={limits}
                loading={false}
                emptyMessage="No spending limits configured. Add them from wallet detail pages."
              />
              <Pagination
                limit={limit}
                offset={offset}
                total={total}
                onPageChange={(l, o) => {
                  setLimit(l);
                  setOffset(o);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
