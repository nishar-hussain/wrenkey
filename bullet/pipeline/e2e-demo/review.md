# e2e-demo — Review + Security Checklist

> Retro-written 2026-07-25 (pipeline artifact per SPEC §9). Covers the
> deployment as it exists today plus the 2026-07-25 demo-hardening tooling.

## What was reviewed

- Live deployment surface: contract `CB5HPNJO…LUIB` (testnet), Railway
  backend, Vercel frontend, Supabase, deposit indexer.
- `scripts/preflight.mjs`, `scripts/e2e-api.mts` (new, this round).
- Contract claim path as exercised by the 2026-07-25 live e2e run.

## Verified by execution (2026-07-25, live testnet)

- Real Groth16 proof (snarkjs, browser-identical wasm+zkey) verifies
  on-chain through the native BLS12-381 host functions. Proof gen: 0.9s in
  Node (browser budget: 15-30s incl. WASM warm-up).
- Exact payout: recipient delta 0.9613 XLM on a 1 XLM note (amount − fee).
- Unlinkability at byte level over raw tx XDR, both directions.
- Nullifier lifecycle: unused → claim → used → replay rejected (#6).
- All three tokens registered (USDC #0, XLM #1, USDT #2) via deposit
  simulation probes (no UnknownToken #11).

## Security checklist

| Item | State |
|---|---|
| Nullifier replay = double-spend | ✅ Covered: contract stores nullifiers permanently (TTL-bumped ~173 days), live replay test rejected with #6 |
| Non-canonical Fr (n + r alias) | ✅ Contract rejects ≥ r on nullifier/root/recipient_digest (#9) — double-spend via alias closed |
| Unknown root accepted | ✅ Rejected (#5); indexer is the sole tree writer (C1 in indexer.ts) |
| amount/tokenId binding | ✅ Both are public inputs; cross-token or wrong-amount claims fail verification |
| Verify bypass | ✅ `maybe_skip_verify` is cfg(test)-only, excluded from the 19K wasm |
| Root-poster trust seam | ⚠️ Documented (README honest-limits): the admin/relayer could admit a forged tree. Accepted for demo; decentralizing is future work |
| Trusted setup | ⚠️ Single-contributor (pot14), toxic waste gitignored; production path = MPC ceremony |
| Demo-scale anonymity set | ⚠️ Fixed denominations give amount-unlinkability only in proportion to pool size; demo copy must not claim strong anonymity |

## Findings (new this round)

### F1 — Indexer root race (UX, not security)
The indexer inserts a leaf into its in-memory tree, then posts the root.
`/path` answers as soon as the leaf is in memory, so there is a ~5-10s
window where a claim built from that path fails on-chain with
UnknownRoot (#5). Observed live on 2026-07-25 (first automated run).
Mitigations: e2e-api polls `is_known_root`; DEMO_TESTING_GUIDE.md Test 3
documents a ten-count before claiming. Code-level fix (defer /path 200
until post_root confirms, or retry claim once on #5) is a candidate P1.

### F2 — Claim front-running seam (known design seam, documented for honesty)
`recipient_digest` is a proof public input, but the payout `recipient`
address is NOT bound into the proof (contract can no longer re-derive the
digest from the address since stealth/ECDH made digests per-payment). A
mempool observer could copy a pending claim's proof + args, swap in their
own `recipient`, and race it with a higher fee; the first inclusion spends
the nullifier and takes the payout. Practical exploitability on testnet is
low (requires watching submissions and winning a ~5s race), and it is a
theft-of-funds seam only against in-flight claims, never a double-spend.
Production paths: bind `recipient` into the circuit as a 6th public input
(requires circuit change + new setup), or submit claims through a
private/relay channel. Not a demo blocker; flagged per the
honest-limits rule.

## Verdict

System is demo-ready on testnet. The core privacy claim — "nothing
on-chain connects a deposit to its claim" — is now verified
byte-for-byte on the live deployment, and repeatable with one command.
