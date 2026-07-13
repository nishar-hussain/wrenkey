/**
 * ECIES (Elliptic Curve Integrated Encryption Scheme) — TypeScript implementation.
 *
 * P-256 ECDH + HKDF-SHA256 + AES-256-GCM, matching the Rust enclave's ecies.rs.
 *
 * Used for:
 * - Key forwarding (§18): encrypt Quorum Key to a new replica's ephemeral public key
 * - Shamir share encryption (§18.4): encrypt shares to operator public keys
 */

import {
  createECDH,
  createHmac,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  createPublicKey,
} from "crypto";

const HKDF_INFO = Buffer.from("wvc-ecies-v1", "utf8");
const KEY_LEN = 32;
const NONCE_LEN = 12;

/** HKDF-SHA256 derivation (extract + expand to 44 bytes: 32 key + 12 nonce) */
function hkdfDerive(sharedSecret: Buffer): { key: Buffer; nonce: Buffer } {
  const prk = createHmac("sha256", Buffer.alloc(0)).update(sharedSecret).digest();
  const okm = createHmac("sha256", prk).update(Buffer.concat([HKDF_INFO, Buffer.from([1])])).digest();
  return {
    key: okm.subarray(0, KEY_LEN),
    nonce: okm.subarray(KEY_LEN, KEY_LEN + NONCE_LEN),
  };
}

/**
 * ECIES encrypt: encrypt plaintext to the recipient's public key.
 *
 * @param recipientPubKeyHex  Recipient's P-256 public key in SEC1 uncompressed hex (04...)
 * @param plaintext           Data to encrypt
 * @returns Buffer containing: ephemeral_pubkey (65 bytes) + ciphertext + 16-byte GCM tag
 */
export function eciesEncrypt(recipientPubKeyHex: string, plaintext: Buffer): Buffer {
  // Generate ephemeral keypair
  const ephemeral = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // Extract SEC1 uncompressed point from SPKI DER (last 65 bytes for P-256)
  const ephemeralPubKeySec1 = (ephemeral.publicKey as Buffer).subarray(-65);

  // Compute ECDH shared secret
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(ephemeral.privateKey as string));
  const sharedSecret = ecdh.computeSecret(Buffer.from(recipientPubKeyHex, "hex"));

  const { key, nonce } = hkdfDerive(sharedSecret);

  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([ephemeralPubKeySec1, encrypted, tag]);
}

/**
 * ECIES decrypt: decrypt ciphertext using the recipient's private key.
 *
 * @param recipientPrivateKeyPem  Recipient's P-256 private key in PEM format
 * @param encrypted               Buffer: ephemeral_pubkey (65 bytes) + ciphertext + 16-byte tag
 * @returns Decrypted plaintext
 */
export function eciesDecrypt(recipientPrivateKeyPem: string, encrypted: Buffer): Buffer {
  if (encrypted.length < 65 + 28) throw new Error("Ciphertext too short");

  const ephemeralPubKeySec1 = encrypted.subarray(0, 65);
  const ciphertextWithTag = encrypted.subarray(65);
  const ciphertext = ciphertextWithTag.subarray(0, -16);
  const tag = ciphertextWithTag.subarray(-16);

  // Compute shared secret using ECDH
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(recipientPrivateKeyPem));
  const sharedSecret = ecdh.computeSecret(ephemeralPubKeySec1);

  const { key, nonce } = hkdfDerive(sharedSecret);

  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Wrap a raw SEC1 uncompressed point (04 + X + Y) in an SPKI DER structure
 * for use with Node.js crypto APIs that expect SPKI format.
 */
function wrapSec1InSpki(sec1: Buffer): Buffer {
  const prefix = Buffer.from([
    0x30, 0x59, // SEQUENCE
    0x30, 0x13, // SEQUENCE (algorithm)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID prime256v1
    0x03, 0x42, 0x00, // BIT STRING, length 66, unused bits 0
  ]);
  return Buffer.concat([prefix, sec1]);
}
