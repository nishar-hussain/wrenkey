import { describe, it, expect, afterEach } from "vitest";
import { invokeLocalDeployment, provisionLocalDeployment } from "../src/services/wvc-local-runtime.js";

afterEach(() => {
  delete process.env.WVC_ALLOW_LOCAL_PROOFS;
});

describe("WVC local runtime", () => {
  it("rejects local proofs unless explicitly enabled", async () => {
    await expect(provisionLocalDeployment({
      deploymentId: "dep-1",
      appId: "app-1",
      manifestId: "manifest-1",
      manifestHash: "sha256:" + "a".repeat(64),
      manifestJson: {},
      replicaCount: 1,
    })).rejects.toThrow("Local WVC proofs are disabled");
  });

  it("creates local boot proofs with an explicit dev-only format marker", async () => {
    process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

    const result = await provisionLocalDeployment({
      deploymentId: "dep-1",
      appId: "app-1",
      manifestId: "manifest-1",
      manifestHash: "sha256:" + "a".repeat(64),
      manifestJson: {},
      replicaCount: 2,
    });

    expect(result.runtime).toBe("local");
    expect(result.healthyReplicas).toBe(2);
    expect(result.bootProofs).toHaveLength(2);
    expect(result.bootProofs[0].proofFormatVersion).toBe("local-dev-v1");
  });

  it("supports the wallet-signer demo payloads", async () => {
    process.env.WVC_ALLOW_LOCAL_PROOFS = "true";

    const seed = await invokeLocalDeployment("dep-1", "sha256:" + "a".repeat(64), {
      payloadType: "generate_seed",
      walletName: "demo",
    });
    expect(seed.result.seedId).toMatch(/^local-seed-/);
    expect(seed.appProof.proofFormatVersion).toBe("local-dev-v1");

    const signature = await invokeLocalDeployment("dep-1", "sha256:" + "a".repeat(64), {
      payloadType: "signature",
      unsignedTx: "0x1234",
    });
    expect(signature.result.signedTx).toMatch(/^0xlocal/);
    expect(signature.appProof.payloadType).toBe("signature");
  });
});
