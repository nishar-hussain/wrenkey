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
import { verifyAppProof, verifyLocalAppProof } from "@wrankey/wvc-verify";
import { generateShares, recoverSecret, serializeShares, deserializeShares, type Share } from "./shamir.js";
import { eciesDecrypt } from "./ecies.js";

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
  .option("--stagedx-digest <sha256>", "StageX reproducible build digest (OCI image SHA-256)")
  .option("--stagedx-version <version>", "StageX release version (e.g. 2026.05.0)")
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
        stagedxDigest: opts.stagedxDigest || undefined,
        stagedxVersion: opts.stagedxVersion || undefined,
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
      const expectedPcrs = JSON.parse(fs.readFileSync(opts.expectedPcrs, "utf8"));
      const result = verifyLocalAppProof(proof, expectedPcrs, { maxAgeMs: 60 * 60 * 1000 });
      if (result.valid) {
        console.log("Local dev proof CRYPTOGRAPHICALLY VERIFIED.");
        console.log("  Format: local-dev-v1");
        console.log("  Warning: This is not an AWS Nitro attestation and must not be trusted in production.");
        console.log(`  Payload:    ${proof.payloadType || proof.payload_type || "unknown"}`);
        console.log(`  Signed at:  ${new Date(result.signedAt!).toISOString()}`);
        console.log(`  Enclave:    ${result.enclavePublicKey?.slice(0, 24)}...`);
        console.log(`  PCRs:       ${JSON.stringify(result.pcrs)}`);
      } else {
        console.error(`Local dev proof INVALID: ${result.reason}`);
        process.exit(1);
      }
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
  .command("rotate")
  .description("Initiate a quorum key rotation ceremony (PRD §18.4, §29.3)")
  .requiredOption("--app <appId>", "App ID")
  .requiredOption("--operators <ids>", "Comma-separated operator IDs participating")
  .action(async (opts: any) => {
    const participatingOperators = opts.operators.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (participatingOperators.length === 0) {
      console.error("At least one operator ID is required.");
      process.exit(1);
    }
    const res: any = await api(`/wvc/apps/${opts.app}/quorum-key/ceremonies`, {
      method: "POST",
      body: { ceremonyType: "rotation", participatingOperators },
    });
    console.log(`Rotation ceremony started: ${res.id}`);
  });

quorumKey
  .command("backup-share")
  .description("Extract your Shamir backup share for a ceremony (PRD §18.4)")
  .requiredOption("--app <appId>", "App ID")
  .requiredOption("--ceremony <ceremonyId>", "Ceremony ID")
  .requiredOption("--operator <alias>", "Local operator alias")
  .option("--out <file>", "Output file to save the decrypted share (default: stdout)")
  .action(async (opts: any) => {
    const operatorKey = loadOperatorKey(opts.operator);
    if (!operatorKey.operatorId) {
      console.error("Operator has no registered ID. Run: wvc operator init <alias> --app <appId>");
      process.exit(1);
    }
    const res: any = await api(`/wvc/apps/${opts.app}/quorum-key/ceremonies/${opts.ceremony}`);

    if (!res.encryptedShares) {
      console.error("No encrypted shares found for this ceremony.");
      console.error("If this is a local simulation, shares are generated during provisioning.");
      console.error("Create a bootstrap ceremony and provision a deployment first.");
      process.exit(1);
    }

    // Find this operator's encrypted share
    const myShare = (res.encryptedShares as any[]).find((s: any) => s.operatorId === operatorKey.operatorId);
    if (!myShare) {
      console.error(`No share found for operator ${operatorKey.operatorId}.`);
      console.error("Participating operators:", res.participatingOperators);
      process.exit(1);
    }

    // Decrypt the share using the operator's private key (ECIES)
    const encryptedBytes = Buffer.from(myShare.encryptedShare, "hex");
    const decrypted = eciesDecrypt(operatorKey.privateKeyPem, encryptedBytes);

    const share: Share = {
      index: (res.encryptedShares as any[]).indexOf(myShare) + 1,
      data: new Uint8Array(decrypted),
    };

    const shareJson = JSON.stringify({
      operatorId: operatorKey.operatorId,
      index: share.index,
      share: Buffer.from(share.data).toString("hex"),
      ceremonyId: opts.ceremony,
      appId: opts.app,
    }, null, 2);

    if (opts.out) {
      fs.writeFileSync(opts.out, shareJson, { mode: 0o600 });
      console.log(`Decrypted Shamir share saved to ${opts.out}`);
    } else {
      console.log(shareJson);
    }

    console.error(`\n  Ceremony:  ${res.id}`);
    console.error(`  Type:      ${res.ceremonyType}`);
    console.error(`  Status:    ${res.status}`);
    console.error(`  Share index: ${share.index}`);
    console.error(`  Share size:  ${decrypted.length} bytes`);
    console.error(`  Operator:  ${opts.operator} (${operatorKey.operatorId})`);
  });

quorumKey
  .command("recover")
  .description("Submit shares to recover a lost Quorum Key (PRD §18.4, §29.4)")
  .requiredOption("--app <appId>", "App ID")
  .requiredOption("--ceremony <ceremonyId>", "Recovery ceremony ID")
  .requiredOption("--shares <file>", "JSON file with array of {operatorId, share, index} objects")
  .action(async (opts: any) => {
    const sharesRaw = JSON.parse(fs.readFileSync(opts.shares, "utf8"));
    if (!Array.isArray(sharesRaw) || sharesRaw.length === 0) {
      console.error("Shares file must contain a non-empty JSON array.");
      process.exit(1);
    }

    console.log(`Recovery ceremony: ${opts.ceremony}`);
    console.log(`Shares provided:    ${sharesRaw.length}`);

    // Parse shares into ShamirShare format
    const shares: Share[] = sharesRaw.map((s: any) => ({
      index: s.index ?? s.x ?? 0,
      data: new Uint8Array(Buffer.from(s.share ?? s.y ?? "", "hex")),
    }));

    // Reconstruct the secret using Shamir threshold reconstruction
    const recoveredSecret = recoverSecret(shares);
    if (!recoveredSecret) {
      console.error("Failed to reconstruct the secret from the provided shares.");
      console.error("Make sure you have enough shares to meet the threshold.");
      process.exit(1);
    }

    console.log(`Secret reconstructed: ${Buffer.from(recoveredSecret).toString("hex").slice(0, 16)}...`);

    // Derive the P-256 public key from the recovered private key scalar
    // Import the private key and export the public key
    const { createPrivateKey, createPublicKey } = require("crypto");
    const privKeyDer = Buffer.concat([
      // PKCS8 wrapper for P-256 private key
      Buffer.from([
        0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20,
      ]),
      Buffer.from(recoveredSecret),
      Buffer.from([
        0xa1, 0x44, 0x03, 0x42, 0x00,
      ]),
      // We need the public key point, but we can derive it from the private key
      // Actually, let's use a simpler approach: import as SEC1
    ]);

    // Use SEC1 format instead
    const sec1Der = Buffer.concat([
      Buffer.from([0x30, 0x77, 0x02, 0x01, 0x01, 0x04, 0x20]),
      Buffer.from(recoveredSecret),
      Buffer.from([0xa0, 0x0a, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]),
      Buffer.from([0xa1, 0x44, 0x03, 0x42, 0x00]),
    ]);

    try {
      const privKeyObj = createPrivateKey({
        key: sec1Der,
        format: "der",
        type: "sec1",
      });
      const pubKeyObj = createPublicKey(privKeyObj);
      const pubDer = pubKeyObj.export({ format: "der", type: "spki" }) as Buffer;
      const pubHex = `04${pubDer.toString("hex").slice(-128)}`;

      console.log(`Recovered Quorum Key public key: ${pubHex.slice(0, 24)}...`);

      const res: any = await api(`/wvc/apps/${opts.app}/quorum-key/ceremonies/${opts.ceremony}/complete`, {
        method: "POST",
        body: { quorumPublicKey: pubHex },
      });
      console.log(`\nRecovery completed: ${res.status || "ok"}`);
      console.log(`New Quorum Key generation available.`);
    } catch (err: any) {
      console.error(`Failed to derive public key from recovered secret: ${err.message}`);
      console.error("The shares may be invalid or corrupted.");
      process.exit(1);
    }
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
