/**
 * Native sub-org wallet provisioning for Wrankey.
 *
 * Mirrors Turnkey's embedded wallet flow but entirely in-process:
 *   1. Generate a BIP-39 HD wallet (mnemonic)
 *   2. Derive EVM (secp256k1, BIP-44) + Stellar (ed25519, SLIP-0010) keys
 *   3. AES-256-GCM encrypt the mnemonic and store it
 *   4. Create WalletAccount rows for both chain families
 *
 * The sub-org's root user gets a fully functional wallet with addresses
 * on both EVM and Stellar chains, ready for signing via the existing
 * enclave/stellar utilities.
 */

import prisma from "../db.js";
import { generateHdWallet, encryptSeedForStorage, deriveAccount } from "../utils/enclave.js";
import { deriveStellarAccount } from "../utils/stellar.js";
import { getChainByName, isStellarChain } from "./chain.js";
import { createAuditLog } from "../utils/audit.js";
import { triggerWebhookEvents } from "../modules/webhook/routes.js";

export interface ProvisionedWallet {
  walletId: string;
  name: string;
  mnemonic: string;
  accounts: { chainId: string; address: string; derivationPath: string; index: number; family: string }[];
}

/**
 * Provision a wallet for a sub-org.
 *
 * Creates an HD wallet owned by the sub-org's root user, derives the first
 * account on the default EVM chain and on Stellar testnet, and stores
 * everything encrypted in the database.
 */
export async function provisionSubOrgWallet(
  subOrgId: string,
  rootUserId: string,
  walletName = "Sub-Org Wallet",
): Promise<ProvisionedWallet> {
  // 1. Generate the HD wallet
  const { mnemonic } = generateHdWallet();
  const encryptedSeed = encryptSeedForStorage(mnemonic);

  // 2. Resolve chains — default EVM + Stellar testnet
  const evmChain = await getChainByName("sepolia").catch(() => null);
  const stellarChain = await getChainByName("stellar-testnet").catch(() => null);

  const accountsCreate: any[] = [];

  if (evmChain) {
    const { address, privateKey } = deriveAccount(mnemonic, 0, evmChain.derivationPath);
    accountsCreate.push({
      chainId: evmChain.id,
      address,
      derivationPath: `${evmChain.derivationPath}/0`,
      index: 0,
    });
  }

  if (stellarChain) {
    const stellarAccount = deriveStellarAccount(mnemonic, 0, stellarChain.derivationPath);
    accountsCreate.push({
      chainId: stellarChain.id,
      address: stellarAccount.address,
      derivationPath: `${stellarChain.derivationPath}/0'`,
      index: 0,
    });
  }

  // 3. Store the wallet
  const wallet = await prisma.wallet.create({
    data: {
      orgId: subOrgId,
      ownerType: "USER",
      ownerId: rootUserId,
      userId: rootUserId,
      name: walletName,
      tags: ["sub-org-managed"],
      encryptedSeed,
      accounts: accountsCreate.length > 0 ? { create: accountsCreate } : undefined,
    },
    include: { accounts: true },
  });

  // 4. Audit log + webhook
  await createAuditLog(
    subOrgId,
    "WALLET_CREATE",
    { walletId: wallet.id, name: walletName, subOrgId, accounts: accountsCreate.map(a => ({ chainId: a.chainId, address: a.address })) },
    rootUserId,
  );
  triggerWebhookEvents(subOrgId, "wallet.created", {
    walletId: wallet.id,
    name: walletName,
    subOrgId,
    autoProvisioned: true,
  });

  return {
    walletId: wallet.id,
    name: walletName,
    mnemonic,
    accounts: wallet.accounts.map((a: any) => ({
      chainId: a.chainId,
      address: a.address,
      derivationPath: a.derivationPath,
      index: a.index,
      family: accountsCreate.find((c) => c.chainId === a.chainId)?.family || "evm",
    })),
  };
}

/**
 * Derive an additional private key from a sub-org's wallet.
 * Used for creating per-chain signing keys.
 */
export async function deriveSubOrgPrivateKey(
  subOrgId: string,
  walletId: string,
  name: string,
  curve: "SECP256K1" | "ED25519",
  index: number,
  chainName: string,
): Promise<{ privateKeyId: string; publicKey: string; address: string }> {
  const wallet = await prisma.wallet.findFirst({
    where: { id: walletId, orgId: subOrgId },
  });
  if (!wallet) throw new Error("Wallet not found in sub-org");

  const { decryptSeedFromStorage } = await import("../utils/enclave.js");
  const mnemonic = decryptSeedFromStorage(wallet.encryptedSeed);

  const chain = await getChainByName(chainName);
  let publicKey: string;
  let address: string;
  let encryptedPrivateKey: string;
  const { encrypt } = await import("../utils/crypto.js");

  if (isStellarChain(chain)) {
    const stellarAccount = deriveStellarAccount(mnemonic, index, chain.derivationPath);
    publicKey = stellarAccount.publicKey;
    address = stellarAccount.address;
    encryptedPrivateKey = encrypt(stellarAccount.secret);
  } else {
    const derived = deriveAccount(mnemonic, index, chain.derivationPath);
    publicKey = derived.privateKey;
    address = derived.address;
    encryptedPrivateKey = encrypt(derived.privateKey);
  }

  const privateKey = await prisma.privateKey.create({
    data: {
      orgId: subOrgId,
      walletId,
      name,
      curve,
      encryptedPrivateKey,
      publicKey,
      derivationIndex: index,
      tags: ["sub-org-managed"],
    },
  });

  return {
    privateKeyId: privateKey.id,
    publicKey,
    address,
  };
}
