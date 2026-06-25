# WranKey Roadmap

> **Overall: ~90% MVP Complete** | Last updated: June 2026

---

## Completed ✅

### Auth (26 endpoints)
| Endpoint | File |
|----------|------|
| `GET /auth/config` | `packages/backend/src/modules/auth/routes.ts` |
| `GET /auth/me` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/email/lookup` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/email/send` — SMTP OTP | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/email/verify` — Login | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/phone/send` — Twilio OTP | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/phone/verify` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/oauth` — Google | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/webauthn/register` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/webauthn/register/verify` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/webauthn/authenticate` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/webauthn/authenticate/verify` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/wallet` — SIWE-style | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/password/signup` — bcrypt | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/password/login` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/password/reset` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/password/reset/confirm` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/signup/initiate` — passwordless | `packages/backend/src/modules/auth/routes.ts` |
| `GET /auth/signup/verify` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/signup/register-options` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /auth/signup/confirm` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /sessions/refresh` | `packages/backend/src/modules/auth/routes.ts` |
| `GET /sessions` | `packages/backend/src/modules/auth/routes.ts` |
| `DELETE /sessions/:id` | `packages/backend/src/modules/auth/routes.ts` |
| `POST /api-keys`, `GET /api-keys`, `DELETE /api-keys/:id` | `packages/backend/src/modules/auth/routes.ts` |

### Wallets (15 endpoints)
| Endpoint | File |
|----------|------|
| `POST /wallets` — Create HD wallet | `packages/backend/src/modules/wallet/routes.ts` |
| `POST /wallets/import` — From mnemonic | `packages/backend/src/modules/wallet/routes.ts` |
| `GET /wallets` — List (paginated, searchable) | `packages/backend/src/modules/wallet/routes.ts` |
| `GET /wallets/:id` — Detail with accounts | `packages/backend/src/modules/wallet/routes.ts` |
| `DELETE /wallets/:id` | `packages/backend/src/modules/wallet/routes.ts` |
| `PATCH /wallets/:id` — Update metadata | `packages/backend/src/modules/wallet/routes.ts` |
| `POST /wallets/:id/accounts` — Derive | `packages/backend/src/modules/wallet/routes.ts` |
| `GET /wallets/:id/accounts` — List | `packages/backend/src/modules/wallet/routes.ts` |
| `POST /wallets/:id/export` — Raw/encrypted | `packages/backend/src/modules/wallet/routes.ts` |
| `POST /wallets/:id/freeze` | `packages/backend/src/modules/wallet/routes.ts` |
| `POST /wallets/:id/unfreeze` | `packages/backend/src/modules/wallet/routes.ts` |
| `POST /wallets/:id/rotate` — Key rotation | `packages/backend/src/modules/wallet/routes.ts` |
| `GET /wallets/:id/balance` — Native balance | `packages/backend/src/modules/wallet/routes.ts` |
| `GET /wallets/:id/tokens` — ERC20 balances | `packages/backend/src/modules/wallet/routes.ts` |
| `GET /wallets/:id/gas-price` | `packages/backend/src/modules/wallet/routes.ts` |

### Transactions (10 endpoints)
| Endpoint | File |
|----------|------|
| `POST /transactions/sign` — Full flow | `packages/backend/src/modules/transaction/routes.ts` |
| `POST /transactions/simulate` — eth_call | `packages/backend/src/modules/transaction/routes.ts` |
| `GET /transactions/:id` — Status check | `packages/backend/src/modules/transaction/routes.ts` |
| `GET /transactions` — List (filterable) | `packages/backend/src/modules/transaction/routes.ts` |
| `POST /transactions/:id/retry` | `packages/backend/src/modules/transaction/routes.ts` |
| `POST /transactions/:id/cancel` | `packages/backend/src/modules/transaction/routes.ts` |
| `POST /transactions/:id/speed-up` | `packages/backend/src/modules/transaction/routes.ts` |
| `GET /accounts/:address/nonce` | `packages/backend/src/modules/transaction/routes.ts` |
| `POST /transactions/estimate-fee` | `packages/backend/src/modules/transaction/routes.ts` |
| `POST /transactions/sign-message` | `packages/backend/src/modules/transaction/routes.ts` |

### Policies, Agents, Webhooks
| Feature | Endpoints | File |
|---------|-----------|------|
| Policies | CRUD (5 endpoints), engine (9 conditions) | `packages/backend/src/modules/policy/routes.ts` + `engine.ts` |
| Agents | Create, List, Get, Revoke (4 endpoints) | `packages/backend/src/modules/agent/routes.ts` |
| Webhooks | CRUD (5 endpoints), 17 event types, HMAC dispatch | `packages/backend/src/modules/webhook/routes.ts` |
| Spending Limits | CRUD (5 endpoints) | `packages/backend/src/modules/spending-limit/routes.ts` |
| Approvals | List, Get, Approve, Reject (4 endpoints) | `packages/backend/src/modules/approval/routes.ts` |
| Chains | List, Add, Deactivate, Seed (4 endpoints) | `packages/backend/src/modules/chain/routes.ts` |
| Orgs/Users | Org CRUD, User CRUD, Audit logs (11 endpoints) | `packages/backend/src/modules/org/routes.ts` |

### Dashboard (12 pages)
| Page | Route | File |
|------|-------|------|
| Login (3-step OTP) | `/login` | `packages/dashboard/src/app/(auth)/login/page.tsx` |
| Onboarding | `/onboarding` | `packages/dashboard/src/app/onboarding/page.tsx` |
| Reset Password | `/reset-password` | `packages/dashboard/src/app/reset-password/page.tsx` |
| Home | `/` | `packages/dashboard/src/app/(dashboard)/page.tsx` |
| Wallets List | `/wallets` | `packages/dashboard/src/app/(dashboard)/wallets/page.tsx` |
| Wallet Detail | `/wallets/[id]` | `packages/dashboard/src/app/(dashboard)/wallets/[id]/page.tsx` |
| Transactions | `/transactions` | `packages/dashboard/src/app/(dashboard)/transactions/page.tsx` |
| Send Transaction | `/transactions/send` | `packages/dashboard/src/app/(dashboard)/transactions/send/page.tsx` |
| Policies | `/policies` | `packages/dashboard/src/app/(dashboard)/policies/page.tsx` |
| Agents | `/agents` | `packages/dashboard/src/app/(dashboard)/agents/page.tsx` |
| Webhooks | `/webhooks` | `packages/dashboard/src/app/(dashboard)/webhooks/page.tsx` |
| API Keys | `/api-keys` | `packages/dashboard/src/app/(dashboard)/api-keys/page.tsx` |
| Users | `/users` | `packages/dashboard/src/app/(dashboard)/users/page.tsx` |
| Team | `/team` | `packages/dashboard/src/app/(dashboard)/team/page.tsx` |
| Profile | `/profile` | `packages/dashboard/src/app/(dashboard)/profile/page.tsx` |
| Approvals | `/approvals` | `packages/dashboard/src/app/(dashboard)/approvals/page.tsx` |
| Audit Logs | `/audit-logs` | `packages/dashboard/src/app/(dashboard)/audit-logs/page.tsx` |

### SDK
| Component | File |
|-----------|------|
| `WranKeyClient` (50+ methods) | `packages/sdk/src/client.ts` |
| Types (20 interfaces) | `packages/sdk/src/types.ts` |
| `WranKeyProvider` + `useWranKey` | `packages/sdk/src/react/WranKeyProvider.tsx` |
| `useAuth` | `packages/sdk/src/react/useAuth.ts` |
| `useWallets` | `packages/sdk/src/react/useWallets.ts` |
| `useTransactions` | `packages/sdk/src/react/useTransactions.ts` |
| `usePolicies` | `packages/sdk/src/react/usePolicies.ts` |
| `useAgents` | `packages/sdk/src/react/useAgents.ts` |

### Infrastructure
- ✅ Prisma schema — 15 models, migration history
- ✅ Redis — Nonce locks (Lua), OTP rate limiting, velocity tracking
- ✅ AES-256-GCM encryption — at rest + PBKDF2 passphrase
- ✅ JWT auth — sign/verify with session expiry
- ✅ API key auth — SHA-256 hashed, 22 scope mappings, IP whitelist
- ✅ WebSocket gateway — `/ws`, per-org rooms
- ✅ Swagger docs at `/docs`
- ✅ CI/CD — GitHub Actions (lint, typecheck, 3 test suites, postgres + redis)
- ✅ Docker Compose — postgres:16 + redis:7
- ✅ Seed script — 1 org, 3 users, 3 policies, 1 webhook, 1 agent

### Tests
| Suite | Coverage |
|-------|----------|
| Crypto utils | 7 tests — encrypt/decrypt, hashing, token generation |
| Enclave (HD wallets) | 15 tests — generation, recovery, derivation, passphrase encryption |
| Policies | 25 tests — all 9 conditions, consensus modes, ReDoS safety |
| Wallet infrastructure | 20+ tests — full lifecycle: create, import, export, freeze, rotate, spending limits, tx simulation, fee estimation, nonce |
| Routes integration | 20 tests — wallets, orgs, users, agents, webhooks, transactions, sign-message |
| API smoke tests | 5 tests — health check, validation, auth required |
| Dashboard | 5 tests — API client, utilities, auth provider, error boundary |

---

## In Progress / High Priority 🔴

### P0-1: Gas Sponsorship
- **Location:** `packages/backend/src/modules/transaction/routes.ts` (signing flow)
- **Config:** Already exists in `config.ts` (`gasSponsorship.enabled`, `maxSponsorAmount`, `sponsorWalletId`)
- **Work needed:**
  1. In `/transactions/sign`, after policy evaluation passes, check if gas sponsorship is enabled
  2. If enabled, use the sponsor wallet's mnemonic to sign the transaction instead of the user's wallet
  3. Add audit log for sponsored transactions
  4. Track sponsorship totals per org/user for billing

### P0-2: Scam Address Detection
- **Location:** `packages/backend/src/services/risk.ts:isKnownScamAddress()`
- **Current state:** Always returns `false`
- **Work needed:**
  1. Integrate with a scam registry API (e.g., Chainalysis, TRM Labs, or a community blocklist)
  2. Cache blocklist in Redis with periodic refresh
  3. Or seed a `scan_addresses` DB table from a curated dataset

### P0-3: Webhook Retry Queue
- **Location:** `packages/backend/src/modules/webhook/routes.ts` (`triggerWebhookEvents`)
- **Current state:** Fire-and-forget with 5s timeout, no retry
- **Work needed:**
  1. Add `webhook_deliveries` DB table (webhook_id, event, payload, status, attempt_count, last_attempt_at, next_attempt_at, error)
  2. On failure, schedule retry with exponential backoff (1m, 5m, 15m, 1h, 6h)
  3. After max retries (5), move to dead letter queue
  4. Add dashboard page to view delivery statuses
  5. Add `GET /webhooks/:id/deliveries` endpoint

### P0-4: Backend Dockerfile
- **Location:** New file: `packages/backend/Dockerfile`
- **Work needed:**
  1. Multistage build: `node:20-alpine` builder → `node:20-alpine` runner
  2. Copy Prisma schema, run `prisma generate`
  3. Build TypeScript, run `prisma migrate deploy` on startup
  4. Expose port 3001
  5. Update `docker-compose.yml` to include the backend service

### P0-5: `.env.example` File
- **Location:** New file: `packages/backend/.env.example`
- **Work needed:**
  1. Document all 40+ environment variables with descriptions and dev defaults
  2. Group by section: Database, Redis, Auth, Email, SMS, OAuth, Blockchain, Risk, Webhooks

### P0-6: Background Transaction Monitoring
- **Location:** New file: `packages/backend/src/services/tx-monitor.ts`
- **Work needed:**
  1. Background interval (every 30s) that queries all `PENDING`/`SIGNED`/`BROADCAST` transactions
  2. For each, check on-chain status via RPC
  3. Update status + fire webhooks on confirmed/failed
  4. Fire WebSocket notifications

### P0-7: Dashboard WebSocket Client
- **Location:** `packages/dashboard/src/components/providers/Providers.tsx` + new hook
- **Work needed:**
  1. Create `useWebSocket()` hook that connects to `ws://localhost:3001/ws?token=...`
  2. Auto-reconnect with exponential backoff
  3. Listen for `transaction_status`, `wallet_event`, `agent_event` messages
  4. Update React state / invalidate queries on events
  5. Wire into wallet detail page for live transaction status updates

### P0-8: Platform Health Monitoring
- **Location:** `packages/dashboard/src/app/(dashboard)/page.tsx`
- **Work needed:**
  1. Add backend `GET /health/services` endpoint that checks: PostgreSQL connection, Redis connection, RPC endpoint reachability
  2. Replace hardcoded "Operational" indicators with real health data
  3. Auto-refresh every 60 seconds

---

## Medium Priority 🟡

### P1-1: More OAuth Providers
- **Location:** `packages/backend/src/modules/auth/routes.ts`
- **Work:** Add handlers for GitHub, Discord, Twitter, Apple OAuth token exchange
- **Estimate:** 3-4 days

### P1-2: WebSocket Heartbeat
- **Location:** `packages/backend/src/services/websocket.ts`
- **Work:** Add server-side interval (every 30s) that pings all clients, terminates dead connections after 2 missed pings

### P1-3: Push/Email Notifications
- **Location:** New service: `packages/backend/src/services/notifications.ts`
- **Work:** Send email alerts for critical events (large transactions, policy violations, agent creation)

### P1-4: Transaction Export
- **Location:** `packages/dashboard/src/app/(dashboard)/transactions/page.tsx`
- **Work:** Add CSV and PDF export buttons using existing transaction data

### P1-5: Fix `brand-600` Tailwind Class
- **Location:** `packages/dashboard/tailwind.config.ts`
- **Work:** Add brand color palette (or replace with primary)

### P1-6: Remove Duplicate `Skeleton` Export
- **Location:** `packages/dashboard/src/components/ui/Spinner.tsx`
- **Work:** Remove the duplicate `Skeleton` component (already in `skeleton.tsx`)

---

## Low Priority / Nice to Have 🟢

### P2-1: Wallet Balance History
- New DB table: `balance_snapshots` (wallet_id, chain_id, address, balance_wei, timestamp)
- Background job to snapshot balances daily
- Dashboard charts with recharts/chart.js

### P2-2: Account/Social Recovery
- Multi-party recovery (split seed between N guardians, need M to recover)
- Time-locked recovery with email verification

### P2-3: Cross-Org Sharing
- Allow wallets/policies/agents to be shared between organizations
- Add `shared_with` relation on relevant models

### P2-4: E2E Tests
- Playwright or Cypress test suite
- Cover: login flow, wallet creation, transaction sending, policy creation, agent creation

### P2-5: SDK React Hook Tests
- Test `WranKeyProvider` with mocked client
- Test each hook's loading, error, and success states
- Test localStorage persistence

### P2-6: ERC-4337 Gasless Transactions
- Implement UserOperation builder
- Bundler integration
- Paymaster contract for gas sponsorship

### P2-7: Transaction History Search
- Full-text search across transactions by address, tx hash, value
- PostgreSQL tsvector index or Elasticsearch

---

## Technical Debt

| # | Item | Location | Effort |
|---|------|----------|--------|
| 1 | Duplicate `Skeleton` export | `packages/dashboard/src/components/ui/Spinner.tsx` | 5 min |
| 2 | Missing `brand-600` color class | `packages/dashboard/tailwind.config.ts` | 10 min |
| 3 | No `.env.example` | `packages/backend/` | 1 hour |
| 4 | No backend Dockerfile | `packages/backend/` | 2 hours |
| 5 | Dashboard tests minimal (5 tests) | `packages/dashboard/tests/` | 1 day |
| 6 | SDK tests minimal (basic client only) | `packages/sdk/tests/` | 1 day |
| 7 | No RPC mocking in backend tests | `packages/backend/tests/` | 1 day |
| 8 | Notifications in Header hardcoded | `packages/dashboard/src/components/layouts/Header.tsx` | 2 hours |
| 9 | `onRequest` hook sends errors via `reply.send()` instead of throwing | `packages/backend/src/app.ts:92` | 30 min |
