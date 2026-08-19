================================================================
  BULLET END-TO-END DEMO TESTING GUIDE
================================================================

Two environments:
  LIVE   https://sendbullet.xyz  (Vercel frontend, Railway backend,
         contract CB5HPNJOZ3ULPNPRL5FJBHSDCHYWFAWXO6TY3JL6URZSYXMRTFQ3LUIB,
         Stellar testnet) — what an audience sees. Default for demo passes.
  LOCAL  pnpm dev (backend :3001 + frontend :3000) — for development loops.

Demo-critical user journeys: hero flow (registered recipient) and invite
flow (unregistered recipient), plus the on-chain privacy proof that makes
the demo worth watching.

================================================================
  PREREQUISITES
================================================================

1. Freighter browser extension installed, network set to Testnet, and at
   least one funded testnet account (fund free at
   https://laboratory.stellar.org/#account-creator?network=test or
   `curl "https://friendbot.stellar.org?addr=<G...>"`).
2. Two accounts is ideal: one to send, one to receive (two browser
   profiles, or Freighter account switching).
3. Run the automated preflight (checks 14 things in ~30s):

   pnpm preflight              # live
   pnpm preflight -- --env local

   ✅ PASS if "ALL GREEN". Do not start a demo on a red board.

Optional env for deeper preflight checks (put in .env.e2e, gitignored):
   E2E_DEMO_HANDLE=@yourhandle       # verifies /resolve end-to-end
   E2E_SENDER_SECRET / E2E_RECIPIENT_SECRET   # balance checks
   E2E_KNOWN_COMMITMENT              # proves the indexer tree is warm

================================================================
  QUICK SMOKE TEST (1 minute, no browser)
================================================================

   pnpm test:e2e -- --smoke

   ✅ PASS if 5/5: /health, /path 404 shape, /notes validation,
   /activity auth guard, circuit assets present.

================================================================
  TEST 1 — REGISTER + LINK WALLET
================================================================

1. Open https://sendbullet.xyz (or http://localhost:3000)
2. Sign in (Google or X OAuth)
3. Go to Register / Account → connect Freighter → link wallet
4. Sign the link message in Freighter
   ✅ PASS if the account page shows your handle + Stellar address
   ✅ PASS if `curl "https://zeekpaybackend-production.up.railway.app/resolve?q=<yourhandle>"`
      returns "found":true with your address

================================================================
  TEST 2 — HERO SEND (DEPOSIT)
================================================================

1. Open /send, pick token USDC, amount 10 (start with USDC for the demo;
   XLM/USDT work too — token is bound into the ZK proof)
2. Enter the recipient's registered handle → it must resolve (green)
3. Confirm → Freighter asks to sign the deposit tx
4. Wait for the confirmation + tx hash
   ✅ PASS if Stellar Expert shows a `deposit` call on the contract with
      a commitment event (link format:
      https://stellar.expert/explorer/testnet/tx/<hash>)
   ❗ The deposit shows ONLY: your address, the SAC transfer, and a
      32-byte commitment. No recipient, no link to anyone. Remember this
      for Test 7.

Note: a deposit of USDC requires testnet USDC in the sender account.
XLM notes (token picker → XLM) need only Friendbot XLM — good fallback.

================================================================
  TEST 3 — INDEXER WAIT (the one timing that can bite you)
================================================================

The deposit indexer polls every ~5s, inserts the leaf, then posts the new
Merkle root on-chain (a second testnet tx, ~5-10s more).

  ✅ PASS: within ~30s of the deposit, the recipient's inbox shows the note
     AND the claim button works.
  ⚠️ KNOWN RACE: the note can appear in the tree (/path answers) a few
     seconds BEFORE the root is confirmed on-chain. A claim submitted in
     that window fails on-chain with UnknownRoot (#5).
     Demo rule: count "one Mississippi" × 10 after the deposit confirms
     before hitting Claim. The automated e2e polls this for you.
  Verify root status manually:
     pnpm preflight   (or call is_known_root with the root from /path)

================================================================
  TEST 4 — INBOX DISCOVERY (the "money simply appears" moment)
================================================================

1. Recipient opens /inbox (their own browser/profile, Freighter connected)
2. Their browser re-derives the Bullet key from a Freighter signature and
   decrypts the sealed inbox note (X25519) — no server ever sees plaintext
   ✅ PASS if a note card appears with the right amount + token
   ✅ PASS if an already-claimed note renders as claimed (nullifier check),
      not as an actionable Claim button

================================================================
  TEST 5 — CLAIM (BROWSER ZK PROOF)
================================================================

1. Recipient clicks Claim on the note
2. Browser generates the Groth16 proof locally (snarkjs + WASM).
   Expected: ~15-30s on a laptop. Narrate this: "the secret never leaves
   the browser; the proof is generated right here."
3. Freighter signs the claim tx → poll → confirmed
   ✅ PASS if the note renders claimed and the token balance increased by
      exactly the denomination
   ✅ PASS if Stellar Expert shows a `claim` call: nullifier, root,
      recipient, proof bytes — and NO commitment, NO sender

================================================================
  TEST 6 — INVITE FLOW (UNREGISTERED RECIPIENT)
================================================================

1. Send to an email address (or handle) that is NOT registered
2. The app creates a per-invite custody wallet; you get a claim link and,
   for emails, SendGrid delivers it (copy-paste for handles is BY DESIGN —
   do not "fix" this, SPEC §3)
3. Open the claim link in a CLEAN browser profile (no Bullet session)
4. Register/connect → claim executes two txs in order:
   TX A: contract → custody wallet (the ZK claim)
   TX B: custody wallet → recipient's real wallet (SAC transfer)
   (Two txs because Soroban allows one InvokeHostFunction per tx.)
   ✅ PASS if both hashes confirm in order and the final wallet balance
      increases by exactly the denomination
   ✅ PASS if the custody wallet ends ~empty

================================================================
  TEST 7 — PRIVACY VERIFICATION (THE MONEY SHOT)
================================================================

Do this live on a projector with Stellar Expert:

1. Open the DEPOSIT tx. List what an observer learns:
   sender address, token, amount, one 32-byte commitment.
2. Open the CLAIM tx. List what an observer learns:
   recipient address, nullifier, root, proof bytes.
3. Ask the room: "find the field that connects these two transactions."
   There isn't one. commitment ≠ nullifier ≠ root ≠ any address.
   ✅ PASS if no value appears in both txs
4. Automated proof of the same property (byte-level over raw XDR):
   pnpm test:e2e   (assertions 8a/8b do exactly this comparison)

Reference evidence (2026-07-25, automated run, 10/10 green):
   deposit: https://stellar.expert/explorer/testnet/tx/b8ec2b27405d99355f13e7087ebf0c06c8698fb7af3939b244978a21e09bc08a
   claim:   https://stellar.expert/explorer/testnet/tx/01f4af09708c46aaa71960c92061edd15af0009a6c0d52983e1bce2a623acf33

================================================================
  TEST 8 — ADVERSARIAL SPOT-CHECK (DOUBLE-SPEND)
================================================================

Already automated — run:
   pnpm test:e2e
Step 9 replays the exact same claim after success.
   ✅ PASS if it is rejected on-chain with Error(Contract, #6)
   NullifierUsed. A note can only ever be claimed once.

================================================================
  AUTOMATED API E2E (the regression workhorse)
================================================================

Full deposit → prove → claim with raw keypairs, no browser, ~2-3 min,
zero cost (Friendbot-funded throwaway accounts, 1 XLM note on testnet):

   pnpm test:e2e                    # against live
   pnpm test:e2e -- --env local     # against your local backend

10 assertions: indexer pickup, root on-chain, proof generation, nullifier
lifecycle (false → true), exact payout, byte-level unlinkability both
directions, double-spend rejection.
   ✅ PASS if "10/10 assertions green — E2E PASS"
Reuse fixed accounts instead of fresh Friendbot ones:
   export E2E_SENDER_SECRET=... E2E_RECIPIENT_SECRET=...
Save machine-readable evidence: E2E_OUT=evidence.json pnpm test:e2e

================================================================
  DEMO-DAY RUNBOOK
================================================================

T-24h:
  □ pnpm preflight — ALL GREEN
  □ pnpm test:e2e — 10/10
  □ One full manual pass of Tests 1-7 on LIVE
  □ Seed 2-3 extra deposits from other accounts (an anonymity set of one
    is a bad look when you explain fixed denominations)
  □ Record a full backup video of Tests 1-7
  □ Charge laptop, close notifications, test the projector

T-1h:
  □ pnpm preflight — ALL GREEN (re-run; Friendbot accounts if balances low)
  □ Freighter unlocked, Testnet selected, correct account active
  □ Clean browser profile for the recipient view; inbox pre-opened
  □ Stellar Expert open on the contract page in a spare tab
  □ Backup video reachable

During:
  □ Follow Tests 2 → 5 verbatim; respect the Test 3 ten-count
  □ Narrate the proof wait (~20s): local proving, secret never leaves
  □ Land Test 7 as the closer

Fallbacks (in order):
  1. RPC/testnet degraded → switch to the backup video, keep narrating
     against the Stellar Expert evidence from T-24h
  2. Freighter hangs → unlock/reconnect; the wrapper times out at 15s
     with a readable message
  3. Live backend down → local demo only if pre-warmed; otherwise video
  4. USDC balance issues → switch the note to XLM (Friendbot-free)

================================================================
  TROUBLESHOOTING
================================================================

| Symptom | Likely cause | Fix |
|---|---|---|
| Claim fails with UnknownRoot (#5) | Hit claim inside the indexer race window (Test 3) | Wait ~10s, retry — the same proof still works |
| Inbox empty after deposit | Indexer behind, or wrong wallet connected | Check /path via preflight; reconnect the wallet the note was sent to |
| Claim button does nothing | Note already claimed (nullifier used) | Expected — inbox renders it as claimed |
| Freighter popup hangs | Mobile/embedded browser | 15s timeout fires; unlock Freighter, retry |
| "recipient_not_registered" on send | Handle not linked to a wallet | Finish Test 1 first, or use the invite flow |
| Proof generation very slow | First load compiles WASM | Second proof is much faster; pre-warm before demo |
| deposit sim ok but tx fails on SAC | Sender lacks token balance/trustline | Fund testnet USDC or switch to an XLM note |
