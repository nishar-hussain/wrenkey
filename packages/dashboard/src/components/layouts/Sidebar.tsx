"use client";

import { useState } from "react";
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
  { href: "/api-keys", label: "API Keys", icon: "🔑" },
  { href: "/users", label: "Users", icon: "👤" },
  { href: "/audit-logs", label: "Audit Logs", icon: "📋" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isAuthenticated) return null;

  const nav = (
    <>
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight" onClick={() => setMobileOpen(false)}>
          WranKey
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}>
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-700 text-xs text-slate-400">WranKey v0.1.0</div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-40 bg-slate-900 text-white p-2 rounded-md">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>
      {/* Mobile overlay */}
      {mobileOpen && <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />}
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 bg-slate-900 text-white flex-col shrink-0">{nav}</aside>
      {/* Mobile sidebar */}
      {mobileOpen && <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col">{nav}</aside>}
    </>
  );
}
