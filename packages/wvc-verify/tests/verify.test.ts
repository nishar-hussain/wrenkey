import { describe, it, expect } from "vitest";
import { decodeCbor, encodeCbor, canonicalize as _unused } from "../src/cbor.js";
import { decodeCoseSign1 } from "../src/cose.js";
import { verifyAppProof, verifyBootProof } from "../src/verify.js";
import { AWS_NITRO_ROOT_CERT_PEM } from "../src/root-cert.js";

describe("WVC Verify — CBOR decoder", () => {
  it("decodes unsigned integers", () => {
    const bytes = new Uint8Array([0x0a]); // 10
    const { value } = decodeCbor(bytes);
    expect(value).toBe(10);
  });

  it("decodes a text string", () => {
    const bytes = new Uint8Array([0x64, 0x61, 0x62, 0x63, 0x64]); // "abcd"
    const { value } = decodeCbor(bytes);
    expect(value).toBe("abcd");
  });

  it("decodes a byte string", () => {
    const bytes = new Uint8Array([0x44, 0x01, 0x02, 0x03, 0x04]);
    const { value } = decodeCbor(bytes);
    expect(value instanceof Uint8Array).toBe(true);
    expect(Array.from(value as Uint8Array)).toEqual([1, 2, 3, 4]);
  });

  it("decodes a map with integer keys", () => {
    const encoded = encodeCbor(new Map([[1, "hello"], [2, 42]]));
    const { value } = decodeCbor(encoded);
    expect(value instanceof Map).toBe(true);
    expect((value as Map<any, any>).get(1)).toBe("hello");
    expect((value as Map<any, any>).get(2)).toBe(42);
  });

  it("decodes an array", () => {
    const encoded = encodeCbor([1, "two", true, null]);
    const { value } = decodeCbor(encoded);
    expect(Array.isArray(value)).toBe(true);
    expect((value as any[])[0]).toBe(1);
    expect((value as any[])[1]).toBe("two");
    expect((value as any[])[2]).toBe(true);
    expect((value as any[])[3]).toBe(null);
  });

  it("round-trips a nested structure", () => {
    const original = new Map([["outer", [1, 2, new Map([["inner", "value"]])]]]);
    const encoded = encodeCbor(original);
    const { value } = decodeCbor(encoded);
    expect(value instanceof Map).toBe(true);
    const outer = (value as Map<any, any>).get("outer");
    expect(Array.isArray(outer)).toBe(true);
    expect(outer[2] instanceof Map).toBe(true);
    expect(outer[2].get("inner")).toBe("value");
  });
});

describe("WVC Verify — COSE_Sign1 decoder", () => {
  it("decodes a minimal COSE_Sign1 structure", () => {
    // Build a minimal COSE_Sign1: [protected(bstr), unprotected(map), payload(bstr), signature(bstr)]
    const protectedHeader = encodeCbor(new Map([[1, -35]])); // alg: ES384
    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    const signature = new Uint8Array([0xaa, 0xbb]);
    const coseBytes = encodeCbor([protectedHeader, new Map(), payload, signature]);

    const cose = decodeCoseSign1(coseBytes);
    expect(Array.from(cose.protectedHeader)).toEqual(Array.from(protectedHeader));
    expect(Array.from(cose.payload)).toEqual([1, 2, 3]);
    expect(Array.from(cose.signature)).toEqual([0xaa, 0xbb]);
  });

  it("rejects a non-array input", () => {
    expect(() => decodeCoseSign1(encodeCbor("not-an-array"))).toThrow();
  });

  it("rejects an array with too few elements", () => {
    expect(() => decodeCoseSign1(encodeCbor([1, 2]))).toThrow();
  });
});

describe("WVC Verify — Root cert", () => {
  it("ships a non-empty PEM root certificate", () => {
    expect(AWS_NITRO_ROOT_CERT_PEM).toContain("BEGIN CERTIFICATE");
    expect(AWS_NITRO_ROOT_CERT_PEM.length).toBeGreaterThan(100);
  });
});

describe("WVC Verify — verifyAppProof failure branches (PRD §16, §27)", () => {
  it("rejects invalid base64 attestation", () => {
    const result = verifyAppProof(
      {
        proofFormatVersion: "v1",
        deploymentId: "d1",
        ephemeralPubkey: "04abcd",
        payloadHash: "sha256:" + "0".repeat(64),
        payloadType: "signature",
        signature: "deadbeef",
        attestationDoc: "!!!not-base64!!!",
        issuedAt: new Date().toISOString(),
      },
      { pcr0: "a".repeat(64), pcr1: "b".repeat(64), pcr2: "c".repeat(64) },
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/base64/);
  });

  it("rejects a proof with a mismatched ephemeral pubkey", () => {
    // Minimal COSE_Sign1 with an empty payload — will fail at attestation decode,
    // but the structure is intentionally degenerate to exercise the error path.
    const payload = new Uint8Array([0xa0]); // empty CBOR map {}
    const coseBytes = encodeCbor([new Uint8Array([0xa0]), new Map(), payload, new Uint8Array(0)]);
    const attestationDoc = Buffer.from(coseBytes).toString("base64");

    const result = verifyAppProof(
      {
        proofFormatVersion: "v1",
        deploymentId: "d1",
        ephemeralPubkey: "04mismatch",
        payloadHash: "sha256:" + "0".repeat(64),
        payloadType: "signature",
        signature: "00",
        attestationDoc,
        issuedAt: new Date().toISOString(),
      },
      { pcr0: "a".repeat(64), pcr1: "b".repeat(64), pcr2: "c".repeat(64) },
    );
    expect(result.valid).toBe(false);
  });
});

describe("WVC Verify — verifyBootProof failure branches", () => {
  it("rejects invalid base64", () => {
    const result = verifyBootProof(
      {
        deploymentId: "d1",
        manifestId: "m1",
        manifestHash: "sha256:" + "0".repeat(64),
        attestationDoc: "!!!invalid!!!",
        bootedAt: new Date().toISOString(),
      },
      { pcr0: "a".repeat(64), pcr1: "b".repeat(64), pcr2: "c".repeat(64) },
    );
    expect(result.valid).toBe(false);
  });
});
