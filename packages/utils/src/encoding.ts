import { base16 as b16, base64 as b64, base58 as b58, bech32 as be32 } from "@scure/base";
import type { RoUint8Array } from "@xlabs-xyz/const-utils";

export const stripPrefix = (prefix: string, str: string): string =>
  str.startsWith(prefix) ? str.slice(prefix.length) : str;

const isHexRegex = /^(?:0x)?[0-9a-fA-F]+$/;
export const hex = {
  isValid: (input: string): boolean =>
    isHexRegex.test(input),

  decode: (input: string): Uint8Array =>
    b16.decode(stripPrefix("0x", input).toUpperCase()),

  encode: ((input: string | RoUint8Array, prefix: boolean = false): string => {
    input = typeof input === "string" ? bytes.encode(input) : input;
    const result = b16.encode(input as Uint8Array).toLowerCase();
    return prefix ? `0x${result}` : result;
  }) as {
    (input: string | RoUint8Array, prefix: true): `0x${string}`;
    (input: string | RoUint8Array, prefix?: boolean): string;
  },
};

export const bech32 = {
  decode: (input: string): Uint8Array =>
    be32.decodeToBytes(input).bytes,

  //no encoding for bech32 for now since there's currently no need and it doesn't fit
  // the mold of the other encoding functions
};

export const base58 = {
  decode: b58.decode,

  encode: (input: string | RoUint8Array): string =>
    b58.encode(typeof input === "string" ? bytes.encode(input) : input as Uint8Array),
};

const isB64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const base64 = {
  isValid: (input: string): boolean => isB64Regex.test(input),

  decode: b64.decode,

  encode: (input: string | RoUint8Array): string =>
    b64.encode(typeof input === "string" ? bytes.encode(input) : input as Uint8Array),
};

export const bignum = {
  decode: (input: string | RoUint8Array, emptyIsZero: boolean = false): bigint => {
    if (typeof input !== "string")
      input = hex.encode(input, true);
    if (input === "" || input === "0x") {
      if (emptyIsZero)
        return 0n;
      else
        throw new Error("Invalid input");
    }
    return BigInt(input);
  },

  encode: ((input: bigint, prefix: boolean = false) =>
    bignum.toString(input, prefix)) as {
      (input: bigint, prefix: true): `0x${string}`;
      (input: bigint, prefix?: boolean): string;
    },

  toString: ((input: bigint, prefix: boolean = false): string => {
    let str = input.toString(16);
    str = str.length % 2 === 1 ? (str = "0" + str) : str;
    if (prefix) return "0x" + str;
    return str;
  }) as {
    (input: bigint, prefix: true): `0x${string}`;
    (input: bigint, prefix?: boolean): string;
  },

  toBytes: (input: bigint | number, length?: number): Uint8Array => {
    if (typeof input === "number")
      input = bignum.toBigInt(input);
    const b = hex.decode(bignum.toString(input));
    if (length === undefined)
      return b;
    if (length < b.length)
      throw new Error(`Can't fit ${input} into ${length} bytes.`);
    return bytes.zpad(b, length);
  },

  toNumber: (input: bigint): number => {
    if (input < BigInt(Number.MIN_SAFE_INTEGER) || BigInt(Number.MAX_SAFE_INTEGER) < input)
      throw new Error(`Invalid cast: ${input} out of safe integer range`);

    return Number(input);
  },

  toBigInt: (input: number): bigint => {
    if (!Number.isSafeInteger(input))
      throw new Error(`Invalid cast: ${input} out of safe integer range`);

    return BigInt(input);
  },
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const bytes = {
  encode: (value: string): Uint8Array =>
    encoder.encode(value),

  decode: (value: RoUint8Array): string =>
    decoder.decode(value as Uint8Array),

  equals: (lhs: RoUint8Array, rhs: RoUint8Array): boolean =>
    lhs.length === rhs.length && lhs.every((v, i) => v === rhs[i]),

  zpad: (arr: RoUint8Array, length: number, padStart: boolean = true): Uint8Array => {
    if (length === arr.length)
      return new Uint8Array(arr);

    if (length < arr.length)
      throw new Error(`Padded length must be >= input length`);

    const result = new Uint8Array(length);
    result.set(arr, padStart ? length - arr.length : 0);
    return result;
  },

  concat: (...args: RoUint8Array[]): Uint8Array => {
    if (args.length < 2)
      //you'd think that the language developers would be able to provide correct overloads for
      //  the constructor of Uint8Array, but no - we have to any cast or duplicate the Uint8Array
      //  constructor call in both ternary branches
      return (new Uint8Array((args.length === 1 ? args[0]! : 0) as any));

    const length = args.reduce((acc, curr) => acc + curr.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const arg of args) {
      result.set(arg, offset);
      offset += arg.length;
    }
    return result;
  },
};
