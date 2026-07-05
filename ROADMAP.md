# WranKey Roadmap

> **Overall: ~97% MVP Complete** | Last updated: July 2026

---

## Completed ✅

### Auth (26 endpoints)
All 6 auth methods implemented: Email OTP, Phone SMS OTP, OAuth (Google, Discord, GitHub, Apple, X/Twitter), WebAuthn/Passkeys, Wallet (SIWE), Password (bcrypt). Passwordless signup, password reset, session management, API keys with 22 scope mappings and IP allowlists. Team invitations via email with Redis-stored 7-day tokens.

### Backend Feature Modules (18 modules, 80+ endpoints)
| Module | Description |
|--------|-------------|
| Auth | 26 endpoints — all auth methods, sessions, API keys, signup/invitation flows |
| Orgs/Users | 11 endpoints — org CRUD, user CRUD, activity feed, audit logs |
| Wallets | 15 endpoints — HD wallet CRUD, import/export, derivation, freeze/unfreeze/rotate, balances, tokens, gas |
| Transactions | 10 endpoints — sign/broadcast, simulate, retry, cancel, speed-up, estimate, sign-message, nonce |
| Policies | 5 endpoints — CRUD with 9 condition types, 3 consensus modes, root bypass |
| Agents | 4 endpoints — create (auto-provisions user + API key), list, get, revoke |
| Webhooks | 5 endpoints — CRUD, 19 event types, HMAC signing, retry queue with exponential backoff |
| Spending Limits | 5 endpoints — CRUD with maxPerTx, daily, monthly, allowlist, denylist |
| Approvals | 4 endpoints — list, get, approve (auto-broadcasts), reject |
| Chains | 4 endpoints — list 6 seeded chains, admin add/deactivate/seed |
| Tags | 4 endpoints — CRUD with usage counts and cascade rename |
| Billing | 3 endpoints — invoices, usage, plans (Free/PAYG/Pro/Enterprise) |
| Sub-Orgs | 8 endpoints — CRUD, impersonation, wallet/user/policy views |
| Contract Interfaces | 6 endpoints — CRUD, ABI decode |
| Private Keys | 7 endpoints — derive, list, export, delete, address derivation |
| Quorum | 2 endpoints — get/update quorum config with member list + health analysis |
| Config | 2 endpoints — get/update org-level configuration |
| Notifications | 6 functions — email alerts for large txs, failures, policy denials, agent/wallet creation, spending limits |

### Dashboard (29 pages)
| Page | Route |
|------|-------|
| Login (3-step OTP) | `/login` |
| Onboarding | `/onboarding` |
| Accept Invitation | `/accept-invitation` |
| OAuth Callback | `/oauth-callback` |
| Reset Password | `/reset-password` |
| Home | `/` |
| Wallets List | `/wallets` |
| Wallet Detail | `/wallets/[id]` |
| Company Wallets | `/company-wallets` |
| Transactions | `/transactions` |
| Send Transaction | `/transactions/send` |
| Policies | `/policies` |
| Approvals | `/approvals` |
| Agents | `/agents` |
| Webhooks | `/webhooks` |
| API Keys | `/api-keys` |
| Spending Limits | `/spending-limits` |
| Team | `/team` |
| Root Quorum | `/team/root-quorum` |
| Users | `/users` |
| Profile | `/profile` |
| Settings | `/settings` |
| Configuration | `/configuration` |
| Audit Logs | `/audit-logs` |
| Activity Logs | `/activity-logs` |
| Billing | `/billing` |
| Usage | `/usage` |
| Tags | `/tags` |
| Private Keys | `/private-keys` |
| Private Key Detail | `/private-keys/[id]` |
| Sub-Orgs | `/sub-orgs` |
| Sub-Org Detail | `/sub-orgs/[id]` |
| Contract Interfaces | `/contract-interfaces` |
| Verifiable Cloud | `/verifiable-cloud` |

### SDK
- ✅ `WranKeyClient` — 50+ typed methods covering all API endpoints
- ✅ Types — 20+ TypeScript interfaces
- ✅ `WranKeyProvider` + `useWranKey` — React context with localStorage persistence
- ✅ `useAuth`, `useWallets`, `useTransactions`, `usePolicies`, `useAgents` — React hooks
- ✅ CJS + ESM dual output via tsup

### Infrastructure
- ✅ Prisma schema — 22 models, full migration history
- ✅ Redis — nonce locks (Lua), OTP rate limiting, velocity tracking, scam cache
- ✅ AES-256-GCM encryption at rest + PBKDF2 passphrase (310K iterations, SHA-512)
- ✅ JWT auth — sign/verify with configurable session expiry
- ✅ API key auth — SHA-256 hashed, 22 scope mappings, IP whitelist
- ✅ WebSocket gateway — `/ws`, per-org rooms, ping/pong heartbeat
- ✅ Background tx monitor — 30s polling, status updates, webhooks, WebSocket
- ✅ Webhook retry queue — exponential backoff (60s-1h, 5 retries), delivery tracking
- ✅ Swagger docs at `/docs`
- ✅ CI/CD — GitHub Actions: lint, typecheck, 6 test suites, PostgreSQL + Redis
- ✅ Docker Compose — postgres:16 + redis:7 + backend API
- ✅ Backend Dockerfile — multistage Node 20 Alpine, non-root user
- ✅ Dashboard Dockerfile — multistage, nginx Alpine runner
- ✅ `.env.example` — all 40+ env vars documented
- ✅ Seed script — 1 org, 3 users, 3 policies, 1 webhook, 1 agent
- ✅ Email notifications — centralized service for critical event alerts
- ✅ CSV export — transaction history download
- ✅ Platform health — live DB/Redis/RPC/WebSocket status on dashboard
- ✅ Dashboard WebSocket — real-time transaction/wallet/agent events
- ✅ Invite flow — invite link always returned, email status reported to admin
- ✅ Team status — active/invited based on valid sessions, current user always active
- ✅ Error handling — fixed onRequest hook to use Fastify error handler

### Tests (90+ across 6 suites)
| Suite | Coverage |
|-------|----------|
| Crypto utils | 7 tests — encrypt/decrypt, hashing, token generation |
| Enclave (HD wallets) | 15 tests — generation, recovery, derivation, passphrase encryption |
| Policies | 25 tests — all 9 conditions, consensus modes, ReDoS safety |
| Wallet infrastructure | 20+ tests — full lifecycle |
| Routes integration | 20 tests — wallets, orgs, users, agents, webhooks, tx, sign-message |
| API smoke tests | 5 tests — health check, validation, auth required |
| Dashboard | 5 tests — API client, utilities, auth provider, error boundary |

---

## Remaining Work 🟢

### P2 — Nice to Have (not blocking MVP)
1. **Wallet balance history** — New DB table, daily snapshots, dashboard charts
2. **Account/social recovery** — N-of-M guardians, time-locked recovery
3. **Cross-org sharing** — Share wallets/policies/agents between orgs
4. **E2E tests** — Playwright or Cypress covering main user flows
5. **SDK React hook tests** — Mocked client tests for loading/error/success states
6. **ERC-4337 gasless transactions** — UserOperation builder, bundler, paymaster contract. Smart contract `.sol` files need to be rebuilt.
7. **Full-text transaction search** — PostgreSQL tsvector or Elasticsearch
8. **Smart contracts** — Recreate Solidity sources (build artifacts from previous compilation exist)
