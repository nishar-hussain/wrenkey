import { describe, it, expect } from "vitest";
import {
  generateHdWallet,
  generateHdWalletFromMnemonic,
  deriveAccount,
  encryptSeedForStorage,
  decryptSeedFromStorage,
} from "../../src/utils/enclave";

describe("enclave (HD wallet)", () => {
  it("should generate HD wallet with mnemonic and seed", () => {
    const wallet = generateHdWallet();
    expect(wallet.mnemonic).toBeTruthy();
    expect(wallet.seed).toBeTruthy();
    expect(wallet.seed).toMatch(/^0x/);
    expect(wallet.mnemonic.split(" ").length).toBe(12);
  });

  it("should generate HD wallet from existing mnemonic", () => {
    const original = generateHdWallet();
    const recovered = generateHdWalletFromMnemonic(original.mnemonic);
    expect(recovered.seed).toBe(original.seed);
  });

  it("should derive different accounts at different indices", () => {
    const wallet = generateHdWallet();
    const acc0 = deriveAccount(wallet.mnemonic, 0);
    const acc1 = deriveAccount(wallet.mnemonic, 1);
    const acc2 = deriveAccount(wallet.mnemonic, 2);

    expect(acc0.address).toBeTruthy();
    expect(acc1.address).toBeTruthy();
    expect(acc2.address).toBeTruthy();
    expect(acc0.address).not.toBe(acc1.address);
    expect(acc1.address).not.toBe(acc2.address);
    expect(acc0.address).toMatch(/^0x/);
  });

  it("should derive same account from same mnemonic and index", () => {
    const wallet = generateHdWallet();
    const accA = deriveAccount(wallet.mnemonic, 5);
    const accB = deriveAccount(wallet.mnemonic, 5);
    expect(accA.address).toBe(accB.address);
  });

  it("should encrypt and decrypt seed", () => {
    const wallet = generateHdWallet();
    const encrypted = encryptSeedForStorage(wallet.mnemonic);
    expect(encrypted).not.toBe(wallet.mnemonic);

    const decrypted = decryptSeedFromStorage(encrypted);
    expect(decrypted).toBe(wallet.mnemonic);

    // Verify the decrypted mnemonic still works
    const account = deriveAccount(decrypted, 0);
    const originalAccount = deriveAccount(wallet.mnemonic, 0);
    expect(account.address).toBe(originalAccount.address);
  });
});
