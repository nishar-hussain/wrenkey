import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useArKey } from "@arkey/sdk/react";
import { useEffect } from "react";

const navItems = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/wallets", label: "Wallets", icon: "💳" },
  { path: "/transactions", label: "Transactions", icon: "🔄" },
  { path: "/policies", label: "Policies", icon: "🛡️" },
  { path: "/agents", label: "Agents", icon: "🤖" },
  { path: "/users", label: "Users", icon: "👥" },
  { path: "/webhooks", label: "Webhooks", icon: "🔔" },
  { path: "/audit-logs", label: "Audit Logs", icon: "📋" },
];

export default function Layout() {
  const { isAuthenticated, session, logout } = useArKey();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary-600">ArKey</h1>
          <p className="text-xs text-gray-500 mt-1">{session.org?.name || "Dashboard"}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-sm font-bold text-primary-700">
              {session.user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user?.email || "User"}</p>
              <p className="text-xs text-gray-500">{session.user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-500 text-lg leading-none cursor-pointer p-1"
              title="Sign out"
            >
              ⏻
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
