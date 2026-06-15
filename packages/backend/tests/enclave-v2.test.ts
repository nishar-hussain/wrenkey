import { describe, it, expect } from "vitest";
import {
  generateHdWallet,
  generateHdWalletFromMnemonic,
  deriveAccount,
  encryptSeedForStorage,
  decryptSeedFromStorage,
  encryptSeedWithPassphrase,
  decryptSeedWithPassphrase,
} from "../src/utils/enclave";

describe("enclave (multi-chain HD wallet)", () => {
  it("generates HD wallet with mnemonic and seed", () => {
    const wallet = generateHdWallet();
    expect(wallet.mnemonic).toBeTruthy();
    expect(wallet.seed).toBeTruthy();
    expect(wallet.seed).toMatch(/^0x/);
    expect(wallet.mnemonic.split(" ").length).toBe(12);
  });

  it("generates from existing mnemonic", () => {
    const original = generateHdWallet();
    const recovered = generateHdWalletFromMnemonic(original.mnemonic);
    expect(recovered.seed).toBe(original.seed);
  });

  it("derives different accounts at different indices", () => {
    const wallet = generateHdWallet();
    const acc0 = deriveAccount(wallet.mnemonic, 0);
    const acc1 = deriveAccount(wallet.mnemonic, 1);
    expect(acc0.address).not.toBe(acc1.address);
    expect(acc0.address).toMatch(/^0x/);
  });

  it("derives accounts with custom derivation path", () => {
    const wallet = generateHdWallet();
    const ethAcc = deriveAccount(wallet.mnemonic, 0, "m/44'/60'/0'/0");
    const ledgerAcc = deriveAccount(wallet.mnemonic, 0, "m/44'/60'/0'");
    expect(ethAcc.address).toMatch(/^0x/);
    expect(ethAcc.address).not.toBe(ledgerAcc.address);
  });

  it("derives same account from same mnemonic, index, and path", () => {
    const wallet = generateHdWallet();
    const accA = deriveAccount(wallet.mnemonic, 5, "m/44'/60'/0'/0");
    const accB = deriveAccount(wallet.mnemonic, 5, "m/44'/60'/0'/0");
    expect(accA.address).toBe(accB.address);
  });

  it("encrypts and decrypts seed", () => {
    const wallet = generateHdWallet();
    const encrypted = encryptSeedForStorage(wallet.mnemonic);
    expect(encrypted).not.toBe(wallet.mnemonic);
    const decrypted = decryptSeedFromStorage(encrypted);
    expect(decrypted).toBe(wallet.mnemonic);
    const account = deriveAccount(decrypted, 0);
    const originalAccount = deriveAccount(wallet.mnemonic, 0);
    expect(account.address).toBe(originalAccount.address);
  });

  it("encrypts and decrypts with passphrase", () => {
    const wallet = generateHdWallet();
    const passphrase = "MySecureP@ssphrase123!";
    const encrypted = encryptSeedWithPassphrase(wallet.mnemonic, passphrase);
    expect(encrypted).not.toBe(wallet.mnemonic);

    const decrypted = decryptSeedWithPassphrase(encrypted, passphrase);
    expect(decrypted).toBe(wallet.mnemonic);

    expect(() => decryptSeedWithPassphrase(encrypted, "WrongPassphrase!")).toThrow();
  });

  it("passphrase encryption produces different ciphertext from default encryption", () => {
    const wallet = generateHdWallet();
    const defaultEncrypted = encryptSeedForStorage(wallet.mnemonic);
    const passphraseEncrypted = encryptSeedWithPassphrase(wallet.mnemonic, "test1234567890");

    expect(passphraseEncrypted).not.toBe(defaultEncrypted);

    const decrypted = decryptSeedWithPassphrase(passphraseEncrypted, "test1234567890");
    expect(decrypted).toBe(wallet.mnemonic);
  });

  it("supports different chain derivation paths", () => {
    const wallet = generateHdWallet();

    const ethPath = "m/44'/60'/0'/0";
    const polygonPath = "m/44'/60'/0'/0";

    const ethAcc = deriveAccount(wallet.mnemonic, 0, ethPath);
    const polyAcc = deriveAccount(wallet.mnemonic, 0, polygonPath);
    expect(ethAcc.address).toBe(polyAcc.address);

    const ethAcc1 = deriveAccount(wallet.mnemonic, 1, ethPath);
    expect(ethAcc1.address).not.toBe(ethAcc.address);
  });
});
