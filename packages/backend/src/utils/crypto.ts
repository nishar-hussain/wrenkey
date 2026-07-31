import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync, createECDH, createVerify, createPublicKey } from "crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 310000;
const PBKDF2_KEY_LEN = 32;
const PBKDF2_DIGEST = "sha512";

function getKey(): Buffer {
  return createHash("sha256").update(config.encryptionKey).digest();
}

function getKeyFromPassphrase(passphrase: string): Buffer {
  const salt = createHash("sha256").update(config.encryptionKey).digest().subarray(0, 32);
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST);
}

export function encrypt(text: string, passphrase?: string): string {
  const key = passphrase ? getKeyFromPassphrase(passphrase) : getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string, passphrase?: string): string {
  const key = passphrase ? getKeyFromPassphrase(passphrase) : getKey();
  const parts = encryptedText.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function hashSha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function generateRandomToken(): string {
  return randomBytes(32).toString("hex");
}

// ─── secp256k1 keypair generation for API key authentication ─────────────

export interface ApiKeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate a secp256k1 keypair for API key authentication.
 * The public key is compressed (33 bytes, hex → 66 chars, starts with 02/03).
 * The private key is 32 bytes hex (64 chars).
 */
export function generateApiKeyPair(): ApiKeyPair {
  const ec = createECDH("secp256k1");
  ec.generateKeys();
  const privateKey = ec.getPrivateKey().toString("hex").padStart(64, "0");
  const publicKeyBuf = ec.getPublicKey();
  // Convert to compressed format (33 bytes)
  const prefix = publicKeyBuf[64] % 2 === 0 ? 0x02 : 0x03;
  const compressed = Buffer.concat([Buffer.from([prefix]), publicKeyBuf.subarray(1, 33)]);
  const publicKey = compressed.toString("hex");
  return { publicKey, privateKey };
}

/**
 * Verify an ECDSA signature over a payload using a compressed public key.
 * Used by the X-Stamp auth mechanism for CLI-generated API keys.
 */
export function verifyApiKeySignature(publicKeyHex: string, payload: string, signatureDer: string): boolean {
  try {
    const compressed = Buffer.from(publicKeyHex, "hex");
    if (compressed.length !== 33) return false;

    // Convert compressed public key to a KeyObject via JWK
    const derKey = compressedToDer(compressed);
    const keyObject = createPublicKey({
      key: derKey,
      format: "der",
      type: "spki",
    });

    const verifier = createVerify("SHA256");
    verifier.update(payload);
    return verifier.verify(keyObject, Buffer.from(signatureDer, "hex"));
  } catch {
    return false;
  }
}

/**
 * Convert a compressed public key to DER-encoded SPKI format for Node crypto.
 */
function compressedToDer(compressed: Buffer): Buffer {
  // OID for secp256k1: 1.3.132.0.10
  const oid = Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);
  // AlgorithmIdentifier: ecPublicKey + secp256k1 OID
  const algId = Buffer.concat([Buffer.from([0x30, 0x07, 0x06, 0x02, 0x2b, 0x81, 0x04]), oid]);
  // Public key BIT STRING (prepend 0x00 for no unused bits)
  const bitStringContent = Buffer.concat([Buffer.from([0x00]), compressed]);
  const bitStringHeader = Buffer.from([0x03, bitStringContent.length]);
  const bitString = Buffer.concat([bitStringHeader, bitStringContent]);
  // SPKI structure: SEQUENCE { AlgorithmIdentifier, BIT STRING }
  const content = Buffer.concat([algId, bitString]);
  const header = Buffer.from([0x30, content.length]);
  return Buffer.concat([header, content]);
}
