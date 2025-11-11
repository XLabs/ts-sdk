import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  bigintReplacer,
  bigintReviver,
  serializeBigints,
  deserializeBigints,
  stringifyWithBigints,
  parseWithBigints,
  type SerializedBigint,
} from "../src/bigintJson.js";

describe("BigInt Serialization", () => {
  const testData = {
    userBalance: 1000000000000000000n,
    nonce: 42n,
    deadline: 1703980800n,
    metadata: {
      chainId: 1n,
      amounts: [100n, 200n, 300n],
    },
    regularString: "hello",
    regularNumber: 123,
    regularBoolean: true,
  };

  describe("bigintReplacer", () => {
    it("should convert BigInt to SerializedBigint", () => {
      const result = bigintReplacer("test", 123n);
      assert.deepStrictEqual(result, {
        $type: "bigint",
        value: "123",
      } satisfies SerializedBigint);
    });

    it("should leave non-BigInt values unchanged", () => {
      assert.strictEqual(bigintReplacer("test", "string"), "string");
      assert.strictEqual(bigintReplacer("test", 123), 123);
      assert(bigintReplacer("test", true));
      assert.strictEqual(bigintReplacer("test", null), null);
    });
  });

  describe("bigintReviver", () => {
    it("should convert SerializedBigint back to BigInt", () => {
      const serialized: SerializedBigint = {
        $type: "bigint",
        value: "123",
      };
      const result = bigintReviver("test", serialized);
      assert.strictEqual(result, 123n);
      assert.strictEqual(typeof result, "bigint");
    });

    it("should leave non-SerializedBigint values unchanged", () => {
      assert.strictEqual(bigintReviver("test", "string"), "string");
      assert.strictEqual(bigintReviver("test", 123), 123);
      assert(bigintReviver("test", true));
      assert.strictEqual(bigintReviver("test", null), null);
    });

    it("should not convert objects that look like SerializedBigint but aren't", () => {
      const notSerialized = { $type: "other", value: "123" };
      assert.strictEqual(bigintReviver("test", notSerialized), notSerialized);
    });
  });

  describe("serializeBigints and deserializeBigints", () => {
    it("should serialize and deserialize complex objects with BigInts", () => {
      const serialized = serializeBigints(testData);
      const deserialized = deserializeBigints<typeof testData>(serialized);

      assert.deepStrictEqual(deserialized, testData);
      assert.strictEqual(typeof deserialized.userBalance, "bigint");
      assert.strictEqual(typeof deserialized.nonce, "bigint");
      assert.strictEqual(typeof deserialized.deadline, "bigint");
      assert.strictEqual(typeof deserialized.metadata.chainId, "bigint");
      assert(deserialized.metadata.amounts.every(amount => typeof amount === "bigint"));
    });

    it("should preserve non-BigInt values", () => {
      const serialized = serializeBigints(testData);
      const deserialized = deserializeBigints<typeof testData>(serialized);

      assert.strictEqual(deserialized.regularString, "hello");
      assert.strictEqual(deserialized.regularNumber, 123);
      assert(deserialized.regularBoolean);
    });

    it("should handle empty objects", () => {
      const empty = {};
      const serialized = serializeBigints(empty);
      const deserialized = deserializeBigints(serialized);
      assert.deepStrictEqual(deserialized, {});
    });

    it("should handle arrays with BigInts", () => {
      const arrayData = { values: [1n, 2n, 3n] };
      const serialized = serializeBigints(arrayData);
      const deserialized = deserializeBigints<typeof arrayData>(serialized);

      assert.deepStrictEqual(deserialized.values, [1n, 2n, 3n]);
      assert(deserialized.values.every(v => typeof v === "bigint"));
    });
  });

  describe("stringifyWithBigints and parseWithBigints", () => {
    it("should stringify and parse objects with BigInts", () => {
      const jsonString = stringifyWithBigints(testData);
      const parsed = parseWithBigints<typeof testData>(jsonString);

      assert.deepStrictEqual(parsed, testData);
      assert.strictEqual(typeof parsed.userBalance, "bigint");
      assert.strictEqual(typeof parsed.nonce, "bigint");
      assert.strictEqual(typeof parsed.deadline, "bigint");
    });

    it("should produce valid JSON", () => {
      const jsonString = stringifyWithBigints(testData);
      assert.doesNotThrow(() => JSON.parse(jsonString));
    });

    it("should handle primitive BigInt values", () => {
      const bigintValue = 123456789n;
      const jsonString = stringifyWithBigints(bigintValue);
      const parsed = parseWithBigints<bigint>(jsonString);

      assert.strictEqual(parsed, bigintValue);
      assert.strictEqual(typeof parsed, "bigint");
    });
  });

  describe("round-trip compatibility", () => {
    it("should maintain data integrity through multiple serialization cycles", () => {
      let current = testData;

      // Multiple round trips
      for (let i = 0; i < 3; i++) {
        const serialized = serializeBigints(current);
        current = deserializeBigints<typeof testData>(serialized);
      }

      assert.deepStrictEqual(current, testData);
    });

    it("should work with JSON.stringify/parse using replacer/reviver", () => {
      const jsonString = JSON.stringify(testData, bigintReplacer);
      const parsed = JSON.parse(jsonString, bigintReviver);

      assert.deepStrictEqual(parsed, testData);
    });
  });
});
