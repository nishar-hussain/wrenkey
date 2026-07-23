import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { WranKeyClient, createClient } from "../client.js";

interface WranKeyContextValue {
  client: WranKeyClient | null;
  isAuthenticated: boolean;
  sessionToken: string | null;
  user: { id: string; email?: string; role: string } | null;
  login: (token: string, userData: { id: string; email?: string; role: string }) => void;
  logout: () => void;
}

const WranKeyContext = createContext<WranKeyContextValue>({
  client: null,
  isAuthenticated: false,
  sessionToken: null,
  user: null,
  login: () => {},
  logout: () => {},
});

export function useWranKey() {
  return useContext(WranKeyContext);
}

export function WranKeyProvider({
  children,
  apiBase,
  apiKey,
  configId,
}: {
  children: ReactNode;
  apiBase: string;
  apiKey?: string;
  configId?: string;
}) {
  const [client] = useState(() => createClient({ apiBase, apiKey, configId }));
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email?: string; role: string } | null>(null);

  const login = useCallback((token: string, userData: { id: string; email?: string; role: string }) => {
    setSessionToken(token);
    setUser(userData);
    client.setSessionToken(token);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("wrankey_session", token);
    }
  }, [client]);

  const logout = useCallback(() => {
    setSessionToken(null);
    setUser(null);
    client.clearSession();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("wrankey_session");
    }
  }, [client]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const stored = localStorage.getItem("wrankey_session");
    if (stored && !sessionToken) {
      setSessionToken(stored);
      client.setSessionToken(stored);
    }
  }, [client, sessionToken]);

  return React.createElement(
    WranKeyContext.Provider,
    { value: { client, isAuthenticated: !!sessionToken, sessionToken, user, login, logout } },
    children
  );
}
