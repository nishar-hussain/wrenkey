import { ethers } from "ethers";
import { encrypt, decrypt } from "./crypto.js";

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

export function deriveAccount(
  mnemonic: string,
  index: number,
  derivationPath: string = "m/44'/60'/0'/0"
): { address: string; privateKey: string } {
  const m = ethers.Mnemonic.fromPhrase(mnemonic);
  const root = ethers.HDNodeWallet.fromSeed(m.computeSeed());
  const fullPath = `${derivationPath}/${index}`;
  const child = root.derivePath(fullPath);
  return { address: child.address, privateKey: child.privateKey };
}

export function encryptSeedForStorage(seed: string): string {
  return encrypt(seed);
}

export function decryptSeedFromStorage(encryptedSeed: string): string {
  return decrypt(encryptedSeed);
}

export function encryptSeedWithPassphrase(seed: string, passphrase: string): string {
  const normalized = passphrase.normalize("NFKC");
  return encrypt(seed, normalized);
}

export function decryptSeedWithPassphrase(encryptedSeed: string, passphrase: string): string {
  const normalized = passphrase.normalize("NFKC");
  return decrypt(encryptedSeed, normalized);
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

export async function simulateTransaction(
  tx: ethers.TransactionRequest,
  rpcUrl: string,
  from?: string
): Promise<{ success: boolean; gasUsed: string; returnData: string; error?: string }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  try {
    const result = await provider.call({
      ...tx,
      from: from || tx.from,
    });
    return { success: true, gasUsed: "0", returnData: result };
  } catch (err: any) {
    let gasUsed = "0";
    const gasMatch = err.message?.match(/gas required exceeds allowance \((\d+)\)/);
    if (gasMatch) gasUsed = gasMatch[1];

    return {
      success: false,
      gasUsed,
      returnData: "",
      error: err.message?.split("(error=")[1]?.replace(/\)$/, "") || err.message?.slice(0, 200) || "Simulation failed",
    };
  }
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
  return provider.getTransactionCount(address, "pending");
}

export async function estimateGas(
  tx: ethers.TransactionRequest,
  rpcUrl: string
): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return provider.estimateGas(tx);
}

export async function getGasPrice(rpcUrl: string): Promise<{ slow: string; standard: string; fast: string }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const feeData = await provider.getFeeData();

  const base = feeData.gasPrice || ethers.parseUnits("20", "gwei");

  return {
    slow: (base * 9n / 10n).toString(),
    standard: base.toString(),
    fast: (base * 12n / 10n).toString(),
  };
}
