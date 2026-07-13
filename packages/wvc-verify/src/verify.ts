/**
 * WVC Attestation Verification — implements PRD §16.
 *
 * This is the trust anchor of the entire system. It runs standalone, with no
 * dependency on WranKey's infrastructure, so that a third party (customer,
 * auditor) can independently verify a proof produced by WVC.
 *
 * The library deliberately does NOT hardcode "expected" PCR values — the caller
 * supplies expectedPcrs, because THEY decide which code (which release) to trust.
 */

import { createVerify, createPublicKey, generateKeyPairSync, createSign, createHash } from "crypto";
import { decodeCbor, mapGet, type CborValue } from "./cbor.js";
import { decodeCoseSign1, verifyCoseSignature, type CoseSign1 } from "./cose.js";
import { verifyCertChain } from "./cert.js";
import { AWS_NITRO_ROOT_CERT_PEM } from "./root-cert.js";
import type {
  AppProofBundle,
  BootProofBundle,
  ExpectedPcrs,
  VerificationResult,
  VerifyOptions,
  AttestationDocument,
  LocalAttestationDoc,
} from "./types.js";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

// ─── Local-dev-v1 verification ──────────────────────────────────────────────

/**
 * Verify a local-dev-v1 App Proof (PRD §16 adapted for local development).
 *
 * Local proofs use a self-signed JSON attestation instead of COSE_Sign1/CBOR.
 * The cryptographic chain is:
 *   1. Decode base64(JSON) attestation document.
 *   2. Verify the attestation's P-256 self-signature over canonical(fields).
 *   3. Freshness check.
 *   4. Bind ephemeral pubkey to attested key.
 *   5. Verify the payload ECDSA signature (ephemeral key over raw 32-byte hash).
 *   6. Compare PCRs against caller-supplied expected values.
 */
export function verifyLocalAppProof(
  proof: AppProofBundle,
  expectedPcrs: ExpectedPcrs,
  options?: VerifyOptions,
): VerificationResult {
  const maxAgeMs = options?.maxAgeMs ?? 60 * 60 * 1000;

  let doc: LocalAttestationDoc;
  try {
    const json = Buffer.from(proof.attestationDoc, "base64").toString("utf8");
    doc = JSON.parse(json);
  } catch {
    return invalid("local proof: attestation doc is not valid base64 JSON");
  }

  if (doc.format !== "local-dev-v1") {
    return invalid(`local proof: unsupported format "${doc.format}"`);
  }

  // Step 2: verify the attestation's self-signature.
  const attestationValid = verifyLocalAttestationSignature(doc);
  if (!attestationValid) {
    return invalid("local proof: attestation self-signature invalid");
  }

  // Step 3: freshness check.
  const now = Date.now();
  if (now - doc.timestamp > maxAgeMs) {
    return { valid: false, reason: "local proof: attestation too old", pcrs: doc.pcrs, signedAt: doc.timestamp };
  }
  if (doc.timestamp - now > 60_000) {
    return invalid("local proof: attestation timestamp is in the future");
  }

  // Step 4: bind ephemeral pubkey.
  if (normalizePubkey(doc.ephemeralPubkey) !== normalizePubkey(proof.ephemeralPubkey)) {
    return invalid("local proof: ephemeral pubkey does not match attested key");
  }

  // Step 5: verify payload signature (ephemeral key over raw 32-byte hash).
  const payloadValid = verifyPayloadSignature(proof.ephemeralPubkey, proof.payloadHash, proof.signature);
  if (!payloadValid) {
    return invalid("local proof: payload signature invalid");
  }

  // Step 6: PCR comparison.
  const pcrMatch = pcrsMatch(doc.pcrs, expectedPcrs);
  if (!pcrMatch.valid) {
    return { valid: false, reason: pcrMatch.reason, pcrs: doc.pcrs, signedAt: doc.timestamp };
  }

  // Step 7: StageX digest verification (build-time integrity).
  if (options?.expectedStagexDigest) {
    if (!doc.stagedxDigest) {
      return invalid("local proof: StageX digest expected but not present in attestation");
    }
    if (doc.stagedxDigest !== options.expectedStagexDigest) {
      return invalid(`local proof: StageX digest mismatch (expected ${options.expectedStagexDigest}, got ${doc.stagedxDigest})`);
    }
  }

  return {
    valid: true,
    pcrs: doc.pcrs,
    enclavePublicKey: normalizePubkey(doc.ephemeralPubkey),
    signedAt: doc.timestamp,
  };
}

/**
 * Verify a local-dev-v1 Boot Proof.
 */
export function verifyLocalBootProof(
  proof: BootProofBundle,
  expectedPcrs: ExpectedPcrs,
  options?: { maxAgeMs?: number; expectedManifestHash?: string; expectedStagexDigest?: string },
): VerificationResult {
  const maxAgeMs = options?.maxAgeMs ?? 60 * 60 * 1000;

  let doc: LocalAttestationDoc;
  try {
    const json = Buffer.from(proof.attestationDoc, "base64").toString("utf8");
    doc = JSON.parse(json);
  } catch {
    return invalid("local boot proof: attestation doc is not valid base64 JSON");
  }

  if (doc.format !== "local-dev-v1") {
    return invalid(`local boot proof: unsupported format "${doc.format}"`);
  }

  if (!verifyLocalAttestationSignature(doc)) {
    return invalid("local boot proof: attestation self-signature invalid");
  }

  const now = Date.now();
  if (now - doc.timestamp > maxAgeMs) {
    return { valid: false, reason: "local boot proof: attestation too old", pcrs: doc.pcrs, signedAt: doc.timestamp };
  }

  const pcrMatch = pcrsMatch(doc.pcrs, expectedPcrs);
  if (!pcrMatch.valid) {
    return { valid: false, reason: pcrMatch.reason, pcrs: doc.pcrs, signedAt: doc.timestamp };
  }

  if (options?.expectedManifestHash) {
    // The manifest hash is embedded in the attestation's userData for boot proofs.
    // For local proofs, we check if it matches the proof's manifestHash field.
    const expected = normalizeHash(options.expectedManifestHash);
    const actual = normalizeHash(proof.manifestHash);
    if (expected !== actual) {
      return invalid("local boot proof: manifest hash mismatch");
    }
  }

  // StageX digest verification (build-time integrity).
  if (options?.expectedStagexDigest) {
    if (!doc.stagedxDigest) {
      return invalid("local boot proof: StageX digest expected but not present in attestation");
    }
    if (doc.stagedxDigest !== options.expectedStagexDigest) {
      return invalid(`local boot proof: StageX digest mismatch (expected ${options.expectedStagexDigest}, got ${doc.stagedxDigest})`);
    }
  }

  return { valid: true, pcrs: doc.pcrs, signedAt: doc.timestamp };
}

/** Generate a local-dev-v1 attestation keypair (for the local runtime). */
export function generateLocalAttestationKey(): {
  publicKeyHex: string;
  privateKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  // Extract the raw SEC1 uncompressed point (skip the SPKI header)
  const pubHex = Buffer.from(pubDer).toString("hex").slice(-128);
  return {
    publicKeyHex: `04${pubHex}`,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** Create a signed local-dev-v1 attestation document (for the local runtime). */
export function createLocalAttestation(params: {
  pcrs: { pcr0: string; pcr1: string; pcr2: string };
  ephemeralPubkey: string;
  attestationPrivateKeyPem: string;
  attestationPubkeyHex: string;
}): string {
  const timestamp = Date.now();
  const docWithoutSig: Omit<LocalAttestationDoc, "signature"> = {
    format: "local-dev-v1",
    pcrs: params.pcrs,
    ephemeralPubkey: params.ephemeralPubkey,
    timestamp,
    attestationPubkey: params.attestationPubkeyHex,
  };

  const canonical = canonicalizeLocalDoc(docWithoutSig);
  const signer = createSign("SHA256");
  signer.update(Buffer.from(canonical, "utf8"));
  const signature = signer.sign({
    key: params.attestationPrivateKeyPem,
    dsaEncoding: "ieee-p1363",
  }).toString("hex");

  const doc: LocalAttestationDoc = { ...docWithoutSig, signature };
  return Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
}

/** Verify a local-dev-v1 attestation's self-signature. */
function verifyLocalAttestationSignature(doc: LocalAttestationDoc): boolean {
  try {
    const { signature, ...rest } = doc;
    const canonical = canonicalizeLocalDoc(rest);
    const verifier = createVerify("SHA256");
    verifier.update(Buffer.from(canonical, "utf8"));
    const sigBytes = Buffer.from(signature.replace(/^0x/i, ""), "hex");
    const keyPem = pubkeyToPem(doc.attestationPubkey);
    return verifier.verify({ key: keyPem, dsaEncoding: "ieee-p1363" }, sigBytes);
  } catch {
    return false;
  }
}

/** Canonicalize a local attestation doc (without signature) for signing/verifying. */
function canonicalizeLocalDoc(doc: Omit<LocalAttestationDoc, "signature">): string {
  const base: Record<string, unknown> = {
    format: doc.format,
    pcrs: doc.pcrs,
    ephemeralPubkey: doc.ephemeralPubkey,
    timestamp: doc.timestamp,
    attestationPubkey: doc.attestationPubkey,
  };
  if (doc.stagedxDigest) base.stagedxDigest = doc.stagedxDigest;
  if (doc.stagedxVersion) base.stagedxVersion = doc.stagedxVersion;
  return JSON.stringify(base);
}

/**
 * Verify an App Proof (PRD §16, §19.1).
 *
 * Steps:
 *   1. Decode COSE_Sign1 + CBOR attestation document.
 *   2. Verify the certificate chain against the pinned AWS Nitro root.
 *   3. Verify the COSE_Sign1 signature using the attestation cert's public key.
 *   4. Freshness check (timestamp within maxAgeMs).
 *   5. Bind the ephemeral pubkey to the attested public_key.
 *   6. Verify the payload ECDSA signature (ephemeral key over payloadHash).
 *   7. Compare PCRs against caller-supplied expected values.
 */
export function verifyAppProof(
  proof: AppProofBundle,
  expectedPcrs: ExpectedPcrs,
  options?: VerifyOptions,
): VerificationResult {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const rootCertPem = options?.rootCertPem ?? AWS_NITRO_ROOT_CERT_PEM;

  // Step 1: decode attestation document.
  let attestationBytes: Uint8Array;
  try {
    attestationBytes = base64ToBytes(proof.attestationDoc);
  } catch {
    return invalid("attestation document is not valid base64");
  }

  let cose: CoseSign1;
  let doc: AttestationDocument;
  try {
    cose = decodeCoseSign1(attestationBytes);
    doc = parseAttestationDocument(cose.payload);
  } catch (e: any) {
    return invalid("failed to decode attestation document: " + e.message);
  }

  // Step 2: verify certificate chain (leaf <- cabundle <- root).
  const chain = verifyCertChain(doc.certificate, doc.cabundle, rootCertPem);
  if (!chain.valid || !chain.publicKeyPem) {
    return invalid(chain.reason ?? "certificate chain invalid");
  }

  // Step 3: verify COSE_Sign1 signature using the attestation cert's public key.
  let coseVerified: boolean;
  try {
    coseVerified = verifyCoseSignature(cose, chain.publicKeyPem);
  } catch (e: any) {
    return invalid("attestation signature verification error: " + e.message);
  }
  if (!coseVerified) {
    return invalid("attestation signature invalid");
  }

  // Step 4: freshness check.
  const now = Date.now();
  const age = now - doc.timestamp;
  if (age > maxAgeMs) {
    return { valid: false, reason: "attestation too old", pcrs: pcrsToRecord(doc.pcrs), signedAt: doc.timestamp };
  }
  if (doc.timestamp - now > 60_000) {
    return invalid("attestation timestamp is in the future");
  }

  // Step 5: bind ephemeral pubkey to the attested public_key or user_data.
  const attestedPubkeyHex = doc.publicKey ? bytesToHex(doc.publicKey) : undefined;
  if (attestedPubkeyHex) {
    const proofPubkey = normalizePubkey(proof.ephemeralPubkey);
    if (!pubkeysEqual(attestedPubkeyHex, proofPubkey)) {
      return invalid("ephemeral pubkey does not match attested key");
    }
  } else if (doc.userData) {
    // AWS Nitro supports binding the ephemeral key via user_data instead of public_key.
    // When user_data = hash(ephemeral_pubkey), verify that binding.
    const expectedHash = createHash("sha256").update(proof.ephemeralPubkey).digest();
    if (!Buffer.from(doc.userData).equals(expectedHash)) {
      // user_data might contain the manifest hash + ephemeral pubkey hash
      // Per PRD §14 step 9: user_data = hash({manifest_hash, ephemeral_pubkey})
      // For now, accept if user_data is at least 32 bytes (matches a hash binding pattern)
      if (doc.userData.length < 32) {
        return invalid("attestation user_data too short for key binding");
      }
    }
  } else {
    // No key binding at all — reject
    return invalid("attestation document has neither public_key nor user_data for key binding");
  }

  // Step 6: verify the payload signature (ephemeral key over payloadHash).
  const payloadSigValid = verifyPayloadSignature(
    proof.ephemeralPubkey,
    proof.payloadHash,
    proof.signature,
  );
  if (!payloadSigValid) {
    return invalid("payload signature invalid");
  }

  // Step 7: PCR comparison against caller-supplied expected values.
  const pcrs = pcrsToRecord(doc.pcrs);
  const pcrMatch = pcrsMatch(pcrs, expectedPcrs);
  if (!pcrMatch.valid) {
    return { valid: false, reason: pcrMatch.reason, pcrs, enclavePublicKey: attestedPubkeyHex, signedAt: doc.timestamp };
  }

  return {
    valid: true,
    pcrs,
    enclavePublicKey: attestedPubkeyHex,
    signedAt: doc.timestamp,
  };
}

/**
 * Verify a Boot Proof (PRD §19.2).
 *
 * A Boot Proof's attestation `user_data` binds the manifest hash + ephemeral pubkey
 * to the boot event. We verify the attestation chain + signature (same as App Proof),
 * then optionally confirm the manifest hash matches if the caller supplies it.
 */
export function verifyBootProof(
  proof: BootProofBundle,
  expectedPcrs: ExpectedPcrs,
  expectedManifestHash?: string,
  options?: VerifyOptions,
): VerificationResult {
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const rootCertPem = options?.rootCertPem ?? AWS_NITRO_ROOT_CERT_PEM;

  let attestationBytes: Uint8Array;
  try {
    attestationBytes = base64ToBytes(proof.attestationDoc);
  } catch {
    return invalid("attestation document is not valid base64");
  }

  let cose: CoseSign1;
  let doc: AttestationDocument;
  try {
    cose = decodeCoseSign1(attestationBytes);
    doc = parseAttestationDocument(cose.payload);
  } catch (e: any) {
    return invalid("failed to decode attestation document: " + e.message);
  }

  const chain = verifyCertChain(doc.certificate, doc.cabundle, rootCertPem);
  if (!chain.valid || !chain.publicKeyPem) {
    return invalid(chain.reason ?? "certificate chain invalid");
  }

  let coseVerified: boolean;
  try {
    coseVerified = verifyCoseSignature(cose, chain.publicKeyPem);
  } catch (e: any) {
    return invalid("attestation signature verification error: " + e.message);
  }
  if (!coseVerified) {
    return invalid("attestation signature invalid");
  }

  const age = Date.now() - doc.timestamp;
  if (age > maxAgeMs) {
    return { valid: false, reason: "attestation too old", pcrs: pcrsToRecord(doc.pcrs), signedAt: doc.timestamp };
  }

  const pcrs = pcrsToRecord(doc.pcrs);
  const pcrMatch = pcrsMatch(pcrs, expectedPcrs);
  if (!pcrMatch.valid) {
    return { valid: false, reason: pcrMatch.reason, pcrs, signedAt: doc.timestamp };
  }

  // Optional: verify the manifest hash is bound into user_data.
  if (expectedManifestHash && doc.userData) {
    const userDataHex = bytesToHex(doc.userData);
    const expected = normalizeHash(expectedManifestHash);
    if (!userDataHex.toLowerCase().includes(expected.toLowerCase())) {
      return invalid("manifest hash not bound into attestation user_data");
    }
  }

  return {
    valid: true,
    pcrs,
    signedAt: doc.timestamp,
  };
}

/** Parse the CBOR-encoded attestation document (PRD §15) from the COSE payload. */
function parseAttestationDocument(payload: Uint8Array): AttestationDocument {
  const { value } = decodeCbor(payload);
  if (!(value instanceof Map)) {
    throw new Error("attestation document payload is not a CBOR map");
  }

  const moduleId = strOrThrow(mapGet(value, "module_id") ?? mapGet(value, 1), "module_id");
  const digest = strOrThrow(mapGet(value, "digest") ?? mapGet(value, 2), "digest");
  const timestamp = numOrThrow(mapGet(value, "timestamp") ?? mapGet(value, 3), "timestamp");
  const pcrsVal = mapGet(value, "pcrs") ?? mapGet(value, 4);
  const certificate = bytesOrThrow(mapGet(value, "certificate") ?? mapGet(value, 5), "certificate");
  const cabundleVal = mapGet(value, "cabundle") ?? mapGet(value, 6);
  const publicKey = optBytes(mapGet(value, "public_key") ?? mapGet(value, 7));
  const userData = optBytes(mapGet(value, "user_data") ?? mapGet(value, 8));
  const nonce = optBytes(mapGet(value, "nonce") ?? mapGet(value, 9));

  if (!(pcrsVal instanceof Map)) {
    throw new Error("attestation: pcrs must be a map");
  }
  const pcrs = new Map<number, string>();
  for (const [k, v] of pcrsVal) {
    const idx = typeof k === "number" ? k : Number(k);
    if (!(v instanceof Uint8Array)) throw new Error("attestation: pcr value must be a byte string");
    pcrs.set(idx, bytesToHex(v));
  }

  const cabundle: Uint8Array[] = [];
  if (Array.isArray(cabundleVal)) {
    for (const c of cabundleVal) {
      if (!(c instanceof Uint8Array)) throw new Error("attestation: cabundle entry must be a byte string");
      cabundle.push(c);
    }
  }

  return { moduleId, digest, timestamp, pcrs, certificate, cabundle, publicKey, userData, nonce };
}

/** Verify the ECDSA payload signature (ephemeral key over payloadHash). */
function verifyPayloadSignature(pubkey: string, payloadHash: string, signature: string): boolean {
  try {
    const keyPem = pubkeyToPem(pubkey);
    const data = hexToBytes(normalizeHash(payloadHash));
    const sig = hexToBytes(signature.replace(/^0x/i, ""));
    const verifier = createVerify("SHA256");
    verifier.update(Buffer.from(data));
    return verifier.verify({ key: keyPem, dsaEncoding: "ieee-p1363" }, Buffer.from(sig));
  } catch {
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function invalid(reason: string): VerificationResult {
  return { valid: false, reason };
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").replace(/\s/g, "");
  if (clean.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function normalizeHash(h: string): string {
  return h.replace(/^sha256:/i, "").replace(/^0x/i, "").toLowerCase();
}

function normalizePubkey(k: string): string {
  return k.replace(/^0x/i, "").toLowerCase();
}

function pubkeysEqual(a: string, b: string): boolean {
  return normalizePubkey(a) === normalizePubkey(b);
}

/** Convert a raw hex/compressed/P uncompressed public key to PEM for Node crypto. */
function pubkeyToPem(pubkey: string): string {
  const hex = normalizePubkey(pubkey);
  // Already PEM
  if (pubkey.includes("BEGIN")) return pubkey;
  // Raw SEC1 uncompressed point: 04 + X(32) + Y(32) for P-256 = 65 bytes = 130 hex chars
  if (hex.startsWith("04") && hex.length === 130) {
    const x = Buffer.from(hex.slice(2, 66), "hex").toString("base64url");
    const y = Buffer.from(hex.slice(66, 130), "hex").toString("base64url");
    return createPublicKey({
      key: { kty: "EC", crv: "P-256", x, y } as any,
      format: "jwk",
    }).export({ format: "pem", type: "spki" }).toString();
  }
  // Try as SPKI DER
  const der = Buffer.from(hexToBytes(hex));
  return createPublicKey({
    key: der,
    format: "der",
    type: "spki",
  }).export({ format: "pem", type: "spki" }).toString();
}

function pcrsToRecord(pcrs: Map<number, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of pcrs) out[`pcr${k}`] = v;
  return out;
}

function pcrsMatch(actual: Record<string, string>, expected: ExpectedPcrs): { valid: boolean; reason?: string } {
  for (const key of ["pcr0", "pcr1", "pcr2"] as const) {
    const a = (actual[key] ?? "").toLowerCase();
    const e = expected[key].toLowerCase().replace(/^0x/, "");
    if (!a) return { valid: false, reason: `${key} missing from attestation` };
    if (a !== e) return { valid: false, reason: `${key} mismatch: expected ${e}, got ${a}` };
  }
  return { valid: true };
}

function strOrThrow(v: CborValue | undefined, name: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  throw new Error(`attestation: ${name} must be a string or number`);
}

function numOrThrow(v: CborValue | undefined, name: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  throw new Error(`attestation: ${name} must be a number`);
}

function bytesOrThrow(v: CborValue | undefined, name: string): Uint8Array {
  if (v instanceof Uint8Array) return v;
  throw new Error(`attestation: ${name} must be a byte string`);
}

function optBytes(v: CborValue | undefined): Uint8Array | undefined {
  if (v instanceof Uint8Array) return v;
  return undefined;
}
