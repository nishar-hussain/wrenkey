"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";

const navItems = [
  { href: "/", label: "Dashboard", icon: "□" },
  { href: "/wallets", label: "Wallets", icon: "○" },
  { href: "/transactions", label: "Transactions", icon: "⇄" },
  { href: "/policies", label: "Policies", icon: "⚙" },
  { href: "/agents", label: "Agents", icon: "◈" },
  { href: "/webhooks", label: "Webhooks", icon: "⟐" },
  { href: "/users", label: "Users", icon: "👤" },
  { href: "/audit-logs", label: "Audit Logs", icon: "📋" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-700">
        <Link href="/" className="text-xl font-bold tracking-tight">
          WranKey
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-brand-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-700 text-xs text-slate-400">
        WranKey v0.1.0
      </div>
    </aside>
  );
}
