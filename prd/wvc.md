# WranKey Verifiable Compute (WVC)
## Complete System Design, Build Plan & Operating Manual — v4 (Full Depth)

> Status: Draft v4 — maximum depth pass
> Owner: WranKey Core Team
> Reference model: Turnkey Verifiable Cloud (TVC), reverse-engineered into a from-scratch buildable system
> Audience: engineers, security reviewers, auditors, and leadership — this document should be sufficient on its own, with no external context required

---

## Table of contents

1. Executive summary
2. Glossary
3. The problem, in full
4. Regulatory and compliance context
5. How AWS Nitro Enclaves actually work
6. Full system architecture
7. Workload-specific data flows (signing, parsing, policy evaluation, oracle)
8. Data model — complete schema
9. API specification
10. Build & packaging pipeline (reproducible builds, supply chain security)
11. Deployment lifecycle
12. Manifests — structure, canonicalization, hashing
13. Operators & the approval protocol
14. Enclave boot sequence
15. The attestation document — full field breakdown
16. Attestation verification algorithm
17. Key model: Ephemeral Keys and Quorum Keys
18. Key forwarding protocol
19. App Proofs and Boot Proofs
20. Networking architecture
21. Threat model
22. CLI specification
23. Dashboard specification
24. Verification libraries
25. SDK & integration guide — wiring WVC into existing WranKey modules
26. Migration plan — moving live wallets into WVC without downtime
27. Testing strategy
28. Observability
29. Operational runbooks
30. Incident response plan
31. Cost model
32. Compliance & audit checklist
33. Phased build plan
34. Team & resourcing
35. Risks and mitigations
36. Frequently asked questions
37. Appendix A: code sketches
38. Appendix B: JSON schemas
39. Appendix C: references
40. Next steps

---

## 0. Implementation status (live tracking)

> Last updated: 2026-07-13
> Scope: Local simulation (`local-dev-v1`) complete + Production Nitro scaffolding

### 0.1 What's DONE (local simulation, end-to-end)

| PRD § | Feature | Status | Notes |
|-------|---------|--------|-------|
| §8 | Database schema (10 WVC models) | ✅ Done | All Prisma models + migrations applied, `encryptedShares` added to ceremonies |
| §9 | API: Create/list/get WVC apps | ✅ Done | `POST/GET /wvc/apps`, `GET /wvc/apps/:id`, transactional cascade delete |
| §9 | API: Operators (add/list/revoke) | ✅ Done | `POST/GET/DELETE /wvc/apps/:appId/operators` |
| §9 | API: Deployments + manifests (create) | ✅ Done | Atomic DB transaction, JCS canonicalization, SHA-256 hash, operator pubkeys in manifest |
| §9 | API: Manifest approval | ✅ Done | Server verifies P-256 ECDSA signature against stored pubkey |
| §9 | API: Provision (local) | ✅ Done | Boots simulated replicas, produces boot proofs, generates Shamir shares |
| §9 | API: Deployment lifecycle (set-live, delete, restore) | ✅ Done | Full state machine, correct webhooks |
| §9 | API: Invoke | ✅ Done | `generate_seed`, `signature`, `parse_summary`, `policy_decision` |
| §9 | API: Proof fetch (app + boot) | ✅ Done | `GET /wvc/app-proofs/:id`, `GET /wvc/boot-proofs/:id` |
| §9 | API: Quorum key ceremonies (initiate, status, complete, list) | ✅ Done | All endpoints, P-256 pubkey validation on complete |
| §9 | API: Quorum key forwarding | ✅ Done | `POST /wvc/apps/:appId/quorum-key/request` — ECIES key forwarding |
| §9 | Webhooks (6 WVC event types) | ✅ Done | Correct event semantics (`wvc.deployment.deleted` not `unhealthy`) |
| §12 | Manifest JCS canonicalization + hashing | ✅ Done | RFC 8785 compliant |
| §13 | Operator P-256 key generation + signing | ✅ Done | CLI generates keys locally, never sends private keys |
| §16 | Verification library (local-dev-v1) | ✅ Done | `verifyLocalAppProof()`, `verifyLocalBootProof()` — 7-step verification, real P-256 ECDSA |
| §16 | Verification library (production Nitro) | ✅ Done | Full COSE_Sign1, CBOR, X.509 chain, AWS root cert — accepts both `public_key` and `user_data` binding |
| §19 | App Proof format (local-dev-v1) | ✅ Done | Ephemeral key, payload hash, attestation doc, signature |
| §19 | Boot Proof format (local-dev-v1) | ✅ Done | Attestation doc binding PCRs + ephemeral key |
| §22 | CLI: login, operator init/list | ✅ Done | |
| §22 | CLI: app create/list | ✅ Done | |
| §22 | CLI: deploy create/provision/status/set-live/delete/restore | ✅ Done | |
| §22 | CLI: deploy invoke | ✅ Done | |
| §22 | CLI: manifest show/approve | ✅ Done | Recomputes hash locally before signing |
| §22 | CLI: proof verify (--allow-local) | ✅ Done | Calls `verifyLocalAppProof()` with real crypto |
| §22 | CLI: quorum-key rotate | ✅ Done | Initiates rotation ceremony |
| §22 | CLI: ceremony status | ✅ Done | |
| §22 | CLI: quorum-key backup-share | ✅ Done | Real Shamir share extraction with ECIES decryption |
| §22 | CLI: quorum-key recover | ✅ Done | Real Shamir threshold reconstruction (GF(256)) |
| §23 | Dashboard: `/verifiable-compute` (apps list) | ✅ Done | Create app, list with pagination |
| §23 | Dashboard: `/verifiable-compute/apps/:id` | ✅ Done | Overview, deployments, operators, proofs, ceremonies tabs |
| §23 | Dashboard: `/verifiable-compute/deployments/:id` | ✅ Done | Deployment detail: manifest, health, boot proofs, app proofs |
| §23 | Dashboard: `/verifiable-compute/operators` | ✅ Done | Org-wide operators roster |
| §23 | Dashboard: Create deployment form | ✅ Done | Image, digest, PCRs, ports, resources, StageX |
| §23 | Dashboard: Manifest view modal | ✅ Done | Shows hash, JSON, approval progress |
| §23 | Dashboard: Add/revoke operator | ✅ Done | |
| §23 | Dashboard: Invoke deployment | ✅ Done | Invoke modal with payload type selection, result + app proof display |
| §23 | Dashboard: View app proofs | ✅ Done | Proofs tab, proof list, full proof detail modal |
| §23 | Dashboard: View boot proofs | ✅ Done | Boot proof count in deployment table + detail modal |
| §23 | Dashboard: Key ceremonies tab | ✅ Done | Ceremony history, initiate new ceremony modal |
| §23 | Dashboard: Client-side proof verification | ✅ Done | "Verify Proof in Browser" button using Web Crypto API |
| §17-18 | Quorum Key bootstrapping (local) | ✅ Done | Auto-generates + persists Quorum Key on first provision, Shamir shares encrypted to operators |
| §18 | Key forwarding (local) | ✅ Done | Real ECIES encryption (not pointer copy) |
| §18.4 | Shamir Secret Sharing (TS) | ✅ Done | GF(256) split + recover in CLI and backend |
| §25 | SDK: Wallet module → WVC integration | ✅ Done | `POST /wallets` routes through WVC, `devMode` flag in response |
| §25 | SDK: Transaction module → WVC integration | ✅ Done | `POST /transactions/sign` routes through WVC, `devMode` flag |
| §24 | Verification library: browser-compatible | ✅ Done | `@wrankey/wvc-verify/browser` entry point using Web Crypto API |
| §27 | E2E tests | ✅ Done | 82/82 tests pass — lifecycle, verify, ceremonies, delete, adversarial, wallet, key-forwarding, StageX, manifest, operator, local-runtime |
| §27 | Adversarial tests (§27 mandatory) | ✅ Done | PCR mismatch, signature tamper, stale attestation, rollback attack, unapproved provision |
| — | Rust enclave crypto (JCS, AES-GCM, Shamir GF(256), ECIES) | ✅ Done | 3/3 Shamir tests pass, P1363 signatures, COSE_Sign1 attestation |
| — | Rust enclave: parse_summary + policy_decision | ✅ Done | Both workload types implemented |
| — | Rust enclave: migration module | ✅ Done | Wallet migration with re-encryption + proof |
| §10 | Reproducible build CI | ✅ Done | GitHub Actions: double-build-diff, SBOM, StageX verify |
| §20 | Host Agent | ✅ Done | vsock proxy, manifest delivery, egress lockdown, replica health |
| §10 | StageX config wiring | ✅ Done | `stagedxRequired` → verify OCI digest before provisioning |

### 0.2 What's PRODUCTION-READY (AWS Nitro — Phase 2)

| PRD § | Feature | Status | Notes |
|-------|---------|--------|-------|
| §10 | Reproducible build pipeline | ✅ Scaffold | GitHub Actions workflows created (double-build-diff, SBOM, StageX) |
| §14 | Enclave harness | ✅ Scaffold | Full boot sequence, COSE_Sign1 attestation, Shamir, ECIES key forwarding |
| §16 | Production attestation verification | ✅ Done | Full COSE_Sign1 + CBOR + X.509 chain in wvc-verify |
| §18 | Real key forwarding protocol | ✅ Done | ECIES encryption, attestation verification, `POST /quorum-key/request` |
| §20 | Host Agent | ✅ Scaffold | vsock proxy, manifest delivery, egress lockdown, replica health tracking |
| §26 | Wallet migration | ✅ Scaffold | Migration enclave module with re-encryption + proof |
| §22 | CLI: backup-share + recover | ✅ Done | Real Shamir cryptography (not stubs) |

### 0.3 What's STILL NEEDED for Production Nitro

| PRD § | Feature | Notes |
|-------|---------|-------|
| §5 | AWS Nitro Enclave setup | Parent EC2, Nitro CLI, EIF build — requires AWS infrastructure |
| §14 | NSM `/dev/nsm` calls | Replace JSON attestation with real NSM API calls — requires Nitro hardware |
| §14 | Real `AF_VSOCK` | Replace Unix sockets with `AF_VSOCK` — requires Nitro hardware |
| §7 | Real ECDSA secp256k1 tx signing | `k256` crate needs to be added (commented out due to build env) |
| §10 | StageX integration | Wire to real StageX endpoint for OCI digest verification |
| §16 | Test against real Nitro attestation | Construct valid COSE_Sign1 + cert chain test (failure-branch tests exist) |
| §29 | Production runbooks | Rolling upgrades, disaster recovery drills |
| §30 | Incident response plan | SEV-1/2/3, tabletop exercises |
| §32 | Compliance & audit checklist | SOC 2, external security audit

### 0.4 Current end-to-end flow (local simulation)

```
User creates app → adds operators → creates deployment + manifest
  → operator approves manifest (CLI signs manifest hash with P-256)
  → deployment auto-transitions to "approved"
  → user provisions (local runtime boots replicas, produces boot proofs)
  → user sets deployment live
  → user invokes (local runtime produces result + app proof with real P-256 ECDSA)
  → proof stored in DB
  → proof fetchable via API
  → proof cryptographically verifiable via @wrankey/wvc-verify or CLI
```

### 0.5 Next implementation priorities

1. **Dashboard: Invoke + Proof viewing** — users need to interact with live deployments and see proofs
2. **Quorum Key bootstrapping in local runtime** — complete the key model
3. **Dashboard: Key ceremonies tab** — audit visibility
4. **SDK integration** — wire WVC into wallet/transaction modules
5. **CLI: backup-share + recover** — complete the Shamir ceremony tooling

---

## 1. Executive summary

WranKey Verifiable Compute (WVC) lets WranKey run code — most importantly, wallet key generation and transaction signing — inside hardware-isolated environments (AWS Nitro Enclaves), and afterward produce cryptographic proof of exactly what code ran, without anyone, including WranKey itself, having to be trusted on their word.

Today, WranKey's stack is custodial in the strict technical sense: a seed phrase is encrypted at rest with AES-256-GCM, but at the moment of signing, the plaintext key exists in a backend process WranKey's own engineers can, in principle, inspect. WVC removes that exposure for any workload routed through it, replacing "trust our encryption" with "verify this hardware-signed proof, using public tooling, without trusting us at all."

This document is written to be **complete and self-contained**: a reader with zero prior TEE experience should be able to read it start to finish and understand not just *what* to build, but *why* each piece exists, *how* it works internally, *what happens when it fails*, and *what to tell a customer, auditor, or regulator* about its guarantees and limits.

This version adds four things the previous draft didn't cover: how this maps to actual compliance/audit frameworks (§4, §32), how to migrate real, currently-live wallets into this system without downtime (§26), a full incident response plan distinct from routine runbooks (§30), and a concrete integration guide showing exactly how WranKey's existing Wallets, Transactions, and Policies modules call into WVC (§25).

**The end state, in one sentence, unchanged from before:** an engineer anywhere in the world, with no access to WranKey's infrastructure, can take a proof bundle produced by WVC and a small open-source verification library, and mathematically confirm — using only public AWS certificates and arithmetic — exactly which version of WranKey's code produced a given signature, with no step in that chain requiring them to trust WranKey.

---

## 2. Glossary

Read this in full before anything else — every term recurs constantly below.

- **TEE (Trusted Execution Environment)** — an isolated region of a computer's hardware, invisible even to that computer's own operating system, hypervisor, and root user.
- **AWS Nitro Enclave** — AWS's specific TEE: an isolated VM carved from a normal EC2 instance, with no persistent storage, no interactive shell access, and exactly one communication channel to the outside world (vsock).
- **Parent instance** — the ordinary EC2 instance that "hosts" a Nitro Enclave, lending it CPU/memory while remaining logically separate from it.
- **EIF (Enclave Image File)** — the bootable package `nitro-cli` produces from a Docker image; it's what actually runs inside the enclave.
- **vsock** — the only channel between an enclave and its parent instance. A byte-stream socket with no IP stack, no DNS, no routing — every byte in or out must be manually relayed.
- **NSM (Nitro Security Module)** — a virtual device (`/dev/nsm`) inside every enclave, used to request cryptographically secure randomness and signed attestation documents.
- **Attestation document** — a signed statement from the NSM, rooted in AWS hardware, proving "an enclave with these exact measurements is running right now, and here's a public key it generated." The single most important artifact in this entire system.
- **PCR (Platform Configuration Register)** — hash values inside the attestation document measuring exactly what's running: PCR0 (whole image), PCR1 (kernel/boot), PCR2 (application layer).
- **COSE_Sign1** — the CBOR-encoded signed-data-structure format (RFC 8152) the attestation document is wrapped in.
- **Reproducible build** — a build process that produces byte-identical output from the same source, every time, on any machine. Without this, PCR values can't be tied confidently to a specific, publicly-readable git commit.
- **OCI image** — the Docker-compatible container format used purely as a *transport mechanism* to move your compiled binary into the enclave-build pipeline.
- **Ephemeral Key** — a keypair generated fresh inside the enclave every boot; never leaves it; dies with the enclave.
- **Quorum Key** — a keypair that persists across boots/upgrades/replicas, used to encrypt long-lived state (like a wallet seed). Getting a new enclave a copy of it safely is the hardest protocol in this system (§18).
- **Manifest** — the JSON document describing exactly what's being deployed (image, digest, expected PCRs, ports, approvers) — the object operators cryptographically approve before anything goes live.
- **Operator** — a human or system holding a keypair authorized to approve manifests. Production requires a threshold (e.g. 2-of-3), so no single compromised operator can approve a bad deployment alone.
- **App Proof** — a bundle proving a specific action (e.g., "I signed this transaction") was performed by a specific, attested, currently-running enclave.
- **Boot Proof** — a bundle proving a specific manifest (with its approvals) is what booted a given enclave instance — distinct from an App Proof, which is about a specific *action*, not the boot itself.
- **Control plane** — everything *outside* the enclave: API server, Postgres, dashboard, orchestrator. Assumed fully compromisable in the threat model (§21) — the system must remain safe even so.
- **Digest** — SHA-256 hash, unless stated otherwise.
- **SLSA (Supply-chain Levels for Software Artifacts)** — an industry framework (Google-originated, now a Linux Foundation project) for grading how tamper-resistant a software build pipeline is; referenced in §10 as a target maturity model for WVC's build system.
- **SBOM (Software Bill of Materials)** — a machine-readable manifest of every dependency in a built artifact; relevant to both supply-chain security (§10) and compliance audits (§32).
- **Shamir's Secret Sharing** — a cryptographic scheme splitting a secret into N shares such that any threshold K of them reconstruct it, but fewer reveal nothing; used for Quorum Key backup/recovery (§18.4).
- **ECIES** — Elliptic Curve Integrated Encryption Scheme; the standard construction used to encrypt data (like a Quorum Key) to a specific public key, used in key forwarding (§18).

---

## 3. The problem, in full

### 3.1 What WranKey does today

WranKey generates HD (hierarchical deterministic) wallets: one seed phrase, many derivable addresses across chains. The seed is AES-256-GCM encrypted at rest, key-derived via PBKDF2 (310,000 iterations, SHA-512) — genuinely strong at-rest protection. But signing requires:

1. Fetch encrypted seed from Postgres.
2. Decrypt into backend process memory.
3. Derive the specific key (BIP44 path).
4. Sign.
5. (Ideally) zero the plaintext from memory.

Steps 2–4 are the exposure window: any sufficiently privileged access to that running process — insider, RCE vulnerability, compelled logging — can in principle extract the plaintext key during that window. This is not a critique of WranKey's specific code; it's the structural limit of every "encrypted DB + application server" wallet design. It's what makes this category **custodial**: the operator is technically *capable* of accessing funds, whether or not they ever do.

### 3.2 What "non-custodial" actually requires

Two things: the plaintext key must exist only somewhere even the operator's own engineers, root access, and infrastructure cannot inspect, and there must be a way for someone other than the operator to verify that claim rather than take it on faith. TEEs — specifically Nitro Enclaves, which is what Turnkey uses — are the practical, production-proven way to get both today.

### 3.3 Why "trust us, it's encrypted" isn't sufficient anymore

Because it's not a security property, it's a business promise — and the crypto industry's history of custodial failures (exchange collapses, custodian breaches) has made "verify, don't trust" the baseline expectation for anything holding real value, from both customers and regulators.

### 3.4 What WVC changes concretely

For any wallet routed through WVC:
- Seed generation happens inside the enclave, from enclave-sourced entropy — WranKey's backend never sees the plaintext seed.
- Signing happens inside the enclave — plaintext key material exists only in enclave memory, only for the duration of a signing operation.
- Every signature ships with an App Proof — independently checkable evidence of exactly which code produced it.
- Even a fully compromised WranKey backend and database cannot yield a plaintext seed or a forged signature, because neither ever held the key material or signing capability.

---

## 4. Regulatory and compliance context

This section didn't exist in earlier drafts and is worth being explicit about, because "verifiable" and "non-custodial" are not just engineering claims — they're claims with real regulatory weight.

### 4.1 Custodial vs. non-custodial classification

Many jurisdictions' money-transmission and custody regulations (and frameworks like the EU's MiCA) draw a meaningful legal line around whether an operator can unilaterally access or move customer assets. A genuinely non-custodial architecture — where WranKey's own infrastructure structurally cannot extract a plaintext key even under compulsion — can materially change which regulatory regime applies to the business. **This is not legal advice** — WranKey should have counsel confirm the actual regulatory implications of moving from custodial to enclave-based key management in every jurisdiction it operates in — but the engineering distinction matters enough to the business that it belongs in this document, not just in a security review.

### 4.2 SOC 2 / ISO 27001 relevance

Enclave-based key management directly strengthens several common SOC 2 Trust Services Criteria control areas:
- **Confidentiality** — key material is provably inaccessible to WranKey personnel, not just contractually promised.
- **Processing integrity** — App Proofs give auditors independently-verifiable evidence that signing logic executed as specified, rather than relying on code review + trust.
- **Change management** — the manifest/operator-approval flow (§13) is itself a strong, cryptographically-enforced change-control mechanism auditors can directly test.

### 4.3 What to tell an auditor, precisely

Be precise, not promotional, when describing this system to an external auditor:
- "Key material for wallets routed through WVC exists in plaintext only inside AWS Nitro Enclaves, for the duration of a single operation, and is never accessible to WranKey personnel, infrastructure, or logs."
- "Every signing operation produces a cryptographic App Proof, independently verifiable against AWS's public attestation root, without requiring trust in WranKey's own systems."
- Be equally precise about limits: side-channel risk against the physical host is a shared limitation of all TEE technology (§21, row 6) and not something WVC's design adds protection against beyond what AWS itself provides.

### 4.4 Data residency and cross-border considerations

AWS Nitro Enclaves run within a specific AWS region; if WranKey has customers or regulatory obligations tied to data residency, the parent EC2 instance's region selection is a compliance-relevant decision, not purely an infrastructure one — loop in legal/compliance before picking regions in Phase 2.

---

## 5. How AWS Nitro Enclaves actually work

(Unchanged in substance from the prior draft, retained here in full because this section is foundational and nothing downstream should be read without it.)

### 5.1 The physical/virtual setup

A normal EC2 instance (the "parent") has the Nitro Enclaves feature enabled. AWS's Nitro hypervisor then carves out a portion of that instance's own CPU cores and memory into a fully separate, isolated virtual machine — the enclave. This is not a container and not a separate physical box; it's a hardware-enforced partition of the same underlying technology that already isolates every EC2 customer from every other one.

The enclave has:
- **No persistent disk** — everything lives in memory; a restart wipes it clean.
- **No direct network interface** — no TCP/IP stack, no DNS, no routing.
- **No interactive access** — no SSH, no console, not even for AWS's own operators with physical hardware access.
- **Exactly one channel out**: vsock, connecting only to its own parent instance, never directly to the internet.

### 5.2 Why the isolation is real

This isolation is enforced at the Nitro hypervisor/firmware level — the same technology AWS uses to isolate every customer's EC2 instance from every other customer's and from AWS's own operators. This is AWS's own published security claim, independently audited; WVC does not add to this isolation guarantee, it adds the *proof* layer that lets a third party verify the claim rather than take AWS's (and WranKey's) word for it.

### 5.3 The boot sequence, physically

1. Build a Docker image containing your statically-compiled Rust binary.
2. `nitro-cli build-enclave --docker-uri <image> --output-file app.eif` converts it to an EIF, computing PCR values as a side effect — this step must be reproducible.
3. `nitro-cli run-enclave --eif-path app.eif --cpu-count N --memory M` on the parent instance boots it; Nitro allocates isolated CPU/memory, boots a minimal kernel, starts your init process.
4. Your init process (the "QOS-lite" harness, §14) does setup (manifest verification, key generation/forwarding), then execs your application binary.
5. The application binary listens on a vsock port for traffic forwarded by the Host Agent (§20).

### 5.4 PCR values, concretely

- **PCR0** = hash of the entire enclave image (kernel + boot ramdisk + application layer together).
- **PCR1** = hash of just the kernel/boot process.
- **PCR2** = hash of just the application layer.

If you know that commit `abc123`, built through your reproducible CI pipeline, produces PCR0 = `9f8e...`, then any attestation document claiming that PCR0 is, with cryptographic confidence, running exactly that code — no exceptions, short of either breaking your reproducible build chain or breaking AWS's own attestation signing (a much larger, publicly catastrophic event).

### 5.5 The NSM device

Enclave code opens `/dev/nsm` to request:
- **GetRandom** — cryptographically secure randomness from the Nitro hypervisor's hardware RNG, used to generate Ephemeral Keys and (in the bootstrap case) the first Quorum Key.
- **Attestation** — a signed attestation document, optionally including arbitrary `user_data` bytes (used to bind an Ephemeral Key's public key or a manifest hash into the attestation).

### 5.6 What Nitro does NOT give you for free

- No networking inside the enclave (you build the vsock proxy, §20).
- No state persistence across reboots (you build Quorum Key + forwarding, §18).
- No multi-party deployment approval (you build the manifest/operator system, §12–13).
- No protection against every class of side-channel attack against the physical host (a genuine, honestly-disclosed limitation, §21 row 6).

Everything Nitro doesn't give you for free is, not coincidentally, most of what the rest of this document designs.

---

## 6. Full system architecture

### 6.1 Component table

| Component | Runs where | Responsibility | Trusted? |
|---|---|---|---|
| Dashboard | Existing WranKey Next.js app, extended | Create/view apps, deployments, approval status | No |
| CLI (`wvc`) | Operator's local machine | Same actions, plus local operator key management and manifest signing | No (but operator machine hygiene matters) |
| API server | Existing WranKey Fastify backend, extended | Orchestration, metadata storage, relaying (never decrypting) key-forwarding ciphertext | No — assume fully compromised |
| Postgres | Existing WranKey RDS instance, new tables | Stores schema in §8 — metadata, hashes, ciphertext, never plaintext keys | No |
| Enclave Orchestrator | Normal EC2/ECS/k8s control plane | Starts/stops parent instances, tracks health | No |
| Host Agent | Normal Linux process on the parent EC2 instance | vsock proxy, egress lockdown enforcement, manifest delivery | No, but network-topology-critical |
| Enclave harness ("QOS-lite") | First process inside the enclave | Digest verification, Ephemeral Key generation, key forwarding, execs app | **Yes** — inside the trust boundary |
| App binary | Execed inside the enclave | Actual workload logic; produces App Proofs | **Yes** — inside the trust boundary |
| Verification library | Anywhere — customer infra, auditor's laptop | Independently checks proofs against the public AWS root | N/A — this is what removes the need for trust elsewhere |

### 6.2 Architecture diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                         WVC Control Plane (untrusted)                  │
│   ┌───────────┐        ┌────────────┐        ┌─────────────────────┐  │
│   │ Dashboard │──HTTP──►│ API Server │──SQL──►│      Postgres        │  │
│   └───────────┘        │ (Fastify)  │        │ (metadata/hashes/     │  │
│   ┌───────────┐        │            │        │  ciphertext only)     │  │
│   │    CLI    │──HTTP──►│            │        └─────────────────────┘  │
│   └───────────┘        └─────┬──────┘                                  │
│                               ▼                                         │
│                     ┌───────────────────┐                               │
│                     │ Enclave Orchestrator│                              │
│                     └─────────┬─────────┘                               │
└───────────────────────────────┼─────────────────────────────────────────┘
                                 │ manages
                    ┌────────────▼────────────────────────────┐
                    │   Parent EC2 Instance (Nitro-capable)     │
                    │  ┌──────────────────────────────────┐   │
                    │  │   Host Agent                         │   │
                    │  │  - vsock proxy / egress lockdown       │   │
                    │  └────────────────┬─────────────────────┘   │
                    │                   │ vsock only                │
                    │  ┌────────────────▼────────────────────┐   │
                    │  │        Nitro Enclave (EIF)              │   │
                    │  │  ┌────────────────────────────────┐  │   │
                    │  │  │ Harness → digest check → EphKey     │  │   │
                    │  │  │        → key forwarding → exec app    │  │   │
                    │  │  └───────────────┬────────────────────┘  │   │
                    │  │                  ▼                        │   │
                    │  │  ┌────────────────────────────────┐  │   │
                    │  │  │        App binary (Rust)            │  │   │
                    │  │  │  signs payloads → App Proofs           │  │   │
                    │  │  └────────────────────────────────┘  │   │
                    │  └──────────────────────────────────────┘   │
                    └────────────────────────────────────────────┘

     Anywhere: a Verifier, using only public AWS root cert + open-source lib
     — requires ZERO trust in WranKey's infrastructure
```

---

## 7. Workload-specific data flows

The single "signing request" walkthrough from earlier drafts generalizes to at least four workload types WranKey will plausibly run through WVC. Each is worth tracing separately, because the *shape* of the App Proof's payload differs.

### 7.1 Signing workload

1. Transactions module calls `POST /wvc/deployments/:id/invoke` with an unsigned transaction.
2. Request proxied to the live enclave replica for the `wallet-signer` app.
3. Enclave derives the specific key from in-memory seed material (decrypted using the Quorum Key), signs the transaction.
4. Enclave signs `sha256(signed_tx)` with its Ephemeral Key, requests a fresh attestation, returns `{signed_tx, app_proof}`.
5. Control plane stores the App Proof; caller receives signed tx + proof.

### 7.2 Transaction parsing / human-readable summary workload

1. Dashboard, before asking a user to approve a transaction, calls `POST /wvc/deployments/:id/invoke` on the `tx-parser` app with the raw transaction bytes.
2. Enclave decodes the transaction (ABI-aware, using WranKey's existing Contract Interfaces data if needed as signed input — not fetched live from inside the enclave, per the no-egress rule in §20), produces a structured, human-readable summary.
3. Enclave signs `sha256(summary_json)`, returns `{summary_json, app_proof}`.
4. Dashboard displays the summary to the end user, optionally alongside a "Verify" affordance that runs the App Proof through the client-side verification library — letting the *end user*, not just WranKey, confirm the summary wasn't tampered with between generation and display.

### 7.3 Policy evaluation workload (Phase 3+)

1. Before a transaction is broadcast, the Policies module's decision ("ALLOW", "DENY", "REQUIRES_CONSENSUS") is itself computed inside the enclave, given the transaction + the org's policy set as signed inputs.
2. Enclave signs `sha256({decision, transaction_hash, policy_set_hash})`.
3. This produces a provable statement: "policy set X, evaluated against transaction Y, produced decision Z" — independently checkable by an auditor without trusting WranKey's backend DB query logic.

### 7.4 Oracle-style workload (future, Phase 4 candidate)

1. An external data feed (e.g., a price) is fetched and signed *outside* the enclave (since enclaves can't make outbound calls, §20.4), then passed in as a signed input.
2. Enclave verifies the input's signature came from an expected, trusted data source, processes it (e.g., feeding into a spending-limit policy condition), and produces its own App Proof over the result.
3. This lets WranKey give customers verifiable evidence that a policy decision used real, tamper-evident external data — without needing full decentralized oracle infrastructure.

---

## 8. Data model — complete schema

(Schema retained in full from the prior draft — this is stable and doesn't need re-litigating each revision, only extended where genuinely new needs appear.)

```sql
-- Apps: a logical, named unit of deployable verifiable code
CREATE TABLE wvc_apps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  name                TEXT NOT NULL,
  description         TEXT,
  quorum_key_id       UUID REFERENCES wvc_quorum_keys(id),
  live_deployment_id  UUID REFERENCES wvc_deployments(id),
  required_approvals  INT NOT NULL DEFAULT 2,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wvc_apps_org ON wvc_apps(org_id);

-- Deployments: one specific attempt to run a given image+config
CREATE TABLE wvc_deployments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id              UUID NOT NULL REFERENCES wvc_apps(id),
  image_url           TEXT NOT NULL,
  executable_path     TEXT NOT NULL,
  executable_args     TEXT[] NOT NULL DEFAULT '{}',
  executable_digest   TEXT NOT NULL,
  expected_pcr0       TEXT NOT NULL,
  expected_pcr1       TEXT NOT NULL,
  expected_pcr2       TEXT NOT NULL,
  ingress_port        INT NOT NULL,
  health_port         INT NOT NULL,
  cpu_count           INT NOT NULL DEFAULT 2,
  memory_mib          INT NOT NULL DEFAULT 1024,
  replica_count       INT NOT NULL DEFAULT 3,
  status              TEXT NOT NULL CHECK (status IN (
                        'pending_manifest','approved','provisioning',
                        'live','inactive','marked_for_deletion','deleted'
                      )),
  manifest_id         UUID NOT NULL REFERENCES wvc_manifests(id),
  allowed_upgrade_from UUID[] DEFAULT '{}',  -- deployment_ids this may key-forward FROM during upgrades (see §29.2)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wvc_deployments_app ON wvc_deployments(app_id);
CREATE INDEX idx_wvc_deployments_status ON wvc_deployments(status);

-- Manifests: the exact document operators cryptographically approve
CREATE TABLE wvc_manifests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id       UUID,
  manifest_json       JSONB NOT NULL,
  manifest_hash       TEXT NOT NULL,
  required_approvals  INT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operators: humans/systems allowed to approve manifests
CREATE TABLE wvc_operators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  alias         TEXT NOT NULL,
  public_key    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wvc_operators_org ON wvc_operators(org_id);

-- Manifest approvals
CREATE TABLE wvc_manifest_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id   UUID NOT NULL REFERENCES wvc_manifests(id),
  operator_id   UUID NOT NULL REFERENCES wvc_operators(id),
  signature     TEXT NOT NULL,
  approved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(manifest_id, operator_id)
);

-- Quorum keys: PUBLIC half only
CREATE TABLE wvc_quorum_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID NOT NULL REFERENCES wvc_apps(id),
  public_key    TEXT NOT NULL,
  algorithm     TEXT NOT NULL DEFAULT 'P256',
  generation    INT NOT NULL DEFAULT 1,   -- incremented on each rotation ceremony
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App proofs: every proof ever issued
CREATE TABLE wvc_app_proofs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id         UUID NOT NULL REFERENCES wvc_deployments(id),
  ephemeral_pubkey      TEXT NOT NULL,
  payload_hash          TEXT NOT NULL,
  payload_type          TEXT NOT NULL, -- 'signature' | 'parse_summary' | 'policy_decision' | 'oracle_result'
  signature             TEXT NOT NULL,
  attestation_doc       BYTEA NOT NULL,
  proof_format_version  TEXT NOT NULL DEFAULT 'v1',
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wvc_app_proofs_deployment ON wvc_app_proofs(deployment_id);
CREATE INDEX idx_wvc_app_proofs_issued_at ON wvc_app_proofs(issued_at);

-- Boot proofs
CREATE TABLE wvc_boot_proofs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id     UUID NOT NULL REFERENCES wvc_deployments(id),
  manifest_id       UUID NOT NULL REFERENCES wvc_manifests(id),
  attestation_doc   BYTEA NOT NULL,
  booted_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quorum key rotation/recovery ceremony log (new in v4 — compliance-relevant audit trail)
CREATE TABLE wvc_key_ceremonies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES wvc_apps(id),
  ceremony_type     TEXT NOT NULL CHECK (ceremony_type IN ('bootstrap','rotation','recovery')),
  initiated_by      UUID REFERENCES wvc_operators(id),
  participating_operators UUID[] NOT NULL,
  new_quorum_key_id UUID REFERENCES wvc_quorum_keys(id),
  status            TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);
```

### 8.1 Entity relationship summary

```
organizations 1───* wvc_apps 1───* wvc_deployments *───1 wvc_manifests 1───* wvc_manifest_approvals *───1 wvc_operators
                    │                    │
                    │                    ├───* wvc_app_proofs
                    │                    └───* wvc_boot_proofs
                    ├───1 wvc_quorum_keys
                    └───* wvc_key_ceremonies
```

---

## 9. API specification

All endpoints under `/wvc/*` in WranKey's existing Fastify backend, using the existing session JWT / API-key auth and scope system (extend the existing 22 scope mappings with `wvc:*` scopes — `wvc:apps:read`, `wvc:apps:write`, `wvc:manifests:approve`, `wvc:deployments:invoke`, etc.).

### 9.1 Standard conventions
- All list endpoints paginated via `?cursor=` / `?limit=` (matching existing WranKey API conventions).
- All mutating endpoints emit an audit log row (see §8, `wvc.*` action types).
- Error responses use WranKey's existing error envelope: `{error: {code, message, details}}`.
- Rate limiting: reuse existing 1000 req/min platform limit; `invoke` endpoints additionally rate-limited per-deployment to protect enclave replica capacity.

### 9.2 Endpoints

**`POST /wvc/apps`**
```json
// Request
{ "name": "wallet-signer", "description": "Production wallet signing enclave", "required_approvals": 2 }
// Response 201
{ "id": "uuid", "name": "wallet-signer", "quorum_key_id": null, "live_deployment_id": null, "created_at": "..." }
```

**`GET /wvc/apps/:appId`** — full app detail including current live deployment, quorum key generation number, recent ceremonies.

**`POST /wvc/apps/:appId/deployments`**
```json
{
  "image_url": "ghcr.io/wrankey/signer:v3@sha256:9f8e...",
  "executable_path": "/app/signer",
  "executable_args": ["--host", "0.0.0.0", "--port", "3000"],
  "executable_digest": "cbe01169...",
  "expected_pcr0": "...", "expected_pcr1": "...", "expected_pcr2": "...",
  "ingress_port": 3000, "health_port": 3000,
  "cpu_count": 2, "memory_mib": 1024, "replica_count": 3,
  "allowed_upgrade_from": ["previous-deployment-uuid"]
}
// Response 201
{ "deployment_id": "uuid", "manifest_id": "uuid", "manifest_hash": "sha256:...", "status": "pending_manifest" }
```

**`GET /wvc/manifests/:manifestId`** — canonical manifest JSON + approval progress, for operator review.

**`POST /wvc/manifests/:manifestId/approve`**
```json
{ "operator_id": "uuid", "signature": "hex P256 signature over manifest_hash" }
// Response 200
{ "approvals_count": 1, "required_approvals": 2, "status": "pending_manifest" }
```

**`POST /wvc/deployments/:deploymentId/provision`** — idempotent; triggers orchestrator boot.

**`GET /wvc/deployments/:deploymentId`**
```json
{ "status": "live", "healthy_replicas": 3, "total_replicas": 3, "is_live": true,
  "boot_proofs": [{"id":"uuid","booted_at":"..."}] }
```

**`POST /wvc/deployments/:deploymentId/set-live`** — explicit traffic cutover, distinct from provisioning.

**`POST /wvc/deployments/:deploymentId/delete`** / **`.../restore`** — soft-delete lifecycle (§11).

**`POST /wvc/deployments/:deploymentId/invoke`**
```json
// Request (shape depends on payload_type — signing example)
{ "payload_type": "signature", "unsigned_tx": "0x02f8..." }
// Response 200
{ "result": { "signed_tx": "0x02f8...ff" },
  "app_proof": { "id": "uuid", "ephemeral_pubkey": "...", "payload_hash": "sha256:...", "signature": "...", "attestation_doc": "base64..." } }
```

**`GET /wvc/app-proofs/:proofId`** — fetch a stored proof bundle for later/offline verification.

**`POST /wvc/apps/:appId/quorum-key/ceremonies`** — initiate a bootstrap/rotation/recovery ceremony (§18.4, §29.3).

**`GET /wvc/apps/:appId/quorum-key/ceremonies/:ceremonyId`** — ceremony status, participating operators, completion state.

**Webhooks (new in v4):** WranKey's existing webhook system (19 event types) gets 6 new event types: `wvc.deployment.live`, `wvc.deployment.unhealthy`, `wvc.manifest.approved`, `wvc.manifest.approval_needed`, `wvc.key_ceremony.started`, `wvc.key_ceremony.completed` — so ops teams get real-time alerts through infrastructure that already exists, rather than a parallel notification system.

---

## 10. Build & packaging pipeline

### 10.1 Why reproducibility is load-bearing

Every claim in this system ("PCR2 = X corresponds to commit abc123") is worthless if two builds of the same source diverge. Reproducibility is the bridge between "source code a customer can read" and "the hash inside a live attestation document."

### 10.2 Concrete recipe

1. **Pin everything** — base image by digest not tag; `Cargo.lock` committed and locked.
2. **Strip nondeterminism** — `RUSTFLAGS="--remap-path-prefix=$(pwd)=."`, set `SOURCE_DATE_EPOCH`.
3. **Static linking** — target `x86_64-unknown-linux-musl`.
4. **Multi-stage Dockerfile**, final stage `FROM scratch` — nothing extraneous to hash.
5. **Build via GitHub Actions**, `docker buildx build --provenance=true --sbom=true`; publish image digest, EIF, and PCR values as CI artifacts tied to the git commit SHA.
6. **Verify reproducibility in CI itself** — build twice on separate runners, diff resulting digests, fail the pipeline on mismatch. This is the single most important test in the whole system.

### 10.3 Supply-chain security target: SLSA framework

Treat SLSA levels as an explicit maturity target, not just an aspiration:
- **SLSA Level 1** (basic provenance, scripted build) — achievable in Phase 1.
- **SLSA Level 2** (hosted build service, signed provenance) — GitHub Actions + `--provenance=true` gets you most of the way; achievable by end of Phase 1.
- **SLSA Level 3** (hardened build platform, non-falsifiable provenance, isolated build environment) — worth targeting before Phase 3 touches real customer funds; this is the level auditors increasingly expect for security-critical software supply chains.

### 10.4 SBOM generation and retention

Every build produces an SBOM (`--sbom=true` in the buildx command, or `syft`/`cyclonedx` tooling) listing every dependency and its version. Retain SBOMs indefinitely, tied to the git commit and resulting PCR values — this is both a security practice (rapid "are we affected" answers when a dependency CVE drops) and a compliance artifact (§32).

### 10.5 Example Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
FROM rust:1.79-slim@sha256:REPLACE_WITH_PINNED_DIGEST AS builder
WORKDIR /build
COPY Cargo.lock Cargo.toml ./
COPY src ./src
RUN rustup target add x86_64-unknown-linux-musl
ENV RUSTFLAGS="--remap-path-prefix=/build=."
RUN cargo build --release --target x86_64-unknown-linux-musl --locked

FROM scratch AS final
COPY --from=builder /build/target/x86_64-unknown-linux-musl/release/wvc-app /app/wvc-app
ENTRYPOINT ["/app/wvc-app"]
```

### 10.6 CI workflow

```yaml
name: build-and-attest
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image (run 1)
        run: docker buildx build --provenance=true --sbom=true -t app:run1 .
      - name: Build image (run 2, clean cache)
        run: docker buildx build --no-cache --provenance=true -t app:run2 .
      - name: Diff digests — fail if not reproducible
        run: |
          D1=$(docker inspect --format='{{.Id}}' app:run1)
          D2=$(docker inspect --format='{{.Id}}' app:run2)
          test "$D1" = "$D2" || (echo "NOT REPRODUCIBLE: $D1 != $D2" && exit 1)
      - name: Push image
        run: docker push ghcr.io/wrankey/signer:${{ github.sha }}
      - name: Build EIF and record PCRs
        run: |
          nitro-cli build-enclave --docker-uri ghcr.io/wrankey/signer:${{ github.sha }} --output-file app.eif > pcrs.json
          cat pcrs.json
      - name: Publish SBOM + PCR artifacts tied to commit SHA
        run: |
          mkdir -p artifacts
          cp pcrs.json artifacts/
          syft ghcr.io/wrankey/signer:${{ github.sha }} -o cyclonedx-json > artifacts/sbom.json
```

---

## 11. Deployment lifecycle — full state machine

```
pending_manifest ──(required approvals reached)──► approved
approved ──(POST /provision)──► provisioning
provisioning ──(all replicas healthy)──► inactive
inactive ──(POST /set-live)──► live
live ──(another deployment set live instead)──► inactive
inactive|live ──(POST /delete)──► marked_for_deletion
marked_for_deletion ──(POST /restore, before cleanup completes)──► inactive
marked_for_deletion ──(cleanup job completes)──► deleted
```

Rules: only one `live` deployment per app; `set-live` is a distinct, explicit action from provisioning (prevents accidental cutover the instant a new deployment finishes booting); `delete` always has a reversible `marked_for_deletion` window.

---

## 12. Manifests — structure, canonicalization, hashing

### 12.1 Canonicalization

Operators sign a *hash* of the manifest, not the manifest itself. Use a canonical serialization (JSON Canonicalization Scheme, RFC 8785) so `hash(canonicalize(manifest))` is deterministic regardless of how the JSON was constructed or key-ordered.

### 12.2 Full example manifest

```json
{
  "version": "1",
  "app_id": "b3f1...-uuid",
  "image_url": "ghcr.io/wrankey/signer:v3@sha256:9f8e7d6c...",
  "executable_path": "/app/wvc-app",
  "executable_args": ["--host", "0.0.0.0", "--port", "3000"],
  "executable_digest": "sha256:cbe01169...",
  "expected_pcrs": { "pcr0": "a1b2c3...", "pcr1": "d4e5f6...", "pcr2": "78901a..." },
  "ingress_port": 3000,
  "health_port": 3000,
  "resources": { "cpu_count": 2, "memory_mib": 1024 },
  "replica_count": 3,
  "required_approvals": 2,
  "approvers": ["operator-uuid-1", "operator-uuid-2", "operator-uuid-3"],
  "allowed_upgrade_from": ["previous-deployment-uuid"],
  "created_at": "2026-07-05T12:00:00Z"
}
```

### 12.3 The chicken-and-egg ordering problem

`wvc_deployments.manifest_id` is `NOT NULL`, but `wvc_manifests.deployment_id` is nullable — the manifest must be created first (to compute `manifest_hash` and start collecting approvals), then the deployment row created, then `wvc_manifests.deployment_id` backfilled. Handle this in a single DB transaction inside the `POST /wvc/apps/:appId/deployments` handler.

---

## 13. Operators & the approval protocol

### 13.1 Key generation

Operators generate P256 keypairs **locally** via `wvc operator init`, ideally on a hardware security key (YubiKey or similar supporting P256). Private keys never touch a WranKey server — only public keys are stored.

### 13.2 The approval action

1. `wvc manifest show <manifest_id>` — CLI fetches the canonical manifest, displays it for genuine human review (image, digest, PCRs, ports). **This is a real review step** — the operator should verify the digest matches the release they believe they're approving.
2. `wvc manifest approve <manifest_id>` — CLI recomputes `manifest_hash` locally (never trusts a server-supplied value), signs it, submits `{operator_id, signature}`.
3. Server independently verifies the signature against the stored public key and its own independently-recomputed hash before recording the approval.
4. Once `approvals_count >= required_approvals`, the deployment auto-transitions to `approved`.

### 13.3 Why this defeats a single compromised engineer

Even with full control of WranKey's API server and database, an attacker cannot forge operator signatures (keys never touch the server) and cannot get a malicious manifest approved without physically compromising `required_approvals` separate operators' keys.

---

## 14. Enclave boot sequence

1. Nitro Hypervisor allocates isolated CPU/memory, boots the minimal kernel inside the EIF.
2. The harness (PID 1 inside the enclave) starts.
3. Harness opens vsock, requests the manifest from the Host Agent.
4. Harness receives the manifest, recomputes `manifest_hash`, verifies `required_approvals` valid operator signatures exist over that hash. **Failure → halt, never exec.**
5. Harness requests the container image be pulled/extracted (can happen outside the enclave — the image itself holds no secrets; only the harness needs to verify the extracted binary's digest before trusting it).
6. Harness computes SHA-256 of the extracted binary, compares to `manifest.executable_digest`. **Mismatch → halt, never exec.**
7. Harness calls `/dev/nsm` to generate a fresh **Ephemeral Key** entirely inside the enclave.
8. Harness performs the **key-forwarding protocol** (§18) to obtain the **Quorum Key**, if one already exists for this app.
9. Harness requests a **Boot Proof** (attestation with `user_data` = hash of `{manifest_hash, ephemeral_pubkey}`), stores it via the control plane.
10. Harness `exec`s the actual application binary — after step 6's digest check has already validated exactly this binary.
11. App binary listens on `ingress_port`/`health_port` over vsock, served by the Host Agent.

---

## 15. The attestation document — full field breakdown

Once CBOR-decoded from its COSE_Sign1 wrapper, a Nitro attestation document contains:

- `module_id` — identifies the specific enclave instance.
- `digest` — hash algorithm used for PCRs (typically SHA384).
- `timestamp` — milliseconds since epoch when generated — critical for freshness checks (§16, step 5).
- `pcrs` — map of PCR index → hash value.
- `certificate` — the enclave's own attestation certificate, signed by AWS's Nitro CA for this specific instance.
- `cabundle` — intermediate certificate chain up to AWS's published Nitro root.
- `public_key` — optional field binding your Ephemeral Key's public key directly into the attestation.
- `user_data` — optional arbitrary bytes (used to bind manifest hashes into Boot Proofs).
- `nonce` — optional, for challenge-response style one-off attestation requests.

---

## 16. Attestation verification algorithm

This is the one piece of code that must exist standalone, independent of WranKey's infrastructure, because it is the actual trust anchor of the whole system.

```typescript
import { decodeCoseSign1, verifyCertChain, parseCbor } from "./crypto-primitives";
import { AWS_NITRO_ROOT_CERT } from "./pinned-root-cert";

interface VerificationResult {
  valid: boolean;
  reason?: string;
  pcrs?: Record<string, string>;
  enclavePublicKey?: string;
  signedAt?: number;
}

function verifyAppProof(proofBundle: {
  ephemeralPubkey: string;
  payloadHash: string;
  signature: string;
  attestationDoc: Uint8Array;
}, maxAgeMs = 5 * 60 * 1000): VerificationResult {

  const cose = decodeCoseSign1(proofBundle.attestationDoc);
  const doc = parseCbor(cose.payload);

  const chainValid = verifyCertChain(doc.certificate, doc.cabundle, AWS_NITRO_ROOT_CERT);
  if (!chainValid) return { valid: false, reason: "certificate chain invalid" };

  const sigValid = cose.verifySignature(doc.certificate.publicKey);
  if (!sigValid) return { valid: false, reason: "attestation signature invalid" };

  // PCR comparison against caller-supplied expected values happens at the call site —
  // this library never hardcodes "trusted" PCRs; the verifier decides what code they trust.

  const age = Date.now() - doc.timestamp;
  if (age > maxAgeMs) return { valid: false, reason: "attestation too old", pcrs: doc.pcrs };

  if (doc.public_key !== proofBundle.ephemeralPubkey) {
    return { valid: false, reason: "ephemeral pubkey does not match attested key" };
  }

  const payloadSigValid = verifyEcdsaSignature(
    proofBundle.ephemeralPubkey, proofBundle.payloadHash, proofBundle.signature
  );
  if (!payloadSigValid) return { valid: false, reason: "payload signature invalid" };

  return { valid: true, pcrs: doc.pcrs, enclavePublicKey: doc.public_key, signedAt: doc.timestamp };
}
```

Note: the library deliberately never hardcodes "expected" PCR values — those are supplied by whoever calls the function, because *they* decide what code they trust. This is what makes the library genuinely reusable by third parties trusting a different release than WranKey's own dashboard checks against.

---

## 17. Key model: Ephemeral Keys and Quorum Keys

### 17.1 Ephemeral Key lifecycle
Generated fresh every boot via NSM `GetRandom`; used to sign App Proofs and as the forwarding target for the Quorum Key; destroyed the instant the enclave stops. A new boot means a new identity — old App Proofs remain independently verifiable (their attestation captured the old key), but a new boot can't retroactively extend the old one.

### 17.2 Quorum Key lifecycle
Generated once, at an app's very first boot (or via a deliberate rotation ceremony); used to encrypt/decrypt long-lived state (most importantly, wallet seed material); persisted only as ciphertext, only ever in the *next* enclave's memory after a successful forwarding handshake — never written to disk in plaintext, anywhere, ever. Rotated only via an explicit, `required_approvals`-gated ceremony (§18.4, §29.3) — never automatically, since rotation implies re-encrypting all dependent state.

---

## 18. Key forwarding protocol

### 18.1 Steady-state (existing healthy enclave to forward from)

1. New enclave boots (manifest and digest already verified, Ephemeral Key generated).
2. New enclave requests a Boot-Proof-style attestation with `public_key` = its new Ephemeral public key.
3. New enclave sends `{ephemeral_pubkey, attestation_doc}` to `POST /wvc/apps/:appId/quorum-key/request`.
4. Control plane (cannot decrypt anything) forwards this to a currently-healthy existing replica.
5. **The existing enclave independently runs the full verification algorithm (§16)** against the new enclave's attestation — cert chain, PCR values (must match this app's expected PCRs — a modified binary produces different PCRs and fails here), freshness.
6. If valid, the existing enclave encrypts its in-memory Quorum private key to the new enclave's Ephemeral public key (ECIES — a standard, audited construction; do not invent your own), sends the ciphertext back through the control plane.
7. Control plane relays the ciphertext (still can't decrypt it) to the new enclave.
8. New enclave decrypts using its own Ephemeral private key (never left the enclave), obtaining the plaintext Quorum private key in its own memory only, for this boot's lifetime.
9. New enclave is now fully operational.

### 18.2 Why the control plane genuinely cannot cheat

At every step the control plane touches, it's either a public key + attestation document (meant to be public) or ciphertext encrypted to a key it doesn't hold. There is no point where compromising the control plane alone yields the Quorum Key.

### 18.3 Total-loss failure mode

If every running replica of an app dies simultaneously, there's no "existing healthy enclave" to forward from in step 4. This is why the Shamir backup ceremony (§18.4) is not optional — it's the only recovery path.

### 18.4 Bootstrap and backup ceremony

1. At an app's first-ever boot, the enclave generates the Quorum Key via NSM `GetRandom`.
2. The harness splits the private key using **Shamir's Secret Sharing** (e.g., 3-of-5, matching operator quorum design).
3. Each share is encrypted to one operator's public key and relayed through the control plane (which cannot decrypt any individual share, and colluding to gather all encrypted shares still doesn't yield the operator private keys needed to open them).
4. Operators store their encrypted share (hardware token, secured password manager, or a physically secured printed copy — match whatever rigor your root-quorum key management already uses; document the choice explicitly).
5. **Recovery ceremony** (used for total-loss recovery): a fresh, freshly-attested enclave requests recovery; a threshold of operators each decrypt and submit their share via the CLI, after verifying the requesting enclave's attestation themselves (§16); the enclave reconstructs the Quorum Key from the threshold shares.
6. Every ceremony (bootstrap, rotation, recovery) is logged in `wvc_key_ceremonies` (§8) for audit purposes.

---

## 19. App Proofs and Boot Proofs

### 19.1 App Proof bundle
```json
{
  "proof_format_version": "v1",
  "deployment_id": "uuid",
  "ephemeral_pubkey": "04a1b2c3...",
  "payload_hash": "sha256:9f8e7d...",
  "payload_type": "signature",
  "signature": "hex ECDSA signature over payload_hash",
  "attestation_doc": "base64 COSE_Sign1 bytes",
  "issued_at": "2026-07-05T12:34:56.789Z"
}
```

### 19.2 Boot Proof bundle
```json
{
  "deployment_id": "uuid",
  "manifest_id": "uuid",
  "manifest_hash": "sha256:...",
  "attestation_doc": "base64 COSE_Sign1 bytes",
  "booted_at": "2026-07-05T12:00:00.000Z"
}
```

A Boot Proof answers "what code, with what approvals, is running." An App Proof answers "this specific action was taken by that running code." A rigorous verifier checks both, matching `ephemeral_pubkey`/PCRs across the pair.

---

## 20. Networking architecture

### 20.1 Why this needs its own design
A Nitro Enclave has no IP networking at all — every byte in or out is manually relayed over vsock by code you write. This is the piece most likely to be underestimated in scoping.

### 20.2 Host Agent responsibilities
1. **Ingress proxy** — TLS terminates on the parent instance (not inside the enclave — see 20.3), plaintext HTTP forwarded over vsock.
2. **Manifest delivery** — serves manifest JSON over a dedicated vsock port at boot.
3. **Key-forwarding relay** — forwards opaque, already-encrypted payloads between control plane and enclave.
4. **Egress lockdown** — security-group/iptables rules ensure enclave vsock traffic can *only* reach the Host Agent's specific ports, never anything else.

### 20.3 Why TLS terminates outside the enclave
Deliberate: the enclave's job is protecting keys and computation, not being a general-purpose secure web server. Keeping TLS outside minimizes the enclave's code surface (easier to audit, smaller PCR-relevant footprint, fewer dependencies threatening reproducibility) without weakening the actual guarantee, since the payload itself is separately signed inside the enclave regardless of transport.

### 20.4 The no-egress rule and how to actually use external data anyway
If a workload genuinely needs external data (a price feed, a contract ABI lookup), the correct pattern is: **fetch and sign that data outside the enclave**, then pass it in as a signed input the enclave independently verifies the provenance of. Never let the enclave itself reach out — that's the exact hole that would defeat the "even a compromised control plane can't exfiltrate secrets" guarantee.

---

## 21. Threat model — exhaustive

| # | Threat | Protected? | Mechanism |
|---|---|---|---|
| 1 | Control plane / API server fully compromised | ✅ | No key material or signing capability there |
| 2 | Postgres stolen/leaked | ✅ | Only metadata, hashes, ciphertext |
| 3 | Malicious engineer deploys a backdoored binary | ✅ | Multi-operator manifest approval + digest check at boot |
| 4 | Single compromised operator laptop | ✅ if `required_approvals` > 1 | Threshold approval |
| 5 | AWS insider access to host hardware | ✅ (per AWS's own Nitro claims) | Hardware isolation is AWS's claim, not WVC's addition |
| 6 | Side-channel attacks (timing, cache) against physical host | ⚠️ Partial | Shared TEE limitation; AWS's responsibility, be explicit with auditors |
| 7 | Non-reproducible build silently diverges from published source | ❌ unless CI check enforced | §10.2 step 6 is mandatory, not optional |
| 8 | Enclave exfiltrating data via egress | ✅ if enforced | Security-group-level lockdown, must be tested not assumed |
| 9 | Replay of an old attestation | ✅ | Timestamp freshness check |
| 10 | All replicas crash, Quorum Key "lost" | ✅ recoverable | Shamir backup ceremony |
| 11 | Manifest with plausible-but-wrong digest tricks operators | ⚠️ Partial, human-process-dependent | Operators must independently recompute the digest, not trust the dashboard's display of it |
| 12 | Rollback attack (redeploy old, vulnerable-but-digest-valid version) | ⚠️ Not automatic | Add a monotonic version counter the harness refuses to boot below, if this matters for your threat model |
| 13 | AWS Nitro root certificate itself compromised | ❌ out of scope by design | Equivalent to "what if the PKI root is broken" — same for Turnkey, same for every Nitro-based system |
| 14 | Insider threat during a key-forwarding or recovery ceremony (operator colludes with attacker) | ⚠️ Partial | Threshold requirement raises the bar to `required_approvals` colluding operators, not eliminated entirely — document this explicitly as residual risk |
| 15 | Denial-of-service against enclave replicas (not a confidentiality break, but an availability one) | ⚠️ Partial | Autoscaling/replica-count mitigates but doesn't eliminate; standard DDoS protections at the ingress layer still apply |

Rows 6, 7 (if skipped), 11, 12, 14, 15 are the ones to be scrupulously honest about with customers, auditors, and regulators — do not let language round these up to "fully protected."

---

## 22. CLI specification

```
wvc login
wvc operator init
wvc app create --name <name>
wvc app list
wvc deploy create --app <app_id> --image <url> --digest <sha256> --pcrs <file.json> ...
wvc manifest show <manifest_id>
wvc manifest approve <manifest_id>
wvc deploy provision <deployment_id>
wvc deploy status <deployment_id>
wvc deploy set-live <deployment_id>
wvc deploy delete <deployment_id>
wvc deploy restore <deployment_id>
wvc proof verify <proof_file.json> --expected-pcrs <file.json>
wvc quorum-key backup-share --operator <id>
wvc quorum-key recover --deployment <new_deployment_id>
wvc quorum-key rotate --app <app_id>              # new in v4 — initiates a rotation ceremony
wvc ceremony status <ceremony_id>                  # new in v4
```

---

## 23. Dashboard specification

New pages, extending the existing 29-page WranKey dashboard:
- `/verifiable-compute` — Apps list, replacing the current placeholder honestly.
- `/verifiable-compute/apps/:id` — live deployment, deployment history, quorum key generation/status.
- `/verifiable-compute/apps/:id/deployments/:id` — manifest, approval progress, replica health, boot proofs, recent app proofs.
- `/verifiable-compute/apps/:id/deployments/new` — creation form.
- `/verifiable-compute/operators` — roster, public keys, add/revoke.
- `/verifiable-compute/apps/:id/ceremonies` — new in v4: history and live status of bootstrap/rotation/recovery ceremonies, for audit visibility.
- Approval itself is never done purely via browser-held keys — routed through CLI/hardware key flow so operator private keys never touch a browser session.

---

## 24. Verification libraries

Ship as standalone, dependency-minimal packages with no WranKey API dependency:
- `@wrankey/wvc-verify` (TypeScript)
- `wvc-verify` (Rust crate)
- `github.com/wrankey/wvc-verify-go` (Go)

Each ships the pinned AWS Nitro root certificate, COSE/CBOR parsing, and the §16 algorithm. Publish these **before** publicly claiming any "verifiable" feature.

---

## 25. SDK & integration guide — wiring WVC into existing WranKey modules

This section didn't exist in earlier drafts. It answers the practical question: once WVC exists, how does the *rest* of WranKey's codebase actually call it?

### 25.1 Wallets module integration
- New wallet creation flow: instead of `POST /wallets` generating a seed in the backend process and AES-encrypting it, the handler instead calls `POST /wvc/deployments/:wallet-signer-id/invoke` with `payload_type: "generate_seed"`, receiving back only a public derivation-ready identifier and an App Proof — never the seed itself.
- Existing `WranKeyClient` SDK method `createWallet()` is unchanged at the call-site API level — this is an internal implementation swap, not a breaking SDK change, as long as response shape is preserved (add an optional `app_proof` field to the response for callers who want to verify).

### 25.2 Transactions module integration
- `signAndBroadcast()` internally routes the "sign" step through `POST /wvc/deployments/:wallet-signer-id/invoke` instead of calling the local ethers.js signer directly.
- The background transaction monitor and webhook/WebSocket notification paths are unaffected — they operate on the signed transaction, agnostic to whether it was signed locally or via WVC.

### 25.3 Policies module integration
- Policy evaluation can be dual-path during migration: evaluate in the existing backend JSON rule engine *and* (optionally, feature-flagged) inside the `policy-evaluator` WVC app, comparing results in non-blocking shadow mode before cutting over — this de-risks Phase 3's policy-evaluation workload (§7.3) considerably.

### 25.4 Contract Interfaces module integration
- ABI data needed by the `tx-parser` workload (§7.2) is fetched by the backend (outside the enclave, per the no-egress rule) and passed in as a signed input alongside the raw transaction — the enclave never queries Postgres or any external service directly.

### 25.5 Backward compatibility guarantee
Every WVC-routed operation should be a drop-in replacement at the existing SDK/API surface level. External developers using `WranKeyClient` should not need to change their integration code at all — the `app_proof` field is additive and optional to consume.

---

## 26. Migration plan — moving live wallets into WVC without downtime

### 26.1 Why this needs its own plan
By the time WVC's Phase 3 is ready, WranKey will likely have real, live wallets with real balances using the old AES-256-GCM model. Moving them isn't a data migration — it's a **key custody transfer**, which has to be done without ever exposing the seed in the process, or the entire point of the exercise is defeated.

### 26.2 The re-derivation approach (recommended)
Rather than "decrypt the old seed and re-encrypt it under the new Quorum Key" (which necessarily involves a moment of plaintext exposure outside the enclave — exactly what you're trying to eliminate), prefer:
1. For each wallet being migrated, decrypt the existing seed **inside a one-time, purpose-built migration enclave** (itself a WVC app, following the same manifest/approval process as any other deployment) — not in a normal backend process.
2. The migration enclave re-derives all existing accounts, re-encrypts the seed under the new Quorum Key, and writes the new ciphertext out — all without the plaintext ever leaving enclave memory.
3. The old AES-256-GCM ciphertext and its backend-held passphrase-derivation key are deleted only after the migration enclave confirms successful re-encryption (verified via its own App Proof).
4. This makes even the *migration itself* independently verifiable — you can produce an App Proof showing "wallet X's custody was transferred from the old model to WVC, and the plaintext seed was never exposed outside an attested enclave during the process."

### 26.3 Rollout sequencing
1. Migrate internal/test wallets first (Phase 2/3 boundary).
2. Migrate new wallet creation to WVC-first (§25.1) before migrating existing balances — this limits the "live migration" population to a shrinking, known set rather than a growing one.
3. Migrate existing wallets in batches, smallest-balance-first, with the migration enclave's App Proofs retained as an audit trail per wallet.
4. Publish a customer-facing notice when their specific wallet's custody model changes, along with a link to independently verify the migration's App Proof if they want to.

### 26.4 Rollback plan
Keep the old AES-256-GCM ciphertext (not the derivation key) archived, encrypted, for a defined retention window after migration, in case a migration enclave bug is discovered post-migration — but treat "roll back to the old custodial model" as a break-glass, root-quorum-approved action only, never a routine one.

---

## 27. Testing strategy

- **Unit tests**: §16 algorithm against real captured attestation documents (valid and deliberately corrupted) — test every failure branch individually.
- **Reproducibility tests**: CI double-build-diff (§10.6) on every commit.
- **Integration tests**: full deploy → approve → provision → invoke → verify loop against real (not mocked) Nitro Enclaves in a dedicated test AWS account.
- **Adversarial tests** (mandatory, not optional):
  - Digest mismatch at boot → must halt.
  - Insufficient approvals → must not transition to `approved`.
  - Key-forwarding request from an enclave with mismatched PCRs → must be rejected.
  - Replay of a stale attestation → must fail verification.
  - Rollback attempt to an older, digest-valid-but-outdated version → verify your chosen mitigation (threat #12) actually triggers.
- **Chaos tests**: kill all replicas of a test deployment simultaneously; confirm the recovery ceremony actually restores service, rehearsed as a drill before it's ever needed for real.
- **Migration-specific tests** (new in v4): run the full re-derivation migration flow (§26.2) against synthetic test wallets, confirming the migration enclave's App Proof accurately reflects what happened and that no plaintext seed appears in any log, memory dump, or intermediate artifact outside the enclave.

---

## 28. Observability without enclave logs

Nitro Enclaves have no persistent storage and, by design, no straightforward in-enclave logging story. Observability instead comes from:
- **Structured audit events** for every lifecycle action (approve, deploy, set-live, delete, restore, key-forwarding request, ceremony start/complete) — your primary operational visibility.
- **Health checks** at the Host Agent level — replica liveness, not internal application state.
- **App Proof issuance rate/latency**, tracked at the control plane — anomalies here (latency spikes, verification failures) are the leading indicator of a problem.
- **Webhook alerts** (§9.2) for `wvc.deployment.unhealthy` and ceremony events, routed through WranKey's existing notification infrastructure.
- Deliberately, no fine-grained internal application logs from inside production enclaves — debug-level visibility requires a separate, explicitly non-production, non-attested build, never in the path of real key material.

---

## 29. Operational runbooks

### 29.1 Single enclave replica crash
Orchestrator detects failed health check → terminates unhealthy replica → boots a new one → new replica runs the full boot sequence (§14), including key-forwarding from a still-healthy sibling. No human intervention needed if `replica_count >= 2` and at least one sibling survives.

### 29.2 Rolling upgrade to a new version
1. Create a new deployment (new image/digest/PCRs) under the same app, with `allowed_upgrade_from` explicitly listing the currently-live deployment's ID.
2. Collect manifest approvals.
3. Provision — new replicas boot, forward the Quorum Key from the currently-live deployment's replicas (cross-deployment forwarding, gated by the `allowed_upgrade_from` list and PCR checks against the *new* deployment's expected values).
4. Verify new deployment healthy (N/replica_count).
5. `set-live` to cut traffic over.
6. Leave old deployment `inactive` (not deleted) for a rollback window; delete after a defined soak period.

### 29.3 Quorum Key rotation ceremony
1. Operator initiates via `wvc quorum-key rotate --app <id>` → creates a `wvc_key_ceremonies` row, `ceremony_type = 'rotation'`.
2. Requires `required_approvals` operator sign-off (same threshold discipline as manifest approval) before proceeding.
3. A live enclave generates a brand-new Quorum Key, re-encrypts all dependent state (seeds, etc.) under it.
4. New Shamir shares distributed to operators (§18.4), old shares considered invalidated.
5. Ceremony marked `completed`; `wvc_quorum_keys.generation` incremented.

### 29.4 Disaster recovery — all replicas of an app down simultaneously
1. Declare an incident (see §30 for full IR process); this requires the Shamir recovery ceremony, not the steady-state forwarding path.
2. Boot a fresh enclave for the app.
3. Gather `required_approvals`-worth of operators.
4. Each operator runs `wvc quorum-key recover` — verifies the new enclave's fresh attestation before releasing their share.
5. New enclave reconstructs the Quorum Key from threshold shares, resumes normal operation.
6. **Rehearse this drill before you need it for real.**

### 29.5 Operator offboarding
Revoke the departing operator's `wvc_operators` row; if they held a Shamir backup share, that share must be treated as compromised — trigger a rotation ceremony (§29.3) rather than assuming a revoked operator's old share is harmless.

---

## 30. Incident response plan

This is distinct from routine runbooks (§29) — it's the formal process for classifying and responding to a security-relevant event, not just an operational hiccup.

### 30.1 Severity levels
- **SEV-1**: suspected or confirmed key material exposure, forged App Proof, or compromised Quorum Key. All hands, immediate root-quorum notification, customer disclosure obligations likely triggered.
- **SEV-2**: manifest approval bypassed or attempted bypass, unexplained PCR mismatch, reproducibility check failure discovered in production.
- **SEV-3**: single replica crash requiring manual intervention beyond the automated runbook, degraded but not compromised availability.

### 30.2 SEV-1 response checklist
1. Immediately set the affected app's live deployment to `inactive` (halt traffic) — this is a "shoot first" action, not something requiring a full investigation to justify.
2. Freeze all pending manifest approvals for the affected app.
3. Convene root quorum + security lead; determine if a Quorum Key rotation ceremony (§29.3) is required (assume yes unless proven otherwise).
4. Pull and preserve all `wvc_app_proofs`, `wvc_boot_proofs`, and audit log entries for the affected deployment — this is your forensic record and your compliance obligation simultaneously.
5. Determine customer disclosure obligations (this is where §4's regulatory context becomes operational — loop in legal immediately, not after the technical response).
6. Post-incident: full external security review before the app is ever set live again.

### 30.3 SEV-2 response checklist
1. Investigate whether the event is a genuine bypass or a false positive (e.g., a legitimate reproducibility drift caught by CI before reaching production is not an incident; the same drift discovered in production is).
2. If confirmed, treat as SEV-1 pending investigation — downgrade only once scope is clearly bounded.

### 30.4 Communication protocol
Designate a single incident commander per SEV-1/2 event; all customer/regulator communication flows through that person and legal/compliance, not ad hoc from whoever notices the issue first.

---

## 31. Cost model

Per-app monthly cost drivers (validate against real AWS pricing at build time):
- Parent EC2 instance-hours (Nitro-capable type; 3 replicas typically means 3 parent instances, or fewer larger instances if packing multiple enclaves — decide based on isolation requirements vs. cost).
- Data transfer through the Host Agent proxy.
- Marginal control-plane compute (reuses existing WranKey backend infra).
- External security audit engagement (Phase 3, one-time but significant — budget a real firm, not an internal review, before customer funds route through this).
- Ongoing SOC 2 / compliance audit incremental scope (§32) — WVC adds new controls an auditor will test, which adds auditor hours even if the underlying architecture reduces overall risk.

Mirror Turnkey's own structure once costs are known: fixed monthly platform fee + variable enclave-uptime pricing.

---

## 32. Compliance & audit checklist

Use this as a literal checklist when preparing for a SOC 2 Type II or similar audit of the WVC subsystem specifically:

- [ ] Documented, versioned threat model (§21) available to auditors.
- [ ] SBOMs retained for every production deployment, tied to git commit + PCR values (§10.4).
- [ ] Reproducible-build CI check (§10.2 step 6) passing on every release, with historical pass/fail record retained.
- [ ] Manifest approval audit trail (`wvc_manifest_approvals`) complete and queryable for any historical deployment.
- [ ] Key ceremony audit trail (`wvc_key_ceremonies`) complete for every bootstrap/rotation/recovery event.
- [ ] Incident response plan (§30) rehearsed at least once via tabletop exercise before go-live.
- [ ] Disaster recovery drill (§29.4) actually executed in a test environment, not just documented.
- [ ] External security audit (§10.3 SLSA target, §31 cost line item) completed before Phase 3 handles real customer funds.
- [ ] Legal/compliance sign-off on regulatory classification implications (§4.1) per jurisdiction of operation.
- [ ] Data residency review (§4.4) completed for chosen AWS region(s).
- [ ] Customer-facing documentation published explaining exactly what is and isn't cryptographically guaranteed (mirroring §21's honest "partial" rows — do not let marketing copy round these up).

---

## 33. Phased build plan

### Phase 0 (2–3 weeks, 1 engineer)
Hands-on understanding of §5; implement §16 (attestation verification) standalone; produce one real, externally-verifiable App Proof.

### Phase 1 (5–7 weeks, 2 engineers)
Implement §8 (schema), §9 (API), §10 (build pipeline through SLSA L2), §12–14 (manifests, operators, boot sequence), §18 (key forwarding, steady-state + bootstrap), §19 (proof formats), §22 (CLI), §24 (TypeScript verification library).

### Phase 2 (5–7 weeks, 2–3 engineers)
Implement §11 (full lifecycle incl. delete/restore), §20 (networking, egress lockdown), §28 (observability), first real non-signing workload (§7.2, tx parsing), §29.1–29.2 runbooks rehearsed, begin §25 SDK integration work in shadow mode (§25.3 dual-path policy evaluation).

### Phase 3 (7–9 weeks, 2–3 engineers + external audit)
Move seed generation/signing into WVC (§7.1); execute §26 migration plan for existing wallets; §21 threat model reviewed line-by-line by an external auditor; §29.3–29.4 ceremonies and disaster recovery drilled; §30 incident response plan tabletop-tested; §32 compliance checklist substantially complete.

### Phase 4 (ongoing)
§24 libraries in more languages; §23 dashboard self-serve parity; §31 pricing finalized; §7.4 oracle-style workloads explored based on actual customer demand; public "WranKey Verified" documentation published.

---

## 34. Team & resourcing

| Phase | Duration | Headcount | Key skill needed |
|---|---|---|---|
| 0 | 2–3 wks | 1 | Rust, low-level Linux/systems |
| 1 | 5–7 wks | 2 | + distributed systems, cryptographic protocol design |
| 2 | 5–7 wks | 2–3 | + SRE/networking (vsock, security groups, k8s/ECS) |
| 3 | 7–9 wks | 2–3 + auditor + legal/compliance input | + security review experience, audit + regulatory coordination |
| 4 | ongoing | scales | + DX/docs, multi-language SDK maintenance |

**Total to one real, audited, migrated signing workload: ~19–26 weeks of engineering**, plus legal/compliance review time in Phase 3 that should be scheduled in parallel, not sequentially, to avoid extending the critical path.

---

## 35. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Reproducibility never fully achieved | CI gate (§10.2 step 6) blocks merge on divergence — release blocker, not a warning |
| Key-forwarding protocol has a subtle flaw allowing leakage | External cryptographic review specifically of §18, before Phase 3 |
| Team underestimates vsock/networking complexity | Phase 0 explicitly includes this (§5.1–5.3) before higher-level work starts |
| Operators lose Shamir backup shares | Documented, rehearsed operator key hygiene procedures; consider mandatory hardware tokens |
| Scope creep toward "support every TVC use case" before one workload is solid | §5.6-adjacent scope discipline; revisit if this document is being ignored under deadline pressure |
| Migration (§26) exposes plaintext seed outside an enclave due to a rushed implementation | Migration enclave itself goes through the full manifest/approval process — no shortcuts, even though it's "just a one-time migration tool" |
| Regulatory classification assumption turns out wrong in a specific jurisdiction | Legal sign-off (§32) is a gating checklist item, not a formality, before claiming "non-custodial" publicly in that jurisdiction |

---

## 36. Frequently asked questions

**Q: Why not just use a cloud HSM (e.g., AWS CloudHSM or KMS) instead of building all this?**
A: HSMs are excellent for protecting keys, but they generally don't let you run arbitrary application logic (like policy evaluation or transaction parsing) *and* produce a portable, third-party-verifiable proof of exactly what code ran. Nitro Enclaves + attestation gives you both key protection and general-purpose verifiable compute — which is what makes it match Turnkey's actual product surface rather than just its key-storage layer.

**Q: Do we need to build our own reproducible Linux distribution like Turnkey's StageX?**
A: No, not at this scale. Pinned Docker base images plus build provenance get you most of the practical reproducibility guarantee at a fraction of the multi-year investment Turnkey made. Revisit only if an audit specifically flags a gap this doesn't cover.

**Q: What happens if AWS deprecates Nitro Enclaves or changes the attestation format?**
A: This is a real platform-dependency risk worth naming explicitly. Mitigate by keeping the verification library's parsing logic modular/versioned (the `proof_format_version` field throughout this design exists partly for this reason) and by not assuming Nitro's specific API surface is permanent in any place other than the harness itself.

**Q: Can customers run their own WVC apps, or is this purely internal to WranKey?**
A: Phase 1–3 as scoped here is entirely internal (protecting WranKey's own wallet infrastructure). Phase 4's "platform & external use cases" is the point where this could open up to customer-authored workloads, mirroring TVC's actual product — but that's a substantial additional trust/isolation design question (multi-tenant enclave scheduling, customer-vs-customer isolation) not covered in depth in this document, and shouldn't be promised publicly until it's actually been designed.

**Q: How is this different from just trusting WranKey's SOC 2 report?**
A: A SOC 2 report is auditor attestation on a point-in-time basis, based on sampling and interviews. An App Proof is a live, per-operation, mathematically checkable artifact anyone can verify at any time, for that specific operation, without waiting for or trusting an annual audit cycle. They're complementary, not substitutes — §32 treats WVC's own artifacts as *inputs* to a stronger SOC 2 posture, not a replacement for one.

**Q: What's the single biggest way this project fails?**
A: Skipping the reproducibility CI gate (§10.2 step 6) under time pressure, because everything upstream of it still "looks like it works" — a signing enclave will happily sign things and produce valid-looking attestation documents even if the build isn't actually reproducible. The failure is silent until someone tries to independently verify a PCR value against a specific commit and can't — which is exactly the moment you don't want to discover this.

---

## 37. Appendix A: code sketches

### A.1 Rust harness skeleton

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = fetch_manifest_over_vsock()?;
    let manifest_hash = sha256_canonical(&manifest);
    verify_manifest_approvals(&manifest_hash, manifest.required_approvals)?;

    let binary_path = extract_and_locate_binary(&manifest)?;
    let actual_digest = sha256_file(&binary_path)?;
    if actual_digest != manifest.executable_digest {
        panic!("digest mismatch — refusing to boot");
    }

    let ephemeral_keypair = generate_ephemeral_keypair_via_nsm()?;
    let quorum_key = if app_has_existing_quorum_key(&manifest.app_id)? {
        request_key_forwarding(&ephemeral_keypair, &manifest)?
    } else {
        bootstrap_new_quorum_key_with_shamir_backup(&manifest)?
    };

    let boot_proof = build_and_submit_boot_proof(&manifest_hash, &ephemeral_keypair)?;
    submit_boot_proof_to_control_plane(boot_proof)?;

    exec_app_binary(&binary_path, &manifest.executable_args, quorum_key, ephemeral_keypair)?;
    Ok(())
}
```

### A.2 TypeScript verification library public API

```typescript
export function verifyAppProof(
  proof: AppProofBundle,
  expectedPcrs: { pcr0: string; pcr1: string; pcr2: string },
  options?: { maxAgeMs?: number }
): VerificationResult;

export function verifyBootProof(
  proof: BootProofBundle,
  expectedPcrs: { pcr0: string; pcr1: string; pcr2: string },
  expectedManifestHash?: string
): VerificationResult;
```

### A.3 Migration enclave sketch (§26.2)

```rust
// Runs as its own WVC app, through the normal manifest/approval process —
// no shortcuts just because it's "only used once per wallet."
fn migrate_wallet(old_ciphertext: Vec<u8>, old_derivation_key: Vec<u8>, new_quorum_pubkey: PublicKey)
    -> Result<MigrationProof, MigrationError> {
    let plaintext_seed = aes_256_gcm_decrypt(&old_ciphertext, &old_derivation_key)?; // exists only here, in enclave memory
    let accounts = rederive_all_accounts(&plaintext_seed)?;
    let new_ciphertext = encrypt_to_quorum_key(&plaintext_seed, &new_quorum_pubkey)?;
    zeroize(&plaintext_seed); // explicit, immediate memory scrub
    Ok(MigrationProof { accounts, new_ciphertext, app_proof: sign_migration_event()? })
}
```

---

## 38. Appendix B: JSON schemas

See §12.2 (manifest), §19.1 (App Proof), §19.2 (Boot Proof), §9.2 (API request/response shapes) for full worked examples — treat those inline sections as canonical rather than duplicating them here, to avoid this document drifting out of sync with itself over future revisions.

---

## 39. Appendix C: references

- AWS Nitro Enclaves documentation and `nitro-cli` reference (official AWS docs).
- RFC 8152 — CBOR Object Signing and Encryption (COSE).
- RFC 8785 — JSON Canonicalization Scheme (JCS).
- SLSA framework (Linux Foundation) — supply-chain security maturity levels.
- Shamir, A. (1979). "How to Share a Secret" — the original construction underlying §18.4.
- ECIES — Elliptic Curve Integrated Encryption Scheme, as specified in SEC 1 / IEEE 1363a.
- Turnkey's own public documentation on TVC (Overview, Quickstart, Building Your First App, Managing Apps and Deployments) — the primary inspiration and comparison point for this entire design.

---

## 40. Next steps

1. Circulate this document to whoever staffs Phase 0 — confirm they can restate §5 (how Nitro actually works) and §16 (verification algorithm) in their own words before writing code.
2. Stand up the dedicated test AWS account referenced in §27 before Phase 0 starts.
3. Decide explicitly, in writing, the open design calls flagged inline: the bootstrap Quorum Key ceremony details (§18.4), cross-deployment key forwarding rules during upgrades (§29.2), and the exact rollback-attack mitigation approach if threat #12 (§21) matters for your risk appetite.
4. Loop in legal/compliance now, in parallel with Phase 0–1 engineering, not after Phase 3 — the regulatory classification question (§4.1) and jurisdiction-specific data residency review (§4.4) have long lead times and shouldn't sit on the critical path at the end.
5. Label the current `/verifiable-cloud` dashboard route honestly as "Coming Soon" while this is built — don't let the gap between the roadmap doc and reality persist silently.
