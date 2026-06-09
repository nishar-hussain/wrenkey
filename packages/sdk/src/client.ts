import type {
  ArKeyConfig,
  SessionState,
  SignTransactionParams,
  CreateWalletParams,
  CreateAgentParams,
  CreatePolicyParams,
  CreateWebhookParams,
} from "./types.js";

export class ArKeyClient {
  private config: ArKeyConfig;
  private session: SessionState;

  constructor(config: ArKeyConfig) {
    this.config = { apiBase: config.apiBase.replace(/\/$/, ""), orgId: config.orgId };
    this.session = { sessionToken: null, user: null, org: null, expiresAt: null };
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.session.sessionToken) {
      headers["Authorization"] = `Bearer ${this.session.sessionToken}`;
    }
    return headers;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.apiBase}/api/v1${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.getHeaders(), ...options.headers },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Request failed: ${res.status}`);
    }
    return data as T;
  }

  // Auth
  async sendEmailOtp(email: string): Promise<{ message: string; expiresIn: number; otp?: string }> {
    return this.request("/auth/email/send", {
      method: "POST",
      body: JSON.stringify({ email, orgId: this.config.orgId }),
    });
  }

  async verifyEmailOtp(email: string, otp: string, orgName?: string): Promise<{ sessionToken: string; user: { id: string; email?: string; role: string }; org: { id: string; name: string }; expiresAt: string }> {
    const result = await this.request<{ sessionToken: string; user: { id: string; email?: string; role: string }; org: { id: string; name: string }; expiresAt: string }>("/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp, orgId: this.config.orgId, orgName }),
    });
    this.session = { sessionToken: result.sessionToken, user: result.user, org: result.org, expiresAt: new Date(result.expiresAt) };
    return result;
  }

  async loginWithOAuth(provider: string, code: string, redirectUri: string): Promise<{ sessionToken: string; user: { id: string; email?: string; role: string }; org: { id: string; name: string }; expiresAt: string }> {
    const result = await this.request<{ sessionToken: string; user: { id: string; email?: string; role: string }; org: { id: string; name: string }; expiresAt: string }>("/auth/oauth", {
      method: "POST",
      body: JSON.stringify({ provider, code, redirectUri }),
    });
    this.session = { sessionToken: result.sessionToken, user: result.user, org: result.org, expiresAt: new Date(result.expiresAt) };
    return result;
  }

  async loginWithWallet(address: string, signature: string, message: string): Promise<{ sessionToken: string }> {
    const result = await this.request<{ sessionToken: string }>("/auth/wallet", {
      method: "POST",
      body: JSON.stringify({ address, signature, message }),
    });
    return result;
  }

  async refreshSession(): Promise<{ sessionToken: string; expiresAt: string }> {
    const result = await this.request<{ sessionToken: string; expiresAt: string }>("/sessions/refresh", { method: "POST" });
    this.session.sessionToken = result.sessionToken;
    this.session.expiresAt = new Date(result.expiresAt);
    return result;
  }

  async logout(): Promise<void> {
    this.session = { sessionToken: null, user: null, org: null, expiresAt: null };
  }

  isAuthenticated(): boolean {
    return !!this.session.sessionToken && !!this.session.expiresAt && this.session.expiresAt > new Date();
  }

  getSession(): SessionState {
    return { ...this.session };
  }

  // Wallets
  async createWallet(params: CreateWalletParams): Promise<{ walletId: string; name: string; ownerType: string; ownerId: string; addresses: Array<{ chain: string; address: string; derivationPath: string; index: number }> }> {
    return this.request("/wallets", { method: "POST", body: JSON.stringify(params) });
  }

  async importWallet(params: { name: string; mnemonic: string; ownerType?: string; ownerId?: string }): Promise<{ walletId: string; name: string; addresses: Array<{ chain: string; address: string; derivationPath: string; index: number }> }> {
    return this.request("/wallets/import", { method: "POST", body: JSON.stringify(params) });
  }

  async getWallets(): Promise<{ wallets: Array<unknown> }> {
    return this.request("/wallets");
  }

  async getWallet(walletId: string): Promise<unknown> {
    return this.request(`/wallets/${walletId}`);
  }

  async deleteWallet(walletId: string): Promise<{ message: string }> {
    return this.request(`/wallets/${walletId}`, { method: "DELETE" });
  }

  async exportWallet(walletId: string): Promise<{ mnemonic: string }> {
    return this.request(`/wallets/${walletId}/export`, { method: "POST" });
  }

  async deriveAccount(walletId: string, chain?: string): Promise<{ id: string; chain: string; address: string; derivationPath: string; index: number }> {
    return this.request(`/wallets/${walletId}/accounts`, { method: "POST", body: JSON.stringify({ chain }) });
  }

  async getAccounts(walletId: string): Promise<{ accounts: Array<{ id: string; chain: string; address: string; derivationPath: string; index: number }> }> {
    return this.request(`/wallets/${walletId}/accounts`);
  }

  // Transactions
  async signAndSend(params: SignTransactionParams): Promise<{ id: string; txHash: string; status: string; chain: string; to: string; value: string }> {
    return this.request("/transactions/sign", { method: "POST", body: JSON.stringify(params) });
  }

  async getTransaction(txId: string): Promise<unknown> {
    return this.request(`/transactions/${txId}`);
  }

  async getAccountTransactions(accountId: string): Promise<{ transactions: Array<unknown> }> {
    return this.request(`/accounts/${accountId}/transactions`);
  }

  // Policies
  async createPolicy(params: CreatePolicyParams): Promise<unknown> {
    return this.request("/policies", { method: "POST", body: JSON.stringify(params) });
  }

  async getPolicies(): Promise<{ policies: Array<unknown> }> {
    return this.request("/policies");
  }

  async deletePolicy(policyId: string): Promise<{ message: string }> {
    return this.request(`/policies/${policyId}`, { method: "DELETE" });
  }

  // Agents
  async createAgent(params: CreateAgentParams): Promise<{ agent: { id: string; name: string; status: string; userId: string }; credentials: { userId: string; apiKeyId: string; apiKey: string; keyPrefix: string } }> {
    return this.request("/agents", { method: "POST", body: JSON.stringify(params) });
  }

  async getAgents(): Promise<{ agents: Array<unknown> }> {
    return this.request("/agents");
  }

  async getAgent(agentId: string): Promise<unknown> {
    return this.request(`/agents/${agentId}`);
  }

  async deleteAgent(agentId: string): Promise<{ message: string }> {
    return this.request(`/agents/${agentId}`, { method: "DELETE" });
  }

  // Users & Org
  async createUser(params: { name?: string; email?: string; phone?: string; role?: string; tags?: string[] }): Promise<unknown> {
    return this.request("/users", { method: "POST", body: JSON.stringify(params) });
  }

  async getUsers(): Promise<{ users: Array<unknown> }> {
    return this.request("/users");
  }

  async updateUser(userId: string, params: { name?: string; email?: string; phone?: string; tags?: string[] }): Promise<unknown> {
    return this.request(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(params) });
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    return this.request(`/users/${userId}`, { method: "DELETE" });
  }

  // API Keys
  async createApiKey(name: string, permissions?: string[], allowedIps?: string[]): Promise<{ id: string; name: string; key: string; keyPrefix: string; permissions: string[]; expiresAt: string }> {
    return this.request("/api-keys", { method: "POST", body: JSON.stringify({ name, permissions, allowedIps }) });
  }

  async getApiKeys(): Promise<{ keys: Array<unknown> }> {
    return this.request("/api-keys");
  }

  async deleteApiKey(keyId: string): Promise<{ message: string }> {
    return this.request(`/api-keys/${keyId}`, { method: "DELETE" });
  }

  // Webhooks
  async createWebhook(params: CreateWebhookParams): Promise<{ id: string; url: string; events: string[]; hmacSecret: string }> {
    return this.request("/webhooks", { method: "POST", body: JSON.stringify(params) });
  }

  async getWebhooks(): Promise<{ webhooks: Array<unknown> }> {
    return this.request("/webhooks");
  }

  async deleteWebhook(webhookId: string): Promise<{ message: string }> {
    return this.request(`/webhooks/${webhookId}`, { method: "DELETE" });
  }

  // Audit Logs
  async getAuditLogs(limit?: number, offset?: number): Promise<{ logs: Array<unknown> }> {
    return this.request(`/audit-logs?limit=${limit || 100}&offset=${offset || 0}`);
  }
}

export default ArKeyClient;
