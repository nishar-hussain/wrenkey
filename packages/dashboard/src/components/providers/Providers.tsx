"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { ToastProvider } from "@/components/ui/Toast";

interface AuthState {
  token: string | null;
  user: { id: string; email?: string; role: string } | null;
  org: { id: string; name: string } | null;
}

interface AuthContextType extends AuthState {
  login: (token: string, user: { id: string; email?: string; role: string }, org: { id: string; name: string }) => void;
  logout: () => void;
  updateOrg: (org: { id: string; name: string }) => void;
  isAuthenticated: boolean;
  ready: boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  org: null,
  login: () => {},
  logout: () => {},
  updateOrg: () => {},
  isAuthenticated: false,
  ready: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

const ACCOUNTS_KEY = "wrankey_accounts";
const LEGACY_REMEMBERED_KEY = "wrankey_remembered_user";

interface StoredAccount {
  email: string;
  orgName: string;
  lastUsed: number;
}

function saveAccountToStorage(email: string, orgName: string) {
  if (!email || !orgName) return;
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const accounts: StoredAccount[] = raw ? JSON.parse(raw) : [];
    const existing = accounts.find(a => a.email === email);
    if (existing) {
      existing.orgName = orgName;
      existing.lastUsed = Date.now();
    } else {
      accounts.push({ email, orgName, lastUsed: Date.now() });
    }
    accounts.sort((a, b) => b.lastUsed - a.lastUsed);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 20)));
  } catch { /* silently fail */ }
}

function migrateLegacyRememberedUser() {
  try {
    const legacy = localStorage.getItem(LEGACY_REMEMBERED_KEY);
    if (!legacy) return;
    const parsed = JSON.parse(legacy);
    if (parsed?.email) {
      saveAccountToStorage(parsed.email, parsed.orgName || "");
    }
    localStorage.removeItem(LEGACY_REMEMBERED_KEY);
  } catch { /* silently fail */ }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email?: string; role: string } | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    migrateLegacyRememberedUser();

    const stored = localStorage.getItem("wrankey_token");
    const storedUser = localStorage.getItem("wrankey_user");
    const storedOrg = localStorage.getItem("wrankey_org");

    if (!stored) {
      setReady(true);
      return;
    }

    const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";
    fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: {
        "Authorization": `Bearer ${stored}`,
        "Content-Type": "application/json",
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Session invalid");
        return res.json();
      })
      .then((data) => {
        setToken(stored);
        setUser(data.user);
        setOrg(data.org);
        localStorage.setItem("wrankey_user", JSON.stringify(data.user));
        localStorage.setItem("wrankey_org", JSON.stringify(data.org));
        if (data.user?.email && data.org?.name) {
          saveAccountToStorage(data.user.email, data.org.name);
        }
      })
      .catch(() => {
        localStorage.removeItem("wrankey_token");
        localStorage.removeItem("wrankey_user");
        localStorage.removeItem("wrankey_org");
      })
      .finally(() => {
        setReady(true);
      });
  }, []);

  const login = (
    newToken: string,
    newUser: { id: string; email?: string; role: string },
    newOrg: { id: string; name: string }
  ) => {
    setToken(newToken);
    setUser(newUser);
    setOrg(newOrg);
    localStorage.setItem("wrankey_token", newToken);
    localStorage.setItem("wrankey_user", JSON.stringify(newUser));
    localStorage.setItem("wrankey_org", JSON.stringify(newOrg));
    if (newUser?.email && newOrg?.name) {
      saveAccountToStorage(newUser.email, newOrg.name);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setOrg(null);
    localStorage.removeItem("wrankey_token");
    localStorage.removeItem("wrankey_user");
    localStorage.removeItem("wrankey_org");
  };

  const updateOrg = (newOrg: { id: string; name: string }) => {
    setOrg(newOrg);
    localStorage.setItem("wrankey_org", JSON.stringify(newOrg));
  };

  return (
    <AuthContext.Provider value={{ token, user, org, login, logout, updateOrg, isAuthenticated: !!token, ready }}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </AuthContext.Provider>
  );
}
