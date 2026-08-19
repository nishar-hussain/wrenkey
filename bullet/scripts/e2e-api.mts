#!/usr/bin/env tsx
// Bullet API end-to-end test — drives the REAL claim flow against the deployed
// system with raw keypairs (no Freighter, no browser):
//
//   deposit (1 XLM note) -> indexer picks it up -> /path -> Groth16 proof
//   (snarkjs, same wasm+zkey the browser uses) -> claim -> assertions:
//     a. claim tx SUCCESS
//     b. nullifier now used on-chain
//     c. recipient balance increased by ~amount - fees
//     d. PRIVACY: claim tx contains no byte of the deposit commitment, and
//        the deposit tx contains no byte of the nullifier (deposit<->claim
//        unlinkability, checked on the raw XDR)
//     e. ADVERSARIAL: replaying the same claim is rejected (NullifierUsed #6)
//
// Usage:
//   pnpm test:e2e [-- --env local] [-- --smoke] [-- --skip-double-spend]
//   tsx scripts/e2e-api.mts --env live
//
// Zero-cost: testnet only, accounts funded via Friendbot.
// Optional env (.env.e2e at repo root is gitignored):
//   E2E_SENDER_SECRET / E2E_RECIPIENT_SECRET — reuse fixed accounts
//   E2E_DEMO_HANDLE — handle checked by --smoke through /resolve
//   E2E_OUT — write the machine-readable evidence JSON here

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
// Single source of truth for Poseidon: the backend module validated against
// the on-chain circuit in poseidon.test.ts.
import { poseidon, BLS_R } from "../backend/src/poseidon.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const backendRequire = createRequire(path.join(REPO_ROOT, "backend", "package.json"));
const frontendRequire = createRequire(path.join(REPO_ROOT, "frontend", "package.json"));
const StellarSdk = backendRequire("@stellar/stellar-sdk");
const snarkjs = frontendRequire("snarkjs");

// ── env files ────────────────────────────────────────────────────────────────
function loadEnvFile(file: string): void {
  try {
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      });
  } catch {
    /* absent */
  }
}
loadEnvFile(path.join(REPO_ROOT, ".env"));
loadEnvFile(path.join(REPO_ROOT, ".env.e2e"));

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string, d: string) => {
  const i = argv.indexOf(n);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const ENV = opt("--env", "live");
const SMOKE = flag("--smoke");
const SKIP_DOUBLE_SPEND = flag("--skip-double-spend");

const PROFILES: Record<string, Record<string, string>> = {
  live: {
    frontend: "https://sendbullet.xyz",
    backend: "https://zeekpaybackend-production.up.railway.app",
    contract: "CB5HPNJOZ3ULPNPRL5FJBHSDCHYWFAWXO6TY3JL6URZSYXMRTFQ3LUIB",
    rpc: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
  },
  local: {
    frontend: process.env.NEXT_PUBLIC_FRONTEND_URL ?? "http://localhost:3000",
    backend: process.env.NEXT_PUBLIC_RESOLVER_URL ?? "http://localhost:3001",
    contract: process.env.ZEEKPAY_CONTRACT_ID ?? "",
    rpc: process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    passphrase: process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
  },
};
const CFG = PROFILES[ENV];
if (!CFG) throw new Error(`unknown --env "${ENV}"`);
if (!CFG.contract) throw new Error(`no contract id for --env ${ENV} (set ZEEKPAY_CONTRACT_ID)`);

// tokenId 1 = native XLM: the only token fundable via Friendbot (zero-cost rule).
const TOKEN_ID = "1";
const AMOUNT = opt("--amount", "10000000"); // 1 XLM in stroops

const WASM_PATH = path.join(REPO_ROOT, "frontend", "public", "circuits", "claim.wasm");
const ZKEY_PATH = path.join(REPO_ROOT, "frontend", "public", "circuits", "claim.zkey");

// ── small framework ──────────────────────────────────────────────────────────
interface Assertion { name: string; ok: boolean; detail: string }
const assertions: Assertion[] = [];
const assert = (name: string, ok: boolean, detail = "") => {
  assertions.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const step = (t: string) => console.log(`\n▶ ${t}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rpc = new StellarSdk.rpc.Server(CFG.rpc);
const contract = new StellarSdk.Contract(CFG.contract);
const { xdr } = StellarSdk;

// ── helpers ──────────────────────────────────────────────────────────────────
async function fundWithFriendbot(pubkey: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(pubkey)}`);
  if (!res.ok) throw new Error(`friendbot failed for ${pubkey.slice(0, 8)}… (${res.status})`);
  for (let i = 0; i < 15; i++) {
    try {
      await rpc.getAccount(pubkey);
      return;
    } catch {
      await sleep(1500);
    }
  }
  throw new Error("friendbot account never became visible");
}

async function getOrMakeKeypair(envKey: string, label: string) {
  const secret = process.env[envKey];
  if (secret) {
    const kp = StellarSdk.Keypair.fromSecret(secret);
    console.log(`  ${label}: ${kp.publicKey()} (from ${envKey})`);
    return kp;
  }
  const kp = StellarSdk.Keypair.random();
  console.log(`  ${label}: ${kp.publicKey()} (generated, Friendbot-funding…)`);
  await fundWithFriendbot(kp.publicKey());
  console.log(`  ${label} funded. Reuse later: export ${envKey}=${kp.secret()}`);
  return kp;
}

async function buildSignSend(kp: ReturnType<typeof StellarSdk.Keypair.random>, op: any, label: string) {
  const account = await rpc.getAccount(kp.publicKey());
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: CFG.passphrase,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();
  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(kp);
  const sent = await rpc.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`${label} send failed: ${JSON.stringify(sent.errorResult)}`);
  const final = await rpc.pollTransaction(sent.hash, { attempts: 60 });
  if (final.status !== "SUCCESS") throw new Error(`${label} tx ${sent.hash} ended ${final.status}`);
  return sent.hash as string;
}

async function simulateBool(source: string, method: string, arg: any): Promise<boolean> {
  const account = await rpc.getAccount(source);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: CFG.passphrase,
  })
    .addOperation(contract.call(method, arg))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return StellarSdk.scValToNative(sim.result!.retval) === true;
}

/** Concatenate every XDR layer of a fetched transaction into one Buffer. */
async function txXdrBytes(hash: string): Promise<Buffer> {
  const tx = await rpc.getTransaction(hash);
  const parts: Buffer[] = [];
  const push = (v: any) => {
    if (!v) return;
    if (typeof v === "string") parts.push(Buffer.from(v, "base64"));
    else if (typeof v.toXDR === "function") parts.push(Buffer.from(v.toXDR("base64") as string, "base64"));
  };
  push((tx as any).envelopeXdr);
  push((tx as any).resultXdr);
  push((tx as any).resultMetaXdr);
  return Buffer.concat(parts);
}

const bytesBE = (n: bigint, bytes: number): Buffer => {
  const hex = n.toString(16).padStart(bytes * 2, "0");
  if (hex.length > bytes * 2) throw new Error("overflow");
  return Buffer.from(hex, "hex");
};

// proof byte layout: mirrors frontend/src/lib/prove_browser.ts exactly
// (G1 = BE(X)||BE(Y); G2 = BE(X_c1)||BE(X_c0)||BE(Y_c1)||BE(Y_c0); Fr = BE 32B)
const be = (dec: string, bytes: number): string => BigInt(dec).toString(16).padStart(bytes * 2, "0");
const g1 = (pt: string[]): string => be(pt[0], 48) + be(pt[1], 48);
const g2 = (pt: string[][]): string =>
  be(pt[0][1], 48) + be(pt[0][0], 48) + be(pt[1][1], 48) + be(pt[1][0], 48);
const frHex = (dec: string): string => be(dec, 32);

const expertTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;

// ── smoke mode ───────────────────────────────────────────────────────────────
async function smoke() {
  console.log(`BULLET API SMOKE — env: ${ENV}`);
  try {
    const res = await fetch(`${CFG.backend}/health`);
    const body = await res.json();
    assert("GET /health", res.ok && body.ok === true, JSON.stringify(body));
  } catch (e) {
    assert("GET /health", false, String(e));
  }
  try {
    const res = await fetch(`${CFG.backend}/path?commitment=12345`);
    const body = await res.json();
    assert("GET /path dummy → 404 unknown_commitment", res.status === 404 && body.error === "unknown_commitment", `HTTP ${res.status}`);
  } catch (e) {
    assert("GET /path dummy → 404", false, String(e));
  }
  try {
    const res = await fetch(`${CFG.backend}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientPubkey: "zz" }),
    });
    const body = await res.json();
    assert("POST /notes rejects malformed input", res.status === 400 && body.error === "invalid_input", `HTTP ${res.status}`);
  } catch (e) {
    assert("POST /notes rejects malformed input", false, String(e));
  }
  try {
    const res = await fetch(`${CFG.backend}/activity`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "send", amount: 1 }),
    });
    assert("POST /activity requires auth", res.status === 401, `HTTP ${res.status}`);
  } catch (e) {
    assert("POST /activity requires auth", false, String(e));
  }
  const handle = process.env.E2E_DEMO_HANDLE;
  if (handle) {
    try {
      const res = await fetch(`${CFG.backend}/resolve?q=${encodeURIComponent(handle)}`);
      const body = await res.json();
      assert(`GET /resolve ${handle}`, res.ok && body.found === true, body.stellarAddress ?? JSON.stringify(body));
    } catch (e) {
      assert(`GET /resolve ${handle}`, false, String(e));
    }
  } else {
    console.log("  ⏭️  /resolve — set E2E_DEMO_HANDLE to check");
  }
  const vkOk = fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH);
  assert("circuit wasm + zkey present", vkOk, vkOk ? "frontend/public/circuits" : "missing");
}

// ── full e2e ─────────────────────────────────────────────────────────────────
async function full() {
  console.log(`BULLET API E2E — env: ${ENV}`);
  console.log(`  backend:  ${CFG.backend}`);
  console.log(`  contract: ${CFG.contract}`);
  console.log(`  note:     ${BigInt(AMOUNT) / 10_000_000n} XLM (tokenId ${TOKEN_ID})`);

  step("Accounts");
  const sender = await getOrMakeKeypair("E2E_SENDER_SECRET", "sender");
  const recipient = await getOrMakeKeypair("E2E_RECIPIENT_SECRET", "recipient");

  step("Note construction (secret never leaves this process)");
  const secret = (BigInt("0x" + crypto.randomBytes(31).toString("hex")) % BLS_R).toString();
  // recipientDigest stands in for the stealth/ECDH digest the app derives:
  // sha256(recipient pubkey) with the top byte zeroed → canonical Fr (< r).
  const rdBytes = crypto.createHash("sha256").update(recipient.rawPublicKey()).digest();
  rdBytes[0] = 0;
  const recipientDigest = BigInt("0x" + rdBytes.toString("hex")).toString();
  const commitment = poseidon([secret, recipientDigest, AMOUNT, TOKEN_ID]);
  const nullifier = poseidon([secret]);
  console.log(`  commitment:      ${commitment.slice(0, 24)}…`);
  console.log(`  nullifier:       ${nullifier.slice(0, 24)}…`);
  console.log(`  recipientDigest: ${recipientDigest.slice(0, 24)}…`);

  step("1. Deposit (sender signs)");
  const commitmentBytes = bytesBE(BigInt(commitment), 32);
  const depositOp = contract.call(
    "deposit",
    StellarSdk.nativeToScVal(sender.publicKey(), { type: "address" }),
    StellarSdk.nativeToScVal(BigInt(AMOUNT), { type: "i128" }),
    xdr.ScVal.scvBytes(commitmentBytes),
    StellarSdk.nativeToScVal(Number(TOKEN_ID), { type: "u32" })
  );
  const depositHash = await buildSignSend(sender, depositOp, "deposit");
  console.log(`  deposit tx: ${depositHash}`);
  console.log(`  ${expertTx(depositHash)}`);

  step("2. Wait for indexer (deposit event → leaf → posted root)");
  let merkle: { root: string; pathElements: string[]; pathIndices: number[] } | null = null;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${CFG.backend}/path?commitment=${encodeURIComponent(commitment)}`);
    if (res.ok) {
      merkle = await res.json();
      break;
    }
    await sleep(6000);
  }
  if (!merkle) {
    assert("indexer picked up deposit within 180s", false, "commitment never appeared in /path");
    return finish(depositHash);
  }
  assert("indexer picked up deposit", true, `leaf in tree, root ${merkle.root.slice(0, 20)}…`);

  step("3. Root recognized on-chain");
  // The indexer inserts the leaf into its in-memory tree BEFORE post_root
  // confirms on-chain, so /path can answer a few seconds before the root is
  // claimable. Poll rather than assert instantly (mirrors the small window a
  // fast browser user can also hit — see DEMO_TESTING_GUIDE.md Test 3).
  let rootKnown = false;
  const rootDeadline = Date.now() + 90_000;
  while (Date.now() < rootDeadline && !rootKnown) {
    rootKnown = await simulateBool(
      recipient.publicKey(),
      "is_known_root",
      xdr.ScVal.scvBytes(bytesBE(BigInt(merkle.root), 32))
    );
    if (!rootKnown) await sleep(5000);
  }
  assert("is_known_root(posted root) = true", rootKnown, rootKnown ? "" : "root never posted within 90s");

  step("4. Groth16 proof (snarkjs, browser-identical assets)");
  const t0 = Date.now();
  const { proof } = await snarkjs.groth16.fullProve(
    {
      root: merkle.root,
      nullifier,
      recipientDigest,
      amount: AMOUNT,
      tokenId: TOKEN_ID,
      secret,
      pathElements: merkle.pathElements,
      pathIndices: merkle.pathIndices,
    },
    WASM_PATH,
    ZKEY_PATH
  );
  const proofMs = Date.now() - t0;
  const proofA = g1(proof.pi_a);
  const proofB = g2(proof.pi_b);
  const proofC = g1(proof.pi_c);
  assert("proof generated", proofA.length === 192 && proofB.length === 384 && proofC.length === 192, `${(proofMs / 1000).toFixed(1)}s`);

  step("5. Nullifier unused before claim");
  const nullifierBytes = bytesBE(BigInt(nullifier), 32);
  const usedBefore = await simulateBool(recipient.publicKey(), "is_nullifier_used", xdr.ScVal.scvBytes(nullifierBytes));
  assert("is_nullifier_used = false before", usedBefore === false, "");

  step("6. Claim (recipient signs)");
  const balBefore = await nativeBalance(recipient.publicKey());
  const claimOp = contract.call(
    "claim",
    xdr.ScVal.scvBytes(Buffer.from(proofA, "hex")),
    xdr.ScVal.scvBytes(Buffer.from(proofB, "hex")),
    xdr.ScVal.scvBytes(Buffer.from(proofC, "hex")),
    xdr.ScVal.scvBytes(bytesBE(BigInt(merkle.root), 32)),
    xdr.ScVal.scvBytes(nullifierBytes),
    xdr.ScVal.scvBytes(bytesBE(BigInt(recipientDigest), 32)),
    StellarSdk.nativeToScVal(recipient.publicKey(), { type: "address" }),
    StellarSdk.nativeToScVal(BigInt(AMOUNT), { type: "i128" }),
    StellarSdk.nativeToScVal(Number(TOKEN_ID), { type: "u32" })
  );
  let claimHash: string;
  try {
    claimHash = await buildSignSend(recipient, claimOp, "claim");
  } catch (e) {
    assert("claim tx SUCCESS", false, String(e).slice(0, 300));
    return finish(depositHash);
  }
  assert("claim tx SUCCESS", true, claimHash);
  console.log(`  ${expertTx(claimHash)}`);

  step("7. Post-claim assertions");
  const usedAfter = await simulateBool(recipient.publicKey(), "is_nullifier_used", xdr.ScVal.scvBytes(nullifierBytes));
  assert("is_nullifier_used = true after", usedAfter, "");

  const balAfter = await nativeBalance(recipient.publicKey());
  const delta = balAfter - balBefore;
  const expected = Number(AMOUNT) / 1e7;
  // recipient pays the claim fee, so delta = amount - feeCharged (< amount).
  assert(
    "recipient balance +amount − fee",
    delta > expected - 0.2 && delta <= expected,
    `${balBefore.toFixed(4)} → ${balAfter.toFixed(4)} XLM (Δ ${delta.toFixed(4)})`
  );

  step("8. Privacy: deposit ↔ claim share no bytes on-chain");
  const [depositXdr, claimXdr] = await Promise.all([txXdrBytes(depositHash), txXdrBytes(claimHash)]);
  assert(
    "claim tx does NOT contain the deposit commitment",
    !claimXdr.includes(commitmentBytes),
    `${depositXdr.length}B vs ${claimXdr.length}B of XDR compared`
  );
  assert(
    "deposit tx does NOT contain the claim nullifier",
    !depositXdr.includes(nullifierBytes),
    ""
  );

  if (!SKIP_DOUBLE_SPEND) {
    step("9. Adversarial: replay same claim (double-spend attempt)");
    const account = await rpc.getAccount(recipient.publicKey());
    const replayTx = new StellarSdk.TransactionBuilder(account, {
      fee: "1000000",
      networkPassphrase: CFG.passphrase,
    })
      .addOperation(claimOp)
      .setTimeout(30)
      .build();
    const sim = await rpc.simulateTransaction(replayTx);
    const err = StellarSdk.rpc.Api.isSimulationError(sim) ? String(sim.error) : "";
    assert(
      "replay rejected with NullifierUsed (#6)",
      err.includes("#6") || /nullifier/i.test(err),
      err.slice(0, 120) || "simulation unexpectedly succeeded"
    );
  }

  finish(depositHash, claimHash);
}

async function nativeBalance(pubkey: string): Promise<number> {
  // rpc.getAccount (Soroban RPC) carries no balances; balances live on Horizon.
  const horizon = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
  const acct = await horizon.loadAccount(pubkey);
  const native = (acct.balances as any[]).find((b) => b.asset_type === "native");
  return native ? parseFloat(native.balance) : 0;
}

function finish(depositHash?: string, claimHash?: string): never {
  const failed = assertions.filter((a) => !a.ok);
  console.log("\n────────────────────────────────────────");
  console.log("EVIDENCE");
  if (depositHash) console.log(`  deposit: ${expertTx(depositHash)}`);
  if (claimHash) console.log(`  claim:   ${expertTx(claimHash)}`);
  console.log(`${assertions.length - failed.length}/${assertions.length} assertions green`);
  const evidence = {
    env: ENV,
    contract: CFG.contract,
    backend: CFG.backend,
    date: new Date().toISOString(),
    depositHash: depositHash ?? null,
    claimHash: claimHash ?? null,
    assertions,
  };
  if (process.env.E2E_OUT) {
    fs.writeFileSync(process.env.E2E_OUT, JSON.stringify(evidence, null, 2));
    console.log(`evidence written to ${process.env.E2E_OUT}`);
  }
  if (failed.length > 0) {
    console.log(`FAILED: ${failed.map((f) => f.name).join("; ")}`);
    process.exit(1);
  }
  console.log(SMOKE ? "SMOKE PASS." : "E2E PASS — deposit → claim verified on the live system.");
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────
try {
  if (SMOKE) {
    await smoke();
    finish();
  } else {
    await full();
  }
} catch (e) {
  console.error("\ne2e-api crashed:", e);
  process.exit(1);
}
