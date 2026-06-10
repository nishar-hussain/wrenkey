import { describe, it, expect } from "vitest";
import { encrypt, decrypt, hashSha256, generateRandomToken } from "../../src/utils/crypto";

describe("crypto utils", () => {
  it("should encrypt and decrypt text", () => {
    const original = "test mnemonic phrase for wallet";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(":").length).toBe(3); // iv:authTag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should generate different encrypted outputs for same input", () => {
    const text = "same text";
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    expect(enc1).not.toBe(enc2); // Different IVs

    const dec1 = decrypt(enc1);
    const dec2 = decrypt(enc2);
    expect(dec1).toBe(text);
    expect(dec2).toBe(text);
  });

  it("should hash consistently", () => {
    const hash1 = hashSha256("test data");
    const hash2 = hashSha256("test data");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA256 hex = 64 chars
  });

  it("should generate different hashes for different inputs", () => {
    const hash1 = hashSha256("data1");
    const hash2 = hashSha256("data2");
    expect(hash1).not.toBe(hash2);
  });

  it("should generate random tokens", () => {
    const token1 = generateRandomToken();
    const token2 = generateRandomToken();
    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("should handle empty string encryption", () => {
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("should handle special characters", () => {
    const original = "Hello, 世界! 🌍 #@$%";
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
});
