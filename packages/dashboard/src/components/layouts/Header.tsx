"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/Providers";
import { Bell, ChevronRight, LogOut, User as UserIcon, Settings, Sun, Moon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const breadcrumbMap: Record<string, string> = {
  "": "Dashboard",
  wallets: "Wallets",
  transactions: "Transactions",
  send: "Send Transaction",
  policies: "Policies",
  agents: "Agents",
  webhooks: "Webhooks",
  "api-keys": "API Keys",
  users: "Users",
  "audit-logs": "Audit Logs",
};

export function Header() {
  const pathname = usePathname();
  const { isAuthenticated, user, org, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ message: string; time: string; type: string }>>([]);

  useEffect(() => {
    const stored = localStorage.getItem("wrankey_dark_mode") === "true";
    setDarkMode(stored);
    if (stored) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem("wrankey_dark_mode", String(next));
    if (next) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  };

  // Simulate some notifications
  useEffect(() => {
    setNotifications([
      { message: "Transaction confirmed: #0xabc123...", time: "2m ago", type: "tx" },
      { message: "New wallet created: Trading Wallet", time: "15m ago", type: "wallet" },
      { message: "Policy updated: Allow Small Transactions", time: "1h ago", type: "policy" },
    ]);
  }, []);

  if (!isAuthenticated) return null;

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => {
    const label = breadcrumbMap[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { label, href: "/" + segments.slice(0, i + 1).join("/"), last: i === segments.length - 1 };
  });

  if (breadcrumbs.length === 0 || breadcrumbs[0].label !== "Dashboard") {
    breadcrumbs.unshift({ label: "Dashboard", href: "/", last: breadcrumbs.length === 0 });
  }

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 sm:px-6 shrink-0">
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
            {crumb.last ? (
              <span className="font-medium text-gray-900 dark:text-gray-100">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleDarkMode}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          title={darkMode ? "Light mode" : "Dark mode"}
        >
          {darkMode ? <Sun className="h-4 w-4 text-gray-500 dark:text-gray-400" /> : <Moon className="h-4 w-4 text-gray-500" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors relative">
              <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">No new notifications</div>
            ) : (
              notifications.map((n, i) => (
                <DropdownMenuItem key={i} className="flex flex-col items-start py-2">
                  <span className="text-sm">{n.message}</span>
                  <span className="text-xs text-gray-400">{n.time}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <div className="h-7 w-7 rounded-full bg-gray-900 dark:bg-white dark:text-gray-900 text-white flex items-center justify-center text-xs font-medium ring-2 ring-gray-200 dark:ring-gray-600">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.email || "User"}</p>
                <p className="text-xs text-muted-foreground">{org?.name}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <UserIcon className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400">
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}