import { describe, it, expect } from "vitest";

describe("WranKey SDK", () => {
  it("should have proper exports structure", async () => {
    const sdk = await import("../src/index.js");
    expect(sdk.WranKeyClient).toBeDefined();
    expect(sdk.createClient).toBeDefined();
    expect(typeof sdk.createClient).toBe("function");
  });

  it("should create a client instance", async () => {
    const { createClient } = await import("../src/index.js");
    const client = createClient({ apiBase: "http://localhost:3001" });
    expect(client).toBeDefined();
    expect(typeof client.setSessionToken).toBe("function");
    expect(typeof client.setApiKey).toBe("function");
    expect(typeof client.clearSession).toBe("function");

    // Auth methods exist
    expect(typeof client.sendEmailOtp).toBe("function");
    expect(typeof client.verifyEmailOtp).toBe("function");
    expect(typeof client.passwordSignup).toBe("function");
    expect(typeof client.passwordLogin).toBe("function");
    expect(typeof client.walletLogin).toBe("function");
    expect(typeof client.logout).toBe("function");

    // Wallet methods exist
    expect(typeof client.createWallet).toBe("function");
    expect(typeof client.listWallets).toBe("function");
    expect(typeof client.getWallet).toBe("function");
    expect(typeof client.deleteWallet).toBe("function");
    expect(typeof client.exportWallet).toBe("function");
    expect(typeof client.getWalletBalance).toBe("function");
    expect(typeof client.deriveAccount).toBe("function");
    expect(typeof client.importWallet).toBe("function");

    // Transaction methods exist
    expect(typeof client.signAndSend).toBe("function");
    expect(typeof client.getTransaction).toBe("function");
    expect(typeof client.listTransactions).toBe("function");
    expect(typeof client.getNonce).toBe("function");

    // Policy methods exist
    expect(typeof client.createPolicy).toBe("function");
    expect(typeof client.listPolicies).toBe("function");
    expect(typeof client.getPolicy).toBe("function");
    expect(typeof client.updatePolicy).toBe("function");
    expect(typeof client.deletePolicy).toBe("function");

    // Agent methods exist
    expect(typeof client.createAgent).toBe("function");
    expect(typeof client.listAgents).toBe("function");
    expect(typeof client.getAgent).toBe("function");
    expect(typeof client.deleteAgent).toBe("function");

    // Webhook methods exist
    expect(typeof client.createWebhook).toBe("function");
    expect(typeof client.listWebhooks).toBe("function");
    expect(typeof client.deleteWebhook).toBe("function");
    expect(typeof client.updateWebhook).toBe("function");

    // Org methods exist
    expect(typeof client.createOrg).toBe("function");
    expect(typeof client.getOrg).toBe("function");
    expect(typeof client.listOrgs).toBe("function");

    // User methods exist
    expect(typeof client.createUser).toBe("function");
    expect(typeof client.listUsers).toBe("function");
    expect(typeof client.getUser).toBe("function");
    expect(typeof client.updateUser).toBe("function");
    expect(typeof client.deleteUser).toBe("function");

    // API Key methods exist
    expect(typeof client.createApiKey).toBe("function");
    expect(typeof client.listApiKeys).toBe("function");
    expect(typeof client.deleteApiKey).toBe("function");

    // Session methods exist
    expect(typeof client.refreshSession).toBe("function");
    expect(typeof client.getSessions).toBe("function");
    expect(typeof client.revokeSession).toBe("function");

    // Audit logs
    expect(typeof client.listAuditLogs).toBe("function");

    // WVC (Verifiable Compute) methods exist
    expect(typeof client.createWvcApp).toBe("function");
    expect(typeof client.listWvcApps).toBe("function");
    expect(typeof client.getWvcApp).toBe("function");
    expect(typeof client.addWvcOperator).toBe("function");
    expect(typeof client.listWvcOperators).toBe("function");
    expect(typeof client.revokeWvcOperator).toBe("function");
    expect(typeof client.createWvcDeployment).toBe("function");
    expect(typeof client.getWvcManifest).toBe("function");
    expect(typeof client.approveWvcManifest).toBe("function");
    expect(typeof client.provisionWvcDeployment).toBe("function");
    expect(typeof client.getWvcDeployment).toBe("function");
    expect(typeof client.setWvcDeploymentLive).toBe("function");
    expect(typeof client.deleteWvcDeployment).toBe("function");
    expect(typeof client.restoreWvcDeployment).toBe("function");
    expect(typeof client.invokeWvcDeployment).toBe("function");
    expect(typeof client.getWvcAppProof).toBe("function");
    expect(typeof client.startWvcCeremony).toBe("function");
    expect(typeof client.getWvcCeremony).toBe("function");

    // Private key methods exist
    expect(typeof client.createPrivateKey).toBe("function");
    expect(typeof client.listPrivateKeys).toBe("function");
    expect(typeof client.getPrivateKey).toBe("function");
    expect(typeof client.exportPrivateKey).toBe("function");
    expect(typeof client.updatePrivateKey).toBe("function");
    expect(typeof client.deletePrivateKey).toBe("function");
    expect(typeof client.addPrivateKeyAddress).toBe("function");

    // Wallet deleteAccount method exists
    expect(typeof client.deleteAccount).toBe("function");
  });

  it("should set and clear session token", async () => {
    const { createClient } = await import("../src/index.js");
    const client = createClient({ apiBase: "http://localhost:3001" });

    client.setSessionToken("test-token-123");
    client.setApiKey("test-api-key-456");
    client.clearSession();
  });

  it("should have react hooks exports", async () => {
    const reactSdk = await import("../src/react/index.js");
    expect(reactSdk.WranKeyProvider).toBeDefined();
    expect(reactSdk.useAuth).toBeDefined();
    expect(reactSdk.useWallets).toBeDefined();
    expect(reactSdk.useTransactions).toBeDefined();
    expect(reactSdk.usePolicies).toBeDefined();
    expect(reactSdk.useAgents).toBeDefined();
    expect(reactSdk.useWvcApps).toBeDefined();
    expect(reactSdk.useSpendingLimits).toBeDefined();
    expect(reactSdk.useApprovalRequests).toBeDefined();
    expect(reactSdk.usePrivateKeys).toBeDefined();
    expect(reactSdk.useChains).toBeDefined();
  });
});
