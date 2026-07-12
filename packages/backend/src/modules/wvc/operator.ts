/**
 * WVC Operator signature verification (PRD §13).
 *
 * Operators generate P256 keypairs locally (ideally on a hardware token). Only
 * the public key is stored on the server. When an operator approves a manifest,
 * they sign the manifest hash locally and submit `{operator_id, signature}`.
 * The server independently verifies the signature against the stored public key
 * and its own recomputed manifest hash.
 *
 * Node's crypto.verify supports ECDSA P-256 verification. We accept both
 * IEEE-P1363 (raw r||s) and DER-encoded signatures, trying DER first then P1363.
 */

import { createVerify, createPublicKey, createSign, generateKeyPairSync, type KeyObject } from "crypto";

/**
 * Verify an operator's P256 signature over a manifest hash.
 *
 * @param publicKeyPem  Operator's public key in PEM form (stored in wvc_operators.public_key)
 * @param manifestHash  The canonical manifest hash string (e.g. "sha256:abc123...")
 * @param signatureHex  The operator's signature as a hex string
 * @returns true if the signature is valid
 */
export function verifyOperatorSignature(
  publicKeyPem: string,
  manifestHash: string,
  signatureHex: string,
): boolean {
  let data: Uint8Array;
  let sig: Uint8Array;
  try {
    data = hashToBytes(manifestHash);
    sig = hexToBytes(signatureHex);
  } catch {
    return false;
  }

  // Try DER-encoded ECDSA first (default Node encoding), then IEEE-P1363 (raw r||s).
  for (const dsaEncoding of ["der", "ieee-p1363"] as const) {
    try {
      const verifier = createVerify("SHA256");
      verifier.update(Buffer.from(data));
      if (verifier.verify({ key: publicKeyPem, dsaEncoding }, Buffer.from(sig))) {
        return true;
      }
    } catch {
      // try next encoding
    }
  }
  return false;
}

/**
 * Convert a stored public key string to PEM. Accepts PEM directly, or hex SEC1
 * uncompressed point (0x04 + X + Y), or hex SPKI DER.
 */
export function normalizePublicKey(key: string): string {
  if (key.includes("BEGIN") || key.includes("-----")) return key;
  const trimmed = key.replace(/^0x/i, "").replace(/\s/g, "").trim();
  // Bare base64 SPKI DER body (no PEM headers) — wrap with PEM markers
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 20) {
    const der = Buffer.from(trimmed, "base64");
    return createPublicKey({ key: der, format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
  }
  // Heuristic: SEC1 uncompressed point for P-256 is 65 bytes (130 hex chars).
  if (trimmed.length === 130 && trimmed.startsWith("04")) {
    const der = Buffer.from(trimmed, "hex");
    return createPublicKey({ key: der, format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
  }
  // Assume SPKI DER hex otherwise.
  const der = Buffer.from(trimmed, "hex");
  return createPublicKey({ key: der, format: "der", type: "spki" }).export({ format: "pem", type: "spki" }).toString();
}

/**
 * Generate a P256 keypair (for testing / CLI bootstrap). In production,
 * operators generate keys locally — the server NEVER holds private keys.
 */
export function generateOperatorKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

/**
 * Sign data with an operator's P256 private key (used by the CLI).
 * Returns a hex signature in IEEE-P1363 (raw r||s) format.
 */
export function signWithOperatorKey(privateKeyPem: string, manifestHash: string): string {
  const data = hashToBytes(manifestHash);
  const signer = createSign("SHA256");
  signer.update(Buffer.from(data));
  const sig = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  return Buffer.from(sig).toString("hex");
}

function hashToBytes(manifestHash: string): Uint8Array {
  const hex = manifestHash.replace(/^sha256:/i, "").replace(/^0x/i, "").trim();
  return hexToBytes(hex);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").replace(/\s/g, "");
  if (clean.length % 2 !== 0) throw new Error("invalid hex signature length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export type { KeyObject };
