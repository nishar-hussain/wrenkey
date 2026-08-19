/**
 * Wrankey API helpers for Bullet frontend.
 *
 * Wrankey is a self-hosted key management platform that provides
 * sub-organization wallets with Stellar-compatible Ed25519 signing.
 */
// No external Stellar SDK or Buffer imports needed —
// the backend handles all XDR parsing and signing via the native SDK.

export interface WrankeySession {
  subOrgId: string;
  walletId: string;
  address: string;
  chain: string;
}

const WRANKEY_API = process.env.NEXT_PUBLIC_WRANKEY_API_URL || "http://localhost:3001/api/v1";
const WRANKEY_API_KEY = process.env.NEXT_PUBLIC_WRANKEY_API_KEY || "";

const STORAGE_KEY = "bullet_wrankey_session";

function saveSession(s: WrankeySession) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function getSession(): WrankeySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WrankeySession) : null;
  } catch { return null; }
}

export function isWrankeyConnected(): boolean {
  return getSession() !== null;
}

export function isWrankeyConfigured(): boolean {
  return !!WRANKEY_API_KEY;
}

async function wkFetch(path: string, method = "GET", body?: unknown): Promise<any> {
  const res = await fetch(`${WRANKEY_API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": WRANKEY_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    let errMsg = text;
    try {
      const err = JSON.parse(text);
      errMsg = err.message || err.error || text;
    } catch {}
    throw new Error(errMsg);
  }
  return JSON.parse(text);
}

export async function wrankeyCreateWallet(
  name = "Bullet Wallet",
  userEmail?: string,
): Promise<WrankeySession | null> {
  if (!WRANKEY_API_KEY) return null;

  const userLabel = (userEmail || name).split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const subOrgName = `bullet-${userLabel}-${Date.now().toString(36)}`;

  const res = await wkFetch("/sub-orgs", "POST", {
    name: subOrgName,
    rootUserEmail: userEmail,
    keyType: "hd",
  });

  const subOrgId = res.id;
  if (!subOrgId) throw new Error("Failed to create sub-organization on Wrankey");

  // Get the first wallet account's address
  const wallet = res.wallet;
  if (!wallet?.walletId) throw new Error("No wallet provisioned");

  // Find the Stellar account (address starts with G)
  const account = wallet.accounts?.find((a: any) => a.address?.startsWith("G"));
  if (!account?.address) throw new Error("No Stellar wallet account found");

  const session: WrankeySession = {
    subOrgId,
    walletId: wallet.walletId,
    address: account.address,
    chain: "stellar-testnet",
  };
  saveSession(session);
  return session;
}

export async function wrankeySignMessage(message: string): Promise<string | null> {
  const s = getSession();
  if (!s) throw new Error("Not connected to Wrankey");

  const res = await wkFetch(`/sub-orgs/${s.subOrgId}/sign-message`, "POST", {
    message,
    chain: s.chain,
    format: "utf8",
  });

  if (res.allowed === false) {
    throw new Error(res.reason || "Policy denied");
  }

  return res.signature || null;
}

export async function wrankeySignTransaction(
  unsignedXdr: string,
  networkPassphrase: string,
  amount?: string,
  tokenId?: number,
): Promise<string> {
  const s = getSession();
  if (!s) throw new Error("Not connected to Wrankey");

  const body: Record<string, unknown> = {
    unsignedXdr,
    chain: s.chain,
    networkPassphrase,
  };
  if (amount !== undefined) body.amount = amount;
  if (tokenId !== undefined) body.tokenId = tokenId;

  const res = await wkFetch(`/sub-orgs/${s.subOrgId}/sign-transaction`, "POST", body);

  if (res.allowed === false) {
    throw new Error(res.reason || "Policy denied");
  }

  if (!res.signedXdr) throw new Error("Wrankey did not return a signed transaction");
  return res.signedXdr;
}

export interface SignTxContext {
  amount?: bigint;
  tokenId?: number;
}

export function getWrankeySigner(): {
  address: string;
  signTx: (xdr: string, ctx?: SignTxContext) => Promise<string>;
} | null {
  const s = getSession();
  if (!s) return null;

  const NETWORK_PASSPHRASE =
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

  return {
    address: s.address,
    signTx: (xdr: string, ctx?: SignTxContext) =>
      wrankeySignTransaction(xdr, NETWORK_PASSPHRASE, ctx?.amount?.toString(), ctx?.tokenId),
  };
}

export function wrankeyDisconnect() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
