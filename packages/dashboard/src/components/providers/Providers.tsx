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

export function Providers({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email?: string; role: string } | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wrankey_token");
    const storedUser = localStorage.getItem("wrankey_user");
    const storedOrg = localStorage.getItem("wrankey_org");

    if (!stored) {
      // No token at all — mark ready and let AuthGuard redirect to login
      setReady(true);
      return;
    }

    // Validate the token against the backend before trusting it
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
        // Token is valid — hydrate state from backend response (always fresh)
        setToken(stored);
        setUser(data.user);
        setOrg(data.org);
        // Keep localStorage in sync with fresh backend data
        localStorage.setItem("wrankey_user", JSON.stringify(data.user));
        localStorage.setItem("wrankey_org", JSON.stringify(data.org));
        // Keep remembered user in sync too
        if (data.user?.email && data.org?.name) {
          localStorage.setItem(
            "wrankey_remembered_user",
            JSON.stringify({ email: data.user.email, orgName: data.org.name })
          );
        }
      })
      .catch(() => {
        // Token is expired/revoked — wipe everything so login page shows cleanly
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
