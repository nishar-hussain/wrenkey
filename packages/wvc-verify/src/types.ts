/**
 * WVC Verification Library — Type Definitions
 *
 * These types model the AWS Nitro attestation document (RFC 8152 COSE_Sign1 + CBOR)
 * and the WVC App/Boot proof bundles that wrap them (WVC PRD §15, §16, §19).
 */

/** Expected Platform Configuration Register values — the caller decides which code to trust. */
export interface ExpectedPcrs {
  pcr0: string;
  pcr1: string;
  pcr2: string;
}

/** A WVC App Proof bundle (PRD §19.1). */
export interface AppProofBundle {
  proofFormatVersion: string;
  deploymentId: string;
  ephemeralPubkey: string;
  payloadHash: string;
  payloadType: "signature" | "parse_summary" | "policy_decision" | "oracle_result";
  signature: string;
  /** Base64-encoded COSE_Sign1 attestation document bytes. */
  attestationDoc: string;
  issuedAt: string;
}

/** A WVC Boot Proof bundle (PRD §19.2). */
export interface BootProofBundle {
  deploymentId: string;
  manifestId: string;
  manifestHash: string;
  /** Base64-encoded COSE_Sign1 attestation document bytes. */
  attestationDoc: string;
  bootedAt: string;
}

/** Result of a verification attempt (PRD §16). */
export interface VerificationResult {
  valid: boolean;
  reason?: string;
  pcrs?: Record<string, string>;
  enclavePublicKey?: string;
  signedAt?: number;
}

/** Decoded Nitro attestation document fields (PRD §15). */
export interface AttestationDocument {
  moduleId: string;
  digest: string;
  timestamp: number;
  pcrs: Map<number, string>;
  certificate: Uint8Array;
  cabundle: Uint8Array[];
  publicKey?: Uint8Array;
  userData?: Uint8Array;
  nonce?: Uint8Array;
}

/** Options for proof verification. */
export interface VerifyOptions {
  /** Maximum acceptable age of the attestation document, in milliseconds. Default: 5 minutes. */
  maxAgeMs?: number;
  /** Override the pinned AWS Nitro root cert (PEM). If omitted, the shipped root is used. */
  rootCertPem?: string;
}
