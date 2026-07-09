/**
 * Local WVC runtime adapter — produces cryptographically verifiable local-dev-v1 proofs.
 *
 * This is a dev/test Host Agent stand-in. It exercises the same control-plane
 * contracts as the Nitro Host Agent, but produces proofs in the "local-dev-v1"
 * format that can be cryptographically verified by @wrankey/wvc-verify's
 * `verifyLocalAppProof()` / `verifyLocalBootProof()`.
 *
 * The attestation chain:
 *   1. A process-local P-256 "attestation key" simulates the NSM attestation key.
 *   2. Each proof gets a fresh ephemeral P-256 keypair.
 *   3. The attestation document is a self-signed JSON binding {PCRs, ephemeralPubkey, timestamp}.
 *   4. The payload signature is a real P-256 ECDSA signature over the raw 32-byte hash.
 *
 * This lets the full WVC flow (create → approve → provision → invoke → verify) be
 * tested end-to-end without AWS Nitro hardware.
 */

import { createHash, generateKeyPairSync, createSign } from "crypto";
import { ForbiddenError, ValidationError } from "../utils/errors.js";
import { config } from "../config.js";
import type { InvokeRequest, InvokeResult, ProvisionRequest, ProvisionResult } from "./wvc-relay.js";

export const LOCAL_PROOF_FORMAT = "local-dev-v1";

// ─── Process-local attestation key ─────────────────────────────────────────
// Simulates the NSM's attestation key — persistent for the process lifetime.

const _attestationKey = (() => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const pubDerHex = Buffer.from(publicKey).toString("hex");
  // Extract SEC1 uncompressed point (last 65 bytes = "04" + X + Y for P-256)
  const pubHex = `04${pubDerHex.slice(-128)}`;
  return { publicKeyHex: pubHex, privateKeyPem: privateKey as string };
})();

// ─── Local dev PCRs (deterministic, clearly fake) ──────────────────────────

const LOCAL_PCRS = {
  pcr0: "0000000000000000000000000000000000000000000000000000000000000000",
  pcr1: "0000000000000000000000000000000000000000000000000000000000000001",
  pcr2: "0000000000000000000000000000000000000000000000000000000000000002",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function localProofsAllowed(): boolean {
  return config.wvc.allowLocalProofs || process.env.WVC_ALLOW_LOCAL_PROOFS === "true";
}

function assertLocalProofsAllowed() {
  if (!localProofsAllowed()) {
    throw new ForbiddenError(
      "Local WVC proofs are disabled. Set WVC_ALLOW_LOCAL_PROOFS=true in dev/test only.",
    );
  }
}

/** Compute payload hash: sha256(payloadType + ":" + payloadBytes) → "sha256:<hex>" */
function computePayloadHash(payloadType: string, payload: unknown): string {
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  return "sha256:" + createHash("sha256").update(`${payloadType}:${payloadStr}`).digest("hex");
}

/** Generate a fresh ephemeral P-256 keypair, returning hex SEC1 uncompressed pubkey + PEM private key. */
function makeEphemeralKey(): { publicKeyHex: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const pubDerHex = Buffer.from(publicKey).toString("hex");
  return {
    publicKeyHex: `04${pubDerHex.slice(-128)}`,
    privateKeyPem: privateKey as string,
  };
}

/** Sign the raw 32-byte hash with an ephemeral P-256 key (IEEE-P1363 format). */
function signPayloadHash(privateKeyPem: string, payloadHash: string): string {
  const hashHex = payloadHash.replace(/^sha256:/i, "");
  const hashBytes = Buffer.from(hashHex, "hex");
  const signer = createSign("SHA256");
  signer.update(hashBytes);
  signer.end();
  return signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" }).toString("hex");
}

/** Build a cryptographically signed local-dev-v1 attestation document (base64 JSON). */
function buildLocalAttestation(params: {
  ephemeralPubkeyHex: string;
  pcrs?: { pcr0: string; pcr1: string; pcr2: string };
}): string {
  const pcrs = params.pcrs ?? LOCAL_PCRS;
  const timestamp = Date.now();

  const docWithoutSig = {
    format: "local-dev-v1" as const,
    pcrs,
    ephemeralPubkey: params.ephemeralPubkeyHex,
    timestamp,
    attestationPubkey: _attestationKey.publicKeyHex,
  };

  const canonical = JSON.stringify({
    format: docWithoutSig.format,
    pcrs: docWithoutSig.pcrs,
    ephemeralPubkey: docWithoutSig.ephemeralPubkey,
    timestamp: docWithoutSig.timestamp,
    attestationPubkey: docWithoutSig.attestationPubkey,
  });

  const signer = createSign("SHA256");
  signer.update(Buffer.from(canonical, "utf8"));
  const signature = signer
    .sign({ key: _attestationKey.privateKeyPem, dsaEncoding: "ieee-p1363" })
    .toString("hex");

  const doc = { ...docWithoutSig, signature };
  return Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function provisionLocalDeployment(request: ProvisionRequest): Promise<ProvisionResult> {
  assertLocalProofsAllowed();

  const proofs = Array.from({ length: Math.max(1, request.replicaCount) }).map((_, index) => {
    const key = makeEphemeralKey();
    return {
      manifestId: request.manifestId,
      attestationDoc: buildLocalAttestation({
        ephemeralPubkeyHex: key.publicKeyHex,
      }),
      replicaIndex: index,
      proofFormatVersion: LOCAL_PROOF_FORMAT,
    };
  });

  return {
    deploymentId: request.deploymentId,
    status: "inactive",
    healthyReplicas: proofs.length,
    totalReplicas: request.replicaCount,
    runtime: "local",
    bootProofs: proofs,
  };
}

export async function invokeLocalDeployment(
  deploymentId: string,
  _manifestHash: string,
  request: InvokeRequest,
): Promise<InvokeResult> {
  assertLocalProofsAllowed();

  const key = makeEphemeralKey();
  const result = buildDemoResult(deploymentId, request);

  // Compute the payload hash over the result (what the enclave "attests to")
  const payloadHash = computePayloadHash(request.payloadType, JSON.stringify(result));
  const signature = signPayloadHash(key.privateKeyPem, payloadHash);
  const attestationDoc = buildLocalAttestation({
    ephemeralPubkeyHex: key.publicKeyHex,
  });

  return {
    result,
    appProof: {
      id: "pending-db-persistence",
      ephemeralPubkey: key.publicKeyHex,
      payloadHash,
      payloadType: request.payloadType,
      signature,
      attestationDoc,
      proofFormatVersion: LOCAL_PROOF_FORMAT,
    },
  };
}

function buildDemoResult(deploymentId: string, request: InvokeRequest): Record<string, unknown> {
  if (request.payloadType === "generate_seed") {
    const seedHash = createHash("sha256").update(`${deploymentId}:${Date.now()}:${Math.random()}`).digest("hex");
    return {
      seedId: `local-seed-${seedHash.slice(0, 16)}`,
      custody: "local-wvc-simulated",
      warning: "Development seed handle only; no production key material was generated.",
    };
  }

  if (request.payloadType === "signature") {
    const unsignedTx = typeof request.unsignedTx === "string" ? request.unsignedTx : "";
    if (!unsignedTx) throw new ValidationError("unsignedTx is required for signature payloads");
    const sigHash = createHash("sha256").update(unsignedTx).digest("hex");
    return {
      signedTx: `0xlocal${sigHash}`,
      signer: "local-wvc-simulated",
      warning: "Development signature only; not valid on-chain.",
    };
  }

  return {
    echoed: request,
    warning: "Local WVC demo workload echoed the payload.",
  };
}
