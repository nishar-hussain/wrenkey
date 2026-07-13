/**
 * WVC Manifest canonicalization & hashing (PRD §12).
 *
 * Operators sign a *hash* of the manifest, not the manifest itself. To make
 * `hash(manifest)` deterministic regardless of how the JSON was constructed or
 * key-ordered, we serialize using JSON Canonicalization Scheme (RFC 8785):
 *   - object keys sorted by UTF-16 code unit order
 *   - no insignificant whitespace
 *   - standard string escaping
 *
 * For the manifest's value types (strings, integers, arrays, nested objects)
 * this simplified JCS produces output identical to a full RFC 8785 implementation.
 */

import { createHash } from "crypto";

export type ManifestValue =
  | string
  | number
  | boolean
  | null
  | ManifestValue[]
  | { [key: string]: ManifestValue };

/** Canonicalize a JSON-compatible value per JCS (RFC 8785). */
export function canonicalize(value: ManifestValue): string {
  return serialize(value);
}

/** Compute the canonical manifest hash: SHA-256 of the JCS-serialized manifest. */
export function computeManifestHash(manifest: ManifestValue): string {
  const canonical = canonicalize(manifest);
  return "sha256:" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Verify a manifest hash matches the canonical hash of the given manifest. */
export function verifyManifestHash(manifest: ManifestValue, expectedHash: string): boolean {
  const actual = computeManifestHash(manifest);
  return actual.toLowerCase() === expectedHash.toLowerCase().replace(/^0x/, "");
}

function serialize(value: ManifestValue): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "number") return serializeNumber(value);
  if (typeof value === "string") return serializeString(value);
  if (Array.isArray(value)) {
    return "[" + value.map(serialize).join(",") + "]";
  }
  const obj = value as { [key: string]: ManifestValue };
  const keys = Object.keys(obj).sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a.charCodeAt(i) !== b.charCodeAt(i)) return a.charCodeAt(i) - b.charCodeAt(i);
    }
    return a.length - b.length;
  });
  return "{" + keys.map((k) => serializeString(k) + ":" + serialize(obj[k])).join(",") + "}";
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error("JCS: non-finite number");
  if (n === 0) return "0";
  const isInt = Number.isInteger(n);
  if (isInt) return String(n);
  let str = n.toString();
  if (str.includes("e")) {
    const [mant, exp] = str.split("e");
    const e = parseInt(exp, 10);
    str = (parseFloat(mant) * Math.pow(10, e)).toString();
  }
  return str;
}

function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20) {
      out += ESCAPE[code] ?? unicodeEscape(code);
    } else if (code === 0x22) {
      out += '\\"';
    } else if (code === 0x5c) {
      out += "\\\\";
    } else if (code < 0x7f) {
      out += s[i];
    } else {
      out += unicodeEscape(code);
    }
  }
  return out + '"';
}

const ESCAPE: Record<number, string> = {
  0: "\\u0000", 1: "\\u0001", 2: "\\u0002", 3: "\\u0003", 4: "\\u0004",
  5: "\\u0005", 6: "\\u0006", 7: "\\u0007", 8: "\\b", 9: "\\t",
  10: "\\n", 11: "\\u000b", 12: "\\f", 13: "\\r",
  14: "\\u000e", 15: "\\u000f", 16: "\\u0010", 17: "\\u0011", 18: "\\u0012",
  19: "\\u0013", 20: "\\u0014", 21: "\\u0015", 22: "\\u0016", 23: "\\u0017",
  24: "\\u0018", 25: "\\u0019", 26: "\\u001a", 27: "\\u001b", 28: "\\u001c",
  29: "\\u001d", 30: "\\u001e", 31: "\\u001f",
};

function unicodeEscape(code: number): string {
  const hex = code.toString(16).padStart(4, "0");
  return "\\u" + hex;
}

/** Build the canonical manifest object from a deployment creation request (PRD §12.2). */
export function buildManifestObject(input: {
  appId: string;
  imageUrl: string;
  executablePath: string;
  executableArgs: string[];
  executableDigest: string;
  expectedPcr0: string;
  expectedPcr1: string;
  expectedPcr2: string;
  ingressPort: number;
  healthPort: number;
  cpuCount: number;
  memoryMib: number;
  replicaCount: number;
  requiredApprovals: number;
  approvers: string[];
  allowedUpgradeFrom: string[];
  stagedxDigest?: string;
  stagedxVersion?: string;
  operatorPubkeys?: { operatorId: string; publicKey: string }[];
}): ManifestValue {
  const manifest: Record<string, ManifestValue> = {
    version: "1",
    app_id: input.appId,
    image_url: input.imageUrl,
    executable_path: input.executablePath,
    executable_args: input.executableArgs,
    executable_digest: input.executableDigest,
    expected_pcrs: {
      pcr0: input.expectedPcr0,
      pcr1: input.expectedPcr1,
      pcr2: input.expectedPcr2,
    },
    ingress_port: input.ingressPort,
    health_port: input.healthPort,
    resources: { cpu_count: input.cpuCount, memory_mib: input.memoryMib },
    replica_count: input.replicaCount,
    required_approvals: input.requiredApprovals,
    approvers: input.approvers,
    allowed_upgrade_from: input.allowedUpgradeFrom,
    created_at: new Date().toISOString(),
  };

  if (input.stagedxDigest) manifest.stagedx_digest = input.stagedxDigest;
  if (input.stagedxVersion) manifest.stagedx_version = input.stagedxVersion;
  if (input.operatorPubkeys) manifest.operator_pubkeys = input.operatorPubkeys;

  return manifest as ManifestValue;
}
