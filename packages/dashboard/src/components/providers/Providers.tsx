"use client";

import { useState, useEffect } from "react";

interface AuthState {
  token: string | null;
  user: { id: string; email?: string; role: string } | null;
  org: { id: string; name: string } | null;
}

interface AuthContextType extends AuthState {
  login: (token: string, user: { id: string; email?: string; role: string }, org: { id: string; name: string }) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

import { createContext, useContext } from "react";

const AuthContext = createContext<AuthContextType>({
  token: null,
  user: null,
  org: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email?: string; role: string } | null>(null);
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("wrankey_token");
    const storedUser = localStorage.getItem("wrankey_user");
    const storedOrg = localStorage.getItem("wrankey_org");
    if (stored) setToken(stored);
    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedOrg) setOrg(JSON.parse(storedOrg));
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

  // If not authenticated, show login page style
  if (!token && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      // We'll use middleware/redirects in pages instead
    }
  }

  return (
    <AuthContext.Provider value={{ token, user, org, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}
