# e2e-demo — Test Results

## 2026-07-25 — automated live run (this round)

### Preflight (`pnpm preflight`, env=live)

```
14/14 checks green — ALL GREEN
  frontend 200, backend /health ok, RPC ledger 3789123, supabase reachable
  contract reads answer (is_known_root / is_nullifier_used)
  token 0 (USDC), 1 (XLM), 2 (USDT) all registered (deposit sim probes)
  tree API alive (/path 404 unknown_commitment on dummy)
  claim.wasm 2.5 MB + claim.zkey 7.3 MB present, claim_vk.json IC = 6
```

### API smoke (`pnpm test:e2e -- --smoke`, env=live)

```
5/5 assertions green — SMOKE PASS
  GET /health, /path 404 shape, POST /notes 400 on malformed,
  POST /activity 401 without auth, circuit assets present
```

### Full API e2e (`pnpm test:e2e`, env=live) — 10/10 green

Real Groth16 deposit → claim against the LIVE deployment, raw keypairs,
Friendbot-funded throwaway accounts, 1 XLM note (tokenId 1):

| Step | Result |
|---|---|
| deposit tx | SUCCESS — `b8ec2b27405d99355f13e7087ebf0c06c8698fb7af3939b244978a21e09bc08a` |
| indexer pickup | leaf in tree within one poll cycle |
| root posted on-chain | `is_known_root = true` (see F1 race note in review.md) |
| proof generation | snarkjs fullProve, 0.9s (Node) |
| nullifier before | `is_nullifier_used = false` |
| claim tx | SUCCESS — `01f4af09708c46aaa71960c92061edd15af0009a6c0d52983e1bce2a623acf33` |
| nullifier after | `is_nullifier_used = true` |
| payout | recipient 10000.0000 → 10000.9613 XLM (1 XLM − fee) |
| privacy (XDR byte diff) | claim tx has NO commitment bytes; deposit tx has NO nullifier bytes |
| adversarial replay | rejected on-chain — `HostError: Error(Contract, #6)` NullifierUsed |

Explorer:
- deposit: https://stellar.expert/explorer/testnet/tx/b8ec2b27405d99355f13e7087ebf0c06c8698fb7af3939b244978a21e09bc08a
- claim: https://stellar.expert/explorer/testnet/tx/01f4af09708c46aaa71960c92061edd15af0009a6c0d52983e1bce2a623acf33

### Browser demo (manual)

Runbook: `DEMO_TESTING_GUIDE.md` Tests 1-7 (register/link, send, indexer
timing, inbox, browser-proof claim, invite flow, privacy verification).
The chain+backend paths those tests exercise are now pre-verified by the
automated e2e above; the Freighter-signing UI steps remain owner-executed.

---

## 2026-07-01 — original deployment verification (historical)

### Backend API (verified via curl)

| Endpoint | Result |
|----------|--------|
| `GET /health` | `{"ok":true}` ✓ |
| `GET /resolve?q=@demo` | returns `stellarAddress` + `contractAddress` ✓ |
| `POST /prove` (secret=12345, rd=42, denom=10) | full proof in ~15 s ✓ |
| `POST /post-root` | `{"ok":true,"hash":"..."}`, `is_known_root=true` on-chain ✓ |

### Proof generation (test vector)

```
nullifier: 30210038655452570927876935731677491109181541264348558594944850742778338046562
root:      19148948013232879213203992136026734822699351263916619827234416357547906460635
proof_a len: 192 chars ✓
proof_b len: 384 chars ✓
proof_c len: 192 chars ✓
```

Matches pre-existing `groth16_soroban.json` (same test inputs → same root, same nullifier). ✓

### On-chain state (superseded — see README for current contract)

- Contract initialized ✓ (old instance `CC2RTZTQ…FW5R`; current live is `CB5HPNJO…LUIB`)
- VK set (was 4 public inputs; now 5 with tokenId, IC = 6) ✓
- Test root posted and recognized (`is_known_root = true`) ✓

### Backend tests

```
# tests 33  # pass 33  # fail 0
```

### Browser demo

Not run at the time (required Freighter + funded testnet account).
Closed on 2026-07-25: the automated API e2e above covers every step except
the Freighter signing UI, which is scripted in DEMO_TESTING_GUIDE.md.
