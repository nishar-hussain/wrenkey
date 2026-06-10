# WranKey - AI-Native Wallet & Agent Platform on Arc

## Overview
Turnkey wallet infrastructure for AI-powered agents and developers on Arc blockchain. Combines embedded wallets, secure key management, and delegated agent framework.

## Tech Stack
- Backend: Fastify v5, Prisma v6, PostgreSQL, Redis, ethers.js
- Dashboard: Next.js 15 (App Router), React 19, TailwindCSS
- SDK: TypeScript, tsup (CJS + ESM)

## Core Features
- Auth: Email OTP, Phone OTP, OAuth (Google), WebAuthn/Passkeys, Wallet (SIWE), Password
- Wallets: HD wallets (BIP44), import, export, account derivation
- Transactions: Sign & broadcast, policy-gated, fee estimation, gas sponsorship
- Policies: JSON rule engine (ALLOW/DENY/CONSENSUS), time/amount/recipient conditions
- Agents: Delegated API credentials with scoped permissions
- Webhooks: Configurable event notifications with HMAC signatures
- Enterprise: Multi-user orgs, roles, audit logs, compliance

## Quick Start
```bash
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```
