# e2e-demo — Spec (Plan)

> Retro-written 2026-07-25 to complete the 4-artifact pipeline (SPEC §9).
> The original 2026-07-01 deployment work proceeded without a spec artifact;
> this documents the scope as executed, plus the 2026-07-25 demo-hardening
> extension (automated preflight + API e2e + demo runbook).

## Goal

Prove the whole system end-to-end on Stellar testnet and make that proof
repeatable: deposit tx and claim tx visible on a block explorer with no
on-chain field connecting them (SPEC §4, P0 item 9).

## Scope

### Original (2026-07-01, done)

- Deploy the zeekpay contract to testnet; initialize with admin + USDC SAC.
- `set_vk` with the real claim-circuit verifying key.
- Verify backend endpoints with curl: /health, /resolve, /prove, /post-root.
- Browser demo instructions (Freighter + funded testnet account).

### Multi-token / production-hardening era (2026-07, done, see git log)

- tokenId bound in the circuit (5 public inputs); XLM + USDT added via
  `add_token`; VK IC = 6.
- Stealth recipientDigest derivation (ECDH, unique per payment).
- Encrypted inbox notes (X25519 sealed boxes via Supabase).
- Invite/custody flow for unregistered recipients (two-tx claim).
- Deposit indexer as the sole Merkle-tree writer; durable Postgres store;
  roots posted on-chain automatically.

### Demo hardening (2026-07-25, this round)

- `scripts/preflight.mjs` — 14-check green/red board (services, contract
  read path, token registration probes, tree API, optional handle/account
  checks, circuit assets). `pnpm preflight`.
- `scripts/e2e-api.mts` — full deposit → indexer → prove → claim against
  the live deployment with raw keypairs (no Freighter), 10 assertions
  including byte-level deposit↔claim unlinkability over raw XDR and a
  double-spend replay. `pnpm test:e2e`; `--smoke` for a 1-minute check.
- `DEMO_TESTING_GUIDE.md` — numbered manual runbook (register, send,
  indexer timing, inbox, claim, invite, privacy verification, adversarial),
  demo-day checklist, troubleshooting table.

## Non-goals

- No Playwright/browser automation this round (Freighter-in-browser
  automation is the follow-up; the API e2e covers the chain+backend paths).
- No new contract code. No changes to circuits, VK, or deployments.
- Zero monetary cost: testnet + Friendbot only (owner rule).

## Acceptance criteria

- [x] Contract deployed, initialized, VK set (5 public inputs, IC = 6).
- [x] Preflight passes against live: 14/14.
- [x] API smoke passes against live: 5/5.
- [x] Full API e2e passes against live: 10/10, with real tx hashes.
- [x] Claim pays the exact denomination to the recipient.
- [x] Claim tx contains no bytes of the deposit commitment; deposit tx
      contains no bytes of the claim nullifier.
- [x] Replayed claim rejected on-chain with Error #6 (NullifierUsed).
- [x] Manual browser runbook written with pass criteria per test.
- [ ] Full manual browser pass (Tests 1-7 of the runbook) executed by the
      owner with Freighter — scheduled per DEMO_TESTING_GUIDE.md demo-day
      runbook. The browser-specific steps (Freighter signing UI) are the
      only part automation cannot cover.
