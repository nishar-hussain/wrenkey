/**
 * Local WVC runtime adapter.
 *
 * This is a dev/test Host Agent-compatible stand-in. It exercises the same
 * control-plane contracts as the Nitro Host Agent, but marks every proof as
 * local-dev-v1 so it cannot be confused with production AWS attestation.
 */

import { createHash, generateKeyPairSync, createSign } from "crypto";
import { ForbiddenError, ValidationError } from "../utils/errors.js";
import { config } from "../config.js";
import type { InvokeRequest, InvokeResult, ProvisionRequest, ProvisionResult } from "./wvc-relay.js";

export const LOCAL_PROOF_FORMAT = "local-dev-v1";

function localProofsAllowed(): boolean {
  return config.wvc.allowLocalProofs || process.env.WVC_ALLOW_LOCAL_PROOFS === "true";
}

function assertLocalProofsAllowed() {
  if (!localProofsAllowed()) {
    throw new ForbiddenError(
      "Local WVC proofs are disabled. Set WVC_ALLOW_LOCAL_PROOFS=true in dev/test only.",
    );
  }
}

function sha256(input: string | Buffer): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function base64Json(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function makeEphemeralKey() {
  const key = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey: key.publicKey, privateKey: key.privateKey };
}

function signPayload(privateKey: string, payloadHash: string): string {
  const signer = createSign("SHA256");
  signer.update(payloadHash);
  signer.end();
  return signer.sign(privateKey).toString("hex");
}

function buildLocalAttestation(params: {
  deploymentId: string;
  manifestId?: string;
  manifestHash: string;
  payloadHash?: string;
  payloadType?: string;
  ephemeralPubkey: string;
}) {
  return base64Json({
    proof_format_version: LOCAL_PROOF_FORMAT,
    runtime: "wrankey-local-wvc-runtime",
    warning: "Development proof only. Not an AWS Nitro attestation.",
    deployment_id: params.deploymentId,
    manifest_id: params.manifestId,
    manifest_hash: params.manifestHash,
    payload_hash: params.payloadHash,
    payload_type: params.payloadType,
    ephemeral_pubkey: params.ephemeralPubkey,
    issued_at: new Date().toISOString(),
  });
}

export async function provisionLocalDeployment(request: ProvisionRequest): Promise<ProvisionResult> {
  assertLocalProofsAllowed();

  const proofs = Array.from({ length: Math.max(1, request.replicaCount) }).map((_, index) => {
    const key = makeEphemeralKey();
    return {
      manifestId: request.manifestId,
      attestationDoc: buildLocalAttestation({
        deploymentId: request.deploymentId,
        manifestId: request.manifestId,
        manifestHash: request.manifestHash,
        ephemeralPubkey: key.publicKey,
      }),
      replicaIndex: index,
      proofFormatVersion: LOCAL_PROOF_FORMAT,
    };
  });

  return {
    deploymentId: request.deploymentId,
    status: "inactive",
    healthyReplicas: proofs.length,
    totalReplicas: request.replicaCount,
    runtime: "local",
    bootProofs: proofs,
  };
}

export async function invokeLocalDeployment(
  deploymentId: string,
  manifestHash: string,
  request: InvokeRequest,
): Promise<InvokeResult> {
  assertLocalProofsAllowed();

  const key = makeEphemeralKey();
  const payloadHash = sha256(stableJson({ deploymentId, request }));
  const result = buildDemoResult(deploymentId, request);
  const signature = signPayload(key.privateKey, payloadHash);

  return {
    result,
    appProof: {
      id: "pending-db-persistence",
      ephemeralPubkey: key.publicKey,
      payloadHash,
      payloadType: request.payloadType,
      signature,
      attestationDoc: buildLocalAttestation({
        deploymentId,
        manifestHash,
        payloadHash,
        payloadType: request.payloadType,
        ephemeralPubkey: key.publicKey,
      }),
      proofFormatVersion: LOCAL_PROOF_FORMAT,
    },
  };
}

function buildDemoResult(deploymentId: string, request: InvokeRequest): Record<string, unknown> {
  if (request.payloadType === "generate_seed") {
    const seedId = sha256(`${deploymentId}:seed:${stableJson(request)}`).slice("sha256:".length, 34);
    return {
      seedId: `local-seed-${seedId}`,
      custody: "local-wvc-simulated",
      warning: "Development seed handle only; no production key material was generated.",
    };
  }

  if (request.payloadType === "signature") {
    const unsignedTx = typeof request.unsignedTx === "string" ? request.unsignedTx : "";
    if (!unsignedTx) throw new ValidationError("unsignedTx is required for signature payloads");
    return {
      signedTx: "0xlocal" + createHash("sha256").update(unsignedTx).digest("hex"),
      signer: "local-wvc-simulated",
      warning: "Development signature only; not valid on-chain.",
    };
  }

  return {
    echoed: request,
    warning: "Local WVC demo workload echoed the payload.",
  };
}
