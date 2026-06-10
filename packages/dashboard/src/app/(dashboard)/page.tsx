"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/Card";

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuth();
  const [stats, setStats] = useState({ wallets: 0, transactions: 0, users: 0, agents: 0 });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function loadStats() {
      try {
        const [wallets, txs, users, agents] = await Promise.all([
          apiFetch<any>("/wallets?limit=1", { token: token! }),
          apiFetch<any>("/transactions?limit=1", { token: token! }),
          apiFetch<any>("/users?limit=1", { token: token! }),
          apiFetch<any>("/agents?limit=1", { token: token! }),
        ]);
        setStats({
          wallets: wallets.total || 0,
          transactions: txs.total || 0,
          users: users.total || 0,
          agents: agents.total || 0,
        });
      } catch { setStats({ wallets: 0, transactions: 0, users: 0, agents: 0 }); }
    }
    loadStats();
  }, [isAuthenticated, token, router]);

  if (!isAuthenticated) return null;

  const statCards = [
    { label: "Wallets", value: stats.wallets, href: "/wallets", color: "bg-blue-500" },
    { label: "Transactions", value: stats.transactions, href: "/transactions", color: "bg-green-500" },
    { label: "Users", value: stats.users, href: "/users", color: "bg-purple-500" },
    { label: "Agents", value: stats.agents, href: "/agents", color: "bg-orange-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(stat.href)}>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center text-white font-bold`}>
                  {stat.label[0]}
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
