# ArKey Implementation Plan

## Tech Stack
- **Backend**: Node.js 20 + TypeScript + Fastify
- **Database**: PostgreSQL 16 + Prisma ORM
- **Cache/Sessions**: Redis
- **Blockchain**: ethers.js v6 (EVM-compatible, Arc chain)
- **Auth**: JWT, WebAuthn (@simplewebauthn), OAuth2, bcrypt
- **Key Management**: ethers.js HD wallets, simulated secure enclave (HSM abstraction)
- **OTP**: nodemailer (email), twilio (SMS placeholder)
- **Testing**: Vitest + supertest
- **SDK**: TypeScript, React hooks
- **Dashboard**: React 18 + Vite + TailwindCSS + Shadcn/ui
- **Monorepo**: npm workspaces
- **Logging**: pino, audit trail to DB

## Project Structure
```
wrankey/
  packages/
    backend/         # Fastify API server
    sdk/             # TypeScript SDK for clients
    dashboard/       # React admin dashboard
  docs/
    implementation-plan.md
  prd/
    wrankeyprd1.md
```

## Phase 1 - Implementation Order (MVP)
1. Project scaffolding & DB schema
2. Auth Service (Email OTP, OAuth, Sessions, API Keys)
3. Wallet Service (HD wallet creation, key management)
4. Policy Engine (JSON rules evaluation)
5. Transaction Service (sign, broadcast)
6. Agent Delegation
7. Webhook Service
8. Audit Logging
9. JavaScript SDK
10. Admin Dashboard
11. Tests
