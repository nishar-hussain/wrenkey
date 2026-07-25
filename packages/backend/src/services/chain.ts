import prisma from "../db.js";
import { config } from "../config.js";

export const CHAIN_FAMILY_EVM = "evm";
export const CHAIN_FAMILY_STELLAR = "stellar";

// Stellar network passphrases are immutable protocol constants — hardcoding them
// avoids importing the Stellar SDK into the chain registry.
export const STELLAR_PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
export const STELLAR_PASSPHRASE_PUBLIC = "Public Global Stellar Network ; September 2015";

type CachedChain = {
  id: string;
  name: string;
  chainId: number | null;
  rpcUrl: string;
  derivationPath: string;
  nativeCurrency: string;
  symbol: string;
  blockExplorerUrl: string | null;
  family: string;
  horizonUrl: string | null;
  networkPassphrase: string | null;
  active: boolean;
};

const chainCache = new Map<string, CachedChain>();

export interface ChainInfo {
  id: string;
  name: string;
  chainId: number | null;
  rpcUrl: string;
  derivationPath: string;
  nativeCurrency: string;
  symbol: string;
  blockExplorerUrl: string | null;
  family: string;
  horizonUrl: string | null;
  networkPassphrase: string | null;
  active: boolean;
}

export function isStellarChain(chain: { family?: string | null } | null | undefined): boolean {
  return !!chain && chain.family === CHAIN_FAMILY_STELLAR;
}

export function isEvmChain(chain: { family?: string | null } | null | undefined): boolean {
  return !!chain && chain.family === CHAIN_FAMILY_EVM;
}

/**
 * Returns the numeric EVM chain id, throwing a clear error if the chain is not
 * EVM (or has no chain id). Use this at EVM-only call sites so the nullable
 * `chainId` column introduced for Stellar chains doesn't silently leak `null`
 * into ethers.js.
 */
export function requireEvmChainId(chain: ChainInfo): number {
  if (chain.chainId === null || chain.chainId === undefined) {
    throw new Error(`Chain "${chain.name}" has no EVM chain id (family=${chain.family}) — cannot build an EVM transaction`);
  }
  return chain.chainId;
}

export async function getChainByName(name: string): Promise<ChainInfo> {
  const cached = chainCache.get(name);
  if (cached) return cached;

  const chain = await prisma.chain.findUnique({ where: { name } });
  if (chain) {
    chainCache.set(name, chain);
    return chain;
  }

  throw new Error(`Chain "${name}" not found in registry`);
}

export async function getChainById(id: string): Promise<ChainInfo> {
  for (const [, v] of chainCache) {
    if (v.id === id) return v;
  }

  const chain = await prisma.chain.findUnique({ where: { id } });
  if (chain) {
    chainCache.set(chain.name, chain);
    return chain;
  }

  throw new Error(`Chain "${id}" not found`);
}

export async function getAllChains(): Promise<ChainInfo[]> {
  return prisma.chain.findMany({ where: { active: true } });
}

/**
 * Default chain for wallet creation when the caller doesn't specify one.
 *
 * Deliberately resolves to an EVM chain: legacy callers (and the test suite)
 * expect `0x`-prefixed addresses when no chain is selected. Stellar wallets must
 * be created with an explicit `chain: "stellar-testnet" | "stellar-pubnet"`.
 */
export async function getDefaultChain(): Promise<ChainInfo> {
  const byName = await prisma.chain.findUnique({ where: { name: config.defaultChainName } });
  if (byName) {
    chainCache.set(byName.name, byName);
    return byName;
  }

  const anyEvm = await prisma.chain.findFirst({ where: { active: true, family: CHAIN_FAMILY_EVM } });
  if (anyEvm) {
    chainCache.set(anyEvm.name, anyEvm);
    return anyEvm;
  }

  // Bootstrap the default EVM chain if the registry is empty.
  const sepolia = await prisma.chain.upsert({
    where: { name: config.defaultChainName },
    update: { active: true, rpcUrl: config.defaultRpcUrl, chainId: config.defaultChainId, family: CHAIN_FAMILY_EVM },
    create: {
      name: config.defaultChainName,
      chainId: config.defaultChainId,
      rpcUrl: config.defaultRpcUrl,
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      family: CHAIN_FAMILY_EVM,
      active: true,
    },
  });
  chainCache.set(sepolia.name, sepolia);
  return sepolia;
}

export async function seedChains() {
  const chains = [
    // ─── EVM ────────────────────────────────────────────────────────────────
    {
      name: "sepolia",
      chainId: 11155111,
      rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ARC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    {
      name: "ethereum",
      chainId: 1,
      rpcUrl: process.env.ETH_RPC_URL || "https://eth.llamarpc.com",
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://etherscan.io",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    {
      name: "polygon",
      chainId: 137,
      rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com",
      nativeCurrency: "MATIC",
      symbol: "POL",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://polygonscan.com",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    {
      name: "arbitrum",
      chainId: 42161,
      rpcUrl: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://arbiscan.io",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    {
      name: "optimism",
      chainId: 10,
      rpcUrl: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io",
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://optimistic.etherscan.io",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    {
      name: "base",
      chainId: 8453,
      rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://basescan.org",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    {
      name: "arc",
      chainId: parseInt(process.env.ARC_CHAIN_ID || "1234", 10),
      rpcUrl: process.env.ARC_RPC_URL || "https://rpc.arc.network",
      nativeCurrency: "ARC",
      symbol: "ARC",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: process.env.ARC_EXPLORER_URL || "",
      family: CHAIN_FAMILY_EVM,
      horizonUrl: null,
      networkPassphrase: null,
      active: true,
    },
    // ─── Stellar ────────────────────────────────────────────────────────────
    {
      name: "stellar-testnet",
      chainId: null,
      rpcUrl: process.env.STELLAR_TESTNET_HORIZON_URL || "https://horizon-testnet.stellar.org",
      nativeCurrency: "XLM",
      symbol: "XLM",
      derivationPath: "m/44'/148'/0'",
      blockExplorerUrl: process.env.STELLAR_TESTNET_EXPLORER_URL || "https://stellar.expert/explorer/testnet",
      family: CHAIN_FAMILY_STELLAR,
      horizonUrl: process.env.STELLAR_TESTNET_HORIZON_URL || "https://horizon-testnet.stellar.org",
      networkPassphrase: process.env.STELLAR_TESTNET_PASSPHRASE || STELLAR_PASSPHRASE_TESTNET,
      active: true,
    },
    {
      name: "stellar-pubnet",
      chainId: null,
      rpcUrl: process.env.STELLAR_PUBNET_HORIZON_URL || "https://horizon.stellar.org",
      nativeCurrency: "XLM",
      symbol: "XLM",
      derivationPath: "m/44'/148'/0'",
      blockExplorerUrl: process.env.STELLAR_PUBNET_EXPLORER_URL || "https://stellar.expert/explorer/public",
      family: CHAIN_FAMILY_STELLAR,
      horizonUrl: process.env.STELLAR_PUBNET_HORIZON_URL || "https://horizon.stellar.org",
      networkPassphrase: process.env.STELLAR_PUBNET_PASSPHRASE || STELLAR_PASSPHRASE_PUBLIC,
      active: true,
    },
  ];

  for (const c of chains) {
    await prisma.chain.upsert({
      where: { name: c.name },
      update: {
        rpcUrl: c.rpcUrl,
        chainId: c.chainId,
        blockExplorerUrl: c.blockExplorerUrl,
        family: c.family,
        horizonUrl: c.horizonUrl,
        networkPassphrase: c.networkPassphrase,
        active: c.active,
        derivationPath: c.derivationPath,
      },
      create: c,
    });
  }

  invalidateChainCache();
}

export function invalidateChainCache() {
  chainCache.clear();
}