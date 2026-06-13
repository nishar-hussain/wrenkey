import type {
  WranKeyConfig,
  Organization,
  User,
  Wallet,
  WalletAccount,
  Transaction,
  Policy,
  Agent,
  Webhook,
  AuditLog,
  SessionInfo,
  ApiKeyInfo,
  PaginatedResponse,
  AuthResponse,
} from "./types.js";

export class WranKeyClient {
  private apiBase: string;
  private sessionToken: string | null = null;
  private apiKey: string | null = null;

  constructor(config: WranKeyConfig) {
    this.apiBase = config.apiBase.replace(/\/$/, "");
    this.sessionToken = config.sessionToken || null;
    this.apiKey = config.apiKey || null;
  }

  setSessionToken(token: string) {
    this.sessionToken = token;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  clearSession() {
    this.sessionToken = null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.sessionToken) {
      headers["Authorization"] = `Bearer ${this.sessionToken}`;
    }
    if (this.apiKey) {
      headers["X-Api-Key"] = this.apiKey;
    }

    const res = await fetch(`${this.apiBase}/api/v1${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // ─── Auth ──────────────────────────────────────────

  async sendEmailOtp(email: string): Promise<{ message: string; expiresIn: number }> {
    return this.request("POST", "/auth/email/send", { email });
  }

  async verifyEmailOtp(email: string, otp: string, orgName?: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/email/verify", { email, otp, orgName });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async sendPhoneOtp(phone: string): Promise<{ message: string; expiresIn: number }> {
    return this.request("POST", "/auth/phone/send", { phone });
  }

  async verifyPhoneOtp(phone: string, otp: string, orgName?: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/phone/verify", { phone, otp, orgName });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async oauthLogin(provider: string, code: string, redirectUri: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/oauth", { provider, code, redirectUri });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async walletLogin(address: string, signature: string, message?: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/wallet", { address, signature, message });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async passwordSignup(email: string, password: string, name?: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/password/signup", { email, password, name });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async passwordLogin(email: string, password: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/password/login", { email, password });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async logout(): Promise<void> {
    await this.request("POST", "/auth/logout");
    this.sessionToken = null;
  }

  async refreshSession(): Promise<{ sessionToken: string; expiresIn: number }> {
    const res = await this.request<{ sessionToken: string; expiresIn: number }>("POST", "/sessions/refresh");
    this.sessionToken = res.sessionToken;
    return res;
  }

  async getSessions(): Promise<SessionInfo[]> {
    return this.request("GET", "/sessions");
  }

  async revokeSession(id: string): Promise<void> {
    await this.request("DELETE", `/sessions/${id}`);
  }

  // ─── API Keys ─────────────────────────────────────

  async createApiKey(name: string, permissions?: string[], allowedIps?: string[]): Promise<ApiKeyInfo & { apiKey: string }> {
    return this.request("POST", "/api-keys", { name, permissions, allowedIps });
  }

  async listApiKeys(limit = 50, offset = 0): Promise<PaginatedResponse<ApiKeyInfo>> {
    return this.request("GET", `/api-keys?limit=${limit}&offset=${offset}`);
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.request("DELETE", `/api-keys/${id}`);
  }

  // ─── Orgs ─────────────────────────────────────────

  async createOrg(name: string): Promise<Organization> {
    return this.request("POST", "/orgs", { name });
  }

  async getOrg(orgId: string): Promise<Organization> {
    return this.request("GET", `/orgs/${orgId}`);
  }

  async listOrgs(): Promise<Organization[]> {
    return this.request("GET", "/orgs");
  }

  // ─── Users ────────────────────────────────────────

  async createUser(data: { name?: string; email?: string; phone?: string; role?: string; tags?: string[] }): Promise<User> {
    return this.request("POST", "/users", data);
  }

  async listUsers(limit = 50, offset = 0): Promise<PaginatedResponse<User>> {
    return this.request("GET", `/users?limit=${limit}&offset=${offset}`);
  }

  async getUser(id: string): Promise<User> {
    return this.request("GET", `/users/${id}`);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.request("PATCH", `/users/${id}`, data);
  }

  async deleteUser(id: string): Promise<void> {
    await this.request("DELETE", `/users/${id}`);
  }

  // ─── Wallets ──────────────────────────────────────

  async createWallet(name: string, options?: { ownerType?: string; ownerId?: string; tags?: string[] }): Promise<{
    walletId: string; name: string; ownerType: string; ownerId: string;
    addresses: Array<{ chain: string; address: string; derivationPath: string; index: number }>;
  }> {
    return this.request("POST", "/wallets", { name, ...options });
  }

  async importWallet(name: string, mnemonic: string, options?: { ownerType?: string; ownerId?: string }): Promise<{
    walletId: string; name: string;
    addresses: Array<{ chain: string; address: string; derivationPath: string; index: number }>;
  }> {
    return this.request("POST", "/wallets/import", { name, mnemonic, ...options });
  }

  async listWallets(limit = 50, offset = 0): Promise<PaginatedResponse<Wallet>> {
    return this.request("GET", `/wallets?limit=${limit}&offset=${offset}`);
  }

  async getWallet(id: string): Promise<Wallet> {
    return this.request("GET", `/wallets/${id}`);
  }

  async deleteWallet(id: string): Promise<void> {
    await this.request("DELETE", `/wallets/${id}`);
  }

  async deriveAccount(walletId: string, chain?: string): Promise<WalletAccount> {
    return this.request("POST", `/wallets/${walletId}/accounts`, { chain });
  }

  async listAccounts(walletId: string): Promise<WalletAccount[]> {
    return this.request("GET", `/wallets/${walletId}/accounts`);
  }

  async exportWallet(walletId: string): Promise<{
    walletId: string;
    mnemonic: string;
    accounts: Array<{ chain: string; address: string; derivationPath: string; index: number }>;
  }> {
    return this.request("POST", `/wallets/${walletId}/export`);
  }

  async getWalletBalance(walletId: string): Promise<{
    walletId: string;
    address: string;
    balance: string;
    balanceWei: string;
    chain: string;
  }> {
    return this.request("GET", `/wallets/${walletId}/balance`);
  }

  // ─── Transactions ─────────────────────────────────

  async signAndSend(tx: {
    walletId: string; to: string; value: string;
    chain?: string; gasLimit?: string; maxFeePerGas?: string; data?: string;
  }): Promise<{ transactionId: string; txHash: string; status: string }> {
    return this.request("POST", "/transactions/sign", tx);
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.request("GET", `/transactions/${id}`);
  }

  async listTransactions(limit = 50, offset = 0): Promise<PaginatedResponse<Transaction>> {
    return this.request("GET", `/transactions?limit=${limit}&offset=${offset}`);
  }

  async getNonce(address: string): Promise<{ address: string; nonce: number }> {
    return this.request("GET", `/accounts/${address}/nonce`);
  }

  // ─── Policies ─────────────────────────────────────

  async createPolicy(data: { name: string; effect: string; conditions?: unknown[]; consensus?: string; priority?: number }): Promise<Policy> {
    return this.request("POST", "/policies", data);
  }

  async listPolicies(limit = 50, offset = 0): Promise<PaginatedResponse<Policy>> {
    return this.request("GET", `/policies?limit=${limit}&offset=${offset}`);
  }

  async getPolicy(id: string): Promise<Policy> {
    return this.request("GET", `/policies/${id}`);
  }

  async updatePolicy(id: string, data: Partial<Policy>): Promise<Policy> {
    return this.request("PATCH", `/policies/${id}`, data);
  }

  async deletePolicy(id: string): Promise<void> {
    await this.request("DELETE", `/policies/${id}`);
  }

  // ─── Agents ───────────────────────────────────────

  async createAgent(name: string, options?: { email?: string; permissions?: string[]; tags?: string[] }): Promise<{
    agent: Agent;
    credentials: { userId: string; apiKeyId: string; apiKey: string; keyPrefix: string };
  }> {
    return this.request("POST", "/agents", { name, ...options });
  }

  async listAgents(limit = 50, offset = 0): Promise<PaginatedResponse<Agent>> {
    return this.request("GET", `/agents?limit=${limit}&offset=${offset}`);
  }

  async getAgent(id: string): Promise<Agent> {
    return this.request("GET", `/agents/${id}`);
  }

  async deleteAgent(id: string): Promise<void> {
    await this.request("DELETE", `/agents/${id}`);
  }

  // ─── Webhooks ─────────────────────────────────────

  async createWebhook(url: string, events: string[]): Promise<Webhook> {
    return this.request("POST", "/webhooks", { url, events });
  }

  async listWebhooks(limit = 50, offset = 0): Promise<PaginatedResponse<Webhook>> {
    return this.request("GET", `/webhooks?limit=${limit}&offset=${offset}`);
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.request("DELETE", `/webhooks/${id}`);
  }

  async updateWebhook(id: string, data: { active?: boolean; url?: string; events?: string[] }): Promise<Webhook> {
    return this.request("PATCH", `/webhooks/${id}`, data);
  }

  // ─── Audit Logs ───────────────────────────────────

  async listAuditLogs(limit = 50, offset = 0): Promise<PaginatedResponse<AuditLog>> {
    return this.request("GET", `/audit-logs?limit=${limit}&offset=${offset}`);
  }
}

export function createClient(config: WranKeyConfig): WranKeyClient {
  return new WranKeyClient(config);
}
