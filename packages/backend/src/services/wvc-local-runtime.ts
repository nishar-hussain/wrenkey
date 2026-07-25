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

import { createHash, generateKeyPairSync, createSign, randomBytes, createPrivateKey } from "crypto";
import { Wallet } from "ethers";
import { ForbiddenError, ValidationError } from "../utils/errors.js";
import { config } from "../config.js";
import { shamirSplit, eciesEncrypt } from "./wvc-crypto.js";
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

// ─── Quorum Key store (simulates enclave-internal key state) ────────────────
// In production, the Quorum Key is injected at boot via the key-forwarding
// protocol (§18). Here we simulate it with an in-process map keyed by appId.

interface QuorumKeyState {
  publicKeyHex: string;
  privateKeyPem: string;
  privateKeyBytes: Uint8Array;
  generation: number;
  bootstrappedAt: number;
  encryptedShares?: { operatorId: string; encryptedShare: string }[];
}

const _quorumKeyStore = new Map<string, QuorumKeyState>();

/** Generate a Quorum Key (simulates NSM GetRandom → P-256 keypair inside enclave). */
function generateQuorumKey(): QuorumKeyState {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const pubDerHex = Buffer.from(publicKey).toString("hex");
  // Extract the 32-byte private key scalar from the PKCS8 DER
  const privKeyObj = createPrivateKey({ key: privateKey, format: "pem" });
  const privDer = createPrivateKey({ key: privateKey, format: "pem" }).export({ format: "der", type: "pkcs8" }) as Buffer;
  // The private key scalar is at offset 36 in PKCS8 for P-256 (after the algorithm OIDs)
  // But safer: use the raw export
  const privKeyBytes = extractPrivateKeyBytes(privateKey as string);
  return {
    publicKeyHex: `04${pubDerHex.slice(-128)}`,
    privateKeyPem: privateKey as string,
    privateKeyBytes: privKeyBytes,
    generation: 1,
    bootstrappedAt: Date.now(),
  };
}

/** Extract the 32-byte private key scalar from a PEM private key. */
function extractPrivateKeyBytes(pemPrivateKey: string): Uint8Array {
  const keyObj = createPrivateKey({ key: pemPrivateKey, format: "pem" });
  // Export as SEC1 DER, which contains the raw private key
  const sec1Der = keyObj.export({ format: "der", type: "sec1" }) as Buffer;
  // In SEC1 DER for P-256: SEQUENCE { INTEGER 1, OCTET STRING (32 bytes), [1] BIT STRING (public key) }
  // The private key scalar is the first OCTET STRING after the version INTEGER
  // Typically at offset 7 (30 77 02 01 01 04 20 <32 bytes>)
  return new Uint8Array(sec1Der.subarray(7, 39));
}

/** Get or bootstrap the Quorum Key for an app (simulates enclave boot key injection). */
function getOrBootstrapQuorumKey(
  appId: string,
  operatorPubkeys?: { operatorId: string; publicKey: string }[],
  threshold?: number,
): QuorumKeyState {
  let keyState = _quorumKeyStore.get(appId);
  if (!keyState) {
    keyState = generateQuorumKey();
    // If operator pubkeys are available, generate Shamir shares and encrypt them
    if (operatorPubkeys && operatorPubkeys.length > 0 && keyState.privateKeyBytes) {
      const shares = shamirSplit(
        keyState.privateKeyBytes,
        threshold ?? Math.min(2, operatorPubkeys.length),
        operatorPubkeys.length,
      );
      keyState.encryptedShares = operatorPubkeys.map((op, i) => ({
        operatorId: op.operatorId,
        encryptedShare: eciesEncrypt(op.publicKey, Buffer.from(shares[i].data)).toString("hex"),
      }));
      console.log(`[WVC-LOCAL] Bootstrapped Quorum Key for app ${appId} (generation ${keyState.generation}) — ${shares.length} Shamir shares encrypted to operators`);
    } else {
      console.log(`[WVC-LOCAL] Bootstrapped Quorum Key for app ${appId} (generation ${keyState.generation})`);
    }
    _quorumKeyStore.set(appId, keyState);
  }
  return keyState;
}

/** Simulate key forwarding: a new replica gets the Quorum Key via ECIES (PRD §18.1). */
function forwardQuorumKey(appId: string, requesterEphemeralPubkeyHex?: string): QuorumKeyState {
  const existing = _quorumKeyStore.get(appId);
  if (!existing) {
    // No existing key — bootstrap a new one
    return getOrBootstrapQuorumKey(appId);
  }
  if (requesterEphemeralPubkeyHex) {
    // Real ECIES key forwarding: encrypt the Quorum Key private material to the
    // new replica's ephemeral public key. In production, the requesting enclave
    // would decrypt it with its ephemeral private key. Here we log the operation
    // but still return the key state directly (local sim).
    const encrypted = eciesEncrypt(requesterEphemeralPubkeyHex, Buffer.from(existing.privateKeyBytes));
    console.log(`[WVC-LOCAL] Forwarded Quorum Key to new replica for app ${appId} via ECIES (${encrypted.length} bytes ciphertext)`);
  } else {
    console.log(`[WVC-LOCAL] Forwarded Quorum Key to new replica for app ${appId}`);
  }
  return existing;
}

/** Get the Quorum Key public key for an app (for API responses). */
export function getLocalQuorumPublicKey(appId: string): string | null {
  const state = _quorumKeyStore.get(appId);
  return state ? state.publicKeyHex : null;
}

/** Rotate the Quorum Key for an app (simulates a rotation ceremony). */
export function rotateLocalQuorumKey(appId: string): QuorumKeyState {
  const old = _quorumKeyStore.get(appId);
  const newKey = generateQuorumKey();
  if (old) {
    newKey.generation = old.generation + 1;
  }
  _quorumKeyStore.set(appId, newKey);
  console.log(`[WVC-LOCAL] Rotated Quorum Key for app ${appId} (generation ${newKey.generation})`);
  return newKey;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function localProofsAllowed(): boolean {
  const envFlag = process.env.WVC_ALLOW_LOCAL_PROOFS;
  if (envFlag === "false") return false;
  return config.wvc.allowLocalProofs || envFlag === "true";
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
  stagedxDigest?: string;
  stagedxVersion?: string;
}): string {
  const pcrs = params.pcrs ?? LOCAL_PCRS;
  const timestamp = Date.now();

  const docWithoutSig: Record<string, unknown> = {
    format: "local-dev-v1" as const,
    pcrs,
    ephemeralPubkey: params.ephemeralPubkeyHex,
    timestamp,
    attestationPubkey: _attestationKey.publicKeyHex,
  };

  if (params.stagedxDigest) docWithoutSig.stagedxDigest = params.stagedxDigest;
  if (params.stagedxVersion) docWithoutSig.stagedxVersion = params.stagedxVersion;

  const canonical = JSON.stringify({
    format: docWithoutSig.format,
    pcrs: docWithoutSig.pcrs,
    ephemeralPubkey: docWithoutSig.ephemeralPubkey,
    timestamp: docWithoutSig.timestamp,
    attestationPubkey: docWithoutSig.attestationPubkey,
    ...(params.stagedxDigest ? { stagedxDigest: params.stagedxDigest } : {}),
    ...(params.stagedxVersion ? { stagedxVersion: params.stagedxVersion } : {}),
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

  // Extract operator public keys from the manifest for Shamir share generation
  const manifestJson = request.manifestJson as any;
  const operatorPubkeys = manifestJson?.operator_pubkeys as { operatorId: string; publicKey: string }[] | undefined;
  const requiredApprovals = manifestJson?.required_approvals as number | undefined;

  // Bootstrap or forward the Quorum Key (simulates §17-18 key model)
  const quorumKey = forwardQuorumKey(request.appId);

  // If this is a fresh bootstrap (no key existed), generate Shamir shares
  if (operatorPubkeys && quorumKey.encryptedShares) {
    // Already has shares from bootstrap
  } else if (operatorPubkeys && !quorumKey.encryptedShares) {
    // Key existed but shares weren't generated — generate them now
    getOrBootstrapQuorumKey(request.appId, operatorPubkeys, requiredApprovals);
  }

  const proofs = Array.from({ length: Math.max(1, request.replicaCount) }).map((_, index) => {
    const key = makeEphemeralKey();
    return {
      manifestId: request.manifestId,
      attestationDoc: buildLocalAttestation({
        ephemeralPubkeyHex: key.publicKeyHex,
        stagedxDigest: request.stagedxDigest,
        stagedxVersion: request.stagedxVersion,
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
    quorumPublicKey: quorumKey.publicKeyHex,
    quorumKeyGeneration: quorumKey.generation,
    encryptedShares: quorumKey.encryptedShares,
  };
}

export async function invokeLocalDeployment(
  deploymentId: string,
  _manifestHash: string,
  request: InvokeRequest,
  stagedxDigest?: string,
  stagedxVersion?: string,
): Promise<InvokeResult> {
  assertLocalProofsAllowed();

  const key = makeEphemeralKey();
  const result = buildDemoResult(deploymentId, request);

  // Compute the payload hash over the result (what the enclave "attests to")
  const payloadHash = computePayloadHash(request.payloadType, JSON.stringify(result));
  const signature = signPayloadHash(key.privateKeyPem, payloadHash);
  const attestationDoc = buildLocalAttestation({
    ephemeralPubkeyHex: key.publicKeyHex,
    stagedxDigest,
    stagedxVersion,
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
    const randomWallet = Wallet.createRandom();
    return {
      seedId: `local-seed-${seedHash.slice(0, 16)}`,
      derivedAddress: randomWallet.address,
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
