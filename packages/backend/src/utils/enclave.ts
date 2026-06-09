import { ethers } from "ethers";
import { encrypt, decrypt } from "./crypto.js";

/**
 * HSM / Secure Enclave abstraction
 * In production, this would use AWS Nitro / Azure TEEs.
 * For MVP, we simulate the enclave with in-memory encryption.
 */

export interface EnclaveResult {
  walletId: string;
  addresses: Array<{ address: string; derivationPath: string; index: number }>;
  encryptedSeed: string;
}

export function generateHdWallet(): { mnemonic: string; seed: string } {
  const wallet = ethers.Wallet.createRandom();
  return {
    mnemonic: wallet.mnemonic!.phrase,
    seed: wallet.privateKey,
  };
}

export function generateHdWalletFromMnemonic(mnemonic: string): { seed: string } {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return { seed: wallet.privateKey };
}

export function deriveAccount(mnemonic: string, index: number): { address: string; privateKey: string } {
  const m = ethers.Mnemonic.fromPhrase(mnemonic);
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());
  const child = root.derivePath(`m/44'/60'/0'/0/${index}`);
  return { address: child.address, privateKey: child.privateKey };
}

export function encryptSeedForStorage(seed: string): string {
  return encrypt(seed);
}

export function decryptSeedFromStorage(encryptedSeed: string): string {
  return decrypt(encryptedSeed);
}

export function signTransaction(mnemonic: string, tx: ethers.TransactionRequest): Promise<string> {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return wallet.signTransaction(tx);
}

export function signMessage(mnemonic: string, message: string): Promise<string> {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return wallet.signMessage(message);
}

export async function broadcastTransaction(
  signedTx: string,
  rpcUrl: string
): Promise<{ hash: string }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const tx = await provider.broadcastTransaction(signedTx);
  return { hash: tx.hash };
}

export async function getTransactionStatus(
  txHash: string,
  rpcUrl: string
): Promise<{ status: string; confirmations: number }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    return { status: "PENDING", confirmations: 0 };
  }
  const block = await provider.getBlockNumber();
  const confirmations = block - receipt.blockNumber + 1;
  return {
    status: receipt.status === 1 ? "CONFIRMED" : "FAILED",
    confirmations,
  };
}

export async function getNonce(address: string, rpcUrl: string): Promise<number> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider.getTransactionCount(address);
}

export async function estimateGas(
  tx: ethers.TransactionRequest,
  rpcUrl: string
): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const estimated = await provider.estimateGas(tx);
  return estimated;
}
