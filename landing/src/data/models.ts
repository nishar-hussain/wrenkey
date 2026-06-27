import type { SnowboardModel, RadarLabels } from "@/types";

export const MODELS: SnowboardModel[] = [
  {
    name: "AGENT\nWALLETS",
    values: [95, 90, 85, 95, 90],
    img: "/img/wrenchy-blue.png",
    color: "rgba(37, 99, 235, 0.85)",
    borderColor: "rgba(37, 99, 235, 0.16)",
    tagline: "Autonomous Cryptographic Execution",
    description: "Issue secure, isolated API keys and configurations to let autonomous AI agents sign transactions programmatically. Keep keys safe inside secure database hashes with full tag-based organization.",
    features: [
      "Fastify REST Agent Endpoints",
      "SHA-256 API Key hashing",
      "Granular wallet:sign scope permissions",
      "Instant agent.created/revoked webhooks"
    ],
    ctaUrl: "#agents"
  },
  {
    name: "EMBEDDED\nWALLETS",
    values: [90, 80, 100, 95, 80],
    img: "/img/wrenchy-purple.png",
    color: "rgba(168, 85, 247, 0.85)",
    borderColor: "rgba(168, 85, 247, 0.16)",
    tagline: "Developer-Friendly Embedded Key Infrastructure",
    description: "Programmatically generate and manage user wallets. Backed by multi-tenant sub-organizations and isolated enclave key operations to offer seamless web3 logins and custody flows.",
    features: [
      "Sub-organization tenant separation",
      "EVM key generation and retrieval",
      "Custom API key authorizations",
      "Fully isolated secure credentials"
    ],
    ctaUrl: "#wallets"
  },
  {
    name: "POLICY\nENGINE",
    values: [95, 85, 80, 75, 100],
    img: "/img/wrenchy-emerald.png",
    color: "rgba(16, 185, 129, 0.85)",
    borderColor: "rgba(16, 185, 129, 0.16)",
    tagline: "Real-Time Transaction Control & Compliance",
    description: "Enforce granular rules before any signing operation. Conditionally inspect gas, destination contracts, transfer amounts, roles, and time windows. Allow or deny automatically based on logic evaluation.",
    features: [
      "LESS_THAN / GREATER_THAN operators",
      "Time-based Window and Regex evaluations",
      "EFFECT_ALLOW and EFFECT_DENY options",
      "Zod-validated schema rules"
    ],
    ctaUrl: "#policies"
  },
  {
    name: "MULTI-SIG\nFLOWS",
    values: [100, 70, 75, 80, 95],
    img: "/img/wrenchy-orange.png",
    color: "rgba(249, 115, 22, 0.85)",
    borderColor: "rgba(249, 115, 22, 0.16)",
    tagline: "Consensus-Driven Security Pipelines",
    description: "Establish threshold requirements for high-risk operations. Automatically request multi-sig reviews if a transaction breaches a policy limit, requiring ANY or ALL designated user approvals.",
    features: [
      "Consensus configuration routing",
      "Multi-party pending approval logs",
      "Webhook approval notifications",
      "Role-based verification rules"
    ],
    ctaUrl: "#approvals"
  },
  {
    name: "TRANSACTION\nSAFETY",
    values: [100, 75, 90, 85, 90],
    img: "/img/wrenchy-cyan.png",
    color: "rgba(6, 182, 212, 0.85)",
    borderColor: "rgba(6, 182, 212, 0.16)",
    tagline: "Isolated Environments & Safe Deserialization",
    description: "Prevent malicious exploits with strict input validation, gas estimation policies, spending limits, and safe Regular Expression analysis to block ReDoS vectors at the gateway.",
    features: [
      "Strict gas limit limits",
      "ReDoS safe regex validation patterns",
      "Database-audited execution logs",
      "Deterministic signature outputs"
    ],
    ctaUrl: "#safety"
  }
];

export const LABELS: RadarLabels = [
  "SECURITY",
  "AUTOMATION",
  "SPEED",
  "INTEGRATION",
  "COMPLIANCE"
];

