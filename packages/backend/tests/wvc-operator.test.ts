import { describe, it, expect } from "vitest";
import {
  generateOperatorKeyPair,
  signWithOperatorKey,
  verifyOperatorSignature,
  normalizePublicKey,
} from "../../src/modules/wvc/operator.js";
import { computeManifestHash, buildManifestObject } from "../../src/modules/wvc/manifest.js";

describe("WVC Operator Signatures (P256, PRD §13)", () => {
  it("generates a valid P256 keypair", () => {
    const { publicKeyPem, privateKeyPem } = generateOperatorKeyPair();
    expect(publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(privateKeyPem).toContain("BEGIN PRIVATE KEY");
  });

  it("verifies a valid signature over a manifest hash", () => {
    const { publicKeyPem, privateKeyPem } = generateOperatorKeyPair();
    const manifest = buildManifestObject({
      appId: "test", imageUrl: "img", executablePath: "/p", executableArgs: [],
      executableDigest: "d", expectedPcr0: "0", expectedPcr1: "1", expectedPcr2: "2",
      ingressPort: 3000, healthPort: 3000, cpuCount: 2, memoryMib: 1024, replicaCount: 3,
      requiredApprovals: 2, approvers: [], allowedUpgradeFrom: [],
    });
    const hash = computeManifestHash(manifest);
    const signature = signWithOperatorKey(privateKeyPem, hash);
    expect(signature).toMatch(/^[0-9a-f]+$/);
    expect(verifyOperatorSignature(publicKeyPem, hash, signature)).toBe(true);
  });

  it("rejects a signature from a different operator's key", () => {
    const op1 = generateOperatorKeyPair();
    const op2 = generateOperatorKeyPair();
    const hash = "sha256:" + "a".repeat(64);
    const signature = signWithOperatorKey(op1.privateKeyPem, hash);
    expect(verifyOperatorSignature(op2.publicKeyPem, hash, signature)).toBe(false);
  });

  it("rejects a signature over a different hash", () => {
    const { publicKeyPem, privateKeyPem } = generateOperatorKeyPair();
    const sig = signWithOperatorKey(privateKeyPem, "sha256:" + "a".repeat(64));
    expect(verifyOperatorSignature(publicKeyPem, "sha256:" + "b".repeat(64), sig)).toBe(false);
  });

  it("rejects a malformed signature", () => {
    const { publicKeyPem } = generateOperatorKeyPair();
    const hash = "sha256:" + "a".repeat(64);
    expect(verifyOperatorSignature(publicKeyPem, hash, "not-hex-garbage")).toBe(false);
  });

  it("normalizes a PEM public key (round-trip)", () => {
    const { publicKeyPem } = generateOperatorKeyPair();
    const normalized = normalizePublicKey(publicKeyPem);
    expect(normalized).toContain("BEGIN PUBLIC KEY");
  });
});
