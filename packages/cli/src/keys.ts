/**
 * WVC CLI operator key management (PRD §13.1).
 *
 * Operators generate P256 keypairs LOCALLY. The private key never touches a
 * WranKey server. Keys are stored in ~/.wvc/operator-<alias>.pem (mode 0600).
 */

import fs from "fs";
import path from "path";
import os from "os";
import { generateKeyPairSync, createSign, createHash } from "crypto";

const KEY_DIR = path.join(os.homedir(), ".wvc");

export interface OperatorKey {
  alias: string;
  publicKeyPem: string;
  privateKeyPem: string;
  operatorId?: string;
}

function keyPath(alias: string): string {
  return path.join(KEY_DIR, `operator-${alias}.pem`);
}

/** Generate a new P256 keypair and store it locally (PRD §13.1). */
export function initOperatorKey(alias: string): OperatorKey {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  fs.mkdirSync(KEY_DIR, { recursive: true });
  const entry: OperatorKey = { alias, publicKeyPem, privateKeyPem };
  fs.writeFileSync(keyPath(alias), JSON.stringify(entry, null, 2), { mode: 0o600 });
  return entry;
}

/** Load a stored operator key by alias. */
export function loadOperatorKey(alias: string): OperatorKey {
  const raw = fs.readFileSync(keyPath(alias), "utf8");
  return JSON.parse(raw);
}

/** List all locally-stored operator keys. */
export function listOperatorKeys(): OperatorKey[] {
  if (!fs.existsSync(KEY_DIR)) return [];
  return fs.readdirSync(KEY_DIR)
    .filter((f) => f.startsWith("operator-") && f.endsWith(".pem"))
    .map((f) => loadOperatorKey(f.replace(/^operator-/, "").replace(/\.pem$/, "")));
}

/** Sign a manifest hash with the operator's private key (IEEE-P1363, PRD §13.2). */
export function signManifestHash(alias: string, manifestHash: string): string {
  const key = loadOperatorKey(alias);
  const hashHex = manifestHash.replace(/^sha256:/i, "").replace(/^0x/i, "").trim();
  const data = Buffer.from(hashHex, "hex");
  const signer = createSign("SHA256");
  signer.update(data);
  const sig = signer.sign({ key: key.privateKeyPem, dsaEncoding: "ieee-p1363" });
  return sig.toString("hex");
}

/** Recompute the manifest hash locally — never trust a server-supplied value (PRD §13.2). */
export function recomputeManifestHash(manifestJson: any): string {
  const canonical = canonicalize(manifestJson);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return "sha256:" + hash;
}

// Minimal JCS canonicalization (matches backend manifest.ts).
function canonicalize(value: any): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return serializeNumber(value);
  if (typeof value === "string") return serializeString(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value).sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a.charCodeAt(i) !== b.charCodeAt(i)) return a.charCodeAt(i) - b.charCodeAt(i);
    }
    return a.length - b.length;
  });
  return "{" + keys.map((k) => serializeString(k) + ":" + canonicalize(value[k])).join(",") + "}";
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error("non-finite number");
  if (Number.isInteger(n)) return String(n);
  return n.toString();
}

function serializeString(s: string): string {
  return JSON.stringify(s);
}
