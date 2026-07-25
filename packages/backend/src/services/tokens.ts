import { ethers } from "ethers";

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface TokenBalance {
  token: TokenInfo;
  balance: string;
  balanceFormatted: string;
}

const KNOWN_TOKENS: Record<number, TokenInfo[]> = {
  1: [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", name: "Tether USD", symbol: "USDT", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", name: "Dai", symbol: "DAI", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  ],
  11155111: [
    { address: "0x1c7D4B196Cb0C0B0330122436921D6f1D7b4b6b0", name: "ChainLink Token", symbol: "LINK", decimals: 18 },
    { address: "0xfA8E539C5e9c2dB2183A092A9a4E8c9C4f6E6bE8", name: "USD Coin", symbol: "USDC", decimals: 6 },
  ],
  10: [
    { address: "0x7F5c764cBc97f6359B391a1c7574B4A1B2C4C4C4", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { address: "0xDA10009c5dA0a1e1b44bC13b04b8E5d0c9b5c5c5", name: "Dai", symbol: "DAI", decimals: 18 },
    { address: "0x4200000000000000000000000000000000000006", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  ],
  137: [
    { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  ],
  8453: [
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71B54bdA6299a", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { address: "0x4200000000000000000000000000000000000006", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  ],
  42161: [
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", name: "Tether USD", symbol: "USDT", decimals: 6 },
    { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523BAbD2", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  ],
};

export async function getTokenBalances(
  walletAddress: string,
  rpcUrl: string,
  chainId?: number | null,
  customTokens?: string[]
): Promise<TokenBalance[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const balances: TokenBalance[] = [];

  const tokens = customTokens
    ? customTokens.map((addr) => ({ address: addr, name: addr, symbol: "???", decimals: 18 }))
    : KNOWN_TOKENS[chainId ?? -1] || [];

  for (const token of tokens) {
    try {
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const [name, symbol, decimals, balance] = await Promise.all([
        contract.name().catch(() => token.name),
        contract.symbol().catch(() => token.symbol),
        contract.decimals().catch(() => token.decimals),
        contract.balanceOf(walletAddress),
      ]);

      balances.push({
        token: { address: token.address, name, symbol, decimals: Number(decimals) },
        balance: balance.toString(),
        balanceFormatted: ethers.formatUnits(balance, Number(decimals)),
      });
    } catch {}
  }

  return balances;
}

export async function getTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  rpcUrl: string,
  decimals = 18
): Promise<TokenBalance> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [name, symbol, balance] = await Promise.all([
    contract.name().catch(() => tokenAddress.slice(0, 10)),
    contract.symbol().catch(() => "???"),
    contract.balanceOf(walletAddress),
  ]);

  return {
    token: { address: tokenAddress, name, symbol, decimals },
    balance: balance.toString(),
    balanceFormatted: ethers.formatUnits(balance, decimals),
  };
}
