import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { stripPrefix, hex, base58, base64, bignum, bytes } from "../src/encoding.js";
import type { Size } from "../src/misc.js";

describe("stripPrefix", () => {
  it("should strip prefix", () => {
    assert.strictEqual(stripPrefix("0x", "0x1234"), "1234");
    assert.strictEqual(stripPrefix("0x", "12340x"), "12340x");
    assert.strictEqual(stripPrefix("0x", "120x34"), "120x34");
    assert.strictEqual(stripPrefix("0x", "0x"), "");
  });
});

describe("hex", () => {
  it("should validate", () => {
    assert(hex.isValid("0x1234"));
    assert(hex.isValid("1234"));
    assert(!hex.isValid("0xGHIJ"));
    assert(!hex.isValid("GHIJ"));
  });

  it("should decode", () => {
    assert.deepStrictEqual(hex.decode("0x48656c6c6f20576f726c6421"),
      new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33]),
    );
    assert.deepStrictEqual(hex.decode("48656c6c6f20576f726c6421"),
      new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33]),
    );
  });

  it("should encode from Uint8Array", () => {
    assert.strictEqual(
      hex.encode(
        new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33]),
      ),
      "48656c6c6f20576f726c6421",
    );
    assert.strictEqual(
      hex.encode(
        new Uint8Array([
          72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33,
        ]),
        true,
      ),
      "0x48656c6c6f20576f726c6421",
    );
  });

  it("should encode from string", () => {
    assert.strictEqual(hex.encode("test"), "74657374");
    assert.strictEqual(hex.encode("test", true), "0x74657374");
  });
});

describe("base58", () => {
  it("should encode", () => {
    assert.strictEqual(base58.encode("test"), "3yZe7d");
    assert.strictEqual(base58.encode(new Uint8Array([72, 101, 108, 108, 111])),
      "9Ajdvzr",
    );
  });
});

describe("base64", () => {
  it("should validate", () => {
    assert(base64.isValid("dGVzdA=="));
    assert(!base64.isValid("dGVzdA"));
    assert(!base64.isValid("dGVzdA==="));
  });

  it("should encode", () => {
    assert.strictEqual(base64.encode("test"), "dGVzdA==");
    assert.strictEqual(base64.encode(new Uint8Array([72, 101, 108, 108, 111])),
      "SGVsbG8=",
    );
  });
});

describe("bignum", () => {
  it("should decode", () => {
    assert.strictEqual(bignum.decode("0x1234"), 4660n);
    assert.deepStrictEqual(bignum.decode(new Uint8Array([0x12, 0x34])), 4660n);
    assert.strictEqual(bignum.decode("0x", true), 0n);
    assert.strictEqual(bignum.decode("", true), 0n);
    assert.throws(() => bignum.decode("0x"));
    assert.throws(() => bignum.decode(""));
  });

  it("should encode", () => {
    assert.strictEqual(bignum.encode(4660n), "1234");
    assert.strictEqual(bignum.encode(4660n, true), "0x1234");
  });

  it("should convert to string", () => {
    assert.strictEqual(bignum.toString(4660n), "1234");
    assert.strictEqual(bignum.toString(4660n, true), "0x1234");
    assert.strictEqual(bignum.toString(1n), "01");
  });

  it("should convert to bytes", () => {
    assert.deepStrictEqual(bignum.toBytes(4660n), new Uint8Array([0x12, 0x34]));
    assert.deepStrictEqual(bignum.toBytes(4660), new Uint8Array([0x12, 0x34]));
    assert.deepStrictEqual(bignum.toBytes(4660n, 4 as Size),
      new Uint8Array([0x00, 0x00, 0x12, 0x34]),
    );
    assert.throws(() => bignum.toBytes(4660n, 1 as Size));
  });

  it("should convert to number", () => {
    assert.strictEqual(bignum.toNumber(4660n), 4660);
    assert.throws(() =>
      bignum.toNumber(BigInt(Number.MAX_SAFE_INTEGER + 1)),
    );
    assert.throws(() =>
      bignum.toNumber(BigInt(Number.MIN_SAFE_INTEGER - 1)),
    );
  });

  it("should convert to bigint", () => {
    assert.strictEqual(bignum.toBigInt(4660), 4660n);
    assert.throws(() => bignum.toBigInt(Number.MIN_SAFE_INTEGER - 1));
    assert.throws(() => bignum.toBigInt(Number.MAX_SAFE_INTEGER + 1));
  });
});

describe("bytes", () => {
  it("should decode", () => {
    assert.strictEqual(bytes.decode(new Uint8Array([116, 101, 115, 116])), "test");
  });

  it("should encode", () => {
    assert.deepStrictEqual(bytes.encode("test"), new Uint8Array([116, 101, 115, 116]));
  });

  it("should check equality", () => {
    assert(bytes.equals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])));
    assert(!bytes.equals(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])));
  });

  it("should zero pad", () => {
    assert.deepStrictEqual(bytes.zpad(new Uint8Array([1, 2, 3]), 5 as Size),
      new Uint8Array([0, 0, 1, 2, 3]),
    );
    assert.deepStrictEqual(bytes.zpad(new Uint8Array([1, 2, 3]), 3 as Size),
      new Uint8Array([1, 2, 3]),
    );
    assert.deepStrictEqual(bytes.zpad(new Uint8Array([1]), 2 as Size, false),
      new Uint8Array([1, 0]),
    );
    assert.throws(() => bytes.zpad(new Uint8Array([1, 2, 3]), 2 as Size));
  });

  it("should concat", () => {
    assert.deepStrictEqual(
      bytes.concat(new Uint8Array([1, 2]), new Uint8Array([3, 4])),
      new Uint8Array([1, 2, 3, 4]),
    );
  });
});
