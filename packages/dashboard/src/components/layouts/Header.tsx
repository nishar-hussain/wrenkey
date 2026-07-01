"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/Providers";
import { Bell, ChevronRight, LogOut, User as UserIcon, Users, Sun, Moon, ArrowLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";

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

const actionLabels: Record<string, string> = {
  WALLET_CREATE: "New wallet created",
  WALLET_IMPORT: "Wallet imported",
  WALLET_DELETE: "Wallet deleted",
  WALLET_EXPORT: "Wallet exported",
  WALLET_FREEZE: "Wallet frozen",
  WALLET_UNFREEZE: "Wallet unfrozen",
  WALLET_ROTATE: "Wallet rotated",
  TX_SIGN: "Transaction signed",
  TX_BROADCAST: "Transaction broadcasted",
  TX_CONFIRMED: "Transaction confirmed",
  TX_FAILED: "Transaction failed",
  POLICY_CREATE: "Policy created",
  POLICY_DELETE: "Policy deleted",
  POLICY_DENY: "Transaction blocked by policy",
  AGENT_CREATE: "Agent created",
  AGENT_DELETE: "Agent revoked",
  USER_CREATE: "Team member invited",
  USER_DELETE: "Team member removed",
  ORG_CREATE: "Organization created",
  SPENDING_LIMIT_CREATE: "Spending limit set",
  APPROVAL_REQUEST: "Approval requested",
  APPROVAL_GRANT: "Approval granted",
  APPROVAL_REJECT: "Approval rejected",
  CONFIG_UPDATE: "Configuration updated",
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, user, org, logout, login, token } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ message: string; time: string; type: string }>>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res: any = await apiFetch("/activities?limit=10&offset=0", { token });
      if (res.data && Array.isArray(res.data)) {
        const items = res.data.slice(0, 10).map((item: any) => ({
          message: actionLabels[item.action] || item.type || item.action,
          time: timeAgo(item.createdAt),
          type: item.action?.toLowerCase() || "",
        }));
        setNotifications(items);
      }
      if (typeof res.pendingCount === "number") {
        setNotificationCount(res.pendingCount);
      }
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

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

  if (!isAuthenticated) return null;

  const returnToParent = () => {
    const parentToken = localStorage.getItem("wrankey_parent_token");
    const parentUser = localStorage.getItem("wrankey_parent_user");
    const parentOrg = localStorage.getItem("wrankey_parent_org");
    localStorage.removeItem("wrankey_parent_token");
    localStorage.removeItem("wrankey_parent_user");
    localStorage.removeItem("wrankey_parent_org");
    localStorage.removeItem("wrankey_parent_org_name");
    if (parentToken && parentUser && parentOrg) {
      const userData = JSON.parse(parentUser);
      const orgData = JSON.parse(parentOrg);
      login(parentToken, { id: userData.id, email: userData.email, role: userData.role }, { id: orgData.id, name: orgData.name });
      router.push("/sub-orgs");
    }
  };

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs = segments.map((seg, i) => {
    const label = breadcrumbMap[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { label, href: "/" + segments.slice(0, i + 1).join("/"), last: i === segments.length - 1 };
  });

  if (breadcrumbs.length === 0 || breadcrumbs[0].label !== "Dashboard") {
    breadcrumbs.unshift({ label: "Dashboard", href: "/", last: breadcrumbs.length === 0 });
  }

  return (
    <>
      {isImpersonating && (
        <div className="h-10 bg-amber-50 border-b border-amber-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <span className="text-amber-500">⚠</span>
            Viewing as <strong>{org?.name || "Sub-Org"}</strong>
          </div>
          <button onClick={returnToParent} className="text-xs font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded-md transition-colors">
            <ArrowLeft className="w-3 h-3" /> Return to Parent Org
          </button>
        </div>
      )}
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
              {notificationCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white font-medium flex items-center justify-center px-1">
                  {notificationCount}
                </span>
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
              <div className="h-7 w-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-medium ring-2 ring-gray-200 dark:ring-gray-600">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-medium shrink-0">
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user?.email || "User"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace("_", " ").toLowerCase() || "Member"}</p>
                  </div>
                </div>
                <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Organization</p>
                  <p className="text-sm font-medium">{org?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{org?.id ? `ID: ${org.id.slice(0, 8)}...` : "—"}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <UserIcon className="h-4 w-4 mr-2" />
                My Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/team" className="cursor-pointer">
                <Users className="h-4 w-4 mr-2" />
                Team
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400 cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </>
  );
}