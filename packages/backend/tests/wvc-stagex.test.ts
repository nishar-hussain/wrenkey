/**
 * StageX Integration Tests — verifies the build-time attestation chain.
 *
 * Tests that:
 *  1. A deployment can be created with StageX digest and version.
 *  2. The manifest includes StageX fields when provided.
 *  3. The attestation document includes StageX digest after provision.
 *  4. The proof verifier rejects a mismatched StageX digest.
 *  5. The proof verifier accepts a matching StageX digest.
 */

import { describe, it, expect } from "vitest";
import {
  buildManifestObject,
  computeManifestHash,
  canonicalize,
} from "../../src/modules/wvc/manifest.js";
import {
  verifyLocalAppProof,
  verifyLocalBootProof,
  generateLocalAttestationKey,
} from "@wrankey/wvc-verify";

// Re-use the same expected PCR values as the local runtime produces
const EXPECTED_PCRS = {
  pcr0: "0000000000000000000000000000000000000000000000000000000000000000",
  pcr1: "0000000000000000000000000000000000000000000000000000000000000001",
  pcr2: "0000000000000000000000000000000000000000000000000000000000000002",
};

const STAGEX_DIGEST = "sha256:abc123def4567890";
const STAGEX_VERSION = "2026.05.0";
const WRONG_STAGEX_DIGEST = "sha256:0000000000000000";

describe("StageX Integration — Manifest", () => {
  it("includes stagedx_digest and stagedx_version in the manifest when provided", () => {
    const manifest = buildManifestObject({
      appId: "app-1",
      imageUrl: "oci://stagex.wrankey.io/wvc-enclave@sha256:abc123",
      executablePath: "/app/wvc-runtime",
      executableArgs: [],
      executableDigest: "sha256:def456",
      expectedPcr0: EXPECTED_PCRS.pcr0,
      expectedPcr1: EXPECTED_PCRS.pcr1,
      expectedPcr2: EXPECTED_PCRS.pcr2,
      ingressPort: 3000,
      healthPort: 3000,
      cpuCount: 2,
      memoryMib: 1024,
      replicaCount: 1,
      requiredApprovals: 1,
      approvers: ["op-1"],
      allowedUpgradeFrom: [],
      stagedxDigest: STAGEX_DIGEST,
      stagedxVersion: STAGEX_VERSION,
    });

    const obj = manifest as any;
    expect(obj.stagedx_digest).toBe(STAGEX_DIGEST);
    expect(obj.stagedx_version).toBe(STAGEX_VERSION);
  });

  it("omits StageX fields from the manifest when not provided", () => {
    const manifest = buildManifestObject({
      appId: "app-2",
      imageUrl: "oci://example.com/image",
      executablePath: "/app/wvc-runtime",
      executableArgs: [],
      executableDigest: "sha256:def456",
      expectedPcr0: EXPECTED_PCRS.pcr0,
      expectedPcr1: EXPECTED_PCRS.pcr1,
      expectedPcr2: EXPECTED_PCRS.pcr2,
      ingressPort: 3000,
      healthPort: 3000,
      cpuCount: 2,
      memoryMib: 1024,
      replicaCount: 1,
      requiredApprovals: 1,
      approvers: ["op-1"],
      allowedUpgradeFrom: [],
    });

    const obj = manifest as any;
    expect(obj.stagedx_digest).toBeUndefined();
    expect(obj.stagedx_version).toBeUndefined();
  });

  it("produces a different manifest hash when StageX fields are included", () => {
    const baseInput = {
      appId: "app-3",
      imageUrl: "oci://example.com/image",
      executablePath: "/app/wvc-runtime",
      executableArgs: [],
      executableDigest: "sha256:def456",
      expectedPcr0: EXPECTED_PCRS.pcr0,
      expectedPcr1: EXPECTED_PCRS.pcr1,
      expectedPcr2: EXPECTED_PCRS.pcr2,
      ingressPort: 3000,
      healthPort: 3000,
      cpuCount: 2,
      memoryMib: 1024,
      replicaCount: 1,
      requiredApprovals: 1,
      approvers: ["op-1"],
      allowedUpgradeFrom: [],
    };

    const withoutStageX = buildManifestObject(baseInput);
    const withStageX = buildManifestObject({
      ...baseInput,
      stagedxDigest: STAGEX_DIGEST,
      stagedxVersion: STAGEX_VERSION,
    });

    const hashWithout = computeManifestHash(withoutStageX);
    const hashWith = computeManifestHash(withStageX);

    expect(hashWithout).not.toBe(hashWith);
  });
});

describe("StageX Integration — Attestation & Verification", () => {
  it("verifies a proof with a matching StageX digest", () => {
    const attestationKey = generateLocalAttestationKey();
    const ephemeralKey = generateLocalAttestationKey();

    const { createSign } = require("crypto");
    const signer = createSign("SHA256");
    const docWithoutSig = {
      format: "local-dev-v1",
      pcrs: EXPECTED_PCRS,
      ephemeralPubkey: ephemeralKey.publicKeyHex,
      timestamp: Date.now(),
      attestationPubkey: attestationKey.publicKeyHex,
      stagedxDigest: STAGEX_DIGEST,
      stagedxVersion: STAGEX_VERSION,
    };
    const canonical = JSON.stringify({
      format: docWithoutSig.format,
      pcrs: docWithoutSig.pcrs,
      ephemeralPubkey: docWithoutSig.ephemeralPubkey,
      timestamp: docWithoutSig.timestamp,
      attestationPubkey: docWithoutSig.attestationPubkey,
      stagedxDigest: docWithoutSig.stagedxDigest,
      stagedxVersion: docWithoutSig.stagedxVersion,
    });
    signer.update(Buffer.from(canonical, "utf8"));
    const signature = signer
      .sign({ key: attestationKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
      .toString("hex");

    const attestationDoc = Buffer.from(
      JSON.stringify({ ...docWithoutSig, signature }),
      "utf8"
    ).toString("base64");

    const { createHash } = require("crypto");
    const payloadHash = "sha256:" + createHash("sha256").update('{"hello":"world"}').digest("hex");
    const payloadSigner = createSign("SHA256");
    const hashBytes = Buffer.from(payloadHash.replace(/^sha256:/i, ""), "hex");
    payloadSigner.update(hashBytes);
    const payloadSig = payloadSigner
      .sign({ key: ephemeralKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
      .toString("hex");

    const proof = {
      proofFormatVersion: "local-dev-v1",
      deploymentId: "deploy-test",
      ephemeralPubkey: ephemeralKey.publicKeyHex,
      payloadHash,
      payloadType: "signature" as const,
      signature: payloadSig,
      attestationDoc,
      issuedAt: new Date().toISOString(),
    };

    const result = verifyLocalAppProof(proof, EXPECTED_PCRS, {
      maxAgeMs: 60 * 60 * 1000,
      expectedStagexDigest: STAGEX_DIGEST,
    });

    expect(result.valid).toBe(true);
  });

  it("rejects a proof when the StageX digest does not match", () => {
    const attestationKey = generateLocalAttestationKey();
    const ephemeralKey = generateLocalAttestationKey();

    const { createSign } = require("crypto");
    const signer = createSign("SHA256");
    const docWithoutSig = {
      format: "local-dev-v1",
      pcrs: EXPECTED_PCRS,
      ephemeralPubkey: ephemeralKey.publicKeyHex,
      timestamp: Date.now(),
      attestationPubkey: attestationKey.publicKeyHex,
      stagedxDigest: STAGEX_DIGEST,
    };
    const canonical = JSON.stringify({
      format: docWithoutSig.format,
      pcrs: docWithoutSig.pcrs,
      ephemeralPubkey: docWithoutSig.ephemeralPubkey,
      timestamp: docWithoutSig.timestamp,
      attestationPubkey: docWithoutSig.attestationPubkey,
      stagedxDigest: docWithoutSig.stagedxDigest,
    });
    signer.update(Buffer.from(canonical, "utf8"));
    const signature = signer
      .sign({ key: attestationKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
      .toString("hex");

    const attestationDoc = Buffer.from(
      JSON.stringify({ ...docWithoutSig, signature }),
      "utf8"
    ).toString("base64");

    const { createHash } = require("crypto");
    const payloadHash = "sha256:" + createHash("sha256").update('{"test":true}').digest("hex");
    const payloadSigner = createSign("SHA256");
    const hashBytes = Buffer.from(payloadHash.replace(/^sha256:/i, ""), "hex");
    payloadSigner.update(hashBytes);
    const payloadSig = payloadSigner
      .sign({ key: ephemeralKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
      .toString("hex");

    const proof = {
      proofFormatVersion: "local-dev-v1",
      deploymentId: "deploy-test",
      ephemeralPubkey: ephemeralKey.publicKeyHex,
      payloadHash,
      payloadType: "signature" as const,
      signature: payloadSig,
      attestationDoc,
      issuedAt: new Date().toISOString(),
    };

    // Try to verify with a WRONG expected digest
    const result = verifyLocalAppProof(proof, EXPECTED_PCRS, {
      maxAgeMs: 60 * 60 * 1000,
      expectedStagexDigest: WRONG_STAGEX_DIGEST,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("StageX digest mismatch");
  });

  it("rejects a proof when StageX digest is expected but not present in attestation", () => {
    const attestationKey = generateLocalAttestationKey();
    const ephemeralKey = generateLocalAttestationKey();

    const { createSign } = require("crypto");
    const signer = createSign("SHA256");
    const docWithoutSig = {
      format: "local-dev-v1",
      pcrs: EXPECTED_PCRS,
      ephemeralPubkey: ephemeralKey.publicKeyHex,
      timestamp: Date.now(),
      attestationPubkey: attestationKey.publicKeyHex,
      // No stagedxDigest here
    };
    const canonical = JSON.stringify({
      format: docWithoutSig.format,
      pcrs: docWithoutSig.pcrs,
      ephemeralPubkey: docWithoutSig.ephemeralPubkey,
      timestamp: docWithoutSig.timestamp,
      attestationPubkey: docWithoutSig.attestationPubkey,
    });
    signer.update(Buffer.from(canonical, "utf8"));
    const signature = signer
      .sign({ key: attestationKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
      .toString("hex");

    const attestationDoc = Buffer.from(
      JSON.stringify({ ...docWithoutSig, signature }),
      "utf8"
    ).toString("base64");

    const { createHash } = require("crypto");
    const payloadHash = "sha256:" + createHash("sha256").update('{"test":true}').digest("hex");
    const payloadSigner = createSign("SHA256");
    const hashBytes = Buffer.from(payloadHash.replace(/^sha256:/i, ""), "hex");
    payloadSigner.update(hashBytes);
    const payloadSig = payloadSigner
      .sign({ key: ephemeralKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
      .toString("hex");

    const proof = {
      proofFormatVersion: "local-dev-v1",
      deploymentId: "deploy-test",
      ephemeralPubkey: ephemeralKey.publicKeyHex,
      payloadHash,
      payloadType: "signature" as const,
      signature: payloadSig,
      attestationDoc,
      issuedAt: new Date().toISOString(),
    };

    const result = verifyLocalAppProof(proof, EXPECTED_PCRS, {
      maxAgeMs: 60 * 60 * 1000,
      expectedStagexDigest: STAGEX_DIGEST,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("StageX digest expected but not present");
  });
});
