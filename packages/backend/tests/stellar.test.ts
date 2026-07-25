import { describe, it, expect } from "vitest";
import {
  deriveStellarAccount,
  isValidStellarAddress,
  deriveStellarAccount as deriveAgain,
  signStellarMessage,
  verifyStellarMessage,
  resolveNetworkPassphrase,
  STROOPS_PER_XLM,
} from "../src/utils/stellar.js";

const TEST_MNEMONIC = "test test test test test test test test test test test junk";

describe("Stellar account derivation (SLIP-0010 ed25519 / SEP-0005)", () => {
  it("derives a valid G... address", () => {
    const acc = deriveStellarAccount(TEST_MNEMONIC, 0);
    expect(isValidStellarAddress(acc.address)).toBe(true);
    expect(acc.publicKey).toBe(acc.address);
    expect(acc.secret).toMatch(/^S[A-Z2-7]{55}$/);
  });

  it("is deterministic for the same mnemonic + index", () => {
    const a = deriveStellarAccount(TEST_MNEMONIC, 0);
    const b = deriveAgain(TEST_MNEMONIC, 0);
    expect(a.address).toBe(b.address);
    expect(a.secret).toBe(b.secret);
  });

  it("derives distinct addresses for distinct indices", () => {
    const a0 = deriveStellarAccount(TEST_MNEMONIC, 0);
    const a1 = deriveStellarAccount(TEST_MNEMONIC, 1);
    const a2 = deriveStellarAccount(TEST_MNEMONIC, 2);
    expect(a0.address).not.toBe(a1.address);
    expect(a1.address).not.toBe(a2.address);
  });

  it("honours a custom base derivation path", () => {
    const a0 = deriveStellarAccount(TEST_MNEMONIC, 0, "m/44'/148'/0'");
    const a0Custom = deriveStellarAccount(TEST_MNEMONIC, 0, "m/44'/148'/5'");
    expect(a0.address).not.toBe(a0Custom.address);
    expect(isValidStellarAddress(a0Custom.address)).toBe(true);
  });

  it("re-derives the same keypair from the produced secret", () => {
    const acc = deriveStellarAccount(TEST_MNEMONIC, 3);
    // The secret embeds the public key; signing with it must verify against the address.
    const sig = signStellarMessage(acc.secret, "payload");
    expect(verifyStellarMessage(acc.publicKey, "payload", sig)).toBe(true);
  });
});

describe("Stellar message signing (ed25519)", () => {
  it("signs and verifies a message", () => {
    const acc = deriveStellarAccount(TEST_MNEMONIC, 0);
    const sig = signStellarMessage(acc.secret, "hello stellar");
    expect(sig).toMatch(/^[0-9a-f]{128}$/); // 64-byte ed25519 signature as hex
    expect(verifyStellarMessage(acc.publicKey, "hello stellar", sig)).toBe(true);
  });

  it("rejects a tampered message", () => {
    const acc = deriveStellarAccount(TEST_MNEMONIC, 0);
    const sig = signStellarMessage(acc.secret, "original");
    expect(verifyStellarMessage(acc.publicKey, "tampered", sig)).toBe(false);
  });
});

describe("Stellar helpers", () => {
  it("resolves the testnet passphrase from a testnet horizon URL", () => {
    expect(resolveNetworkPassphrase(null, "https://horizon-testnet.stellar.org"))
      .toBe("Test SDF Network ; September 2015");
  });

  it("resolves the public passphrase from a pubnet horizon URL", () => {
    expect(resolveNetworkPassphrase(undefined, "https://horizon.stellar.org"))
      .toBe("Public Global Stellar Network ; September 2015");
  });

  it("prefers an explicit passphrase over URL inference", () => {
    expect(resolveNetworkPassphrase("Custom Sandbox", "https://horizon-testnet.stellar.org"))
      .toBe("Custom Sandbox");
  });

  it("exports the correct XLM stroop conversion constant", () => {
    expect(STROOPS_PER_XLM).toBe(10_000_000);
  });
});