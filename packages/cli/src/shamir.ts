/**
 * Shamir Secret Sharing over GF(256) — TypeScript port of the Rust implementation.
 *
 * Splits a 32-byte secret into N shares with threshold K.
 * Any K shares can reconstruct the secret; fewer reveal nothing.
 *
 * Used by the WVC CLI for Quorum Key backup and recovery (PRD §18.4).
 */

import { randomBytes } from "crypto";

/** GF(256) multiplication using the AES polynomial (x^8 + x^4 + x^3 + x + 1 = 0x11b) */
function gf256Mul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

/** GF(256) inverse using brute force (fine for 256 elements) */
function gf256Inv(a: number): number {
  if (a === 0) return 0;
  for (let i = 1; i < 256; i++) {
    if (gf256Mul(a, i) === 1) return i;
  }
  return 0;
}

/** A Shamir share: (x, y) where y = p(x) for the sharing polynomial p */
export interface Share {
  index: number; // x coordinate (1..N)
  data: Uint8Array; // y coordinates (32 bytes)
}

/**
 * Split a 32-byte secret into N shares with threshold K.
 * Any K shares can reconstruct the secret; fewer reveal nothing.
 */
export function generateShares(secret: Uint8Array, threshold: number, total: number): Share[] {
  if (threshold <= 0 || threshold > total) throw new Error("Invalid threshold");
  if (secret.length !== 32) throw new Error("Secret must be 32 bytes");

  // Coefficients: [threshold] rows x 32 bytes
  const coeffs: Uint8Array[] = [secret];
  for (let i = 1; i < threshold; i++) {
    coeffs.push(Uint8Array.from(randomBytes(32)));
  }

  // Evaluate the polynomial at x=1, 2, ..., total for each byte
  const shares: Share[] = [];
  for (let x = 1; x <= total; x++) {
    const y = new Uint8Array(32);
    for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
      // Horner's method: y[byteIdx] = a0 + a1*x + a2*x^2 + ...
      let acc = coeffs[threshold - 1][byteIdx];
      for (let d = threshold - 2; d >= 0; d--) {
        acc = gf256Mul(acc, x) ^ coeffs[d][byteIdx];
      }
      y[byteIdx] = acc;
    }
    shares.push({ index: x, data: y });
  }

  return shares;
}

/**
 * Reconstruct the secret from at least `threshold` shares using
 * Lagrange interpolation at x=0.
 */
export function recoverSecret(shares: Share[]): Uint8Array | null {
  if (shares.length === 0) return null;
  const n = shares.length;
  const secret = new Uint8Array(32);

  for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
    // Lagrange interpolation at x=0:
    // S = sum_j y_j * prod_{m != j} (0 - x_m) / (x_j - x_m)
    // In GF(256): subtraction = XOR, so (0 - x_m) = x_m, (x_j - x_m) = x_j XOR x_m
    let sum = 0;

    for (let j = 0; j < n; j++) {
      const xj = shares[j].index;
      const yjByte = shares[j].data[byteIdx];

      // Compute L_j(0) = prod_{m != j} x_m * inv(x_j XOR x_m)
      let lagrange = 1;
      for (let m = 0; m < n; m++) {
        if (m === j) continue;
        const xm = shares[m].index;
        const denom = xj ^ xm;
        if (denom === 0) return null;
        lagrange = gf256Mul(lagrange, gf256Mul(xm, gf256Inv(denom)));
      }

      sum ^= gf256Mul(yjByte, lagrange);
    }

    secret[byteIdx] = sum;
  }

  return secret;
}

/** Serialize shares to JSON for file storage */
export function serializeShares(shares: Share[]): string {
  return JSON.stringify(
    shares.map((s) => ({
      index: s.index,
      share: Buffer.from(s.data).toString("hex"),
    })),
    null,
    2,
  );
}

/** Deserialize shares from JSON file content */
export function deserializeShares(json: string): Share[] {
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("Invalid shares file: expected array");
  return arr.map((s: any) => ({
    index: s.index ?? s.x ?? 0,
    data: new Uint8Array(Buffer.from(s.share ?? s.y ?? "", "hex")),
  }));
}
