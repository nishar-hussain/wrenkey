/**
 * WVC Enclave Relay (PRD §7, §20).
 *
 * This is the control-plane seam where invoke requests are forwarded to a live
 * enclave replica. The enclave itself runs inside AWS Nitro and communicates
 * over vsock; the Host Agent on the parent EC2 instance proxies HTTP -> vsock.
 *
 * The control plane never decrypts anything — it only relays opaque request/
 * response blobs. When no real enclave is reachable (no AWS Nitro hardware in
 * this environment), the relay returns a clear error so callers can degrade
 * gracefully.
 */

import { config } from "../config.js";
import prisma from "../db.js";
import { NotFoundError, ForbiddenError } from "../utils/errors.js";

export interface InvokeRequest {
  payloadType: "signature" | "parse_summary" | "policy_decision" | "oracle_result" | "generate_seed";
  [key: string]: unknown;
}

export interface AppProofResponse {
  id: string;
  ephemeralPubkey: string;
  payloadHash: string;
  payloadType: string;
  signature: string;
  attestationDoc: string;
}

export interface InvokeResult {
  result: Record<string, unknown>;
  appProof: AppProofResponse;
}

/**
 * Relay an invoke request to the live enclave replica for the given deployment.
 *
 * @param deploymentId  The deployment to invoke
 * @param orgId         Caller's org (for tenancy check)
 * @param request       The opaque invoke payload
 */
export async function invokeDeployment(
  deploymentId: string,
  orgId: string,
  request: InvokeRequest,
): Promise<InvokeResult> {
  const deployment = await prisma.wvcDeployment.findFirst({
    where: { id: deploymentId },
    include: { app: true, manifest: true },
  });

  if (!deployment) throw new NotFoundError("WVC deployment");
  if (deployment.app.orgId !== orgId) throw new ForbiddenError("Deployment does not belong to your org");
  if (deployment.status !== "live") throw new ForbiddenError(`Deployment is not live (status: ${deployment.status})`);

  const endpoint = config.wvc.enclaveEndpoint;

  // No enclave reachable — return a clear, structured error. This is the path
  // taken in any environment without AWS Nitro hardware (i.e. local dev, tests).
  if (!endpoint) {
    throw new ForbiddenError(
      "No enclave endpoint configured. WVC invoke requires a live AWS Nitro Enclave. " +
      "Set WVC_ENCLAVE_ENDPOINT or route the request to a running Host Agent. " +
      "(PRD §7, §20 — the enclave binary is a separate Rust/AWS effort.)",
    );
  }

  const url = `${endpoint.replace(/\/$/, "")}/deployments/${deploymentId}/invoke`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.wvc.invokeTimeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new ForbiddenError(`Enclave invoke failed: ${(err as any)?.error?.message || res.statusText}`);
    }

    const data = (await res.json()) as InvokeResult;

    // Persist the App Proof so it can be fetched later via GET /wvc/app-proofs/:id.
    if (data.appProof) {
      await prisma.wvcAppProof.create({
        data: {
          deploymentId,
          ephemeralPubkey: data.appProof.ephemeralPubkey,
          payloadHash: data.appProof.payloadHash,
          payloadType: data.appProof.payloadType,
          signature: data.appProof.signature,
          attestationDoc: Buffer.from(data.appProof.attestationDoc, "base64"),
          proofFormatVersion: "v1",
        },
      });
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}
