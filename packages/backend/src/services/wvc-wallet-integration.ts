/**
 * WVC Wallet Integration (PRD §25).
 *
 * Bridges WranKey's existing wallet/transaction modules to the WVC enclave.
 * When `WVC_WALLET_SIGNER_DEPLOYMENT_ID` is set, wallet creation and transaction
 * signing route through the WVC enclave instead of the in-process ethers.js signer.
 *
 * This is a drop-in replacement at the SDK level — the API surface is unchanged,
 * but the response includes an optional `appProof` field callers can verify.
 */

import { ethers } from "ethers";
import { config } from "../config.js";
import { invokeDeployment, type InvokeResult } from "./wvc-relay.js";
import { decryptSeedFromStorage, signTransaction } from "../utils/enclave.js";

/** Returns true if WVC wallet signing is enabled (deployment ID is configured). */
export function isWvcWalletSigningEnabled(): boolean {
  return !!(config.wvc.walletSignerDeploymentId || process.env.WVC_WALLET_SIGNER_DEPLOYMENT_ID);
}

/** Returns true if the given encryptedSeed is a WVC enclave handle (not a raw encrypted mnemonic). */
export function isWvcWallet(encryptedSeed: string | null | undefined): boolean {
  return typeof encryptedSeed === "string" && encryptedSeed.startsWith("wvc:");
}

/**
 * Sign an unsigned transaction for a wallet, routing through the WVC enclave when
 * the wallet is WVC-managed, or falling back to the in-process ethers.js signer
 * for legacy wallets. This centralises the branch so every signing path
 * (sign / retry / cancel / speed-up) stays consistent.
 */
export async function signTxForWallet(
  orgId: string,
  encryptedSeed: string,
  accountIndex: number,
  derivationPath: string,
  tx: ethers.TransactionRequest,
): Promise<{ signedTx: string; appProof?: InvokeResult["appProof"]; devMode?: boolean }> {
  if (isWvcWallet(encryptedSeed)) {
    const unsignedTxHex = ethers.Transaction.from(tx as ethers.TransactionLike<string>).unsignedSerialized;
    const wvcResult = await wvcSignTransaction(orgId, unsignedTxHex);
    return { signedTx: wvcResult.signedTx, appProof: wvcResult.appProof, devMode: wvcResult.devMode };
  }
  const seed = decryptSeedFromStorage(encryptedSeed);
  const signedTx = await signTransaction(seed, accountIndex, derivationPath, tx);
  return { signedTx };
}

/** Get the configured wallet signer deployment ID (from env or config). */
function getWalletSignerDeploymentId(): string {
  return process.env.WVC_WALLET_SIGNER_DEPLOYMENT_ID || config.wvc.walletSignerDeploymentId || "";
}

/**
 * Generate a wallet seed through the WVC enclave (PRD §25.1).
 *
 * Instead of calling `ethers.Wallet.createRandom()` in the backend process,
 * this routes seed generation through the enclave, which generates it from
 * enclave-sourced entropy. The backend never sees the plaintext seed —
 * only a `seedId` handle that the enclave uses to reference the key material.
 *
 * @returns { seedId, appProof } — the seed handle + cryptographic proof
 */
export async function wvcGenerateSeed(orgId: string): Promise<{
  seedId: string;
  derivedAddress?: string;
  appProof: InvokeResult["appProof"];
  devMode: boolean;
}> {
  if (!isWvcWalletSigningEnabled()) {
    throw new Error("WVC wallet signing is not enabled. Set WVC_WALLET_SIGNER_DEPLOYMENT_ID.");
  }

  const deploymentId = getWalletSignerDeploymentId();

  const result = await invokeDeployment(
    deploymentId,
    orgId,
    { payloadType: "generate_seed" },
  );

  const seedId = (result.result as any).seedId;
  if (!seedId) {
    throw new Error("WVC enclave did not return a seedId");
  }

  const derivedAddress = (result.result as any).derivedAddress as string | undefined;
  const devMode = (result.result as any).warning !== undefined;
  return { seedId, derivedAddress, appProof: result.appProof, devMode };
}

/**
 * Sign a transaction through the WVC enclave (PRD §25.2).
 *
 * Instead of calling `new ethers.Wallet(privateKey).signTransaction(tx)` in the
 * backend process, this routes signing through the enclave. The plaintext key
 * never leaves enclave memory.
 *
 * @param orgId        Caller's org ID (for tenancy check on the deployment)
 * @param unsignedTx   The unsigned transaction hex (ethers.js serialized)
 * @returns { signedTx, appProof } — the signed transaction + cryptographic proof
 */
export async function wvcSignTransaction(
  orgId: string,
  unsignedTx: string,
): Promise<{
  signedTx: string;
  appProof: InvokeResult["appProof"];
  devMode: boolean;
}> {
  if (!isWvcWalletSigningEnabled()) {
    throw new Error("WVC wallet signing is not enabled. Set WVC_WALLET_SIGNER_DEPLOYMENT_ID.");
  }

  const result = await invokeDeployment(
    getWalletSignerDeploymentId(),
    orgId,
    { payloadType: "signature", unsignedTx },
  );

  const signedTx = (result.result as any).signedTx;
  if (!signedTx) {
    throw new Error("WVC enclave did not return a signedTx");
  }

  const devMode = (result.result as any).warning !== undefined;
  return { signedTx, appProof: result.appProof, devMode };
}
