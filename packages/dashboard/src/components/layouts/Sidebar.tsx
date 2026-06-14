"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/Providers";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Shield,
  Bot,
  Webhook,
  Key,
  Users,
  ClipboardList,
  User,
  UsersRound,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/wallets", label: "Wallets", icon: Wallet },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/agents", label: "Agents", icon: Bot },
];

const secondaryNav = [
  { href: "/profile", label: "My Profile", icon: User },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/api-keys", label: "API Keys", icon: Key },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit-logs", label: "Audit Logs", icon: ClipboardList },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated, user, org } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isAuthenticated) return null;

  const NavItem = ({ href, label, icon: Icon }: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        onClick={() => setTimeout(() => setMobileOpen(false), 100)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors",
          isActive
            ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium"
            : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    );
  };

  const nav = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 shrink-0">
        <Link href="/" className="flex items-center gap-2 font-semibold text-lg" onClick={() => setMobileOpen(false)}>
          <Image src="/logo-icon.png" alt="WranKey" width={28} height={28} className="rounded-md" />
          WranKey
        </Link>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav content */}
      <div className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-6">
          <div className="space-y-1">
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Main</p>
            {mainNav.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>

          <div className="space-y-1">
            <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Management</p>
            {secondaryNav.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-medium shrink-0">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.email || "User"}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate capitalize">{user?.role?.replace("_", " ").toLowerCase() || "Member"}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{org?.name} · <span className="font-mono">{org?.id?.slice(0, 6)}</span></p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 bg-white border border-gray-200 rounded-md p-2 shadow-sm"
      >
        <Menu className="h-5 w-5 text-gray-700" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col shrink-0">
        {nav}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 flex flex-col shadow-xl">
          {nav}
        </aside>
      )}
    </>
  );
}
