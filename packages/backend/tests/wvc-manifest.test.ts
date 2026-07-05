import { describe, it, expect } from "vitest";
import { canonicalize, computeManifestHash, buildManifestObject } from "../../src/modules/wvc/manifest.js";

describe("WVC Manifest Canonicalization (JCS, PRD §12)", () => {
  it("produces deterministic output regardless of key insertion order", () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } };
    const b = { a: 2, b: 1, c: { y: 2, z: 1 } };
    expect(canonicalize(a as any)).toBe(canonicalize(b as any));
  });

  it("sorts keys by UTF-16 code unit order", () => {
    const result = canonicalize({ b: 1, a: 2, c: 3 } as any);
    expect(result).toBe('{"a":2,"b":1,"c":3}');
  });

  it("handles nested objects and arrays", () => {
    const result = canonicalize({ outer: { z: [3, 1, 2], a: "x" } } as any);
    expect(result).toBe('{"outer":{"a":"x","z":[3,1,2]}}');
  });

  it("escapes control characters in strings", () => {
    const result = canonicalize({ msg: "line1\nline2\ttab" } as any);
    expect(result).toBe('{"msg":"line1\\nline2\\ttab"}');
  });

  it("handles null, true, false", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(false)).toBe("false");
  });
});

describe("WVC Manifest Hash (PRD §12.1)", () => {
  it("produces a sha256-prefixed hash", () => {
    const manifest = buildManifestObject({
      appId: "test-app",
      imageUrl: "ghcr.io/wrankey/signer:v1@sha256:abc",
      executablePath: "/app/signer",
      executableArgs: ["--port", "3000"],
      executableDigest: "sha256:def",
      expectedPcr0: "a1",
      expectedPcr1: "b2",
      expectedPcr2: "c3",
      ingressPort: 3000,
      healthPort: 3000,
      cpuCount: 2,
      memoryMib: 1024,
      replicaCount: 3,
      requiredApprovals: 2,
      approvers: ["op1", "op2"],
      allowedUpgradeFrom: [],
    });
    const hash = computeManifestHash(manifest);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces the same hash for identical manifests (ignoring created_at)", () => {
    const base = {
      appId: "x", imageUrl: "img", executablePath: "/p", executableArgs: [],
      executableDigest: "d", expectedPcr0: "0", expectedPcr1: "1", expectedPcr2: "2",
      ingressPort: 3000, healthPort: 3000, cpuCount: 2, memoryMib: 1024, replicaCount: 3,
      requiredApprovals: 2, approvers: [], allowedUpgradeFrom: [],
    };
    const m1 = buildManifestObject(base);
    const m2 = buildManifestObject(base);
    // created_at will differ by milliseconds potentially, so strip it for comparison
    delete (m1 as any).created_at;
    delete (m2 as any).created_at;
    expect(computeManifestHash(m1)).toBe(computeManifestHash(m2));
  });

  it("produces different hashes for different manifests", () => {
    const base = {
      appId: "x", imageUrl: "img", executablePath: "/p", executableArgs: [],
      executableDigest: "d", expectedPcr0: "0", expectedPcr1: "1", expectedPcr2: "2",
      ingressPort: 3000, healthPort: 3000, cpuCount: 2, memoryMib: 1024, replicaCount: 3,
      requiredApprovals: 2, approvers: [], allowedUpgradeFrom: [],
    };
    const m1 = buildManifestObject(base);
    const m2 = buildManifestObject({ ...base, executableDigest: "different" });
    delete (m1 as any).created_at;
    delete (m2 as any).created_at;
    expect(computeManifestHash(m1)).not.toBe(computeManifestHash(m2));
  });
});
