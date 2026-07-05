# WranKey - AI-Native Wallet & Agent Platform on Arc

> **Status: ~97% MVP Complete** | Updated: July 2026

## Overview

Turnkey wallet infrastructure for AI-powered agents and developers on Arc blockchain and EVM-compatible chains. Combines embedded HD wallets, secure key management, policy engine, multi-sig approvals, AI agent delegation, and full audit trails.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Fastify v5, Prisma v6, PostgreSQL 16, Redis 7, ethers.js v6 |
| Dashboard | Next.js 15, React 19, TailwindCSS, shadcn/ui, Radix UI |
| SDK | TypeScript, tsup (CJS + ESM), 6 React hooks |
| Blockchain | Ethereum, Polygon, Arbitrum, Optimism, Base, Sepolia (testnet) |
| Auth | JWT sessions, API keys (SHA-256), WebAuthn/Passkeys, SIWE, bcrypt |
| Email | Nodemailer (SMTP), Twilio (SMS) |
| Infra | Docker Compose (PostgreSQL + Redis + Backend), GitHub Actions CI/CD |

---

## Core Features

### Auth — 26 endpoints ✅
- Email OTP (SMTP/Nodemailer) with rate limiting (3 per 5 min)
- Phone OTP (Twilio SMS)
- OAuth 2.0: Google, Discord, GitHub, Apple, X/Twitter (org-level credential override)
- WebAuthn/Passkeys (FIDO2 registration + authentication via @simplewebauthn)
- Wallet-based (SIWE-style with ethers.js signature verification)
- Password auth (bcrypt, 12 rounds) with reset flow
- Passwordless signup (email verify → passkey register → complete)
- Session management + JWT with configurable expiry (dev: 30 days, prod: 1 hour)
- API keys (SHA-256 hashed, 22 scope mappings, IP allowlisting, expiration dates)
- Team invitations via email with 7-day Redis tokens + OTP acceptance
- Auth configuration endpoint (server-level + org-level overrides)

### Organizations & Users ✅
- Organization CRUD with self-referencing parent/child hierarchy
- User CRUD with roles: ORG_ADMIN, DEVELOPER, AGENT
- Team management: invite members, create service users (agents)
- Root quorum configuration for critical operation gating
- Org-level configuration (branding, OAuth providers, on-ramp, auth methods)
- Sub-organizations with impersonation ("view as sub-org")
- Tag management (user/wallet labeling with usage counts)
- Activity feed with 36 audit action types
- Full audit logs (filterable by action, resource; with IP and user agent)

### Wallets — 15 endpoints ✅
- HD wallets (BIP44 m/44'/60'/0'/0/n with BIP32/Legacy options)
- Import from mnemonic (12 or 24 words, validated)
- Export/reveal mnemonic (raw + passphrase-encrypted with PBKDF2)
- Account derivation per chain (6 supported chains)
- Seed encryption (AES-256-GCM) at rest
- Native coin balance fetching via JSON-RPC
- ERC20 token balance queries (known tokens: USDC, USDT, DAI, WETH)
- Gas price estimation per chain (slow/standard/fast)
- Freeze/Unfreeze wallet
- Key rotation (generate new seed, re-derive all existing accounts)
- Private key derivation and management (SECP256K1)

### Transactions — 10 endpoints ✅
- Sign & broadcast (ethers.js v6 with full EIP-1559 support)
- Pre-sign evaluation: policy engine → risk assessment → spending limits check
- Gas sponsorship (config-driven, sponsor wallet pays gas)
- Transaction simulation (eth_call)
- Fee estimation
- Retry failed transactions (configurable: max 3 retries, 1s base delay)
- Cancel pending transactions (replacement tx with 0-value self-transfer)
- Speed-up pending transactions (replacement tx with higher gas)
- Nonce management with Redis-based distributed locking
- Message signing (off-chain)
- Contract interface ABI decoding in transaction context
- Background transaction monitor (30s polling, updates status, fires webhooks + WebSocket)
- CSV export (download up to 1000 transactions with filters)

### Policy Engine ✅
- JSON rule engine with 9 condition types:
  - `LESS_THAN`, `GREATER_THAN`, `EQUAL`
  - `INCLUDE`, `NOT_INCLUDE`, `REGEX_MATCH` (with ReDoS protection)
  - `BEFORE`, `AFTER`, `WINDOW` (time-based)
- Effects: `EFFECT_ALLOW`, `EFFECT_DENY`
- Consensus: `ANY`, `ALL`, `REQUIRES_CONSENSUS` (triggers multi-sig)
- Root user (ORG_ADMIN) bypass
- Priority ordering (higher evaluated first)
- Toggle active/inactive per policy

### Risk Assessment ✅
- High value detection (5x/10x above 24h average, configurable 80% threshold)
- New recipient detection (address not seen in recent 100+ transactions)
- Off-hours detection (10pm-6am UTC)
- Velocity checking via Redis (configurable: 50 tx/hour window)
- Scam address detection:
  - Static blocklist (30 known scam addresses)
  - Dynamic blocklist from GitHub (crytic/evm-scam-database, 24h Redis cache)
  - Burn address detection (0x0, 0xdead, 0x1)
- Spending limit validation (per-wallet/chain: maxPerTx, daily, monthly, allowlist, denylist)

### Multi-Sig Approvals ✅
- Auto-triggered on `REQUIRES_CONSENSUS` policy or high-risk transactions
- Configurable required approvals count
- Approve: auto-broadcasts transaction when threshold is met
- Reject: marks transaction as FAILED
- Full audit trail for approval lifecycle

### AI Agents ✅
- Create agent with delegated credentials
- Auto-provisions User + scoped API key on creation
- 14 granular permissions (wallet:sign, wallet:read, transaction:read, policy:read, etc.)
- Revoke agent (disables API key, sets status to REVOKED)
- Agent login events tracked via webhooks
- Email notification to org admins on agent creation

### Webhooks — 19 event types ✅
- Configurable subscriptions: user.login/signup, wallet.{created,imported,deleted,exported,frozen,unfrozen,rotated}, account.{created,deleted}, transaction.{submitted,confirmed,failed}, policy.{created,deleted,triggered}, agent.{created,revoked,login}
- HMAC-SHA256 payload signing
- Retry queue with exponential backoff (base 60s, max 1h, 5 attempts)
- WebhookDelivery tracking (status, attempt count, next attempt time, errors)
- Background processor (30s poll for pending/retrying deliveries)

### Enterprise Features ✅
- Multi-user organizations with role-based access (ORG_ADMIN, DEVELOPER, AGENT, AUDITOR)
- Sub-organizations with impersonation for multi-tenant use
- Spending limits: per-wallet/chain — maxPerTx, maxDaily, maxMonthly, allowlist, denylist
- IP-whitelisted API keys with SHA-256 hashing
- Scope-based permissions (22 URL pattern → method → scope mappings)
- Comprehensive audit logging (36 action types)
- Billing: plans (Free, PAYG, Pro, Enterprise), invoices, monthly usage metrics
- Contract interfaces: save ABIs, decode calldata
- Tags for user/wallet organization

### Notifications ✅
- Centralized email notification service for org admins
- Alerts for: large transactions, transaction failures, policy denials, agent creation, wallet creation, spending limit breaches
- Same SMTP/branding patterns as auth emails
- Real-time activity display in dashboard notification bell

### Developer Experience ✅
- SDK: `WranKeyClient` class with 50+ typed methods, CJS+ESM dual output
- React hooks: `useWranKey`, `useAuth`, `useWallets`, `useTransactions`, `usePolicies`, `useAgents`
- `WranKeyProvider` with localStorage persistence and session restore
- WebSocket gateway (`/ws`) with per-org rooms, ping/pong heartbeat
- Swagger API docs at `/docs`
- `.env.example` with all 40+ environment variables documented
- Docker Compose with backend service + health checks

### Infrastructure ✅
- Prisma schema: 22 models, full migration history
- Redis: nonce locks (Lua scripts), OTP rate limiting, velocity tracking, scam address caching
- AES-256-GCM encryption at rest, PBKDF2 key derivation (310K iterations, SHA-512)
- JWT + API key dual authentication
- Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Rate limiting: 1000 req/min
- CORS with dynamic origin validation
- CI/CD: GitHub Actions (lint, typecheck, 3 test suites, PostgreSQL + Redis services)
- Docker Compose: PostgreSQL 16 + Redis 7 + Backend API
- Backend multistage Dockerfile (Node 20 Alpine, non-root user)
- Dashboard multistage Dockerfile (nginx Alpine)
- Seed script: 1 org, 3 users, 3 policies, 1 webhook, 1 agent

### Dashboard — 29 pages ✅
| Page | Route | Purpose |
|------|-------|---------|
| Login | `/login` | 3-step email OTP login/signup with remembered users |
| Onboarding | `/onboarding` | New user org name setup wizard |
| Accept Invitation | `/accept-invitation` | Accept team invite via token + OTP |
| OAuth Callback | `/oauth-callback` | OAuth code exchange handler |
| Reset Password | `/reset-password` | Request + confirm password reset |
| Home | `/` | Dashboard with live platform health (DB, Redis, RPC, WebSocket) |
| Wallets | `/wallets` | Wallet CRUD with create/import modals |
| Wallet Detail | `/wallets/[id]` | Single wallet: balances, tokens, gas, accounts, security |
| Company Wallets | `/company-wallets` | Company-level wallet listing |
| Transactions | `/transactions` | Filterable history with CSV export, auto-refresh |
| Send Transaction | `/transactions/send` | Send form with fee estimation |
| Policies | `/policies` | Policy builder with dynamic conditions |
| Approvals | `/approvals` | Multi-sig approval queue with approve/reject |
| Agents | `/agents` | Agent CRUD with one-time credential display |
| Webhooks | `/webhooks` | Webhook registration with event selection |
| API Keys | `/api-keys` | API key CRUD with permissions + IP allowlists |
| Spending Limits | `/spending-limits` | Per-wallet spending cap configuration |
| Team | `/team` | Team roster, invite members, create service users |
| Root Quorum | `/team/root-quorum` | Quorum configuration for critical operations |
| Users | `/users` | User listing |
| Profile | `/profile` | Edit display name, view account info |
| Settings | `/settings` | General settings |
| Configuration | `/configuration` | Org-level embedded wallet config |
| Audit Logs | `/audit-logs` | Filterable audit trail |
| Activity Logs | `/activity-logs` | Chronological activity feed |
| Billing | `/billing` | Invoices, plans, monthly usage |
| Usage | `/usage` | Usage analytics |
| Tags | `/tags` | Tag management with usage counts |
| Private Keys | `/private-keys` | Derived private key management |
| Private Key Detail | `/private-keys/[id]` | Individual private key details |
| Sub-Orgs | `/sub-orgs` | Multi-tenant sub-organization management |
| Sub-Org Detail | `/sub-orgs/[id]` | Sub-org details with impersonation |
| Contract Interfaces | `/contract-interfaces` | Smart contract ABI management |
| Verifiable Cloud | `/verifiable-cloud` | Verifiable cloud page |

### Tests — 90+ tests across 6 suites ✅
| Suite | Tests |
|-------|-------|
| Crypto utils | 7 — encrypt/decrypt, hashing, token generation |
| Enclave (HD wallets) | 15 — generation, recovery, derivation, passphrase encryption |
| Policies | 25 — all 9 conditions, consensus modes, ReDoS safety |
| Wallet infrastructure | 20+ — full lifecycle: create, import, export, freeze, rotate, spending limits, tx simulation, fee estimation, nonce |
| Routes integration | 20 — wallets, orgs, users, agents, webhooks, transactions, sign-message |
| API smoke tests | 5 — health check, validation, auth required |
| Dashboard | 5 — API client, utilities, auth provider, error boundary |

---

## User Journey (End-to-End)

1. **Sign up** → Email OTP, WebAuthn/passkey, Google OAuth, or password
2. **Set org name** → Onboarding wizard on first login
3. **Create wallet** → HD wallet on any chain, import existing
4. **Check balances** → Native + ERC20 tokens per chain
5. **Set policies** → Allow/deny rules with conditions + spending limits
6. **Create agents** → AI agents with scoped API keys
7. **Send transactions** → Sign → Policy check → Risk assess → Broadcast → Monitor
8. **Handle approvals** → Approve/reject multi-sig requests
9. **Invite team** → Email invite with link → OTP acceptance → joins org
10. **Monitor** → Activity feed, audit logs, notification bell, email alerts
11. **Manage** → Sub-orgs, tags, billing, configuration, contract interfaces, private keys
12. **Export** → Download transaction history as CSV

---

## Remaining Work

### P0 — Completed ✅
All critical items done: gas sponsorship, scam address detection, webhook retry queue, backend Dockerfile, `.env.example`, background transaction monitor, dashboard WebSocket client, platform health monitoring, error handling fix.

### P1 — Completed ✅
All OAuth providers (Google, Discord, GitHub, Apple, X), WebSocket heartbeat, email notification service, transaction CSV export, Tailwind brand classes, duplicate fix, invite flow improvements, team status fixes.

### P2 — Not Started (nice to have, not blocking MVP)
1. **Wallet balance history** — New DB table for balance snapshots, daily background job, charts
2. **Account/social recovery** — N-of-M guardians, time-locked recovery with email verification
3. **Cross-org sharing** — Share wallets/policies/agents between organizations
4. **E2E tests** — Playwright or Cypress covering login, wallets, transactions, policies, agents
5. **SDK React hook tests** — Mocked client tests for each hook's loading/error/success states
6. **ERC-4337 gasless transactions** — UserOperation builder, bundler integration, Paymaster contract. Note: smart contract source files (`.sol`) are deleted; contracts need to be rebuilt.
7. **Full-text transaction search** — PostgreSQL tsvector or Elasticsearch
8. **Smart contracts** — Solidity source files need to be recreated (build artifacts exist for WranKeyWallet, WranKeyWalletFactory, WranKeyPaymaster, ModuleManager, GuardianModule, SessionKeyModule, SpendingLimitModule)

---

## Quick Start

```bash
# 1. Start databases
docker compose up -d

# 2. Install dependencies
npm install

# 3. Setup database
npm run db:migrate
npm run db:seed

# 4. Run dev servers (backend :3001, dashboard :5173)
npm run dev
```

API docs (Swagger) at `http://localhost:3001/docs`
Dashboard at `http://localhost:5173`
