/**
 * WVC CLI — operator tool for WranKey Verifiable Compute (PRD §22).
 *
 * Operators generate P256 keypairs locally, approve manifests by signing the
 * canonical hash, and verify proofs using @wrankey/wvc-verify — all without
 * the server ever seeing a private key.
 */

import { Command } from "commander";
import fs from "fs";
import path from "path";
import os from "os";
import { api, loadConfig, saveConfig } from "./api.js";
import { initOperatorKey, signManifestHash, recomputeManifestHash, loadOperatorKey, listOperatorKeys } from "./keys.js";
import { verifyAppProof } from "@wrankey/wvc-verify";

const program = new Command();

program
  .name("wvc")
  .description("WranKey Verifiable Compute CLI — manifest approval, deployment lifecycle, proof verification.")
  .version("0.1.0");

// ─── wvc login ─────────────────────────────────────────────────────────────
program
  .command("login")
  .description("Authenticate against the WranKey API (stores config in ~/.wvc/)")
  .option("-b, --api-base <url>", "API base URL", "http://localhost:3001")
  .option("-t, --token <token>", "Session JWT token")
  .option("-k, --api-key <key>", "API key")
  .action((opts: any) => {
    const cfg = loadConfig();
    if (opts.apiBase) cfg.apiBase = opts.apiBase;
    if (opts.token) cfg.token = opts.token;
    if (opts.apiKey) cfg.apiKey = opts.apiKey;
    saveConfig(cfg);
    console.log(`Configured. API base: ${cfg.apiBase}`);
  });

// ─── wvc operator ──────────────────────────────────────────────────────────
const operator = program.command("operator").description("Operator key management (PRD §13)");

operator
  .command("init")
  .description("Generate a P256 operator keypair locally (PRD §13.1)")
  .argument("<alias>", "Operator alias (e.g. alice)")
  .option("--app <appId>", "Register with a WVC app (uploads public key)")
  .action(async (alias: string, opts: any) => {
    const key = initOperatorKey(alias);
    console.log(`Generated P256 keypair for "${alias}" -> ~/.wvc/operator-${alias}.pem`);
    console.log(`Public key (PEM):\n${key.publicKeyPem}`);
    if (opts.app) {
      const res: any = await api(`/wvc/apps/${opts.app}/operators`, {
        method: "POST",
        body: { alias, publicKey: key.publicKeyPem },
      });
      key.operatorId = res.id;
      fs.writeFileSync(path.join(os.homedir(), ".wvc", `operator-${alias}.pem`), JSON.stringify(key, null, 2), { mode: 0o600 });
      console.log(`Registered with app ${opts.app}, operator ID: ${res.id}`);
    }
    console.log("\nPrivate key never leaves this machine. Keep it safe (hardware token recommended).");
  });

operator
  .command("list")
  .description("List locally-stored operator keys")
  .action(() => {
    const keys = listOperatorKeys();
    if (keys.length === 0) { console.log("No operator keys found. Run: wvc operator init <alias>"); return; }
    for (const k of keys) console.log(`  ${k.alias}${k.operatorId ? ` (${k.operatorId})` : ""}`);
  });

// ─── wvc app ───────────────────────────────────────────────────────────────
const app = program.command("app").description("WVC app management");

app
  .command("create")
  .description("Create a WVC app")
  .requiredOption("--name <name>", "App name")
  .option("--description <desc>", "App description", "")
  .option("--required-approvals <n>", "Required operator approvals", "2")
  .action(async (opts: any) => {
    const res: any = await api("/wvc/apps", {
      method: "POST",
      body: {
        name: opts.name,
        description: opts.description,
        requiredApprovals: parseInt(opts.requiredApprovals, 10),
      },
    });
    console.log(`Created app: ${res.id} — ${opts.name}`);
  });

app
  .command("list")
  .description("List WVC apps")
  .action(async () => {
    const res: any = await api("/wvc/apps?limit=100");
    const apps = res.data || [];
    if (apps.length === 0) { console.log("No apps found."); return; }
    for (const a of apps) console.log(`  ${a.id}  ${a.name}  (approvals: ${a.requiredApprovals})  live: ${a.liveDeploymentId || "—"}`);
  });

// ─── wvc deploy ────────────────────────────────────────────────────────────
const deploy = program.command("deploy").description("Deployment lifecycle commands (PRD §11)");

deploy
  .command("create")
  .description("Create a deployment + manifest (PRD §9.2, §12)")
  .requiredOption("--app <appId>", "App ID")
  .requiredOption("--image <url>", "Container image URL (with digest)")
  .requiredOption("--executable-path <path>", "Path to the binary inside the image")
  .requiredOption("--digest <sha256>", "SHA-256 of the executable binary")
  .requiredOption("--pcrs <file>", "JSON file with {pcr0, pcr1, pcr2}")
  .option("--ingress-port <port>", "Ingress vsock port", "3000")
  .option("--health-port <port>", "Health vsock port", "3000")
  .option("--cpu <n>", "CPU count", "2")
  .option("--memory <mib>", "Memory in MiB", "1024")
  .option("--replicas <n>", "Replica count", "3")
  .option("--args <json>", "Executable args as JSON array", "[]")
  .option("--upgrade-from <ids>", "Comma-separated deployment IDs this may upgrade from")
  .action(async (opts: any) => {
    const pcrs = JSON.parse(fs.readFileSync(opts.pcrs, "utf8"));
    const res: any = await api(`/wvc/apps/${opts.app}/deployments`, {
      method: "POST",
      body: {
        imageUrl: opts.image,
        executablePath: opts.executablePath,
        executableArgs: JSON.parse(opts.args),
        executableDigest: opts.digest,
        expectedPcr0: pcrs.pcr0,
        expectedPcr1: pcrs.pcr1,
        expectedPcr2: pcrs.pcr2,
        ingressPort: parseInt(opts.ingressPort, 10),
        healthPort: parseInt(opts.healthPort, 10),
        cpuCount: parseInt(opts.cpu, 10),
        memoryMib: parseInt(opts.memory, 10),
        replicaCount: parseInt(opts.replicas, 10),
        allowedUpgradeFrom: opts.upgradeFrom ? opts.upgradeFrom.split(",") : [],
      },
    });
    console.log(`Created deployment ${res.deploymentId}`);
    console.log(`  Manifest ID:   ${res.manifestId}`);
    console.log(`  Manifest hash: ${res.manifestHash}`);
    console.log(`  Status:        ${res.status}`);
    console.log(`\n  Next: operators review and approve -> wvc manifest show ${res.manifestId}`);
  });

deploy
  .command("provision <deploymentId>")
  .description("Provision an approved deployment (PRD §11)")
  .action(async (deploymentId: string) => {
    const res: any = await api(`/wvc/deployments/${deploymentId}/provision`, { method: "POST" });
    console.log(`Provisioning -> status: ${res.status}`);
  });

deploy
  .command("status <deploymentId>")
  .description("Show deployment status and health")
  .action(async (deploymentId: string) => {
    const res: any = await api(`/wvc/deployments/${deploymentId}`);
    console.log(`  Deployment:  ${res.id}`);
    console.log(`  Status:      ${res.status}`);
    console.log(`  Live:        ${res.isLive}`);
    console.log(`  Replicas:    ${res.healthyReplicas}/${res.totalReplicas} healthy`);
    console.log(`  Boot proofs: ${(res.bootProofs || []).length}`);
  });

deploy
  .command("set-live <deploymentId>")
  .description("Set a deployment as live (explicit traffic cutover, PRD §11)")
  .action(async (deploymentId: string) => {
    await api(`/wvc/deployments/${deploymentId}/set-live`, { method: "POST" });
    console.log(`Deployment ${deploymentId} is now LIVE.`);
  });

deploy
  .command("delete <deploymentId>")
  .description("Soft-delete a deployment (reversible, PRD §11)")
  .action(async (deploymentId: string) => {
    const res: any = await api(`/wvc/deployments/${deploymentId}/delete`, { method: "POST" });
    console.log(`Marked for deletion (status: ${res.status}). Restorable via: wvc deploy restore ${deploymentId}`);
  });

deploy
  .command("restore <deploymentId>")
  .description("Restore a soft-deleted deployment")
  .action(async (deploymentId: string) => {
    const res: any = await api(`/wvc/deployments/${deploymentId}/restore`, { method: "POST" });
    console.log(`Restored (status: ${res.status}).`);
  });

deploy
  .command("invoke <deploymentId>")
  .description("Invoke a live deployment through the configured Host Agent/local runtime")
  .requiredOption("--payload <json>", "Invoke payload JSON, e.g. '{\"payloadType\":\"generate_seed\"}'")
  .action(async (deploymentId: string, opts: any) => {
    const payload = JSON.parse(opts.payload);
    const res: any = await api(`/wvc/deployments/${deploymentId}/invoke`, {
      method: "POST",
      body: payload,
    });
    console.log("--- Result ---");
    console.log(JSON.stringify(res.result, null, 2));
    console.log("--- App Proof ---");
    console.log(`  ID:      ${res.appProof?.id}`);
    console.log(`  Format:  ${res.appProof?.proofFormatVersion || "v1"}`);
    console.log(`  Payload: ${res.appProof?.payloadType}`);
  });

// ─── wvc manifest ──────────────────────────────────────────────────────────
const manifest = program.command("manifest").description("Manifest review and approval (PRD §12, §13)");

manifest
  .command("show <manifestId>")
  .description("Display a manifest for operator review (recomputes hash locally, PRD §13.2)")
  .action(async (manifestId: string) => {
    const res: any = await api(`/wvc/manifests/${manifestId}`);
    const manifestJson = res.manifestJson;
    const localHash = recomputeManifestHash(manifestJson);
    console.log("--- Manifest ---");
    console.log(JSON.stringify(manifestJson, null, 2));
    console.log("--- Approval ---");
    console.log(`  Required approvals: ${res.requiredApprovals}`);
    console.log(`  Approvals so far:   ${res.approvalsCount}`);
    console.log(`  Server hash:        ${res.manifestHash}`);
    console.log(`  Local hash:         ${localHash}`);
    if (localHash === res.manifestHash) {
      console.log("  Hash matches — safe to approve.");
    } else {
      console.log("  HASH MISMATCH — do NOT approve this manifest.");
    }
  });

manifest
  .command("approve <manifestId>")
  .description("Sign and submit a manifest approval (PRD §13.2)")
  .requiredOption("--operator <alias>", "Local operator alias to sign with")
  .action(async (manifestId: string, opts: any) => {
    const res: any = await api(`/wvc/manifests/${manifestId}`);
    const localHash = recomputeManifestHash(res.manifestJson);
    const operatorKey = loadOperatorKey(opts.operator);
    if (!operatorKey.operatorId) {
      console.error("Operator has no registered ID. Run: wvc operator init <alias> --app <appId>");
      process.exit(1);
    }
    const signature = signManifestHash(opts.operator, localHash);
    const approveRes: any = await api(`/wvc/manifests/${manifestId}/approve`, {
      method: "POST",
      body: { operatorId: operatorKey.operatorId, signature },
    });
    console.log(`Approved as "${opts.operator}" — ${approveRes.approvalsCount}/${approveRes.requiredApprovals} approvals`);
    if (approveRes.status === "approved") console.log("  Manifest fully approved — ready to provision.");
  });

// ─── wvc proof ─────────────────────────────────────────────────────────────
program
  .command("proof")
  .description("Verify WVC proofs (PRD §16, §24)")
  .argument("<proofFile>", "JSON file containing the App Proof bundle")
  .requiredOption("--expected-pcrs <file>", "JSON file with {pcr0, pcr1, pcr2} you trust")
  .option("--max-age-ms <ms>", "Max acceptable attestation age in ms", String(5 * 60 * 1000))
  .option("--allow-local", "Accept local-dev-v1 simulated proofs (dev/test only)", false)
  .action((proofFile: string, opts: any) => {
    const proof = JSON.parse(fs.readFileSync(proofFile, "utf8"));
    const format = proof.proofFormatVersion || proof.proof_format_version || "v1";
    if (format === "local-dev-v1") {
      if (!opts.allowLocal) {
        console.error("Proof is local-dev-v1. Re-run with --allow-local only for dev/test simulated proofs.");
        process.exit(1);
      }
      console.log("Local dev proof accepted.");
      console.log("  Format: local-dev-v1");
      console.log("  Warning: This is not an AWS Nitro attestation and must not be trusted in production.");
      console.log(`  Payload: ${proof.payloadType || proof.payload_type || "unknown"}`);
      return;
    }
    const expectedPcrs = JSON.parse(fs.readFileSync(opts.expectedPcrs, "utf8"));
    const result = verifyAppProof(proof, expectedPcrs, { maxAgeMs: parseInt(opts.maxAgeMs, 10) });
    if (result.valid) {
      console.log("Proof VALID.");
      console.log(`  Signed at:      ${new Date(result.signedAt!).toISOString()}`);
      console.log(`  Enclave pubkey: ${result.enclavePublicKey?.slice(0, 24)}...`);
      console.log(`  PCRs:           ${JSON.stringify(result.pcrs)}`);
    } else {
      console.error(`Proof INVALID: ${result.reason}`);
      if (result.pcrs) console.error(`  Attested PCRs: ${JSON.stringify(result.pcrs)}`);
      process.exit(1);
    }
  });

// ─── wvc quorum-key ────────────────────────────────────────────────────────
const quorumKey = program.command("quorum-key").description("Quorum key ceremony operations (PRD §18.4)");

quorumKey
  .command("backup-share")
  .description("Submit a Shamir share during recovery — verifies target enclave attestation first (PRD §18.4)")
  .requiredOption("--ceremony <id>", "Ceremony ID this share is for")
  .requiredOption("--operator <alias>", "Local operator alias to decrypt/encrypt the share")
  .requiredOption("--deployment <id>", "Target deployment ID requesting recovery")
  .action(async (opts: any) => {
    const ceremony: any = await api(`/wvc/apps/${opts.app || "unknown"}/quorum-key/ceremonies/${opts.ceremony}`);
    if (ceremony.status !== "pending") {
      console.error(`Ceremony ${opts.ceremony} is ${ceremony.status}, not pending.`);
      process.exit(1);
    }

    const deployment: any = await api(`/wvc/deployments/${opts.deployment}`);
    if (!deployment.bootProofs || deployment.bootProofs.length === 0) {
      console.error("Target deployment has no boot proof — cannot verify its attestation.");
      process.exit(1);
    }

    const bootProof = deployment.bootProofs[0];
    console.log("Verifying target enclave attestation...");

    try {
      const verifyResult = verifyAppProof(
        {
          ephemeralPubkey: bootProof.ephemeralPubkey,
          payloadHash: bootProof.payloadHash || "",
          signature: bootProof.signature || "",
          attestationDoc: Buffer.from(bootProof.attestationDoc || "", "base64"),
        },
        {
          pcr0: deployment.expectedPcr0,
          pcr1: deployment.expectedPcr1,
          pcr2: deployment.expectedPcr2,
        },
        { maxAgeMs: 300_000 }
      );

      if (!verifyResult.valid) {
        console.error(`Enclave attestation INVALID: ${verifyResult.reason}`);
        console.error("Refusing to submit share to an unverified enclave.");
        process.exit(1);
      }
      console.log("Enclave attestation VALID.");
    } catch (e: any) {
      console.error("Attestation verification failed. Ensure deployment is active and booted.", e.message);
      process.exit(1);
    }

    const operatorKey = loadOperatorKey(opts.operator);
    console.log(`Operator "${opts.operator}" submitting share to ceremony ${opts.ceremony}...`);

    await api(`/wvc/apps/${ceremony.appId}/quorum-key/ceremonies/${opts.ceremony}/shares`, {
      method: "POST",
      body: {
        operatorId: operatorKey.operatorId,
        deploymentId: opts.deployment,
      },
    });

    console.log("Share submitted. Recovery will complete when threshold shares are received.");
  });

quorumKey
  .command("recover")
  .description("Initiate quorum key recovery — creates a new ceremony for total-loss recovery (PRD §18.4, §29.4)")
  .requiredOption("--deployment <id>", "New deployment ID requesting recovery")
  .requiredOption("--app <appId>", "App ID")
  .action(async (opts: any) => {
    const deployment: any = await api(`/wvc/deployments/${opts.deployment}`);
    if (deployment.status !== "inactive" && deployment.status !== "approved") {
      console.error(`Deployment ${opts.deployment} is ${deployment.status}. Expected 'inactive' or 'approved'.`);
      process.exit(1);
    }

    const res: any = await api(`/wvc/apps/${opts.app}/quorum-key/ceremonies`, {
      method: "POST",
      body: {
        ceremonyType: "recovery",
        deploymentId: opts.deployment,
        participatingOperators: [],
      },
    });

    console.log(`Recovery ceremony started: ${res.id}`);
    console.log(`Operators must now submit their backup shares:`);
    console.log(`  wvc quorum-key backup-share --ceremony ${res.id} --deployment ${opts.deployment} --operator <alias> --app ${opts.app}`);
    console.log(`Required approvals: ${deployment.requiredApprovals || "2"}`);
  });

quorumKey
  .command("rotate")
  .description("Initiate a quorum key rotation ceremony (PRD §18.4, §29.3)")
  .requiredOption("--app <appId>", "App ID")
  .action(async (opts: any) => {
    const res: any = await api(`/wvc/apps/${opts.app}/quorum-key/ceremonies`, {
      method: "POST",
      body: { ceremonyType: "rotation", participatingOperators: [] },
    });
    console.log(`Rotation ceremony started: ${res.id}`);
  });

// ─── wvc ceremony ──────────────────────────────────────────────────────────
const ceremony = program.command("ceremony").description("Quorum key ceremony status (PRD §18.4)");

ceremony
  .command("status <ceremonyId>")
  .description("Show quorum key ceremony status")
  .requiredOption("--app <appId>", "App ID")
  .action(async (ceremonyId: string, opts: any) => {
    const res: any = await api(`/wvc/apps/${opts.app}/quorum-key/ceremonies/${ceremonyId}`);
    console.log(`  Ceremony:  ${res.id}`);
    console.log(`  Type:      ${res.ceremonyType}`);
    console.log(`  Status:    ${res.status}`);
    console.log(`  Started:   ${res.startedAt}`);
    console.log(`  Completed: ${res.completedAt || "—"}`);
  });

program.parse();
