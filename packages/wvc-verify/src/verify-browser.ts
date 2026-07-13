/**
 * Browser-compatible WVC Proof Verification (local-dev-v1 only).
 *
 * Uses the Web Crypto API instead of Node's `crypto` module.
 * Only supports local-dev-v1 proofs (no X.509 chain verification needed).
 * For production Nitro proofs, use the Node.js entry point.
 */

import type {
  AppProofBundle,
  BootProofBundle,
  ExpectedPcrs,
  VerificationResult,
  VerifyOptions,
  LocalAttestationDoc,
} from "./types.js";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

// ─── Web Crypto helpers ──────────────────────────────────────────────────────

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

/**
 * Convert IEEE-P1363 signature (r||s, raw 64 bytes for P-256) to DER-encoded
 * signature, which is what Web Crypto's subtle.verify expects.
 */
function p1363ToDer(sigHex: string): Uint8Array {
  const sig = hexToBytes(sigHex);
  if (sig.length !== 64) throw new Error("P-256 P1363 signature must be 64 bytes");

  const r = sig.slice(0, 32);
  const s = sig.slice(32, 64);

  // Encode each integer as DER INTEGER (prepend 0x00 if high bit set, strip leading zeros)
  function encodeInt(n: Uint8Array): Uint8Array {
    let start = 0;
    while (start < n.length - 1 && n[start] === 0) start++;
    let trimmed = n.slice(start);
    if (trimmed[0] & 0x80) {
      const padded = new Uint8Array(trimmed.length + 1);
      padded.set(trimmed, 1);
      trimmed = padded;
    }
    const der = new Uint8Array(trimmed.length + 2);
    der[0] = 0x02; // INTEGER tag
    der[1] = trimmed.length;
    der.set(trimmed, 2);
    return der;
  }

  const rDer = encodeInt(r);
  const sDer = encodeInt(s);

  const bodyLen = rDer.length + sDer.length;
  const der = new Uint8Array(bodyLen + 2);
  der[0] = 0x30; // SEQUENCE tag
  der[1] = bodyLen;
  der.set(rDer, 2);
  der.set(sDer, 2 + rDer.length);
  return der;
}

/** Import a raw SEC1 uncompressed P-256 public key (04 + X + Y) as a Web Crypto key. */
async function importP256Key(pubkeyHex: string): Promise<CryptoKey> {
  const hex = normalizePubkey(pubkeyHex);
  if (!hex.startsWith("04") || hex.length !== 130) {
    throw new Error("Expected raw SEC1 uncompressed P-256 key (04 + X + Y, 130 hex chars)");
  }
  const keyBytes = hexToBytes(hex);
  return crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

/** Verify a P-256 ECDSA signature using Web Crypto. */
async function verifyEcdsa(
  pubkeyHex: string,
  data: Uint8Array,
  signatureHex: string,
): Promise<boolean> {
  try {
    const key = await importP256Key(pubkeyHex);
    const derSig = p1363ToDer(signatureHex.replace(/^0x/i, ""));
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      derSig as BufferSource,
      data as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Verify a P-256 ECDSA signature over a raw 32-byte hash using Web Crypto. */
async function verifyEcdsaRawHash(
  pubkeyHex: string,
  rawHashHex: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    const key = await importP256Key(pubkeyHex);
    const derSig = p1363ToDer(signatureHex.replace(/^0x/i, ""));
    const data = hexToBytes(rawHashHex);
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      derSig as BufferSource,
      data as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Canonicalize a local attestation doc (without signature) for verification. */
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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Verify a local-dev-v1 App Proof in the browser using Web Crypto.
 *
 * Same 6-step verification as the Node.js version, but using
 * `crypto.subtle.verify` instead of `crypto.createVerify`.
 */
export async function verifyLocalAppProofBrowser(
  proof: AppProofBundle,
  expectedPcrs: ExpectedPcrs,
  options?: VerifyOptions,
): Promise<VerificationResult> {
  const maxAgeMs = options?.maxAgeMs ?? 60 * 60 * 1000;

  let doc: LocalAttestationDoc;
  try {
    const json = new TextDecoder().decode(base64ToBytes(proof.attestationDoc));
    doc = JSON.parse(json);
  } catch {
    return invalid("local proof: attestation doc is not valid base64 JSON");
  }

  if (doc.format !== "local-dev-v1") {
    return invalid(`local proof: unsupported format "${doc.format}"`);
  }

  // Step 2: verify the attestation's self-signature.
  const { signature, ...rest } = doc;
  const canonical = canonicalizeLocalDoc(rest);
  const attestationValid = await verifyEcdsa(
    doc.attestationPubkey,
    new TextEncoder().encode(canonical),
    signature,
  );
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
  const rawHash = normalizeHash(proof.payloadHash);
  const payloadValid = await verifyEcdsaRawHash(
    proof.ephemeralPubkey,
    rawHash,
    proof.signature,
  );
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
 * Verify a local-dev-v1 Boot Proof in the browser.
 */
export async function verifyLocalBootProofBrowser(
  proof: BootProofBundle,
  expectedPcrs: ExpectedPcrs,
  options?: { maxAgeMs?: number; expectedManifestHash?: string; expectedStagexDigest?: string },
): Promise<VerificationResult> {
  const maxAgeMs = options?.maxAgeMs ?? 60 * 60 * 1000;

  let doc: LocalAttestationDoc;
  try {
    const json = new TextDecoder().decode(base64ToBytes(proof.attestationDoc));
    doc = JSON.parse(json);
  } catch {
    return invalid("local boot proof: attestation doc is not valid base64 JSON");
  }

  if (doc.format !== "local-dev-v1") {
    return invalid(`local boot proof: unsupported format "${doc.format}"`);
  }

  const { signature, ...rest } = doc;
  const canonical = canonicalizeLocalDoc(rest);
  const attestationValid = await verifyEcdsa(
    doc.attestationPubkey,
    new TextEncoder().encode(canonical),
    signature,
  );
  if (!attestationValid) {
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
    const expected = normalizeHash(options.expectedManifestHash);
    const actual = normalizeHash(proof.manifestHash);
    if (expected !== actual) {
      return invalid("local boot proof: manifest hash mismatch");
    }
  }

  if (options?.expectedStagexDigest) {
    if (!doc.stagedxDigest) {
      return invalid("local boot proof: StageX digest expected but not present in attestation");
    }
    if (doc.stagedxDigest !== options.expectedStagexDigest) {
      return invalid(`local boot proof: StageX digest mismatch`);
    }
  }

  return { valid: true, pcrs: doc.pcrs, signedAt: doc.timestamp };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function invalid(reason: string): VerificationResult {
  return { valid: false, reason };
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
