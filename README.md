# WranKey

**AI-Native Wallet & Agent Platform on Arc**

Turnkey wallet infrastructure for AI-powered agents and developers on the Arc blockchain. Combines embedded wallets, secure key management, and a delegated agent framework.

## Architecture

```
wrankey/
├── packages/
│   ├── backend/     # Fastify v5 + Prisma + PostgreSQL + Redis + ethers.js
│   ├── dashboard/   # Next.js 15 (App Router) + React 19 + TailwindCSS
│   └── sdk/         # TypeScript SDK (CJS + ESM) with React hooks
├── docker-compose.yml
└── prd/
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Fastify v5, Prisma v6, PostgreSQL 16, Redis 7, ethers.js v6 |
| **Dashboard** | Next.js 15, React 19, TailwindCSS, shadcn/ui |
| **SDK** | TypeScript, tsup (CJS + ESM), React 18/19 |
| **Blockchain** | Arc Network (EVM-compatible) |
| **Auth** | JWT sessions, API keys (SHA-256), WebAuthn/Passkeys, SIWE |

## Implementation Status

**Overall: ~90% complete (MVP-ready)**

| Area | Status | Coverage |
|------|--------|----------|
| Backend API | ✅ Complete | 10 feature modules, 100+ endpoints |
| Dashboard | ✅ Complete | 12 pages, all CRUD operations |
| SDK | ✅ Complete | 50+ client methods, 6 React hooks |
| Infrastructure | ✅ Complete | Prisma, Redis, Docker, CI/CD |
| Tests | ✅ Complete | 90+ unit/integration tests (backend) |
| Gas Sponsorship | ⬜ Pending | Config exists, implementation needed |
| Webhook Retries | ⬜ Pending | Fire-and-forget, needs retry queue |
| Real-time Dashboard | ⬜ Pending | WebSocket gateway exists, dashboard not connected |
| Production Deploy | ⬜ Pending | No backend Dockerfile, no monitoring |

## What's Complete

### Backend API Modules (10)
- ✅ **Auth** — 26 endpoints: Email/Phone OTP, Google OAuth, WebAuthn/Passkeys, Wallet (SIWE), Password (bcrypt), Passwordless signup, Sessions, API keys, Password reset
- ✅ **Wallets** — 15 endpoints: HD wallet CRUD (BIP44), Import/Export (raw + passphrase-encrypted), Account derivation, Freeze/Unfreeze/Rotate, Balance, Tokens (ERC20), Gas price
- ✅ **Transactions** — 10 endpoints: Sign & broadcast, Simulate (eth_call), Retry, Cancel, Speed-up, Fee estimation, Message signing, Nonce management
- ✅ **Policies** — JSON rule engine: 9 condition types (LESS_THAN, GREATER_THAN, EQUAL, INCLUDE, NOT_INCLUDE, REGEX_MATCH, BEFORE, AFTER, WINDOW), 3 consensus modes (ANY/ALL/REQUIRES_CONSENSUS), Root user bypass, ReDoS protection
- ✅ **Agents** — Create agent (auto-provisions user + scoped API key), Revoke, List
- ✅ **Webhooks** — CRUD + HMAC-SHA256 signed event dispatch, 17 event types
- ✅ **Spending Limits** — Per-wallet/chain: max per tx, daily, monthly, allowlist, denylist
- ✅ **Approvals** — Multi-sig flow with required consensus count, auto-broadcast on approval
- ✅ **Chains** — Registry with 6 seeded chains (Sepolia, Ethereum, Polygon, Arbitrum, Optimism, Base), Admin CRUD
- ✅ **Orgs/Users** — Org CRUD, User CRUD, Role-based access (ORG_ADMIN, DEVELOPER, AGENT, AUDITOR), Audit logging (36 action types)

### Dashboard Pages (12)
- ✅ **Login** — 3-step email OTP flow with remembered users
- ✅ **Onboarding** — Org naming wizard, auto-skips if named
- ✅ **Reset Password** — Request + confirm with token
- ✅ **Home** — Stats cards (wallets, txs, users, agents), quick actions
- ✅ **Wallets** — List (search/filter/paginate), Create, Import
- ✅ **Wallet Detail** — 3 tabs: Overview (balances, tokens, gas), Transactions (retry/cancel/speed-up), Security (freeze/unfreeze/rotate/export/sign/derive accounts)
- ✅ **Transactions** — Filterable list with auto-refresh, Send form with fee estimation + simulation
- ✅ **Policies** — Create with dynamic condition builder, toggle, delete
- ✅ **Agents** — Create with permission checkboxes, one-time credential display, revoke
- ✅ **Webhooks** — Create with event selection, HMAC secret display, delete
- ✅ **API Keys** — Create with permissions + IP whitelist, one-time key display, delete
- ✅ **Users** — Create, update, delete
- ✅ **Team** — Read-only roster with role badges
- ✅ **Profile** — Editable display name, account info
- ✅ **Approvals** — Pending requests, approve/reject actions
- ✅ **Audit Logs** — Paginated read-only table

### SDK
- ✅ `WranKeyClient` — 50+ typed methods covering all API endpoints
- ✅ React hooks — `useAuth`, `useWallets`, `useTransactions`, `usePolicies`, `useAgents`
- ✅ `WranKeyProvider` — Context with localStorage persistence + session restore
- ✅ CJS + ESM dual output via tsup

### Infrastructure
- ✅ Prisma schema — 15 models, full migrations
- ✅ Redis — Nonce locks, OTP rate limiting (Lua scripts), velocity checks
- ✅ AES-256-GCM encryption at rest, PBKDF2 key derivation for passphrases
- ✅ JWT + API key auth with scope-based permission mapping (22 URL patterns)
- ✅ WebSocket gateway (`/ws`) with per-org client tracking
- ✅ Swagger API docs at `/docs`
- ✅ CI/CD — GitHub Actions: lint, typecheck, 3 test suites, PostgreSQL + Redis services
- ✅ Docker Compose — PostgreSQL 16 + Redis 7

## What's Remaining

### Critical (needed for production)
- ⬜ **Gas sponsorship** — Config exists in `config.ts` but no code uses it. Need sponsor wallet logic in transaction signing flow.
- ⬜ **Scam address detection** — `isKnownScamAddress()` returns `false`. Needs integration with a blocklist registry.
- ⬜ **Webhook retry queue** — Currently fire-and-forget. Needs retry with exponential backoff, dead letter queue, and delivery status tracking.
- ⬜ **Dashboard WebSocket integration** — Backend gateway at `/ws` exists. Dashboard needs a WebSocket client for real-time transaction/wallet/event updates.
- ⬜ **Platform health monitoring** — Dashboard "Platform Status" indicators are hardcoded. Need `/health` endpoint calls per service.
- ⬜ **Backend Dockerfile** — Missing. Only dashboard has a Dockerfile. Need multistage Node.js build for the Fastify server.
- ⬜ **`.env.example`** — Referenced in docs but not in the repo. Document all 40+ env vars with defaults.
- ⬜ **Background transaction monitoring** — Tx status only checked on manual fetch. Need a background job that polls pending txs, updates status, and fires webhooks.

### Medium
- ⬜ More OAuth providers (GitHub, Discord, Twitter, Apple)
- ⬜ WebSocket server-side heartbeat/keepalive
- ⬜ Push/email notifications (only WebSocket + webhooks currently)
- ⬜ Transaction CSV/PDF export
- ⬜ Missing `brand-600` color class in Tailwind config
- ⬜ Duplicate `Skeleton` export in `Spinner.tsx` (also in `skeleton.tsx`)

### Nice to Have
- ⬜ Wallet balance history & analytics
- ⬜ Account/social recovery mechanisms
- ⬜ Cross-org sharing / multi-tenancy
- ⬜ E2E tests (Playwright/Cypress)
- ⬜ SDK React hook test coverage
- ⬜ Gasless transactions via ERC-4337

## Quick Start

### Prerequisites
- Node.js >= 20
- Docker (for PostgreSQL & Redis)
- npm

### Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd wrankey
npm install

# 2. Start infrastructure
docker compose up -d postgres redis

# 3. Setup database
npm run db:migrate
npm run db:seed

# 4. Run dev servers
npm run dev
```

The dashboard runs at **http://localhost:3000** and the API at **http://localhost:3001**.
API docs (Swagger) at **http://localhost:3001/docs**.

## Core Features

### Authentication
- Email OTP (with SMTP/Nodemailer)
- Phone OTP (with Twilio SMS)
- Google OAuth
- WebAuthn / Passkeys
- Wallet-based (SIWE / MetaMask)
- Password authentication (bcrypt)
- Session management + JWT
- API keys with SHA-256 hashing + IP whitelisting

### Wallets
- HD wallets (BIP44 m/44'/60'/0'/0/n)
- Import from mnemonic
- Export / reveal mnemonic (audited)
- Account derivation
- Seed encryption (AES-256-GCM) at rest
- Balance fetching via JSON-RPC

### Transactions
- Sign & broadcast (ethers.js)
- Policy-based gating (pre-sign evaluation)
- Fee estimation
- Gas sponsorship configuration
- Transaction status tracking
- Nonce management

### Policy Engine
- JSON rule engine with 9 condition types:
  - `LESS_THAN`, `GREATER_THAN`, `EQUAL`
  - `INCLUDE`, `NOT_INCLUDE`, `REGEX_MATCH`
  - `BEFORE`, `AFTER`, `WINDOW` (time-based)
- Effects: `EFFECT_ALLOW`, `EFFECT_DENY`
- Consensus: `ANY`, `ALL`, `REQUIRES_CONSENSUS`
- Root user bypass

### Agents
- Create AI agent with delegated credentials
- Auto-generated user + API key on creation
- Scoped permissions per agent
- Revoke agent (disables key + marks as REVOKED)

### Webhooks
- Configurable event subscriptions
- HMAC-SHA256 signature verification
- Events: user.login, wallet.{created,imported,deleted,exported}, transaction.{submitted,confirmed,failed}, policy.{created,deleted,triggered}, agent.{created,revoked}, account.created

### Enterprise
- Multi-user organizations
- Role-based access (ORG_ADMIN, DEVELOPER, AGENT, AUDITOR)
- Comprehensive audit logging
- IP-whitelisted API keys
- Scope-based permissions (wallet:*, policy:*, etc.)

## API Reference

### Base URL
`http://localhost:3001/api/v1`

### Public Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/email/send` | Send email OTP |
| POST | `/auth/email/verify` | Verify email OTP + login |
| POST | `/auth/phone/send` | Send phone OTP |
| POST | `/auth/phone/verify` | Verify phone OTP + login |
| POST | `/auth/oauth` | OAuth (Google) login |
| POST | `/auth/password/signup` | Password signup |
| POST | `/auth/password/login` | Password login |
| POST | `/auth/password/reset` | Request password reset |
| POST | `/auth/password/reset/confirm` | Confirm password reset |
| POST | `/auth/wallet` | SIWE wallet login |
| POST | `/auth/webauthn/register` | WebAuthn registration start |
| POST | `/auth/webauthn/register/verify` | WebAuthn registration verify |
| POST | `/auth/webauthn/authenticate` | WebAuthn authentication start |
| POST | `/auth/webauthn/authenticate/verify` | WebAuthn authentication verify |
| GET  | `/health` | Health check |

### Protected Endpoints (Bearer Token or X-Api-Key)
| Method | Path | Description |
|--------|------|-------------|
| POST   | `/sessions/refresh` | Refresh JWT session |
| GET    | `/sessions` | List active sessions |
| DELETE | `/sessions/:id` | Revoke session |
| POST   | `/auth/logout` | Logout |
| POST   | `/api-keys` | Create API key |
| GET    | `/api-keys` | List API keys |
| DELETE | `/api-keys/:id` | Delete API key |
| POST   | `/orgs` | Create organization |
| GET    | `/orgs` | List organizations |
| GET    | `/orgs/:id` | Get organization |
| POST   | `/users` | Create user |
| GET    | `/users` | List users |
| PATCH  | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| POST   | `/wallets` | Create HD wallet |
| POST   | `/wallets/import` | Import from mnemonic |
| GET    | `/wallets` | List wallets |
| GET    | `/wallets/:id` | Get wallet |
| PATCH  | `/wallets/:id` | Update wallet |
| DELETE | `/wallets/:id` | Delete wallet |
| POST   | `/wallets/:id/accounts` | Derive account |
| GET    | `/wallets/:id/accounts` | List accounts |
| POST   | `/wallets/:id/export` | Export wallet (reveal mnemonic) |
| GET    | `/wallets/:id/balance` | Get wallet balance |
| POST   | `/transactions/sign` | Sign & send transaction |
| GET    | `/transactions` | List transactions |
| GET    | `/transactions/:id` | Get transaction |
| POST   | `/transactions/estimate-fee` | Estimate fee |
| GET    | `/accounts/:address/nonce` | Get nonce |
| POST   | `/policies` | Create policy |
| GET    | `/policies` | List policies |
| GET    | `/policies/:id` | Get policy |
| PATCH  | `/policies/:id` | Update policy |
| DELETE | `/policies/:id` | Delete policy |
| POST   | `/agents` | Create agent |
| GET    | `/agents` | List agents |
| GET    | `/agents/:id` | Get agent |
| DELETE | `/agents/:id` | Revoke agent |
| POST   | `/webhooks` | Create webhook |
| GET    | `/webhooks` | List webhooks |
| PATCH  | `/webhooks/:id` | Update webhook |
| DELETE | `/webhooks/:id` | Delete webhook |
| GET    | `/audit-logs` | List audit logs |

## Environment Variables

See `packages/backend/.env.example` for all configuration options. Key variables:

| Variable | Description | Default |
|----------|------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | `dev-secret` |
| `ENCRYPTION_KEY` | AES-256 encryption key | `dev-encryption-key-32characters` |
| `ARC_RPC_URL` | Arc blockchain RPC URL | `https://rpc.arc.network` |
| `ARC_CHAIN_ID` | Arc chain ID | `1234` |
| `GAS_SPONSORSHIP_ENABLED` | Enable gas sponsorship | `false` |
| `SMTP_HOST` | SMTP server for email OTP | - |

## Testing

```bash
# Run all tests
npm test

# Run backend tests only
npm test -- --filter=@wrankey/backend

# Run with coverage
npx vitest --coverage
```

## Docker Deployment

```bash
# Build and start all services
docker compose up -d --build

# Services:
# - PostgreSQL on port 5432
# - Redis on port 6379
# - Backend API on port 3001
# - Dashboard on port 8080 (nginx)
```

## SDK Usage

```typescript
import { createClient } from "@wrankey/sdk";

const client = createClient({
  apiBase: "http://localhost:3001",
});

// Send email OTP
await client.sendEmailOtp("user@example.com");

// Verify OTP and get session
const auth = await client.verifyEmailOtp("user@example.com", "123456");
console.log(auth.sessionToken);

// Create a wallet
const wallet = await client.createWallet("My Wallet");
console.log(wallet.addresses[0]);

// Send a transaction
const tx = await client.signAndSend({
  walletId: wallet.walletId,
  to: "0x...",
  value: "0.01",
});
console.log(tx.txHash);

// React hooks available too:
// useWallets(), useTransactions(), useAuth(), usePolicies(), useAgents()
```

## Project Structure

```
packages/
├── backend/
│   ├── prisma/          # Schema + migrations + seed
│   ├── src/
│   │   ├── modules/     # Feature modules (auth, wallet, transaction, policy, agent, webhook, org)
│   │   ├── middleware/   # Auth + security middleware
│   │   ├── utils/        # Crypto, enclave, JWT, audit, errors, pagination
│   │   ├── app.ts        # Fastify app builder
│   │   ├── config.ts     # Environment config
│   │   ├── db.ts         # Prisma client
│   │   ├── redis.ts      # Redis client
│   │   └── server.ts     # Entry point
│   └── tests/           # Vitest integration + unit tests
├── dashboard/
│   └── src/
│       ├── app/          # Next.js App Router pages
│       ├── components/   # UI components (shadcn/ui)
│       └── lib/          # API client + utilities
└── sdk/
    └── src/
        ├── client.ts     # WranKeyClient (full API)
        ├── types.ts      # TypeScript interfaces
        └── react/        # React hooks + provider
```

## Database Schema

15 tables managed by Prisma: `organizations`, `users`, `authenticators`, `sessions`, `api_keys`, `wallets`, `wallet_accounts`, `transactions`, `policies`, `agents`, `webhooks`, `audit_logs`

See `packages/backend/prisma/schema.prisma` for the full schema.

---

**License**: Private | **Version**: 0.1.0
