import { useCallback, useState } from "react";
import { useWranKey } from "./WranKeyProvider.js";

export function useAuth() {
  const { client, login: setAuth, logout: clearAuth, isAuthenticated } = useWranKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendEmailOtp = useCallback(async (email: string) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      return await client.sendEmailOtp(email);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const verifyEmailOtp = useCallback(async (email: string, otp: string, orgName?: string) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.verifyEmailOtp(email, otp, orgName);
      setAuth(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role });
      return res;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, setAuth]);

  const sendPhoneOtp = useCallback(async (phone: string) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      return await client.sendPhoneOtp(phone);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const verifyPhoneOtp = useCallback(async (phone: string, otp: string, orgName?: string) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.verifyPhoneOtp(phone, otp, orgName);
      setAuth(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role });
      return res;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, setAuth]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.passwordLogin(email, password);
      setAuth(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role });
      return res;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, setAuth]);

  const signupWithPassword = useCallback(async (email: string, password: string, name?: string) => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.passwordSignup(email, password, name);
      setAuth(res.sessionToken, { id: res.user.id, email: res.user.email, role: res.user.role });
      return res;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, setAuth]);

  const logout = useCallback(async () => {
    if (!client) return;
    try {
      await client.logout();
    } catch {}
    clearAuth();
  }, [client, clearAuth]);

  return {
    isAuthenticated,
    loading,
    error,
    sendEmailOtp,
    verifyEmailOtp,
    sendPhoneOtp,
    verifyPhoneOtp,
    loginWithPassword,
    signupWithPassword,
    logout,
  };
}
