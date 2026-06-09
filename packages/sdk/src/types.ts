export interface ArKeyConfig {
  apiBase: string;
  orgId?: string;
}

export interface SessionState {
  sessionToken: string | null;
  user: { id: string; email?: string; role: string } | null;
  org: { id: string; name: string } | null;
  expiresAt: Date | null;
}

export interface SignTransactionParams {
  walletId: string;
  chain?: string;
  to: string;
  value: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  data?: string;
}

export interface CreateWalletParams {
  name: string;
  ownerType?: string;
  ownerId?: string;
  tags?: string[];
}

export interface CreateAgentParams {
  name: string;
  email?: string;
  permissions?: string[];
  tags?: string[];
}

export interface CreatePolicyParams {
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
}

export interface CreateWebhookParams {
  url: string;
  events: string[];
}
