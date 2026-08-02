"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/Providers";
import { Bell, ChevronDown, LogOut, User as UserIcon, Users, Sun, Moon, ArrowLeft, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";

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

  useEffect(() => {
    setIsImpersonating(!!localStorage.getItem("wrankey_parent_token"));
  }, [pathname]);

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

  const userRoleLabel = user?.role === "ORG_ADMIN" ? "Root user" : user?.role?.replace("_", " ").toLowerCase() || "User";

  return (
    <>
      {isImpersonating && (
        <div className="h-10 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            <span>⚠</span>
            Viewing as <strong>{org?.name || "Sub-Org"}</strong>
          </div>
          <button onClick={returnToParent} className="text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/20 px-2.5 py-1 rounded-md transition-colors">
            <ArrowLeft className="w-3 h-3" /> Return to Parent Org
          </button>
        </div>
      )}
      
      <header className="h-14 flex items-center justify-end px-6 shrink-0 bg-transparent">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDarkMode}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-md transition-colors"
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 rounded-md transition-colors relative">
                <Bell className="h-4 w-4" />
                {notificationCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center px-0.5">
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
              <button className="flex items-center gap-2 py-1 px-2 text-xs font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors">
                <div className="w-5 h-5 rounded-full border border-gray-400 dark:border-gray-500 flex items-center justify-center shrink-0">
                  <UserIcon className="w-3 h-3 text-gray-600 dark:text-gray-300" />
                </div>
                <span className="capitalize">{userRoleLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-medium shrink-0">
                      {user?.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{user?.email || "User"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{userRoleLabel}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Organization</p>
                    <p className="text-sm font-medium text-foreground">{org?.name || "—"}</p>
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