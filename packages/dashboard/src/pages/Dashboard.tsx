import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useArKey } from "@arkey/sdk/react";

export default function DashboardPage() {
  const { client } = useArKey();
  const [stats, setStats] = useState({ wallets: 0, users: 0, policies: 0, agents: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [wallets, users, policies, agents] = await Promise.all([
          client.getWallets(),
          client.getUsers(),
          client.getPolicies(),
          client.getAgents(),
        ]);
        setStats({
          wallets: wallets.wallets?.length || 0,
          users: users.users?.length || 0,
          policies: policies.policies.length,
          agents: agents.agents?.length || 0,
        });
      } catch (err) {
        console.error("Failed to load stats:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [client]);

  const cards = [
    { label: "Wallets", value: stats.wallets, icon: "💳", href: "/wallets", color: "bg-blue-50 text-blue-700" },
    { label: "Users", value: stats.users, icon: "👥", href: "/users", color: "bg-green-50 text-green-700" },
    { label: "Policies", value: stats.policies, icon: "🛡️", href: "/policies", color: "bg-purple-50 text-purple-700" },
    { label: "Agents", value: stats.agents, icon: "🤖", href: "/agents", color: "bg-orange-50 text-orange-700" },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link key={card.label} to={card.href} className={`${card.color} rounded-xl p-6 hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-80">{card.label}</p>
                <p className="text-3xl font-bold mt-1">
                  {loading ? "..." : card.value}
                </p>
              </div>
              <span className="text-3xl">{card.icon}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Create Wallet", href: "/wallets" },
            { label: "Add User", href: "/users" },
            { label: "Create Policy", href: "/policies" },
            { label: "Deploy Agent", href: "/agents" },
          ].map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="p-4 border border-gray-200 rounded-lg text-center text-sm font-medium text-gray-600 hover:border-primary-300 hover:text-primary-600 transition-colors"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
