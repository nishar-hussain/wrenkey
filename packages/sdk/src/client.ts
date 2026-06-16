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
  Chain,
  SpendingLimit,
  ApprovalRequest,
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

  async createWallet(name: string, options?: { ownerType?: string; ownerId?: string; tags?: string[]; chain?: string }): Promise<{
    walletId: string; name: string; ownerType: string; ownerId: string;
    addresses: Array<{ chainId: string; address: string; derivationPath: string; index: number }>;
  }> {
    return this.request("POST", "/wallets", { name, ...options });
  }

  async importWallet(name: string, mnemonic: string, options?: { ownerType?: string; ownerId?: string; chain?: string; tags?: string[] }): Promise<{
    walletId: string; name: string;
    addresses: Array<{ chainId: string; address: string; derivationPath: string; index: number }>;
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
    balances: Array<{ chainId: string; chain: string; address: string; balance: string; balanceWei: string; symbol: string }>;
  }> {
    return this.request("GET", `/wallets/${walletId}/balance`);
  }

  async getWalletTokens(walletId: string, chain?: string): Promise<{
    walletId: string;
    tokenBalances: Array<{ address: string; chain: string; chainId: number; tokens: Array<{ token: { address: string; name: string; symbol: string; decimals: number }; balance: string; balanceFormatted: string }> }>;
  }> {
    const qs = chain ? `?chain=${chain}` : "";
    return this.request("GET", `/wallets/${walletId}/tokens${qs}`);
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

  async estimateFee(tx: { to: string; value?: string; data?: string }): Promise<{
    gasLimit: string;
    baseFeePerGas: string;
    estimatedFee: string;
    estimatedFeeWei: string;
    chain: string;
    currency: string;
  }> {
    return this.request("POST", "/transactions/estimate-fee", tx);
  }

  async updateWallet(id: string, data: { name?: string; tags?: string[]; status?: string }): Promise<Wallet> {
    return this.request("PATCH", `/wallets/${id}`, data);
  }

  async freezeWallet(id: string): Promise<{ walletId: string; status: string }> {
    return this.request("POST", `/wallets/${id}/freeze`);
  }

  async unfreezeWallet(id: string): Promise<{ walletId: string; status: string }> {
    return this.request("POST", `/wallets/${id}/unfreeze`);
  }

  async rotateWallet(id: string): Promise<Wallet> {
    return this.request("POST", `/wallets/${id}/rotate`);
  }

  async exportWalletEncrypted(walletId: string, passphrase: string): Promise<{
    walletId: string;
    encryptedMnemonic: string;
    accounts: WalletAccount[];
  }> {
    return this.request("POST", `/wallets/${walletId}/export`, { passphrase });
  }

  async getWalletGasPrice(walletId: string, chain?: string): Promise<{
    chain: string; slow: string; standard: string; fast: string;
  }> {
    const qs = chain ? `?chain=${chain}` : "";
    return this.request("GET", `/wallets/${walletId}/gas-price${qs}`);
  }

  // ─── Transactions (extended) ───────────────────────

  async simulateTransaction(tx: {
    walletId: string; chain?: string; to: string; value?: string; gasLimit?: string; maxFeePerGas?: string; data?: string;
  }): Promise<{ success: boolean; gasUsed: string; returnData: string; error?: string }> {
    return this.request("POST", "/transactions/simulate", tx);
  }

  async retryTransaction(id: string): Promise<{ transactionId: string; txHash: string; status: string }> {
    return this.request("POST", `/transactions/${id}/retry`);
  }

  async cancelTransaction(id: string): Promise<{ transactionId: string; txHash: string; status: string }> {
    return this.request("POST", `/transactions/${id}/cancel`);
  }

  async speedUpTransaction(id: string, gasMultiplier?: number): Promise<{ transactionId: string; txHash: string; status: string }> {
    return this.request("POST", `/transactions/${id}/speed-up`, { gasMultiplier });
  }

  // ─── Chains ────────────────────────────────────────

  async listChains(limit = 50, offset = 0): Promise<PaginatedResponse<Chain>> {
    return this.request("GET", `/chains?limit=${limit}&offset=${offset}`);
  }

  async addChain(data: { name: string; chainId: number; rpcUrl: string; nativeCurrency?: string; symbol?: string; blockExplorerUrl?: string; derivationPath?: string }): Promise<Chain> {
    return this.request("POST", "/chains", data);
  }

  async seedChains(): Promise<{ message: string; chains: Chain[] }> {
    return this.request("POST", "/chains/seed");
  }

  // ─── Spending Limits ───────────────────────────────

  async createSpendingLimit(data: {
    walletId?: string; chainId?: string; name: string; maxPerTx?: string;
    maxDaily?: string; maxMonthly?: string; allowlist?: string[]; denylist?: string[];
  }): Promise<SpendingLimit> {
    return this.request("POST", "/spending-limits", data);
  }

  async listSpendingLimits(limit = 50, offset = 0, walletId?: string): Promise<PaginatedResponse<SpendingLimit>> {
    const walletParam = walletId ? `&walletId=${walletId}` : "";
    return this.request("GET", `/spending-limits?limit=${limit}&offset=${offset}${walletParam}`);
  }

  async getSpendingLimit(id: string): Promise<SpendingLimit> {
    return this.request("GET", `/spending-limits/${id}`);
  }

  async updateSpendingLimit(id: string, data: Partial<SpendingLimit>): Promise<SpendingLimit> {
    return this.request("PATCH", `/spending-limits/${id}`, data);
  }

  async deleteSpendingLimit(id: string): Promise<void> {
    await this.request("DELETE", `/spending-limits/${id}`);
  }

  // ─── Approval Requests ─────────────────────────────

  async listApprovalRequests(limit = 50, offset = 0, status?: string): Promise<PaginatedResponse<ApprovalRequest>> {
    const statusParam = status ? `&status=${status}` : "";
    return this.request("GET", `/approval-requests?limit=${limit}&offset=${offset}${statusParam}`);
  }

  async getApprovalRequest(id: string): Promise<ApprovalRequest> {
    return this.request("GET", `/approval-requests/${id}`);
  }

  async approveRequest(id: string): Promise<{ id: string; status: string; approvedCount: number; requiredApprovals: number }> {
    return this.request("POST", `/approval-requests/${id}/approve`);
  }

  async rejectRequest(id: string): Promise<{ id: string; status: string }> {
    return this.request("POST", `/approval-requests/${id}/reject`);
  }

  // ─── Auth (additional) ─────────────────────────────

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    return this.request("POST", "/auth/password/reset", { email });
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<{ message: string }> {
    return this.request("POST", "/auth/password/reset/confirm", { token, newPassword });
  }

  async webauthnRegisterOptions(email: string): Promise<{ options: unknown; userId: string }> {
    return this.request("POST", "/auth/webauthn/register", { email });
  }

  async webauthnRegisterVerify(userId: string, credential: unknown): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/webauthn/register/verify", { userId, credential });
    this.sessionToken = res.sessionToken;
    return res;
  }

  async webauthnAuthenticateOptions(email: string): Promise<{ options: unknown; userId: string }> {
    return this.request("POST", "/auth/webauthn/authenticate", { email });
  }

  async webauthnAuthenticateVerify(userId: string, credential: unknown): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>("POST", "/auth/webauthn/authenticate/verify", { userId, credential });
    this.sessionToken = res.sessionToken;
    return res;
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
