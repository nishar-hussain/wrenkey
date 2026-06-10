import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { WranKeyClient } from "../client.js";
import type { WranKeyConfig, SessionState } from "../types.js";

interface WranKeyContextValue {
  client: WranKeyClient;
  session: SessionState;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithEmail: (email: string, otp: string, orgName?: string) => Promise<void>;
  loginWithOAuth: (provider: string, code: string, redirectUri: string) => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const WranKeyContext = createContext<WranKeyContextValue | null>(null);

export function WranKeyProvider({
  config,
  children,
}: {
  config: WranKeyConfig;
  children: ReactNode;
}) {
  const [client] = useState(() => new WranKeyClient(config));
  const [session, setSession] = useState<SessionState>(client.getSession());
  const [isLoading, setIsLoading] = useState(false);

  const refreshState = useCallback(() => {
    setSession({ ...client.getSession() });
  }, [client]);

  const sendEmailOtp = useCallback(
    async (email: string) => {
      setIsLoading(true);
      try {
        await client.sendEmailOtp(email);
      } finally {
        setIsLoading(false);
      }
    },
    [client]
  );

  const loginWithEmail = useCallback(
    async (email: string, otp: string, orgName?: string) => {
      setIsLoading(true);
      try {
        await client.verifyEmailOtp(email, otp, orgName);
        refreshState();
      } finally {
        setIsLoading(false);
      }
    },
    [client, refreshState]
  );

  const loginWithOAuth = useCallback(
    async (provider: string, code: string, redirectUri: string) => {
      setIsLoading(true);
      try {
        await client.loginWithOAuth(provider, code, redirectUri);
        refreshState();
      } finally {
        setIsLoading(false);
      }
    },
    [client, refreshState]
  );

  const logout = useCallback(() => {
    client.logout();
    refreshState();
  }, [client, refreshState]);

  const refreshSession = useCallback(async () => {
    if (client.isAuthenticated()) {
      await client.refreshSession();
      refreshState();
    }
  }, [client, refreshState]);

  useEffect(() => {
    const interval = setInterval(refreshSession, 30 * 60 * 1000); // Refresh every 30min
    return () => clearInterval(interval);
  }, [refreshSession]);

  return (
    <WranKeyContext.Provider
      value={{
        client,
        session,
        isAuthenticated: client.isAuthenticated(),
        isLoading,
        loginWithEmail,
        loginWithOAuth,
        sendEmailOtp,
        logout,
        refreshSession,
      }}
    >
      {children}
    </WranKeyContext.Provider>
  );
}

export function useWranKey(): WranKeyContextValue {
  const context = useContext(WranKeyContext);
  if (!context) {
    throw new Error("useWranKey must be used within WranKeyProvider");
  }
  return context;
}

export function useWallet() {
  const { client } = useWranKey();

  const createWallet = useCallback(
    (params: { name: string; ownerType?: string; ownerId?: string; tags?: string[] }) =>
      client.createWallet(params),
    [client]
  );

  const getWallets = useCallback(() => client.getWallets(), [client]);
  const getWallet = useCallback((walletId: string) => client.getWallet(walletId), [client]);
  const deleteWallet = useCallback((walletId: string) => client.deleteWallet(walletId), [client]);
  const getAccounts = useCallback(
    (walletId: string) => client.getAccounts(walletId),
    [client]
  );
  const deriveAccount = useCallback(
    (walletId: string, chain?: string) => client.deriveAccount(walletId, chain),
    [client]
  );

  return { createWallet, getWallets, getWallet, deleteWallet, getAccounts, deriveAccount };
}

export function useTransaction() {
  const { client } = useWranKey();

  const signAndSend = useCallback(
    (params: {
      walletId: string;
      chain?: string;
      to: string;
      value: string;
      gasLimit?: string;
      maxFeePerGas?: string;
      data?: string;
    }) => client.signAndSend(params),
    [client]
  );

  const getTransaction = useCallback(
    (txId: string) => client.getTransaction(txId),
    [client]
  );

  return { signAndSend, getTransaction };
}

export function useAgent() {
  const { client } = useWranKey();

  const createAgent = useCallback(
    (params: { name: string; email?: string; permissions?: string[]; tags?: string[] }) =>
      client.createAgent(params),
    [client]
  );

  const getAgents = useCallback(() => client.getAgents(), [client]);
  const getAgent = useCallback((agentId: string) => client.getAgent(agentId), [client]);
  const deleteAgent = useCallback((agentId: string) => client.deleteAgent(agentId), [client]);

  return { createAgent, getAgents, getAgent, deleteAgent };
}

export function usePolicy() {
  const { client } = useWranKey();

  const createPolicy = useCallback(
    (params: {
      name: string;
      effect: "EFFECT_ALLOW" | "EFFECT_DENY";
      conditions?: Array<{
        type: string;
        field: string;
        value?: string | number;
        values?: Array<string | number>;
      }>;
      consensus?: "ANY" | "ALL" | "REQUIRES_CONSENSUS";
      priority?: number;
    }) => client.createPolicy(params),
    [client]
  );

  const getPolicies = useCallback(() => client.getPolicies(), [client]);
  const deletePolicy = useCallback((policyId: string) => client.deletePolicy(policyId), [client]);

  return { createPolicy, getPolicies, deletePolicy };
}
