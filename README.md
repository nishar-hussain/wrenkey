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
