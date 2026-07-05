/**
 * COSE_Sign1 (RFC 8152) decoder and signature verifier.
 *
 * An AWS Nitro attestation document is a COSE_Sign1 tagged (tag 18) structure:
 *   [protected_header (bstr), unprotected_header (map), payload (bstr), signature (bstr)]
 *
 * The signature is computed over the "Sig_structure":
 *   ["Signature1", body_protected, external_aad, payload]
 * CBOR-encoded and signed with the attestation certificate's private key.
 */

import { createVerify } from "crypto";
import { decodeCbor, encodeCbor, mapGet, type CborValue } from "./cbor.js";

export interface CoseSign1 {
  protectedHeader: Uint8Array;
  unprotectedHeader: Map<CborValue, CborValue>;
  payload: Uint8Array;
  signature: Uint8Array;
}

interface TaggedValue {
  tag: number;
  value: CborValue;
}

/**
 * Decode a COSE_Sign1 structure from raw bytes.
 * Accepts both tagged (tag 18) and untagged forms.
 */
export function decodeCoseSign1(input: Uint8Array): CoseSign1 {
  const { value } = decodeCbor(input);

  let tagged = value as TaggedValue | CborValue[];
  if (typeof tagged === "object" && tagged !== null && !Array.isArray(tagged) && !(tagged instanceof Map) && !(tagged instanceof Uint8Array) && "tag" in (tagged as any)) {
    tagged = (tagged as TaggedValue).value as CborValue[];
  }

  if (!Array.isArray(tagged)) {
    throw new Error("COSE_Sign1: expected array or tagged array");
  }

  const arr = tagged as CborValue[];
  if (arr.length < 4) {
    throw new Error("COSE_Sign1: expected at least 4 elements, got " + arr.length);
  }

  const protectedHeader = asBytes(arr[0], "protected header");
  const unprotectedHeader = asMap(arr[1], "unprotected header");
  const payload = asBytes(arr[2], "payload");
  const signature = asBytes(arr[3], "signature");

  return { protectedHeader, unprotectedHeader, payload, signature };
}

/**
 * Build the Sig_structure and verify the COSE_Sign1 signature using the given public key.
 *
 * AWS Nitro uses ECDSA with P-384 and SHA-384 by default. The algorithm is read
 * from the protected header (COSE label 1) when available; otherwise SHA-384 is assumed.
 */
export function verifyCoseSignature(cose: CoseSign1, publicKeyPem: string): boolean {
  const sigStructure = encodeCbor([
    "Signature1",
    cose.protectedHeader,
    new Uint8Array(0),
    cose.payload,
  ]);

  const alg = readAlgorithm(cose.protectedHeader);
  const hashAlgorithm = algToHash(alg);

  const verifier = createVerify(hashAlgorithm);
  verifier.update(Buffer.from(sigStructure));
  return verifier.verify(
    { key: publicKeyPem, dsaEncoding: "ieee-p1363" },
    Buffer.from(cose.signature),
  );
}

function readAlgorithm(protectedHeaderBytes: Uint8Array): number | undefined {
  if (protectedHeaderBytes.length === 0) return undefined;
  const { value } = decodeCbor(protectedHeaderBytes);
  if (value instanceof Map) {
    const alg = mapGet(value, 1);
    if (typeof alg === "number") return alg;
  }
  return undefined;
}

/** COSE algorithm label -> Node hash algorithm name. */
function algToHash(alg: number | undefined): string {
  // -35: ES384 (ECDSA w/ P-384, SHA-384) — AWS Nitro default
  // -7:  ES256 (ECDSA w/ P-256, SHA-256)
  // -36: ES512
  if (alg === -7) return "SHA256";
  if (alg === -36) return "SHA512";
  return "SHA384";
}

function asBytes(v: CborValue, ctx: string): Uint8Array {
  if (v instanceof Uint8Array) return v;
  throw new Error(`COSE_Sign1: ${ctx} must be a byte string`);
}

function asMap(v: CborValue, ctx: string): Map<CborValue, CborValue> {
  if (v instanceof Map) return v;
  if (v === undefined || v === null) return new Map();
  throw new Error(`COSE_Sign1: ${ctx} must be a map`);
}
