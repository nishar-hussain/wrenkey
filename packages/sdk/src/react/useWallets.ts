import { useCallback, useState, useEffect } from "react";
import { useWranKey } from "./WranKeyProvider.js";
import type { Wallet, WalletAccount, PaginatedResponse } from "../types.js";

export function useWallets() {
  const { client, isAuthenticated } = useWranKey();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchWallets = useCallback(async (limit = 50, offset = 0) => {
    if (!client || !isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res: PaginatedResponse<Wallet> = await client.listWallets(limit, offset);
      setWallets(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const createWallet = useCallback(async (name: string, options?: { ownerType?: string; ownerId?: string; tags?: string[] }) => {
    if (!client) throw new Error("Client not initialized");
    const wallet = await client.createWallet(name, options);
    await fetchWallets();
    return wallet;
  }, [client, fetchWallets]);

  const importWallet = useCallback(async (name: string, mnemonic: string, options?: { ownerType?: string; ownerId?: string }) => {
    if (!client) throw new Error("Client not initialized");
    const wallet = await client.importWallet(name, mnemonic, options);
    await fetchWallets();
    return wallet;
  }, [client, fetchWallets]);

  const getWallet = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.getWallet(id);
  }, [client]);

  const deleteWallet = useCallback(async (id: string) => {
    if (!client) throw new Error("Client not initialized");
    await client.deleteWallet(id);
    await fetchWallets();
  }, [client, fetchWallets]);

  const deriveAccount = useCallback(async (walletId: string, chain?: string): Promise<WalletAccount> => {
    if (!client) throw new Error("Client not initialized");
    const account = await client.deriveAccount(walletId, chain);
    await fetchWallets();
    return account;
  }, [client, fetchWallets]);

  const listAccounts = useCallback(async (walletId: string) => {
    if (!client) throw new Error("Client not initialized");
    return client.listAccounts(walletId);
  }, [client]);

  return {
    wallets, loading, error, total,
    fetchWallets, createWallet, importWallet, getWallet, deleteWallet, deriveAccount, listAccounts,
  };
}
