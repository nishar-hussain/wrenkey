/**
 * @wrankey/wvc-verify
 *
 * Standalone verification library for WranKey Verifiable Compute (WVC) proofs.
 * Independently verifies AWS Nitro attestation documents backing WVC App Proofs
 * and Boot Proofs, rooted in the public AWS Nitro PKI — with ZERO trust in
 * WranKey's own infrastructure.
 *
 * @example
 * ```ts
 * import { verifyAppProof } from "@wrankey/wvc-verify";
 *
 * const result = verifyAppProof(proofBundle, {
 *   pcr0: "9f8e...", pcr1: "d4e5...", pcr2: "7890...",
 * });
 * if (result.valid) {
 *   console.log("verified, signed at", new Date(result.signedAt!));
 * } else {
 *   console.error("verification failed:", result.reason);
 * }
 * ```
 *
 * PRD: §16, §19, §24.
 */

export {
  verifyAppProof,
  verifyBootProof,
  verifyLocalAppProof,
  verifyLocalBootProof,
  generateLocalAttestationKey,
  createLocalAttestation,
} from "./verify.js";
export { decodeCoseSign1, verifyCoseSignature, type CoseSign1 } from "./cose.js";
export { verifyCertChain, type ChainVerificationResult } from "./cert.js";
export { decodeCbor, encodeCbor } from "./cbor.js";
export { AWS_NITRO_ROOT_CERT_PEM } from "./root-cert.js";
export type {
  AppProofBundle,
  BootProofBundle,
  ExpectedPcrs,
  VerificationResult,
  VerifyOptions,
  AttestationDocument,
  LocalAttestationDoc,
} from "./types.js";
