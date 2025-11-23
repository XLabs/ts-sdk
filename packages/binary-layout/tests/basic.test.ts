import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  type Layout,
  serialize,
  deserialize,
} from "../src";

const numberSizes = [1, 2, 3, 4, 5, 6] as const;
const bigintSizes = [7, 8, 10, 12, 16, 32] as const;

describe('Basic Layout Tests', () => {
  it("should serialize and deserialize uint8", () => {
    const layout = {
      binary: "uint",
      size: 1
    } as const satisfies Layout;

    const value = 42;
    const encoded = serialize(layout, value);
    assert.strictEqual(encoded.length, 1);
    assert.strictEqual(encoded[0], 42);

    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded, value);
  });

  it("should serialize and deserialize uint64le", () => {
    const layout = {
      binary: "uint",
      size: 8,
      endianness: "little"
    } as const satisfies Layout;

    const value = 42n;
    const encoded = serialize(layout, value);
    assert(encoded instanceof Uint8Array);
    assert.strictEqual(encoded.length, layout.size);
    assert.strictEqual(encoded[0], Number(value));
    for (let i = 1; i < layout.size; ++i) {
      assert.strictEqual(encoded[i], 0);
    }

    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded, value);
  });

  for (const size of numberSizes) {
    it(`should throw for out of bounds uint numbers (size=${size})`, () => {
      const layout = { binary: "uint", size } as const;
      const max = 2 ** (8 * size) - 1;

      assert.doesNotThrow(() => serialize(layout, max));
      assert.throws(() => serialize(layout, max + 1));
      assert.throws(() => serialize(layout, -1));
    });
  }

  for (const size of numberSizes) {
    it(`should throw for out of bounds int numbers (size=${size})`, () => {
      const layout = { binary: "int", size } as const;
      const upper = 2 ** (8 * size - 1) - 1;
      const lower = -upper - 1;

      assert.doesNotThrow(() => serialize(layout, upper));
      assert.throws(() => serialize(layout, upper + 1));
      assert.doesNotThrow(() => serialize(layout, lower));
      assert.throws(() => serialize(layout, lower - 1));
    });
  }

  for (const size of bigintSizes) {
    it(`should throw for out of bounds uint bigints (size=${size})`, () => {
      const layout = { binary: "uint", size } as const;
      const max = 2n ** (8n * BigInt(size)) - 1n;

      assert.doesNotThrow(() => serialize(layout, max));
      assert.throws(() => serialize(layout, max + 1n));
      assert.throws(() => serialize(layout, -1n));
    });
  }

  for (const size of bigintSizes) {
    it(`should throw for out of bounds int bigints (size=${size})`, () => {
      const layout = { binary: "int", size } as const;
      const upper = 2n ** (8n * BigInt(size) - 1n) - 1n;
      const lower = -upper - 1n;

      assert.doesNotThrow(() => serialize(layout, upper));
      assert.throws(() => serialize(layout, upper + 1n));
      assert.doesNotThrow(() => serialize(layout, lower));
      assert.throws(() => serialize(layout, lower - 1n));
    });
  }

  it("should handle string conversion", () => {
    const stringConversion = {
      to: (encoded: Uint8Array) => new TextDecoder().decode(encoded),
      from: (decoded: string) => new TextEncoder().encode(decoded),
    } as const;

    const layout = {
      binary: "bytes",
      lengthSize: 1,
      custom: stringConversion
    } as const satisfies Layout;

    const value = "Hello, World!";
    const encoded = serialize(layout, value);
    assert(encoded instanceof Uint8Array);
    assert.strictEqual(encoded.length, layout.lengthSize + value.length);
    const decoded = deserialize(layout, encoded);

    assert.strictEqual(decoded, value);
  });
});