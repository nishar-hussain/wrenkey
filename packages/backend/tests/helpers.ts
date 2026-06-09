import { vi } from "vitest";
import { signToken } from "../src/utils/jwt.js";

export const TEST_ORG_ID = "org-test-001";
export const TEST_USER_ID = "user-test-001";
export const TEST_WALLET_ID = "wallet-test-001";
export const TEST_ACCOUNT_ID = "acct-test-001";
export const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

export function createTestToken(orgId = TEST_ORG_ID, userId = TEST_USER_ID, role = "ORG_ADMIN") {
  return signToken({ sub: userId, orgId, role });
}

export function authHeader(token?: string) {
  return { authorization: `Bearer ${token || createTestToken()}` };
}

export const mockPrismaData = {
  organization: {
    id: TEST_ORG_ID,
    name: "Test Org",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  user: {
    id: TEST_USER_ID,
    orgId: TEST_ORG_ID,
    name: "Test User",
    email: "test@example.com",
    phone: null,
    role: "ORG_ADMIN",
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  wallet: {
    id: TEST_WALLET_ID,
    orgId: TEST_ORG_ID,
    ownerType: "USER",
    ownerId: TEST_USER_ID,
    userId: TEST_USER_ID,
    name: "Test Wallet",
    tags: [],
    encryptedSeed: "iv:auth:encrypted",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    accounts: [
      {
        id: TEST_ACCOUNT_ID,
        walletId: TEST_WALLET_ID,
        chain: "arc",
        address: TEST_ADDRESS,
        derivationPath: "m/44'/60'/0'/0/0",
        index: 0,
        createdAt: new Date(),
      },
    ],
  },
  account: {
    id: TEST_ACCOUNT_ID,
    walletId: TEST_WALLET_ID,
    chain: "arc",
    address: TEST_ADDRESS,
    derivationPath: "m/44'/60'/0'/0/0",
    index: 0,
    createdAt: new Date(),
  },
  policy: {
    id: "policy-test-001",
    orgId: TEST_ORG_ID,
    name: "Allow under 1000",
    effect: "EFFECT_ALLOW",
    conditions: [{ type: "LESS_THAN", field: "params.value", value: 1000 }],
    consensus: "ANY",
    priority: 0,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  agent: {
    id: "agent-test-001",
    orgId: TEST_ORG_ID,
    userId: TEST_USER_ID,
    name: "Test Agent",
    apiKeyId: "apikey-test-001",
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: TEST_USER_ID, name: "Test User", email: "test@example.com", tags: [] },
  },
  webhook: {
    id: "webhook-test-001",
    orgId: TEST_ORG_ID,
    userId: TEST_USER_ID,
    url: "https://example.com/webhook",
    events: ["wallet.created", "transaction.submitted"],
    hmacSecret: "secret123",
    active: true,
    createdAt: new Date(),
  },
  session: {
    id: "session-test-001",
    userId: TEST_USER_ID,
    token: "test-token",
    type: "READ_WRITE",
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
  },
  transaction: {
    id: "tx-test-001",
    accountId: TEST_ACCOUNT_ID,
    orgId: TEST_ORG_ID,
    txHash: "0xabc123",
    chain: "arc",
    to: TEST_ADDRESS,
    value: "500",
    gasLimit: "21000",
    maxFeePerGas: "20000000000",
    data: "0x",
    status: "BROADCAST",
    signedTx: "0xsigned",
    error: null,
    createdAt: new Date(),
    confirmedAt: null,
  },
};
