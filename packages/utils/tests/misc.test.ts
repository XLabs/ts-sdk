import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { definedOrThrow, throws } from "../src/misc.js";

describe("throws", () => {
  it("should return false when no error is thrown", () => {
    assert(!throws(() => {}));
  });

  it("should return true when an error is thrown", () => {
    assert(
      throws(() => {
        throw new Error("Test error");
      }),
    );
  });
});

describe("definedOrThrow", () => {
  it("should return the value if defined", () => {
    assert.strictEqual(definedOrThrow(null, "Value is undefined"), null);
    assert.strictEqual(definedOrThrow(0, "Value is undefined"), 0);
    assert.strictEqual(definedOrThrow(false, "Value is undefined"), false);
    assert.strictEqual(definedOrThrow("", "Value is undefined"), "");
  });

  it("should throw an error if the value is undefined", () => {
    assert.throws(() => definedOrThrow(undefined, "Value is undefined"),
      /Value is undefined/,
    );
  });
});
