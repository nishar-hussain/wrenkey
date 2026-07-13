/**
 * WVC Crypto utilities — Shamir Secret Sharing and ECIES for the backend.
 *
 * Used during Quorum Key bootstrap to split the key into shares and encrypt
 * each share to an operator's public key (PRD §18.4).
 */

import {
  createECDH,
  createHmac,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  createPrivateKey,
  randomBytes,
} from "crypto";

// ─── Shamir Secret Sharing over GF(256) ──────────────────────────────────────

/** GF(256) multiplication using the AES polynomial (x^8 + x^4 + x^3 + x + 1 = 0x11b) */
function gf256Mul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

/** GF(256) inverse using brute force */
function gf256Inv(a: number): number {
  if (a === 0) return 0;
  for (let i = 1; i < 256; i++) {
    if (gf256Mul(a, i) === 1) return i;
  }
  return 0;
}

export interface ShamirShare {
  index: number;
  data: Uint8Array;
}

/** Split a 32-byte secret into N shares with threshold K. */
export function shamirSplit(secret: Uint8Array, threshold: number, total: number): ShamirShare[] {
  if (threshold <= 0 || threshold > total) throw new Error("Invalid threshold");
  if (secret.length !== 32) throw new Error("Secret must be 32 bytes");

  const coeffs: Uint8Array[] = [secret];
  for (let i = 1; i < threshold; i++) {
    coeffs.push(Uint8Array.from(randomBytes(32)));
  }

  const shares: ShamirShare[] = [];
  for (let x = 1; x <= total; x++) {
    const y = new Uint8Array(32);
    for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
      let acc = coeffs[threshold - 1][byteIdx];
      for (let d = threshold - 2; d >= 0; d--) {
        acc = gf256Mul(acc, x) ^ coeffs[d][byteIdx];
      }
      y[byteIdx] = acc;
    }
    shares.push({ index: x, data: y });
  }
  return shares;
}

/** Reconstruct the secret from at least `threshold` shares. */
export function shamirRecover(shares: ShamirShare[]): Uint8Array | null {
  if (shares.length === 0) return null;
  const n = shares.length;
  const secret = new Uint8Array(32);

  for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      const xj = shares[j].index;
      const yjByte = shares[j].data[byteIdx];
      let lagrange = 1;
      for (let m = 0; m < n; m++) {
        if (m === j) continue;
        const xm = shares[m].index;
        const denom = xj ^ xm;
        if (denom === 0) return null;
        lagrange = gf256Mul(lagrange, gf256Mul(xm, gf256Inv(denom)));
      }
      sum ^= gf256Mul(yjByte, lagrange);
    }
    secret[byteIdx] = sum;
  }
  return secret;
}

// ─── ECIES (P-256 ECDH + HKDF-SHA256 + AES-256-GCM) ───────────────────────────

const HKDF_INFO = Buffer.from("wvc-ecies-v1", "utf8");
const HKDF_LENGTH = 44; // 32 bytes key + 12 bytes nonce

/** HKDF-SHA256: Extract (HMAC of IKM with empty salt) then Expand to 44 bytes. */
function hkdfDerive(sharedSecret: Buffer): { key: Buffer; nonce: Buffer } {
  // HKDF-Extract: PRK = HMAC-SHA256(salt="", IKM=sharedSecret)
  const prk = createHmac("sha256", Buffer.alloc(0)).update(sharedSecret).digest();

  // HKDF-Expand: produce 44 bytes using T(N) = HMAC(PRK, T(N-1) | info | N)
  let t = Buffer.alloc(0);
  const okm = Buffer.alloc(HKDF_LENGTH);
  let offset = 0;
  let counter = 1;

  while (offset < HKDF_LENGTH) {
    const input = Buffer.concat([t, HKDF_INFO, Buffer.from([counter])]);
    t = createHmac("sha256", prk).update(input).digest();
    const toCopy = Math.min(t.length, HKDF_LENGTH - offset);
    t.copy(okm, offset, 0, toCopy);
    offset += toCopy;
    counter++;
  }

  return { key: okm.subarray(0, 32), nonce: okm.subarray(32, 44) };
}

/** Wrap a raw SEC1 uncompressed point (04 + X + Y) in SPKI DER. */
function wrapSec1InSpki(sec1: Buffer): Buffer {
  const prefix = Buffer.from([
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  ]);
  return Buffer.concat([prefix, sec1]);
}

/** ECIES encrypt to a recipient's SEC1 hex public key. Returns: ephemeral_pubkey(65) + ciphertext + tag(16). */
export function eciesEncrypt(recipientPubKeyHex: string, plaintext: Buffer): Buffer {
  const ephemeral = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const ephemeralSec1 = (ephemeral.publicKey as Buffer).subarray(-65);

  // Create ECDH from the ephemeral private key
  const ecdh = createECDH("prime256v1");
  const ephemeralPrivKey = createPrivateKey({ key: ephemeral.privateKey as string, format: "pem" });
  const ephemeralPrivDer = ephemeralPrivKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  // Extract the 32-byte private key scalar from PKCS8 DER (at offset 36 for P-256)
  ecdh.setPrivateKey(ephemeralPrivDer.subarray(36, 68));

  const recipientSec1 = Buffer.from(recipientPubKeyHex, "hex");
  const sharedSecret = ecdh.computeSecret(recipientSec1);

  const { key, nonce } = hkdfDerive(sharedSecret);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([ephemeralSec1, encrypted, tag]);
}

/** ECIES decrypt using recipient's PEM private key. */
export function eciesDecrypt(recipientPrivateKeyPem: string, encrypted: Buffer): Buffer {
  if (encrypted.length < 65 + 28) throw new Error("Ciphertext too short");

  const ephemeralSec1 = encrypted.subarray(0, 65);
  const ciphertextWithTag = encrypted.subarray(65);
  const ciphertext = ciphertextWithTag.subarray(0, -16);
  const tag = ciphertextWithTag.subarray(-16);

  const ecdh = createECDH("prime256v1");
  const privKeyObj = createPrivateKey({ key: recipientPrivateKeyPem, format: "pem" });
  const privDer = privKeyObj.export({ format: "der", type: "pkcs8" }) as Buffer;
  ecdh.setPrivateKey(privDer.subarray(36, 68));

  const sharedSecret = ecdh.computeSecret(ephemeralSec1);

  const { key, nonce } = hkdfDerive(sharedSecret);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
