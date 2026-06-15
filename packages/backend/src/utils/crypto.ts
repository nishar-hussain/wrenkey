import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from "crypto";
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
