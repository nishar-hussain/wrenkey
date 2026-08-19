#!/usr/bin/env node
// Bullet demo preflight — one command, green/red board, < 60s.
// Run BEFORE every demo rehearsal or demo-day. Exit code 0 = all green.
//
// Usage:
//   node scripts/preflight.mjs [--env live|local]   (default: live)
//   pnpm preflight [-- --env local]
//
// Optional env (put in .env.e2e at repo root — gitignored — or export):
//   E2E_PROBE_SECRET       funded testnet secret used as the tx source for
//                          read-only simulations. If unset, a throwaway
//                          account is created + Friendbot-funded (free).
//   E2E_SENDER_SECRET      demo sender account — balance is checked.
//   E2E_RECIPIENT_SECRET   demo recipient account — balance is checked.
//   E2E_DEMO_HANDLE        handle you will send to in the demo (e.g. @you)
//                          — checked through /resolve end-to-end.
//   E2E_KNOWN_COMMITMENT   decimal commitment of a past deposit — checked
//                          through /path (proves the indexer tree is warm).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

// ── deps (resolved from workspace packages; no new installs) ─────────────────
const backendRequire = createRequire(path.join(REPO_ROOT, "backend", "package.json"));
const StellarSdk = backendRequire("@stellar/stellar-sdk");

// ── env loading (no dotenv dep; same approach as set_vk.mjs) ─────────────────
function loadEnvFile(file) {
  try {
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      });
  } catch {
    /* file absent — fine */
  }
}
loadEnvFile(path.join(REPO_ROOT, ".env"));
loadEnvFile(path.join(REPO_ROOT, ".env.e2e"));

// ── config profiles ───────────────────────────────────────────────────────────
const argEnv = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : "live";

const PROFILES = {
  live: {
    frontend: "https://sendbullet.xyz",
    backend: "https://zeekpaybackend-production.up.railway.app",
    contract: "CB5HPNJOZ3ULPNPRL5FJBHSDCHYWFAWXO6TY3JL6URZSYXMRTFQ3LUIB",
    rpc: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
    supabase: "https://fxtxvierohxvvusmhkoa.supabase.co",
  },
  local: {
    frontend: process.env.NEXT_PUBLIC_FRONTEND_URL ?? "http://localhost:3000",
    backend: process.env.NEXT_PUBLIC_RESOLVER_URL ?? "http://localhost:3001",
    contract: process.env.ZEEKPAY_CONTRACT_ID ?? "",
    rpc: process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    passphrase:
      process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
    supabase: process.env.SUPABASE_URL ?? "",
  },
};

const CFG = PROFILES[argEnv];
if (!CFG) {
  console.error(`Unknown --env "${argEnv}" (expected live|local)`);
  process.exit(2);
}

// ── tiny check framework ─────────────────────────────────────────────────────
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const section = (t) => console.log(`\n${t}`);

const TIMEOUT = 15_000;
async function get(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── probe account for read-only simulations ──────────────────────────────────
async function ensureProbeAccount(rpc) {
  if (process.env.E2E_PROBE_SECRET) {
    return StellarSdk.Keypair.fromSecret(process.env.E2E_PROBE_SECRET);
  }
  const kp = StellarSdk.Keypair.random();
  const res = await get(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(kp.publicKey())}`
  );
  if (!res.ok) throw new Error(`friendbot funding failed (${res.status})`);
  // Wait until the account is visible to the RPC.
  for (let i = 0; i < 10; i++) {
    try {
      await rpc.getAccount(kp.publicKey());
      return kp;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("friendbot-funded account never became visible");
}

/** Simulate a read-only contract call; returns the native retval. */
async function simulate(rpc, source, method, ...args) {
  const contract = new StellarSdk.Contract(CFG.contract);
  const account = await rpc.getAccount(source);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: CFG.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    const err = new Error(sim.error);
    err.simulationError = sim.error;
    throw err;
  }
  return sim.result?.retval ? StellarSdk.scValToNative(sim.result.retval) : undefined;
}

// ── checks ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`BULLET PREFLIGHT — env: ${argEnv}`);
  console.log(`  frontend: ${CFG.frontend}`);
  console.log(`  backend:  ${CFG.backend}`);
  console.log(`  contract: ${CFG.contract || "(unset)"}`);

  // 1. frontend + backend + rpc + supabase reachability
  section("1. Services");
  try {
    const res = await get(CFG.frontend);
    check("frontend serves", res.ok, `HTTP ${res.status}`);
  } catch (e) {
    check("frontend serves", false, String(e.cause?.code ?? e.message ?? e));
  }
  try {
    const res = await get(`${CFG.backend}/health`);
    const body = await res.json().catch(() => ({}));
    check("backend /health", res.ok && body.ok === true, JSON.stringify(body));
  } catch (e) {
    check("backend /health", false, String(e.cause?.code ?? e.message ?? e));
  }

  const rpc = new StellarSdk.rpc.Server(CFG.rpc);
  try {
    const ledger = await rpc.getLatestLedger();
    check("soroban RPC", ledger.sequence > 0, `ledger ${ledger.sequence}`);
  } catch (e) {
    check("soroban RPC", false, String(e).slice(0, 120));
  }

  if (CFG.supabase) {
    try {
      // Any HTTP response (even 4xx) proves the project is reachable.
      const res = await get(`${CFG.supabase}/auth/v1/health`);
      check("supabase reachable", true, `HTTP ${res.status}`);
    } catch (e) {
      check("supabase reachable", false, String(e.cause?.code ?? e.message ?? e));
    }
  } else {
    check("supabase reachable", false, "no SUPABASE_URL configured for this env");
  }

  // 2. contract read path (is_known_root / is_nullifier_used must answer)
  section("2. Contract (read-only simulations)");
  let probe = null;
  try {
    probe = await ensureProbeAccount(rpc);
    check("probe account funded", true, probe.publicKey().slice(0, 8) + "…");
  } catch (e) {
    check("probe account funded", false, String(e).slice(0, 120));
  }

  if (probe && CFG.contract) {
    const bytes32 = (n) =>
      StellarSdk.xdr.ScVal.scvBytes(Buffer.from(n.toString(16).padStart(64, "0"), "hex"));
    try {
      const known = await simulate(rpc, probe.publicKey(), "is_known_root", bytes32(1));
      check("is_known_root answers", known === false, `dummy root => ${known} (false expected)`);
    } catch (e) {
      check("is_known_root answers", false, String(e).slice(0, 140));
    }
    try {
      const used = await simulate(rpc, probe.publicKey(), "is_nullifier_used", bytes32(2));
      check("is_nullifier_used answers", used === false, `dummy nullifier => ${used} (false expected)`);
    } catch (e) {
      check("is_nullifier_used answers", false, String(e).slice(0, 140));
    }
    // Token registration probe: deposit() fails with contract error #11
    // (UnknownToken) for unregistered tokenIds. Any other outcome (success or
    // a SAC-side balance error) means the token IS registered.
    for (const [tokenId, label] of [[0, "USDC"], [1, "XLM"], [2, "USDT"]]) {
      try {
        const { xdr } = StellarSdk;
        await simulate(
          rpc,
          probe.publicKey(),
          "deposit",
          StellarSdk.nativeToScVal(probe.publicKey(), { type: "address" }),
          StellarSdk.nativeToScVal(1n, { type: "i128" }),
          xdr.ScVal.scvBytes(Buffer.alloc(32, 7)),
          StellarSdk.nativeToScVal(tokenId, { type: "u32" })
        );
        check(`token ${tokenId} (${label}) registered`, true, "deposit simulates clean");
      } catch (e) {
        const msg = String(e.simulationError ?? e);
        if (msg.includes("#11")) {
          check(`token ${tokenId} (${label}) registered`, false, "contract says UnknownToken (#11)");
        } else {
          // e.g. SAC balance/trustline failure — reached the transfer, so the token exists.
          check(`token ${tokenId} (${label}) registered`, true, `registered (sim fails later: ${msg.slice(0, 60)})`);
        }
      }
    }
  } else if (!CFG.contract) {
    check("contract id configured", false, `set ZEEKPAY_CONTRACT_ID for --env ${argEnv}`);
  }

  // 3. backend tree + resolver
  section("3. Backend tree + resolver");
  try {
    const res = await get(`${CFG.backend}/path?commitment=12345`);
    const body = await res.json().catch(() => ({}));
    check(
      "tree API alive (/path 404 on dummy)",
      res.status === 404 && body.error === "unknown_commitment",
      `HTTP ${res.status} ${JSON.stringify(body).slice(0, 80)}`
    );
  } catch (e) {
    check("tree API alive (/path 404 on dummy)", false, String(e.cause?.code ?? e.message ?? e));
  }
  if (process.env.E2E_KNOWN_COMMITMENT) {
    try {
      const res = await get(
        `${CFG.backend}/path?commitment=${encodeURIComponent(process.env.E2E_KNOWN_COMMITMENT)}`
      );
      const body = await res.json().catch(() => ({}));
      check(
        "indexer warm (known commitment in tree)",
        res.ok && Array.isArray(body.pathElements),
        `HTTP ${res.status} root=${String(body.root ?? "").slice(0, 16)}…`
      );
    } catch (e) {
      check("indexer warm (known commitment in tree)", false, String(e).slice(0, 120));
    }
  } else {
    console.log("  ⏭️  indexer warmth — set E2E_KNOWN_COMMITMENT to check");
  }
  if (process.env.E2E_DEMO_HANDLE) {
    try {
      const res = await get(
        `${CFG.backend}/resolve?q=${encodeURIComponent(process.env.E2E_DEMO_HANDLE)}`
      );
      const body = await res.json().catch(() => ({}));
      check(
        `demo handle resolves (${process.env.E2E_DEMO_HANDLE})`,
        res.ok && body.found === true,
        body.found ? `→ ${body.stellarAddress}` : `HTTP ${res.status} ${JSON.stringify(body).slice(0, 80)}`
      );
    } catch (e) {
      check(`demo handle resolves (${process.env.E2E_DEMO_HANDLE})`, false, String(e).slice(0, 120));
    }
  } else {
    console.log("  ⏭️  handle resolution — set E2E_DEMO_HANDLE to check");
  }

  // 4. demo accounts
  section("4. Demo accounts");
  for (const [envKey, label, min] of [
    ["E2E_SENDER_SECRET", "sender", 2],
    ["E2E_RECIPIENT_SECRET", "recipient", 1],
  ]) {
    const secret = process.env[envKey];
    if (!secret) {
      console.log(`  ⏭️  ${label} balance — set ${envKey} to check`);
      continue;
    }
    try {
      const kp = StellarSdk.Keypair.fromSecret(secret);
      const acct = await rpc.getAccount(kp.publicKey());
      const native = acct.balances.find((b) => b.asset_type === "native");
      const xlm = native ? parseFloat(native.balance) : 0;
      check(`${label} funded (${kp.publicKey().slice(0, 8)}…)`, xlm >= min, `${xlm.toFixed(2)} XLM (need ≥ ${min})`);
    } catch (e) {
      check(`${label} funded`, false, String(e).slice(0, 120));
    }
  }

  // 5. local circuit assets (needed for browser proving + e2e-api script)
  section("5. Circuit assets (local)");
  for (const rel of ["frontend/public/circuits/claim.wasm", "frontend/public/circuits/claim.zkey"]) {
    const p = path.join(REPO_ROOT, rel);
    let ok = false;
    let detail = "missing";
    try {
      const st = fs.statSync(p);
      ok = st.size > 1000;
      detail = `${(st.size / 1024 / 1024).toFixed(1)} MB`;
    } catch { /* missing */ }
    check(rel, ok, detail);
  }
  try {
    const vk = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "circuits", "build", "claim_vk.json"), "utf8")
    );
    const ic = vk.IC ?? vk.ic ?? [];
    check("claim_vk.json IC = 6 (5 public inputs)", ic.length === 6, `IC length ${ic.length}`);
  } catch (e) {
    check("claim_vk.json readable", false, String(e).slice(0, 120));
  }

  // ── board ──────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log("\n────────────────────────────────────────");
  console.log(`${results.length - failed.length}/${results.length} checks green`);
  if (failed.length > 0) {
    console.log(`RED: ${failed.map((f) => f.name).join("; ")}`);
    process.exit(1);
  }
  console.log("ALL GREEN — safe to start the demo.");
}

main().catch((e) => {
  console.error("preflight crashed:", e);
  process.exit(1);
});
