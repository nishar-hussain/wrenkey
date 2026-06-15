export interface WranKeyConfig {
  apiBase: string;
  orgId?: string;
  sessionToken?: string;
  apiKey?: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
  tags: string[];
  createdAt: string;
}

export interface Wallet {
  id: string;
  orgId: string;
  ownerType: string;
  ownerId: string;
  userId?: string;
  name: string;
  tags: string[];
  status: string;
  accounts?: WalletAccount[];
  createdAt: string;
  updatedAt: string;
}

export interface WalletAccount {
  id: string;
  walletId: string;
  chainId: string;
  chain?: string;
  address: string;
  derivationPath: string;
  index: number;
  createdAt: string;
}

export interface Chain {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  nativeCurrency: string;
  symbol: string;
  blockExplorerUrl?: string;
  derivationPath: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpendingLimit {
  id: string;
  orgId: string;
  walletId?: string;
  chainId?: string;
  name: string;
  maxPerTx?: string;
  maxDaily?: string;
  maxMonthly?: string;
  allowlist: string[];
  denylist: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequest {
  id: string;
  orgId: string;
  transactionId: string;
  requestedBy: string;
  approvedBy: string[];
  rejectedBy: string[];
  requiredApprovals: number;
  status: string;
  transaction?: Transaction;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  orgId: string;
  txHash?: string;
  chain: string;
  to: string;
  value: string;
  nonce?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  data?: string;
  status: string;
  signedTx?: string;
  replacementFor?: string;
  error?: string;
  riskScore?: number;
  createdAt: string;
  confirmedAt?: string;
}

export interface Policy {
  id: string;
  orgId: string;
  name: string;
  effect: string;
  conditions: unknown;
  consensus: string;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  apiKeyId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
}

export interface Webhook {
  id: string;
  orgId: string;
  userId?: string;
  url: string;
  events: string[];
  hmacSecret?: string;
  active: boolean;
  createdAt: string;
}

export type WebhookListItem = Omit<Webhook, "hmacSecret">;

export interface AuditLog {
  id: string;
  orgId: string;
  userId?: string;
  action: string;
  resource?: string;
  details?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  type: string;
  expiresAt: string;
  createdAt: string;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  allowedIps: string[];
  expiresAt?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthResponse {
  sessionToken: string;
  user: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    role: string;
  };
  org: Organization;
  expiresAt: string;
}
