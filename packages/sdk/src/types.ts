export interface WranKeyConfig {
  apiBase: string;
  orgId?: string;
  sessionToken?: string;
  apiKey?: string;
  configId?: string;
}

export interface AuthConfig {
  googleClientId: string;
  sessionExpiry: number;
  otpEnabled: boolean;
  otpLength: number;
  otpType: "numeric" | "alphanumeric";
  otpEmail: boolean;
  otpSms: boolean;
  passkeyAuth: boolean;
  walletAuth: boolean;
  socialOAuth: boolean;
  googleLogin: boolean;
  appleLogin: boolean;
  xLogin: boolean;
  discordLogin: boolean;
  redirectUrl: string;
  appName: string;
  appLogo: string;
  requireTokenLookup: boolean;
}

export interface Organization {
  id: string;
  name: string;
  parentOrgId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubOrg {
  id: string;
  name: string;
  rootUserId?: string;
  rootUserEmail?: string;
  userCount: number;
  walletCount: number;
  createdAt: string;
}

export interface SubOrgDetail {
  id: string;
  name: string;
  rootUser: { id: string; email: string; name: string } | null;
  userCount: number;
  walletCount: number;
  policyCount: number;
  createdAt: string;
  parentOrgId: string;
}

export interface ImpersonateResponse {
  sessionToken: string;
  user: { id: string; email: string; role: string };
  org: { id: string; name: string };
  impersonating: boolean;
  expiresAt: string;
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
  transactionId?: string | null;
  actionType: string;
  targetId: string;
  actionPayload?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  requestedBy: string;
  approvedBy: string[];
  rejectedBy: string[];
  requiredApprovals: number;
  status: string;
  transaction?: Transaction | null;
  wallet?: { id: string; name: string; status: string; tags: string[] } | null;
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
  sponsored: boolean;
  createdAt: string;
  confirmedAt?: string;
}

export interface PrivateKey {
  id: string;
  orgId: string;
  walletId: string;
  name: string;
  curve: string;
  tags: string[];
  publicKey: string;
  derivationIndex: number;
  exported: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  addresses?: PrivateKeyAddress[];
}

export interface PrivateKeyAddress {
  id: string;
  privateKeyId: string;
  chainId: string;
  address: string;
  createdAt: string;
  chain?: { name: string; chainId: number };
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

// ─── WVC (Verifiable Compute) — PRD §8, §9, §19 ───────────────────────────

export interface WvcApp {
  id: string;
  orgId: string;
  name: string;
  description: string;
  quorumKeyId?: string | null;
  liveDeploymentId?: string | null;
  requiredApprovals: number;
  createdAt: string;
  updatedAt: string;
}

export interface WvcDeployment {
  id: string;
  appId: string;
  imageUrl: string;
  executablePath: string;
  executableArgs: string[];
  executableDigest: string;
  expectedPcr0: string;
  expectedPcr1: string;
  expectedPcr2: string;
  ingressPort: number;
  healthPort: number;
  cpuCount: number;
  memoryMib: number;
  replicaCount: number;
  status: "pending_manifest" | "approved" | "provisioning" | "inactive" | "live" | "marked_for_deletion" | "deleted";
  manifestId: string;
  allowedUpgradeFrom: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WvcManifest {
  id: string;
  appId: string;
  manifestJson: Record<string, unknown>;
  manifestHash: string;
  requiredApprovals: number;
  createdAt: string;
}

export interface WvcOperator {
  id: string;
  orgId: string;
  appId: string;
  alias: string;
  publicKey: string;
  status: "active" | "revoked";
  createdAt: string;
}

export interface WvcAppProof {
  id: string;
  deploymentId: string;
  ephemeralPubkey: string;
  payloadHash: string;
  payloadType: "signature" | "parse_summary" | "policy_decision" | "oracle_result" | "generate_seed";
  signature: string;
  attestationDoc: string;
  proofFormatVersion: string;
  issuedAt: string;
}

export interface WvcBootProof {
  id: string;
  deploymentId: string;
  manifestId: string;
  attestationDoc: string;
  bootedAt: string;
}

export interface WvcKeyCeremony {
  id: string;
  appId: string;
  ceremonyType: "bootstrap" | "rotation" | "recovery";
  initiatedBy?: string | null;
  participatingOperators: string[];
  newQuorumKeyId?: string | null;
  status: "pending" | "completed" | "failed";
  startedAt: string;
  completedAt?: string | null;
}

export interface WvcInvokeResult {
  result: Record<string, unknown>;
  appProof: {
    id: string;
    ephemeralPubkey: string;
    payloadHash: string;
    payloadType: string;
    signature: string;
    attestationDoc: string;
    proofFormatVersion?: string;
  };
}
