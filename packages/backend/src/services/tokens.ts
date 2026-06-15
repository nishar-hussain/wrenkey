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
  ],
  137: [
    { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", name: "USD Coin", symbol: "USDC", decimals: 6 },
    { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", name: "Wrapped Ether", symbol: "WETH", decimals: 18 },
  ],
  42161: [
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", name: "Tether USD", symbol: "USDT", decimals: 6 },
    { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", name: "USD Coin", symbol: "USDC", decimals: 6 },
  ],
};

export async function getTokenBalances(
  walletAddress: string,
  rpcUrl: string,
  chainId: number,
  customTokens?: string[]
): Promise<TokenBalance[]> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const balances: TokenBalance[] = [];

  const tokens = customTokens
    ? customTokens.map((addr) => ({ address: addr, name: addr, symbol: "???", decimals: 18 }))
    : KNOWN_TOKENS[chainId] || [];

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
