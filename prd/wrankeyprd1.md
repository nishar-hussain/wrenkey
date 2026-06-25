# WranKey - AI-Native Wallet & Agent Platform on Arc

> **Status: ~90% MVP Complete** | Updated: June 2026

## Overview
Turnkey wallet infrastructure for AI-powered agents and developers on Arc blockchain. Combines embedded wallets, secure key management, and delegated agent framework.

## Tech Stack
- Backend: Fastify v5, Prisma v6, PostgreSQL, Redis, ethers.js ✅
- Dashboard: Next.js 15 (App Router), React 19, TailwindCSS ✅
- SDK: TypeScript, tsup (CJS + ESM) ✅

## Core Features

### Auth ✅
- ✅ Email OTP (SMTP/Nodemailer)
- ✅ Phone OTP (Twilio SMS)
- ✅ OAuth (Google)
- ✅ WebAuthn/Passkeys
- ✅ Wallet (SIWE/MetaMask)
- ✅ Password (bcrypt)
- ✅ Passwordless signup flow
- ✅ Password reset flow
- ✅ Session management + JWT
- ✅ API keys (SHA-256 hashed, IP whitelisted, scoped permissions)

### Wallets ✅
- ✅ HD wallets (BIP44 m/44'/60'/0'/0/n)
- ✅ Import from mnemonic (12 or 24 words)
- ✅ Export / reveal mnemonic (raw + passphrase-encrypted with PBKDF2)
- ✅ Account derivation per chain
- ✅ Seed encryption (AES-256-GCM) at rest
- ✅ Balance fetching via JSON-RPC
- ✅ ERC20 token balance queries
- ✅ Freeze/Unfreeze wallet
- ✅ Key rotation
- ✅ Gas price estimation per chain

### Transactions ✅
- ✅ Sign & broadcast (ethers.js v6)
- ✅ Policy-based gating (pre-sign evaluation)
- ✅ Fee estimation
- ✅ Transaction simulation (eth_call)
- ✅ Retry / Cancel / Speed-up (replacement tx)
- ✅ Transaction status tracking
- ✅ Nonce management with Redis locking
- ✅ Message signing
- ⬜ Gas sponsorship (config exists, not implemented)

### Policy Engine ✅
- ✅ JSON rule engine with 9 condition types:
  - `LESS_THAN`, `GREATER_THAN`, `EQUAL`
  - `INCLUDE`, `NOT_INCLUDE`, `REGEX_MATCH`
  - `BEFORE`, `AFTER`, `WINDOW` (time-based)
- ✅ Effects: `EFFECT_ALLOW`, `EFFECT_DENY`
- ✅ Consensus: `ANY`, `ALL`, `REQUIRES_CONSENSUS`
- ✅ Root user bypass
- ✅ ReDoS protection on regex conditions
- ✅ Risk assessment (6 factors: high value, extreme spike, new recipient, off-hours, velocity, known scams)
- ✅ Velocity checking via Redis
- ⬜ Scam address registry integration

### Agents ✅
- ✅ Create AI agent with delegated credentials
- ✅ Auto-generated user + API key on creation
- ✅ 14 granular permissions (including `*` wildcard)
- ✅ Revoke agent (disables key, sets status to REVOKED)

### Webhooks ✅
- ✅ Configurable event subscriptions (17 event types)
- ✅ HMAC-SHA256 signature verification
- ✅ Events: user.login/signup, wallet.{created,imported,deleted,exported,frozen,unfrozen,rotated}, transaction.{submitted,signed,broadcast,confirmed,failed}, policy.{created,deleted,triggered}, agent.{created,revoked}, account.created
- ⬜ Retry queue with exponential backoff
- ⬜ Delivery status tracking

### Enterprise ✅
- ✅ Multi-user organizations
- ✅ Role-based access (ORG_ADMIN, DEVELOPER, AGENT, AUDITOR)
- ✅ Comprehensive audit logging (36 action types)
- ✅ IP-whitelisted API keys
- ✅ Scope-based permissions (22 URL pattern → method → scope mappings)
- ✅ Spending limits (per-wallet/chain: max per tx, daily, monthly, allowlist, denylist)
- ✅ Multi-sig approval requests with configurable required approvals

### Dashboard ✅
- ✅ 12 fully functional pages (Login, Onboarding, Home, Wallets, Wallet Detail, Transactions, Send, Policies, Agents, Webhooks, API Keys, Users, Team, Profile, Approvals, Audit Logs)
- ✅ shadcn/ui component library
- ✅ Dark mode (class-based)
- ⬜ Real-time WebSocket integration (gateway exists at `/ws`, dashboard not connected)

## Remaining Work (Priority Order)

### P0 — Critical for Production
1. Gas sponsorship implementation (transaction routes)
2. Scam address detection service
3. Webhook retry queue + dead letter queue
4. Backend Dockerfile
5. `.env.example` file
6. Background transaction status monitoring job
7. Dashboard WebSocket client for real-time updates
8. Platform health API integration in dashboard

### P1 — Important
9. More OAuth providers (GitHub, Discord, Twitter, Apple)
10. WebSocket server-side heartbeat/keepalive
11. Push/email notification system
12. Transaction CSV/PDF export
13. Fix `brand-600` Tailwind class and duplicate `Skeleton` export

### P2 — Nice to Have
14. Wallet balance history & analytics
15. Account/social recovery
16. Cross-org sharing
17. E2E tests
18. SDK hook test coverage
19. ERC-4337 gasless transactions

## Quick Start
```bash
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```
