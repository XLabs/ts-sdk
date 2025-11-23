import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isUint8Array } from "../src/array.js";

describe("isUint8Array", () => {
  it("should return true for Uint8Array", () => {
    assert(isUint8Array(new Uint8Array([1, 2, 3])));
    assert(isUint8Array(Buffer.from([])));
  });

  it("should return false for non-Uint8Array values", () => {
    assert(!isUint8Array([]));
    assert(!isUint8Array({}));
    assert(!isUint8Array("string"));
    assert(!isUint8Array(123));
    // eslint-disable-next-line unicorn/no-null
    assert(!isUint8Array(null));
    // eslint-disable-next-line unicorn/no-useless-undefined
    assert(!isUint8Array(undefined));
  });
});
