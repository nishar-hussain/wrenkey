/**
 * X.509 certificate chain verification for AWS Nitro attestation documents.
 *
 * The attestation document carries:
 *   - `certificate`: the enclave's own attestation certificate (DER bytes)
 *   - `cabundle`: array of intermediate CA certificates (DER bytes)
 *
 * The chain is: enclave cert <- cabundle[0] <- cabundle[1] <- ... <- root.
 * We verify each link's signature using Node's built-in crypto.X509Certificate.
 */

import { X509Certificate, type KeyObject } from "crypto";

export interface ChainVerificationResult {
  valid: boolean;
  reason?: string;
  /** The enclave certificate's public key in PEM form, for COSE signature verification. */
  publicKeyPem?: string;
}

/**
 * Verify that `leafCert` chains to `rootCertPem` via `cabundle`.
 * Returns the leaf cert's public key (PEM) on success.
 */
export function verifyCertChain(
  leafCertDer: Uint8Array,
  cabundleDer: Uint8Array[],
  rootCertPem: string,
): ChainVerificationResult {
  let leaf: X509Certificate;
  let intermediates: X509Certificate[];
  let root: X509Certificate;

  try {
    leaf = new X509Certificate(Buffer.from(leafCertDer));
  } catch (e: any) {
    return { valid: false, reason: "failed to parse leaf certificate: " + e.message };
  }

  try {
    intermediates = cabundleDer.map((der) => new X509Certificate(Buffer.from(der)));
  } catch (e: any) {
    return { valid: false, reason: "failed to parse cabundle: " + e.message };
  }

  try {
    root = new X509Certificate(rootCertPem);
  } catch (e: any) {
    return { valid: false, reason: "failed to parse root certificate: " + e.message };
  }

  // Build the candidate chain: leaf -> intermediates -> root.
  // We verify each signature link. AWS Nitro emits a single intermediate in practice,
  // but the algorithm handles an arbitrary-length bundle.
  const chain = [leaf, ...intermediates, root];

  for (let i = 0; i < chain.length - 1; i++) {
    const subject = chain[i];
    const issuer = chain[i + 1];
    let verified: boolean;
    try {
      verified = subject.verify(issuer.publicKey);
    } catch (e: any) {
      return { valid: false, reason: `signature verification failed at link ${i}: ${e.message}` };
    }
    if (!verified) {
      return { valid: false, reason: `certificate at link ${i} not signed by issuer at link ${i + 1}` };
    }
  }

  // Confirm the final cert is self-signed (a genuine root).
  let rootSelfSigned: boolean;
  try {
    rootSelfSigned = root.verify(root.publicKey);
  } catch {
    rootSelfSigned = false;
  }
  if (!rootSelfSigned) {
    return { valid: false, reason: "root certificate is not self-signed" };
  }

  const publicKeyPem = leaf.publicKey.export({ format: "pem", type: "spki" }).toString();
  return { valid: true, publicKeyPem };
}

/** Export type for callers that need the KeyObject. */
export type { KeyObject };
