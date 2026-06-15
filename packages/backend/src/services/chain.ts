import prisma from "../db.js";
import { config } from "../config.js";

const chainCache = new Map<string, { id: string; name: string; chainId: number; rpcUrl: string; derivationPath: string; nativeCurrency: string; symbol: string; blockExplorerUrl: string | null; active: boolean }>();

export interface ChainInfo {
  id: string;
  name: string;
  chainId: number;
  rpcUrl: string;
  derivationPath: string;
  nativeCurrency: string;
  symbol: string;
  blockExplorerUrl: string | null;
  active: boolean;
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

export async function getDefaultChain(): Promise<ChainInfo> {
  const defaultChain = await prisma.chain.findFirst({ where: { active: true } });
  if (defaultChain) {
    chainCache.set(defaultChain.name, defaultChain);
    return defaultChain;
  }

  const arc = await prisma.chain.upsert({
    where: { name: config.arcChainName },
    update: { active: true },
    create: {
      name: config.arcChainName,
      chainId: config.arcChainId,
      rpcUrl: config.arcRpcUrl,
      nativeCurrency: "ETH",
      symbol: "ARC",
      derivationPath: "m/44'/60'/0'/0",
      active: true,
    },
  });
  chainCache.set(arc.name, arc);
  return arc;
}

export async function seedChains() {
  const existing = await prisma.chain.count();
  if (existing > 0) return;

  const chains = [
    {
      name: "arc",
      chainId: config.arcChainId,
      rpcUrl: config.arcRpcUrl,
      nativeCurrency: "ETH",
      symbol: "ARC",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: null,
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
      active: true,
    },
    {
      name: "sepolia",
      chainId: 11155111,
      rpcUrl: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      nativeCurrency: "ETH",
      symbol: "ETH",
      derivationPath: "m/44'/60'/0'/0",
      blockExplorerUrl: "https://sepolia.etherscan.io",
      active: true,
    },
  ];

  for (const c of chains) {
    await prisma.chain.create({ data: c });
  }
}

export function invalidateChainCache() {
  chainCache.clear();
}
