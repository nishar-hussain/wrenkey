/**
 * Minimal CBOR (RFC 8949) decoder.
 *
 * Implements the subset of CBOR needed to decode AWS Nitro attestation documents
 * and COSE_Sign1 structures: unsigned/signed ints, byte strings, text strings,
 * arrays, maps, tags, simple values, and floats. No indefinite-length encoding
 * is produced by the Nitro NSM, but the break-terminator is handled defensively.
 */

type CborValue =
  | number
  | bigint
  | string
  | Uint8Array
  | boolean
  | null
  | undefined
  | CborValue[]
  | Map<CborValue, CborValue>
  | { tag: number; value: CborValue };

const EMPTY = new Uint8Array(0);

export function decodeCbor(input: Uint8Array, offset = 0): { value: CborValue; offset: number } {
  if (offset >= input.length) throw new Error("CBOR: unexpected end of input");

  const firstByte = input[offset++];
  const majorType = firstByte >> 5;
  const additionalInfo = firstByte & 0x1f;

  let argument: number | bigint;
  if (additionalInfo < 24) {
    argument = additionalInfo;
  } else if (additionalInfo === 24) {
    argument = input[offset++];
  } else if (additionalInfo === 25) {
    argument = (input[offset] << 8) | input[offset + 1];
    offset += 2;
  } else if (additionalInfo === 26) {
    argument = (input[offset] * 0x1000000) + ((input[offset + 1] << 16) | (input[offset + 2] << 8) | input[offset + 3]);
    offset += 4;
  } else if (additionalInfo === 27) {
    let big = BigInt(input[offset]) * 0x100000000000000n +
      BigInt(input[offset + 1]) * 0x10000000000n +
      BigInt(input[offset + 2]) * 0x100000000n +
      BigInt(input[offset + 3]) * 0x1000000n +
      BigInt(input[offset + 4]) * 0x10000n +
      BigInt(input[offset + 5]) * 0x100n +
      BigInt(input[offset + 6]);
    big = BigInt.asUintN(64, big);
    argument = big;
    offset += 8;
  } else if (additionalInfo === 31) {
    argument = -1;
  } else {
    throw new Error(`CBOR: reserved additional info ${additionalInfo}`);
  }

  switch (majorType) {
    case 0: {
      if (typeof argument === "bigint") return { value: argument, offset };
      return { value: argument as number, offset };
    }
    case 1: {
      const val = typeof argument === "bigint" ? argument : BigInt(argument);
      return { value: -1n - val, offset };
    }
    case 2: {
      if (argument === -1) {
        const { value, offset: next } = readIndefiniteByteString(input, offset);
        return { value, offset: next };
      }
      const len = Number(argument);
      const value = input.subarray(offset, offset + len);
      return { value: new Uint8Array(value), offset: offset + len };
    }
    case 3: {
      if (argument === -1) {
        const { value, offset: next } = readIndefiniteTextString(input, offset);
        return { value, offset: next };
      }
      const len = Number(argument);
      const value = new TextDecoder().decode(input.subarray(offset, offset + len));
      return { value, offset: offset + len };
    }
    case 4: {
      if (argument === -1) {
        const arr: CborValue[] = [];
        while (true) {
          if (offset >= input.length) throw new Error("CBOR: unterminated indefinite array");
          if (input[offset] === 0xff) { offset++; break; }
          const { value, offset: next } = decodeCbor(input, offset);
          arr.push(value); offset = next;
        }
        return { value: arr, offset };
      }
      const len = Number(argument);
      const arr: CborValue[] = [];
      for (let i = 0; i < len; i++) {
        const { value, offset: next } = decodeCbor(input, offset);
        arr.push(value); offset = next;
      }
      return { value: arr, offset };
    }
    case 5: {
      if (argument === -1) {
        const map = new Map<CborValue, CborValue>();
        while (true) {
          if (offset >= input.length) throw new Error("CBOR: unterminated indefinite map");
          if (input[offset] === 0xff) { offset++; break; }
          const { value: key, offset: kNext } = decodeCbor(input, offset);
          const { value: val, offset: vNext } = decodeCbor(input, kNext);
          map.set(key, val); offset = vNext;
        }
        return { value: map, offset };
      }
      const len = Number(argument);
      const map = new Map<CborValue, CborValue>();
      for (let i = 0; i < len; i++) {
        const { value: key, offset: kNext } = decodeCbor(input, offset);
        const { value: val, offset: vNext } = decodeCbor(input, kNext);
        map.set(key, val); offset = vNext;
      }
      return { value: map, offset };
    }
    case 6: {
      const { value, offset: next } = decodeCbor(input, offset);
      return { value: { tag: Number(argument), value }, offset: next };
    }
    case 7: {
      if (argument === 20) return { value: false, offset };
      if (argument === 21) return { value: true, offset };
      if (argument === 22) return { value: null, offset };
      if (argument === 23) return { value: undefined, offset };
      if (additionalInfo === 25) {
        const view = new DataView(input.buffer, input.byteOffset + offset - 2, 2);
        return { value: halfFloatToNumber(view.getUint16(0)), offset };
      }
      if (additionalInfo === 26) {
        const view = new DataView(input.buffer, input.byteOffset + offset - 4, 4);
        return { value: view.getFloat32(0), offset };
      }
      if (additionalInfo === 27) {
        const view = new DataView(input.buffer, input.byteOffset + offset - 8, 8);
        return { value: view.getFloat64(0), offset };
      }
      return { value: argument as number, offset };
    }
    default:
      throw new Error(`CBOR: unknown major type ${majorType}`);
  }
}

function readIndefiniteByteString(input: Uint8Array, offset: number): { value: Uint8Array; offset: number } {
  const chunks: Uint8Array[] = [];
  while (true) {
    if (offset >= input.length) throw new Error("CBOR: unterminated indefinite byte string");
    if (input[offset] === 0xff) { offset++; break; }
    const { value, offset: next } = decodeCbor(input, offset);
    if (!(value instanceof Uint8Array)) throw new Error("CBOR: non-byte-string chunk in indefinite byte string");
    chunks.push(value); offset = next;
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const c of chunks) { out.set(c, i); i += c.length; }
  return { value: out, offset };
}

function readIndefiniteTextString(input: Uint8Array, offset: number): { value: string; offset: number } {
  const chunks: string[] = [];
  while (true) {
    if (offset >= input.length) throw new Error("CBOR: unterminated indefinite text string");
    if (input[offset] === 0xff) { offset++; break; }
    const { value, offset: next } = decodeCbor(input, offset);
    if (typeof value !== "string") throw new Error("CBOR: non-text chunk in indefinite text string");
    chunks.push(value); offset = next;
  }
  return { value: chunks.join(""), offset };
}

function halfFloatToNumber(raw: number): number {
  const sign = (raw & 0x8000) >> 15;
  const exp = (raw & 0x7c00) >> 10;
  const frac = raw & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * frac * 2 ** -24;
  if (exp === 0x1f) return frac ? NaN : (sign ? -Infinity : Infinity);
  return (sign ? -1 : 1) * 2 ** (exp - 15) * (1 + frac * 2 ** -10);
}

/** Encode a value to CBOR bytes (minimal encoder for building Sig_structure). */
export function encodeCbor(value: CborValue): Uint8Array {
  const parts: number[] = [];
  encodeInto(value, parts);
  return new Uint8Array(parts);
}

function encodeHead(majorType: number, arg: number, out: number[]) {
  const mt = majorType << 5;
  if (arg < 24) {
    out.push(mt | arg);
  } else if (arg < 0x100) {
    out.push(mt | 24, arg);
  } else if (arg < 0x10000) {
    out.push(mt | 25, (arg >> 8) & 0xff, arg & 0xff);
  } else if (arg < 0x100000000) {
    out.push(mt | 26, (arg >>> 24) & 0xff, (arg >> 16) & 0xff, (arg >> 8) & 0xff, arg & 0xff);
  } else {
    const hi = Math.floor(arg / 0x100000000);
    const lo = arg % 0x100000000;
    out.push(mt | 27, ...bytesOf(hi, 4), ...bytesOf(lo, 4));
  }
}

function bytesOf(n: number, len: number): number[] {
  const out: number[] = [];
  for (let i = len - 1; i >= 0; i--) out.push((n >> (i * 8)) & 0xff);
  return out;
}

function encodeInto(value: CborValue, out: number[]) {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0) {
      encodeHead(0, value, out);
    } else {
      out.push(0xfb);
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, value);
      out.push(...new Uint8Array(buf));
    }
    return;
  }
  if (typeof value === "bigint") {
    if (value >= 0n) {
      out.push(0x1b);
      const b = BigInt.asUintN(64, value);
      for (let i = 7; i >= 0; i--) out.push(Number((b >> BigInt(i * 8)) & 0xffn));
    } else {
      const mag = -1n - value;
      out.push(0x3b);
      for (let i = 7; i >= 0; i--) out.push(Number((mag >> BigInt(i * 8)) & 0xffn));
    }
    return;
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    encodeHead(3, bytes.length, out);
    out.push(...bytes);
    return;
  }
  if (value instanceof Uint8Array) {
    encodeHead(2, value.length, out);
    out.push(...value);
    return;
  }
  if (Array.isArray(value)) {
    encodeHead(4, value.length, out);
    for (const item of value) encodeInto(item, out);
    return;
  }
  if (value instanceof Map) {
    encodeHead(5, value.size, out);
    for (const [k, v] of value) { encodeInto(k, out); encodeInto(v, out); }
    return;
  }
  if (value === null) { out.push(0xf6); return; }
  if (value === true) { out.push(0xf5); return; }
  if (value === false) { out.push(0xf4); return; }
  if (value === undefined) { out.push(0xf7); return; }
  throw new Error("CBOR: cannot encode value of type " + typeof value);
}

/** Helper: get a value from a CBOR map keyed by string or number. */
export function mapGet(map: Map<CborValue, CborValue> | undefined, key: string | number): CborValue | undefined {
  if (!map) return undefined;
  return map.get(key as CborValue);
}

export { EMPTY };
export type { CborValue };
