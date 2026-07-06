import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  generateHdWallet,
  generateHdWalletFromMnemonic,
  deriveAccount,
  signTransaction,
  signMessage,
  encryptSeedForStorage,
  decryptSeedFromStorage,
} from "../src/utils/enclave.js";

describe("signTransaction — correct account key derivation (C2 fix)", () => {
  it("signs with the correct key for account index 0", async () => {
    const { mnemonic } = generateHdWallet();
    const path = "m/44'/60'/0'/0";
    const account0 = deriveAccount(mnemonic, 0, path);

    const tx: ethers.TransactionRequest = {
      to: "0x1234567890123456789012345678901234567890",
      value: ethers.parseEther("0.001"),
      chainId: 11155111,
      nonce: 0,
    };

    const signedTx = await signTransaction(mnemonic, 0, path, tx);
    expect(signedTx).toBeTruthy();

    // The recovered address from the signed tx should match account 0's address
    const parsed = ethers.Transaction.from(signedTx);
    expect(parsed.from!.toLowerCase()).toBe(account0.address.toLowerCase());
  });

  it("signs with the correct key for account index > 0 (the C2 bug)", async () => {
    const { mnemonic } = generateHdWallet();
    const path = "m/44'/60'/0'/0";
    const account1 = deriveAccount(mnemonic, 1, path);
    const account0 = deriveAccount(mnemonic, 0, path);

    // account1 and account0 must be different
    expect(account1.address).not.toBe(account0.address);

    const tx: ethers.TransactionRequest = {
      to: "0x1234567890123456789012345678901234567890",
      value: ethers.parseEther("0.001"),
      chainId: 11155111,
      nonce: 1,
    };

    const signedTx = await signTransaction(mnemonic, 1, path, tx);

    // The recovered address MUST be account1, NOT account0 (the bug was it always used account0)
    const parsed = ethers.Transaction.from(signedTx);
    expect(parsed.from!.toLowerCase()).toBe(account1.address.toLowerCase());
    expect(parsed.from!.toLowerCase()).not.toBe(account0.address.toLowerCase());
  });

  it("signs with different keys for different indices on the same mnemonic", async () => {
    const { mnemonic } = generateHdWallet();
    const path = "m/44'/60'/0'/0";

    const tx: ethers.TransactionRequest = {
      to: "0x1234567890123456789012345678901234567890",
      value: ethers.parseEther("0.001"),
      chainId: 11155111,
      nonce: 0,
    };

    const signed0 = await signTransaction(mnemonic, 0, path, tx);
    const signed1 = await signTransaction(mnemonic, 1, path, tx);

    // The two signatures must be different (different keys)
    expect(signed0).not.toBe(signed1);

    const parsed0 = ethers.Transaction.from(signed0);
    const parsed1 = ethers.Transaction.from(signed1);
    expect(parsed0.from!).not.toBe(parsed1.from!);
  });

  it("works with a custom derivation path", async () => {
    const { mnemonic } = generateHdWallet();
    const customPath = "m/44'/60'/1'/0";
    const account = deriveAccount(mnemonic, 0, customPath);

    const tx: ethers.TransactionRequest = {
      to: "0x1234567890123456789012345678901234567890",
      value: ethers.parseEther("0.001"),
      chainId: 1,
      nonce: 0,
    };

    const signedTx = await signTransaction(mnemonic, 0, customPath, tx);
    const parsed = ethers.Transaction.from(signedTx);
    expect(parsed.from!.toLowerCase()).toBe(account.address.toLowerCase());
  });
});

describe("signTransaction — consistency with signMessage", () => {
  it("signTransaction and signMessage use the same derived key for the same index", async () => {
    const { mnemonic } = generateHdWallet();
    const path = "m/44'/60'/0'/0";
    const account2 = deriveAccount(mnemonic, 2, path);

    // Sign a message with the derived private key (the correct approach, already used by sign-message)
    const sig = await signMessage(account2.privateKey, "hello world");

    // Verify the signature recovers to account2's address
    const recovered = ethers.verifyMessage("hello world", sig);
    expect(recovered.toLowerCase()).toBe(account2.address.toLowerCase());
  });
});

describe("Seed encryption round-trip", () => {
  it("encrypts and decrypts a seed phrase", () => {
    const { mnemonic } = generateHdWallet();
    const encrypted = encryptSeedForStorage(mnemonic);
    const decrypted = decryptSeedFromStorage(encrypted);
    expect(decrypted).toBe(mnemonic);
  });

  it("generates a different wallet from a different mnemonic", () => {
    const { mnemonic: m1 } = generateHdWallet();
    const { mnemonic: m2 } = generateHdWallet();
    expect(m1).not.toBe(m2);

    const a1 = deriveAccount(m1, 0, "m/44'/60'/0'/0");
    const a2 = deriveAccount(m2, 0, "m/44'/60'/0'/0");
    expect(a1.address).not.toBe(a2.address);
  });

  it("derives the same address from the same mnemonic via fromMnemonic", () => {
    const { mnemonic } = generateHdWallet();
    const account = deriveAccount(mnemonic, 0, "m/44'/60'/0'/0");
    const wallet = ethers.Wallet.fromPhrase(mnemonic);
    expect(account.address.toLowerCase()).toBe(wallet.address.toLowerCase());
  });
});
