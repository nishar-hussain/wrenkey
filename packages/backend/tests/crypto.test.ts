import { describe, it, expect } from "vitest";
import { encrypt, decrypt, hashSha256, generateRandomToken } from "../src/utils/crypto.js";

describe("Crypto Utils", () => {
  it("should encrypt and decrypt strings", () => {
    const original = "test_secret_key_12345";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.split(":").length).toBe(3);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should produce deterministic sha256 hash", () => {
    const hash1 = hashSha256("hello");
    const hash2 = hashSha256("hello");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it("should generate random tokens of expected length", () => {
    const token = generateRandomToken();
    expect(token.length).toBe(64);
  });

  it("should generate different tokens each time", () => {
    const t1 = generateRandomToken();
    const t2 = generateRandomToken();
    expect(t1).not.toBe(t2);
  });
});
