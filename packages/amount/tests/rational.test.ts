import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Rational } from "../src/rational.js";

describe("Rational", () => {
  describe("from", () => {
    it("creates a fresh instance from Rational", () => {
      const r = Rational.from(5n, 1n);
      assert.deepStrictEqual(Rational.from(r).unwrap(), [5n, 1n]);
      assert.notStrictEqual(Rational.from(r), r);
    });

    it("creates from bigint", () => {
      assert.deepStrictEqual(Rational.from(5n).unwrap(), [5n, 1n]);
      assert.deepStrictEqual(Rational.from(-5n).unwrap(), [-5n, 1n]);
    });

    it("creates from fraction", () => {
      assert.deepStrictEqual(Rational.from(5n, 2n).unwrap(), [5n, 2n]);
      assert.deepStrictEqual(Rational.from(-5n, 2n).unwrap(), [-5n, 2n]);
    });

    it("creates from fraction with negative denominator", () => {
      assert.deepStrictEqual(Rational.from(5n, -2n).unwrap(), [-5n, 2n]);
      assert.deepStrictEqual(Rational.from(-5n, -2n).unwrap(), [5n, 2n]);
    });

    it("creates from integer", () => {
      assert.deepStrictEqual(Rational.from(5).unwrap(), [5n, 1n]);
      assert.deepStrictEqual(Rational.from(-5).unwrap(), [-5n, 1n]);
    });

    it("creates from string", () => {
      assert.deepStrictEqual(Rational.from("5").unwrap(), [5n, 1n]);
      assert.deepStrictEqual(Rational.from("0.50").unwrap(), [1n, 2n]);
      assert.deepStrictEqual(Rational.from("-3.50").unwrap(), [-7n, 2n]);
      assert.deepStrictEqual(Rational.from("0.3333333333333333").unwrap(),
        [3333333333333333n, 10000000000000000n],
      );
    });

    it("creates from decimal with default precision", () => {
      assert.deepStrictEqual(Rational.from(0.5).unwrap(), [1n, 2n]);
      assert.deepStrictEqual(Rational.from(-0.5).unwrap(), [-1n, 2n]);
      assert.deepStrictEqual(Rational.from(0.3333333333333333).unwrap(),
        [3333333333n, 10000000000n],
      );
    });

    it("creates from decimal with custom precision", () => {
      assert.deepStrictEqual(Rational.from(0.5, 2).unwrap(), [1n, 2n]);
      assert.deepStrictEqual(Rational.from(0.3333333333333333, 0).unwrap(), [0n, 1n]);
      assert.deepStrictEqual(Rational.from(0.3333333333333333, 2).unwrap(), [33n, 100n]);
      assert.deepStrictEqual(Rational.from(0.3333333333333333, 4).unwrap(), [3333n, 10000n]);
      assert.deepStrictEqual(Rational.from(0.3333333333333333, 6).unwrap(), [333333n, 1000000n]);
    });

    it("normalizes fractions", () => {
      assert.deepStrictEqual(Rational.from(4n, 2n).unwrap(), [2n, 1n]);
      assert.deepStrictEqual(Rational.from(-4n, 2n).unwrap(), [-2n, 1n]);
      assert.deepStrictEqual(Rational.from(4n, -2n).unwrap(), [-2n, 1n]);
      assert.deepStrictEqual(Rational.from(-4n, -2n).unwrap(), [2n, 1n]);
    });

    it("throws on invalid numbers", () => {
      assert.throws(() => Rational.from(Infinity), /Invalid value/);
      assert.throws(() => Rational.from(-Infinity), /Invalid value/);
      assert.throws(() => Rational.from(Number.NaN), /Invalid value/);
    });

    it("throws on invalid strings", () => {
      assert.throws(() => Rational.from(""), /Invalid rational value/);
      assert.throws(() => Rational.from("1.2.3"), /Invalid rational value/);
      assert.throws(() => Rational.from("abcd"), /Invalid rational value/);
    });

    it("throws on invalid precision", () => {
      assert.throws(() => Rational.from(0.5, -1), /Invalid precision/);
      assert.throws(() => Rational.from(0.5, 1.5), /Invalid precision/);
      assert.throws(() => Rational.from(0.5, 16), /Invalid precision/);
    });

    it("throws if denominator is zero", () => {
      assert.throws(() => Rational.from(5n, 0n), /Denominator cannot be zero/);
    });
  });

  describe("setDefaultPrecision", () => {
    it("sets and uses default precision", () => {
      const originalPrecision = (Rational as any).defaultPrecision;
      try {
        Rational.setDefaultPrecision(4);
        assert.deepStrictEqual(Rational.from(0.3333333333333333).unwrap(), [3333n, 10000n]);
        Rational.setDefaultPrecision(6);
        assert.deepStrictEqual(Rational.from(0.3333333333333333).unwrap(), [333333n, 1000000n]);
      } finally {
        Rational.setDefaultPrecision(originalPrecision);
      }
    });

    it("throws on invalid precision", () => {
      assert.throws(() => Rational.setDefaultPrecision(-1), /Invalid precision/);
      assert.throws(() => Rational.setDefaultPrecision(1.5), /Invalid precision/);
      assert.throws(() => Rational.setDefaultPrecision(16), /Invalid precision/);
    });
  });

  describe("isInteger", () => {
    it("returns true for integers", () => {
      assert(Rational.from(5n).isInteger());
      assert(Rational.from(-5n).isInteger());
      assert(Rational.from(5).isInteger());
      assert(Rational.from(-5).isInteger());
    });

    it("returns false for non-integers", () => {
      assert(!Rational.from(5n, 2n).isInteger());
      assert(!Rational.from(-5n, 2n).isInteger());
      assert(!Rational.from(0.5).isInteger());
      assert(!Rational.from(-0.5).isInteger());
    });
  });

  describe("conversion", () => {
    const half = Rational.from(1n, 2n);

    it("toNumber", () => {
      assert.strictEqual(half.toNumber(), 0.5);
    });

    it("toString", () => {
      assert.strictEqual(half.toString(), "0.5");
    });

    it("toFixed", () => {
      assert.strictEqual(half.toFixed(2), "0.50");
      assert.strictEqual(half.toFixed(), "1"); // round(0.5) -> 1
      assert.strictEqual(Rational.from( 1n, 3n).toFixed(2), "0.33");
      assert.strictEqual(Rational.from( 4n, 1n).toFixed(2), "4.00");
      assert.strictEqual(Rational.from(-1n, 4n).toFixed(2), "-0.25");
      assert.strictEqual(Rational.from(-5n, 4n).toFixed(2), "-1.25");
      assert.strictEqual(Rational.from(-4n, 1n).toFixed(2), "-4.00");
      assert.strictEqual(Rational.from(-1n, 3n).toFixed(2), "-0.33");
    });

    it("floor", () => {
      assert.strictEqual(half.floor(), 0n);
      assert.strictEqual(Rational.from(3n, 2n).floor(), 1n);
      assert.strictEqual(Rational.from(-1n, 2n).floor(), -1n);
      assert.strictEqual(Rational.from(-5n, 2n).floor(), -3n);
    });

    it("ceil", () => {
      assert.strictEqual(half.ceil(), 1n);
      assert.strictEqual(Rational.from(3n, 2n).ceil(), 2n);
      assert.strictEqual(Rational.from(-1n, 2n).ceil(), 0n);
      assert.strictEqual(Rational.from(-5n, 2n).ceil(), -2n);
    });

    it("round", () => {
      assert.strictEqual(half.round(), 1n);
      assert.strictEqual(Rational.from(1n, 4n).round(), 0n);
      assert.strictEqual(Rational.from(-1n, 2n).round(), 0n);
      assert.strictEqual(Rational.from(-5n, 2n).round(), -2n);
    });
  });

  describe("comparison", () => {
    const half = Rational.from(1n, 2n);
    const third = Rational.from(1n, 3n);

    it("equality", () => {
      assert(half.eq(Rational.from(1n, 2n)));
      assert(!half.eq(third));
      assert(half.eq(0.5));
      assert(!half.eq(1n));
    });

    it("inequality", () => {
      assert(!half.ne(Rational.from(1n, 2n)));
      assert(half.ne(third));
    });

    it("greater than", () => {
      assert(half.gt(third));
      assert(!third.gt(half));
      assert(!half.gt(0.5));
      assert(!half.gt(1n));
    });

    it("less than", () => {
      assert(!half.lt(third));
      assert(third.lt(half));
      assert(!half.lt(0.5));
      assert(half.lt(1n));
    });

    it("greater than or equal", () => {
      assert(half.ge(third));
      assert(!third.ge(half));
      assert(half.ge(0.5));
      assert(!half.ge(1n));
    });

    it("less than or equal", () => {
      assert(!half.le(third));
      assert(third.le(half));
      assert(half.le(0.5));
      assert(half.le(1n));
    });
  });

  describe("special operations", () => {
    const half = Rational.from(1n, 2n);
    const negHalf = Rational.from(-1n, 2n);

    it("abs", () => {
      assert.deepStrictEqual(half.abs().unwrap(), [1n, 2n]);
      assert.deepStrictEqual(negHalf.abs().unwrap(), [1n, 2n]);
    });

    it("neg", () => {
      assert.deepStrictEqual(half.neg().unwrap(), [-1n, 2n]);
      assert.deepStrictEqual(negHalf.neg().unwrap(), [1n, 2n]);
    });

    it("inv", () => {
      assert.deepStrictEqual(half.inv().unwrap(), [2n, 1n]);
      assert.deepStrictEqual(negHalf.inv().unwrap(), [-2n, 1n]);
      assert.throws(() => Rational.from(0).inv(), /Cannot invert zero/);
    });
  });

  describe("arithmetic", () => {
    const half = Rational.from(1n, 2n);
    const third = Rational.from(1n, 3n);

    it("addition", () => {
      assert.deepStrictEqual(half.add(third).unwrap(), [5n, 6n]);
      assert.deepStrictEqual(half.add(1).unwrap(), [3n, 2n]);
      assert.deepStrictEqual(half.add(1.5).unwrap(), [2n, 1n]);
      assert.deepStrictEqual(half.add(1n).unwrap(), [3n, 2n]);
    });

    it("subtraction", () => {
      assert.deepStrictEqual(half.sub(third).unwrap(), [1n, 6n]);
      assert.deepStrictEqual(half.sub(1).unwrap(), [-1n, 2n]);
      assert.deepStrictEqual(half.sub(1n).unwrap(), [-1n, 2n]);
    });

    it("multiplication", () => {
      assert.deepStrictEqual(half.mul(third).unwrap(), [1n, 6n]);
      assert.deepStrictEqual(half.mul(2).unwrap(), [1n, 1n]);
      assert.deepStrictEqual(half.mul(2.5).unwrap(), [5n, 4n]);
      assert.deepStrictEqual(half.mul(2n).unwrap(), [1n, 1n]);
    });

    it("division", () => {
      assert.deepStrictEqual(half.div(third).unwrap(), [3n, 2n]);
      assert.deepStrictEqual(half.div(2).unwrap(), [1n, 4n]);
      assert.deepStrictEqual(half.div(2.5).unwrap(), [1n, 5n]);
      assert.deepStrictEqual(half.div(2n).unwrap(), [1n, 4n]);
      assert.throws(() => half.div(0), /Cannot divide by zero/);
    });
  });
});

