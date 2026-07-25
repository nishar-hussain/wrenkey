/**
 * Stellar key + transaction utilities (additive, EVM paths untouched).
 *
 * Stellar differs from EVM in three load-bearing ways this module hides:
 *   1. Keys are ed25519 (SLIP-0010), not secp256k1 (BIP-44). All derivation
 *      levels are hardened; addresses are base32 `G...`/`S...`, not `0x...`.
 *   2. There is no JSON-RPC. Horizon is a REST API and operations are built
 *      as `Transaction` envelopes (XDR), not `to`/`value`/`data` blobs.
 *   3. Accounts are stateful objects on-chain: a payment to a non-existent
 *      destination fails, so we auto-substitute `createAccount` in that case.
 *
 * Every public function here is consumed behind a `chain.family === "stellar"`
 * branch in the wallet/transaction routes, so the legacy ethers.js signer keeps
 * working untouched. Tests that assert `0x` addresses never reach this module.
 */

import { createHmac, pbkdf2Sync } from "node:crypto";
import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  Networks,
  BASE_FEE,
  type Transaction,
} from "@stellar/stellar-sdk";

const HARDENED_OFFSET = 0x80000000;
const STROOPS_PER_XLM = 10_000_000;

/** Stellar public/account addresses are 56-char base32 starting with `G`. */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(address);
}

/** Stellar secrets are 56-char base32 starting with `S`. */
function isValidStellarSecret(secret: string): boolean {
  return /^S[A-Z2-7]{55}$/.test(secret);
}

// ─── BIP-39 mnemonic → 64-byte seed ──────────────────────────────────────────
function bip39SeedFromMnemonic(mnemonic: string, passphrase = ""): Buffer {
  const normalized = mnemonic.normalize("NFKC");
  const salt = `mnemonic${passphrase}`.normalize("NFKC");
  return pbkdf2Sync(normalized, salt, 2048, 64, "sha512");
}

// ─── SLIP-0010 ed25519 derivation (hardened-only) ─────────────────────────────
function hmacSha512(key: Buffer, data: Buffer): Buffer {
  return createHmac("sha512", key).update(data).digest();
}

interface Slip10Node {
  key: Buffer;
  chain: Buffer;
}

function slip10Master(seed: Buffer): Slip10Node {
  const I = hmacSha512(Buffer.from("ed25519 seed", "utf8"), seed);
  return { key: I.subarray(0, 32), chain: I.subarray(32, 64) };
}

function slip10HardenedChild(parent: Slip10Node, index: number): Slip10Node {
  // SLIP-0010 §5: data = 0x00 || ser256(k_par) || ser32(i)
  const data = Buffer.concat([
    Buffer.from([0x00]),
    parent.key,
    intToBe32(index | HARDENED_OFFSET),
  ]);
  const I = hmacSha512(parent.chain, data);
  return { key: I.subarray(0, 32), chain: I.subarray(32, 64) };
}

function intToBe32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n >>> 0, 0);
  return buf;
}

/** Parse an HD path into a list of (hardened) absolute indices for ed25519. */
function parseStellarPath(path: string): number[] {
  const trimmed = path.trim().replace(/^m\//, "");
  if (!trimmed) return [];
  return trimmed.split("/").map((segmentRaw) => {
    const segment = segmentRaw.trim();
    const hardened = segment.endsWith("'") || segment.endsWith("h") || segment.endsWith("H");
    const value = parseInt(hardened ? segment.slice(0, -1) : segment, 10);
    if (Number.isNaN(value) || value < 0) throw new Error(`Invalid path segment: "${segment}"`);
    // ed25519 SLIP-10 only supports hardened derivation
    return value | HARDENED_OFFSET;
  });
}

export interface StellarAccount {
  address: string; // G...
  publicKey: string; // G... (same as address)
  secret: string; // S...
}

/**
 * Derive a Stellar ed25519 keypair from a BIP-39 mnemonic.
 *
 * Default path `m/44'/148'/0'` follows SEP-0005; the account index is appended
 * hardened, i.e. the full derivation is `m/44'/148'/0'/<index>'`.
 */
export function deriveStellarAccount(
  mnemonic: string,
  index: number,
  derivationPath = "m/44'/148'/0'",
): StellarAccount {
  if (index < 0) throw new Error("account index must be >= 0");

  const seed = bip39SeedFromMnemonic(mnemonic);
  let node = slip10Master(seed);

  const segments = parseStellarPath(derivationPath);
  for (const seg of segments) {
    node = slip10HardenedChild(node, seg);
  }
  // Append the hardened account index as the final SEP-0005 level.
  node = slip10HardenedChild(node, index | HARDENED_OFFSET);

  const kp = Keypair.fromRawEd25519Seed(Buffer.from(node.key));
  const address = kp.publicKey();
  return { address, publicKey: address, secret: kp.secret() };
}

/**
 * Derive from an already-stored Stellar secret (`S...`). Used by sign-only
 * paths where the mnemonic isn't re-derived from scratch.
 */
export function keypairFromSecret(secret: string): Keypair {
  if (!isValidStellarSecret(secret)) {
    throw new Error("Invalid Stellar secret (expected S...)");
  }
  return Keypair.fromSecret(secret);
}

// ─── Horizon helpers ──────────────────────────────────────────────────────────
function serverFor(horizonUrl: string): Horizon.Server {
  return new Horizon.Server(horizonUrl);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Horizon request timed out after ${ms}ms`)), ms),
    ),
  ]) as Promise<T>;
}

/** Network passphrase for the given horizon network (best-effort inference). */
export function resolveNetworkPassphrase(configuredPassphrase: string | null | undefined, horizonUrl: string): string {
  if (configuredPassphrase && configuredPassphrase.length > 0) return configuredPassphrase;
  const url = horizonUrl.toLowerCase();
  if (url.includes("test") || url.includes("futurenet")) return Networks.TESTNET;
  return Networks.PUBLIC;
}

// ─── Balance ──────────────────────────────────────────────────────────────────
export interface StellarBalance {
  address: string;
  nativeBalance: string; // XLM as decimal string (Horizon units)
  symbol: string;
  trustlines: { code: string; issuer: string; balance: string }[];
}

export async function getStellarBalance(address: string, horizonUrl: string): Promise<StellarBalance> {
  if (!isValidStellarAddress(address)) throw new Error(`Invalid Stellar address: ${address}`);
  const server = serverFor(horizonUrl);
  const account = await withTimeout(server.loadAccount(address), 15000);
  const native = (account.balances as any[]).find((b) => b.asset_type === "native");
  const trustlines = (account.balances as any[])
    .filter((b) => b.asset_type !== "native" && b.asset_type !== "liquidity_pool_shares")
    .map((b) => ({ code: b.asset_code, issuer: b.asset_issuer, balance: b.balance }));
  return {
    address,
    nativeBalance: native ? native.balance : "0",
    symbol: "XLM",
    trustlines,
  };
}

// ─── Sequence ─────────────────────────────────────────────────────────────────
/** On-chain sequence number for a funded account. Throws if the account is not funded. */
export async function getStellarSequence(address: string, horizonUrl: string): Promise<string> {
  if (!isValidStellarAddress(address)) throw new Error(`Invalid Stellar address: ${address}`);
  const server = serverFor(horizonUrl);
  const account = await withTimeout(server.loadAccount(address), 15000);
  return account.sequenceNumber();
}

// ─── Fee estimate ─────────────────────────────────────────────────────────────
export interface StellarFeeEstimate {
  baseFeeStroops: string;
  suggestedFeeStroops: string; // per operation
  estimatedFeeStroops: string; // single-op payment
  estimatedFeeXlm: string;
  currency: string;
}

export async function getStellarFeeEstimate(horizonUrl: string): Promise<StellarFeeEstimate> {
  const base = Number(BASE_FEE);
  try {
    const server = serverFor(horizonUrl);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    // feeStats() returns the structured Horizon /fee_stats payload
    const stats: any = await Promise.race([
      server.feeStats() as unknown as Promise<any>,
      new Promise((_, reject) => setTimeout(() => reject(new Error("fee stats timeout")), 10000)),
    ]).finally(() => clearTimeout(t));
    const mode = Number(stats?.fee_charged?.mode ?? base) || base;
    const perOp = Math.max(mode, base);
    return {
      baseFeeStroops: String(base),
      suggestedFeeStroops: String(perOp),
      estimatedFeeStroops: String(perOp),
      estimatedFeeXlm: (perOp / STROOPS_PER_XLM).toFixed(7),
      currency: "XLM",
    };
  } catch {
    return {
      baseFeeStroops: String(base),
      suggestedFeeStroops: String(base),
      estimatedFeeStroops: String(base),
      estimatedFeeXlm: (base / STROOPS_PER_XLM).toFixed(7),
      currency: "XLM",
    };
  }
}

// ─── Sign a payment (or create-account) envelope ─────────────────────────────
export interface StellarSignParams {
  secret: string; // sender S... secret derived from the wallet seed
  fromAddress: string; // sender G... address (must be funded)
  to: string; // destination G... address (may be unfunded → createAccount)
  amount: string; // XLM decimal string (Horizon/SDK amount units, e.g. "1.0000000")
  networkPassphrase: string;
  horizonUrl: string;
  memo?: string;
  feeStroops?: string; // per-op fee override
}

export interface StellarSignResult {
  /** Signed transaction envelope, base64 XDR. Safe to persist + replay. */
  envelopeXdr: string;
  /** Sequence number used for this transaction (for audit/nonce parity). */
  sequence: string;
  /** True if the destination was unfunded and a createAccount op was used. */
  createdAccount: boolean;
}

/**
 * Build, sign, and return a Stellar payment transaction. If the destination has
 * not been funded on-chain yet, automatically substitute a `createAccount`
 * operation (the only valid way to send XLM to a brand-new account).
 *
 * NOTE: this returns the signed XDR only — it does NOT broadcast. The
 * transaction routes call `broadcastStellarTransaction` afterwards so the
 * pre-send balance/nonce/risk checks can run first, mirroring the EVM path.
 */
export async function signStellarPayment(params: StellarSignParams): Promise<StellarSignResult> {
  if (!isValidStellarAddress(params.fromAddress)) throw new Error(`Invalid source Stellar address: ${params.fromAddress}`);
  if (!isValidStellarAddress(params.to)) throw new Error(`Invalid destination Stellar address: ${params.to}`);

  const kp = Keypair.fromSecret(params.secret);
  if (kp.publicKey() !== params.fromAddress) {
    throw new Error("Stellar source secret does not match the provided source address");
  }

  const server = serverFor(params.horizonUrl);

  // Source must exist + be funded to submit any operation.
  const sourceAccount = await withTimeout(server.loadAccount(params.fromAddress), 15000);

  // Decide op type: payment if destination exists, otherwise createAccount.
  let createdAccount = false;
  try {
    await withTimeout(server.loadAccount(params.to), 15000);
  } catch {
    createdAccount = true;
  }

  const fee = params.feeStroops || (await getStellarFeeEstimate(params.horizonUrl)).suggestedFeeStroops;

  const builder = new TransactionBuilder(sourceAccount, {
    fee: String(fee),
    networkPassphrase: params.networkPassphrase,
  });

  if (createdAccount) {
    builder.addOperation(
      Operation.createAccount({
        destination: params.to,
        startingBalance: params.amount,
      }),
    );
  } else {
    builder.addOperation(
      Operation.payment({
        destination: params.to,
        asset: Asset.native(),
        amount: params.amount,
      }),
    );
  }

  if (params.memo && params.memo.length > 0) {
    // Stellar text memo max is 28 bytes
    const memoBytes = Buffer.from(params.memo, "utf8");
    builder.addMemo(Memo.text(memoBytes.subarray(0, 28).toString("utf8")));
  }

  const tx = builder.setTimeout(180).build();
  tx.sign(kp);

  return {
    envelopeXdr: tx.toXDR(),
    sequence: sourceAccount.sequenceNumber(),
    createdAccount,
  };
}

// ─── Broadcast ────────────────────────────────────────────────────────────────
function txFromXdr(envelopeXdr: string): Transaction {
  // Network passphrase is irrelevant for inspection (signatures already applied)
  // — fromXDR rejects anything that isn't a valid Transaction/FeeBump envelope.
  const tx = TransactionBuilder.fromXDR(envelopeXdr, Networks.PUBLIC);
  isTransaction(tx);
  return tx;
}

function isTransaction(tx: any): asserts tx is Transaction {
  // TransactionBuilder.fromXDR returns Transaction | FeeBumpTransaction
  if (typeof tx.sequence !== "string") {
    throw new Error("Expected a Transaction envelope, got fee-bump");
  }
}

export async function broadcastStellarTransaction(
  envelopeXdr: string,
  networkPassphrase: string,
  horizonUrl: string,
): Promise<{ hash: string }> {
  if (!envelopeXdr || envelopeXdr.trim().length === 0) throw new Error("Missing transaction envelope XDR");
  const server = serverFor(horizonUrl);
  // Re-attach the network passphrase so submit validates the existing signature.
  const tx = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase);
  isTransaction(tx);
  const response = await withTimeout(
    server.submitTransaction(tx) as unknown as Promise<{ hash: string; ledger?: number; successful?: boolean }>,
    60000,
  );
  const hash = response.hash || (tx.hash() as Buffer).toString("hex");
  return { hash };
}

/**
 * Inspect a signed envelope's sequence number (used by retry/audit parity).
 * Passphrase is irrelevant for inspection only.
 */
export async function getSequenceForBroadcast(envelopeXdr: string): Promise<string> {
  return txFromXdr(envelopeXdr).sequence;
}

// ─── Transaction status ───────────────────────────────────────────────────────
export interface StellarTxStatus {
  status: "PENDING" | "CONFIRMED" | "FAILED";
  successful: boolean;
  ledger: number | null;
}

export async function getStellarTransactionStatus(
  txHash: string,
  horizonUrl: string,
): Promise<StellarTxStatus> {
  if (!txHash || txHash.trim().length === 0) return { status: "PENDING", successful: false, ledger: null };

  try {
    const server = serverFor(horizonUrl);
    const response: any = await withTimeout(
      (server as unknown as { transactions: () => { transaction: (h: string) => { call: () => Promise<any> } } })
        .transactions()
        .transaction(txHash)
        .call(),
      15000,
    );
    const ledgers = response?.ledger ?? response?.ledger_attr ?? null;
    if (ledgers === null || ledgers === undefined) {
      return { status: "PENDING", successful: false, ledger: null };
    }
    const successful = response.successful !== false
      && response.successful_result !== "tx_failed";
    return {
      status: successful ? "CONFIRMED" : "FAILED",
      successful,
      ledger: Number(ledgers),
    };
  } catch {
    return { status: "PENDING", successful: false, ledger: null };
  }
}

// ─── Message signing (ed25519 over raw message bytes) ─────────────────────────
export function signStellarMessage(secret: string, message: string): string {
  const kp = Keypair.fromSecret(secret);
  const data = Buffer.from(message, "utf8");
  const signature = kp.sign(data); // Buffer (64 bytes)
  return signature.toString("hex");
}

export function verifyStellarMessage(publicKey: string, message: string, signatureHex: string): boolean {
  const kp = Keypair.fromPublicKey(publicKey);
  return kp.verify(Buffer.from(message, "utf8"), Buffer.from(signatureHex, "hex"));
}

export { STROOPS_PER_XLM, BASE_FEE };