import { describe, it, expect } from "vitest";
import { generateHdWallet, deriveAccount, encryptSeedForStorage, decryptSeedFromStorage } from "../src/utils/enclave.js";

describe("Enclave / Wallet Utils", () => {
  it("should generate HD wallet with mnemonic and seed", () => {
    const wallet = generateHdWallet();
    expect(wallet.mnemonic).toBeTruthy();
    expect(wallet.mnemonic.split(" ").length).toBe(12);
    expect(wallet.seed).toBeTruthy();
    expect(wallet.seed.startsWith("0x")).toBe(true);
  });

  it("should derive account addresses", () => {
    const wallet = generateHdWallet();
    const account0 = deriveAccount(wallet.mnemonic, 0);
    const account1 = deriveAccount(wallet.mnemonic, 1);

    expect(account0.address.startsWith("0x")).toBe(true);
    expect(account0.address.length).toBe(42);
    expect(account0.address).not.toBe(account1.address);
    expect(account0.privateKey.startsWith("0x")).toBe(true);
  });

  it("should encrypt and decrypt seeds for storage", () => {
    const wallet = generateHdWallet();
    const encrypted = encryptSeedForStorage(wallet.mnemonic);
    expect(encrypted).not.toBe(wallet.mnemonic);

    const decrypted = decryptSeedFromStorage(encrypted);
    expect(decrypted).toBe(wallet.mnemonic);

    // Verify we can still use it
    const account = deriveAccount(decrypted, 0);
    expect(account.address.startsWith("0x")).toBe(true);
  });
});
