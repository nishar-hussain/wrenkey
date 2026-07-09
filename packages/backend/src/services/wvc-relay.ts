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
import { invokeLocalDeployment, provisionLocalDeployment } from "./wvc-local-runtime.js";

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
  proofFormatVersion?: string;
}

export interface InvokeResult {
  result: Record<string, unknown>;
  appProof: AppProofResponse;
}

export interface BootProofResponse {
  id?: string;
  manifestId: string;
  attestationDoc: string;
  replicaIndex?: number;
  proofFormatVersion?: string;
}

export interface ProvisionRequest {
  deploymentId: string;
  appId: string;
  manifestId: string;
  manifestHash: string;
  manifestJson: unknown;
  replicaCount: number;
}

export interface ProvisionResult {
  deploymentId: string;
  status: "inactive";
  healthyReplicas: number;
  totalReplicas: number;
  runtime: "local" | "host-agent";
  bootProofs: BootProofResponse[];
}

function isLocalRuntimeEndpoint(endpoint: string): boolean {
  return endpoint === "local" || endpoint === "local-dev" || endpoint === "in-process";
}

function endpointConfiguredForLocalDev(endpoint: string): boolean {
  return !endpoint && (config.wvc.allowLocalProofs || process.env.WVC_ALLOW_LOCAL_PROOFS === "true");
}

export async function provisionDeployment(deploymentId: string, orgId: string): Promise<ProvisionResult> {
  const deployment = await prisma.wvcDeployment.findFirst({
    where: { id: deploymentId },
    include: { app: true, manifest: true },
  });

  if (!deployment) throw new NotFoundError("WVC deployment");
  if (deployment.app.orgId !== orgId) throw new ForbiddenError("Deployment does not belong to your org");
  if (deployment.status !== "approved") {
    throw new ForbiddenError(`Cannot provision: deployment status is ${deployment.status}, must be approved`);
  }

  const request: ProvisionRequest = {
    deploymentId,
    appId: deployment.appId,
    manifestId: deployment.manifestId,
    manifestHash: deployment.manifest.manifestHash,
    manifestJson: deployment.manifest.manifestJson,
    replicaCount: deployment.replicaCount,
  };

  const endpoint = config.wvc.enclaveEndpoint;
  const result = isLocalRuntimeEndpoint(endpoint) || endpointConfiguredForLocalDev(endpoint)
    ? await provisionLocalDeployment(request)
    : await provisionViaHostAgent(endpoint, request);

  const persistedBootProofIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const proof of result.bootProofs) {
      const created = await tx.wvcBootProof.create({
        data: {
          deploymentId,
          manifestId: proof.manifestId,
          attestationDoc: Buffer.from(proof.attestationDoc, "base64"),
        },
      });
      persistedBootProofIds.push(created.id);
    }
    await tx.wvcDeployment.update({
      where: { id: deploymentId },
      data: { status: result.status },
    });
  });

  // Attach DB IDs to the result
  result.bootProofs = result.bootProofs.map((proof, index) => ({
    ...proof,
    id: persistedBootProofIds[index],
  }));

  return result;
}

async function provisionViaHostAgent(endpoint: string, request: ProvisionRequest): Promise<ProvisionResult> {
  if (!endpoint) {
    throw new ForbiddenError(
      "No enclave endpoint configured. WVC provision requires AWS Nitro Host Agent or local dev mode. " +
      "Set WVC_ENCLAVE_ENDPOINT=local and WVC_ALLOW_LOCAL_PROOFS=true for the local slice.",
    );
  }

  const url = `${endpoint.replace(/\/$/, "")}/deployments/${request.deploymentId}/provision`;
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
      throw new ForbiddenError(`Enclave provision failed: ${(err as any)?.error?.message || res.statusText}`);
    }

    return (await res.json()) as ProvisionResult;
  } finally {
    clearTimeout(timeout);
  }
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

  if (isLocalRuntimeEndpoint(endpoint) || endpointConfiguredForLocalDev(endpoint)) {
    const data = await invokeLocalDeployment(deploymentId, deployment.manifest.manifestHash, request);
    return persistAppProof(deploymentId, data);
  }

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
    return persistAppProof(deploymentId, data);
  } finally {
    clearTimeout(timeout);
  }
}

async function persistAppProof(deploymentId: string, data: InvokeResult): Promise<InvokeResult> {
  if (!data.appProof) return data;

  const created = await prisma.wvcAppProof.create({
    data: {
      deploymentId,
      ephemeralPubkey: data.appProof.ephemeralPubkey,
      payloadHash: data.appProof.payloadHash,
      payloadType: data.appProof.payloadType,
      signature: data.appProof.signature,
      attestationDoc: Buffer.from(data.appProof.attestationDoc, "base64"),
      proofFormatVersion: data.appProof.proofFormatVersion || detectProofFormat(data.appProof.attestationDoc),
    },
  });

  return {
    ...data,
    appProof: {
      ...data.appProof,
      id: created.id,
      proofFormatVersion: created.proofFormatVersion,
    },
  };
}

function detectProofFormat(attestationDoc: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(attestationDoc, "base64").toString("utf8"));
    return parsed.proof_format_version || "v1";
  } catch {
    return "v1";
  }
}
