import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Layout, DeriveType } from "../src";
import {
  type DeriveTuple,
  serialize,
  deserialize,
  toTuple,
  fromTuple,
  stringConversion,
} from "../src";

const simpleLayout = [
  { name: "a", binary: "uint", size: 1 },
  { name: "b", binary: "uint", size: 2 },
  { name: "c", binary: "bytes", size: 3 },
] as const satisfies Layout;

const withOmit = [
  { name: "header", binary: "uint", size: 1, custom: 0xff, omit: true },
  { name: "x", binary: "uint", size: 2 },
  { name: "y", binary: "uint", size: 2 },
] as const satisfies Layout;

const withCustom = [
  { name: "label", binary: "bytes", lengthSize: 1, custom: stringConversion },
  { name: "value", binary: "uint", size: 4 },
] as const satisfies Layout;

describe("Tuple Utils", () => {
  describe("toTuple", () => {
    it("should extract values in layout order", () => {
      const obj: DeriveType<typeof simpleLayout> = {
        a: 1,
        b: 2,
        c: new Uint8Array([3, 4, 5]),
      };
      const tuple = toTuple(simpleLayout, obj);
      assert.strictEqual(tuple[0], 1);
      assert.strictEqual(tuple[1], 2);
      assert.deepStrictEqual(tuple[2], new Uint8Array([3, 4, 5]));
      assert.strictEqual(tuple.length, 3);
    });

    it("should skip omitted items", () => {
      const obj: DeriveType<typeof withOmit> = { x: 10, y: 20 };
      const tuple = toTuple(withOmit, obj);
      assert.strictEqual(tuple[0], 10);
      assert.strictEqual(tuple[1], 20);
      assert.strictEqual(tuple.length, 2);
    });

    it("should work with custom conversions", () => {
      const obj: DeriveType<typeof withCustom> = { label: "hello", value: 42 };
      const tuple = toTuple(withCustom, obj);
      assert.strictEqual(tuple[0], "hello");
      assert.strictEqual(tuple[1], 42);
    });
  });

  describe("fromTuple", () => {
    it("should assemble object from positional values", () => {
      const tuple: DeriveTuple<typeof simpleLayout> =
        [1, 2, new Uint8Array([3, 4, 5])];
      const obj = fromTuple(simpleLayout, tuple);
      assert.strictEqual(obj.a, 1);
      assert.strictEqual(obj.b, 2);
      assert.deepStrictEqual(obj.c, new Uint8Array([3, 4, 5]));
    });

    it("should skip omitted items", () => {
      const tuple: DeriveTuple<typeof withOmit> = [10, 20];
      const obj = fromTuple(withOmit, tuple);
      assert.strictEqual((obj as any).header, undefined);
      assert.strictEqual(obj.x, 10);
      assert.strictEqual(obj.y, 20);
    });

    it("should work with custom conversions", () => {
      const tuple: DeriveTuple<typeof withCustom> = ["hello", 42];
      const obj = fromTuple(withCustom, tuple);
      assert.strictEqual(obj.label, "hello");
      assert.strictEqual(obj.value, 42);
    });
  });

  describe("roundtrip", () => {
    it("toTuple and fromTuple should be inverses", () => {
      const obj: DeriveType<typeof simpleLayout> = {
        a: 7,
        b: 300,
        c: new Uint8Array([10, 20, 30]),
      };
      const roundtripped = fromTuple(simpleLayout, toTuple(simpleLayout, obj));
      assert.deepStrictEqual(roundtripped, obj);
    });

    it("fromTuple result should serialize correctly", () => {
      const tuple: DeriveTuple<typeof withOmit> = [10, 20];
      const obj = fromTuple(withOmit, tuple);
      const encoded = serialize(withOmit, obj);
      const decoded = deserialize(withOmit, encoded);
      assert.strictEqual(decoded.x, 10);
      assert.strictEqual(decoded.y, 20);
    });

    it("deserialized object should convert to tuple", () => {
      const original: DeriveType<typeof withCustom> = { label: "test", value: 99 };
      const encoded = serialize(withCustom, original);
      const decoded = deserialize(withCustom, encoded);
      const tuple = toTuple(withCustom, decoded);
      assert.strictEqual(tuple[0], "test");
      assert.strictEqual(tuple[1], 99);
    });
  });
});
