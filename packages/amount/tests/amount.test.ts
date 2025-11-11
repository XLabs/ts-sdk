import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Amount } from "../src/amount.js";
import { Rational } from "../src/rational.js";
import { Conversion } from "../src/conversion.js";

const BTC = {
  name: "BTC",
  units: [
    { symbol: "satoshi", scale: 1n },
    { symbol: "BTC", scale: 100_000_000n },
  ] as const,
  human: "BTC",
  atomic: "satoshi",
} as const;

const USD = {
  name: "USD",
  units: [
    { symbol: "cent", scale: 1n },
    { symbol: "USD", scale: 100n },
  ] as const,
  human: "USD",
  atomic: "cent",
} as const;

describe("Amount", () => {
  describe("creation", () => {
    it("creates from number", () => {
      const amount = Amount.from(1, BTC);
      assert(amount);
    });

    it("creates from bigint", () => {
      const amount = Amount.from(1n, BTC);
      assert(amount);
    });

    it("creates from Rational", () => {
      const amount = Amount.from(Rational.from(1n, 2n), BTC);
      assert(amount);
    });

    it("creates from string", () => {
      const amount = Amount.from("1.50", BTC, "satoshi");
      assert(amount);
    });

    it("creates with specific unit", () => {
      const amount = Amount.from(1, BTC, "satoshi");
      assert(amount);
    });

    it("creates with ofKind", () => {
      const amount = Amount.ofKind(BTC)(1);
      assert(amount);
    });
  });

  describe("string representation", () => {
    it("default stringification", () => {
      const amount = Amount.from(1, BTC);
      assert.strictEqual(amount.toString(), "1 BTC");
    });

    it("toJSON representation", () => {
      const amount = Amount.from(1, BTC);
      assert.strictEqual(amount.toJSON(), "1 BTC");
    });

    it("stringification without human unit", () => {
      const satoshi = {
        name: "satoshi",
        units: [
          { symbol: "satoshi", scale: 1n },
        ],
        atomic: "satoshi",
      } as const;
      const amount = Amount.from(150_000_000n, satoshi, "satoshi");
      assert.strictEqual(amount.toString(), "150000000 satoshi");
    });

    it("custom stringification", () => {
      const customBTC = {
        ...BTC,
        stringify: (value: Rational) => `${value.div(10**8).toFixed(8)} CUSTOM`,
      };
      const amount = Amount.from(1.5, customBTC);
      assert.strictEqual(amount.toString(), "1.50000000 CUSTOM");
    });
  });

  describe("conversion", () => {
    it("converts to specific units", () => {
      const amount = Amount.from(1, BTC);
      assert.deepStrictEqual(amount.toUnit("satoshi").unwrap(), [100_000_000n, 1n]);
      assert.deepStrictEqual(amount.toUnit("BTC").unwrap(), [1n, 1n]);
    });

    it("converts to atomic", () => {
      const amount = Amount.from(1, BTC);
      assert.strictEqual(amount.toUnit("atomic"), 100_000_000n);
    });

    it("converts to human", () => {
      const amount = Amount.from(100_000_000n, BTC, "satoshi");
      assert.deepStrictEqual(amount.toUnit("human").unwrap(), [1n, 1n]);
    });

    it("converts between kinds", () => {
      const btcToUsd = Conversion.from(Rational.from(50_000n, 1n), USD, BTC);
      const amount = Amount.from(1n, BTC);
      const converted = amount.convert(btcToUsd);
      assert.deepStrictEqual(converted.toUnit("human").unwrap(), [50_000n, 1n]);
    });

    it("throws on kind mismatch during conversion", () => {
      const btcToUsd = Conversion.from(Rational.from(50_000n, 1n), USD, BTC);
      const amount = Amount.from(1n, USD);
      assert.throws(() => amount.convert(btcToUsd as any), /Kind mismatch: USD vs BTC/);
    });

    it("floors to specific unit", () => {
      const amount = Amount.from(1.7, BTC);
      const floored = amount.floorTo("BTC");
      assert.deepStrictEqual(floored.toUnit("BTC"), Rational.from(1));
    });

    it("ceils to specific unit", () => {
      const amount = Amount.from(1.3, BTC);
      const ceiled = amount.ceilTo("BTC");
      assert.deepStrictEqual(ceiled.toUnit("BTC"), Rational.from(2));
    });

    it("floors to atomic unit", () => {
      const amount = Amount.from(Rational.from(150_000_000n, 1n).add(Rational.from(7n, 10n)), BTC, "satoshi");
      const floored = amount.floorTo("satoshi");
      assert.strictEqual(floored.toUnit("atomic"), 150_000_000n);
    });

    it("ceils to atomic unit", () => {
      const amount = Amount.from(Rational.from(150_000_000n, 1n).add(Rational.from(3n, 10n)), BTC, "satoshi");
      const ceiled = amount.ceilTo("atomic");
      assert.strictEqual(ceiled.toUnit("atomic"), 150_000_001n);
    });

    it("floors to human unit", () => {
      const amount = Amount.from(1.7, USD);
      const floored = amount.floorTo("human");
      assert.deepStrictEqual(floored.toUnit("human"), Rational.from(1));
    });

    it("ceils to human unit", () => {
      const amount = Amount.from(1.3, USD);
      const ceiled = amount.ceilTo("human");
      assert.deepStrictEqual(ceiled.toUnit("human"), Rational.from(2));
    });
  });

  describe("standardUnit", () => {
    it("returns the first unit", () => {
      const amount = Amount.from(1, BTC);
      assert.deepStrictEqual(amount.standardUnit(), { symbol: "satoshi", scale: 1n });
    });
  });

  describe("arithmetic", () => {
    it("addition", () => {
      const a1 = Amount.from(1, BTC);
      const a2 = Amount.from(2, BTC);
      const sum = a1.add(a2);
      assert.deepStrictEqual(sum.toUnit("BTC").unwrap(), [3n, 1n]);
    });

    it("subtraction", () => {
      const a1 = Amount.from(2, BTC);
      const a2 = Amount.from(1, BTC);
      const diff = a1.sub(a2);
      assert.deepStrictEqual(diff.toUnit("BTC").unwrap(), [1n, 1n]);
    });

    it("multiplication", () => {
      const amount = Amount.from(2, BTC);
      const product = amount.mul(2);
      assert.deepStrictEqual(product.toUnit("BTC").unwrap(), [4n, 1n]);
    });

    it("division", () => {
      const amount = Amount.from(4, BTC);
      const quotient = amount.div(2);
      assert.deepStrictEqual(quotient.toUnit("BTC").unwrap(), [2n, 1n]);
    });

    it("throws on kind mismatch", () => {
      const btc = Amount.from(1, BTC);
      const usd = Amount.from(1, USD);
      // @ts-expect-error | Disallowed by type system but possible at runtime
      assert.throws(() => btc.add(usd), /Kind mismatch: BTC vs USD/);
    });
  });

  describe("comparison", () => {
    it("equality", () => {
      const a1 = Amount.from(1, BTC);
      const a2 = Amount.from(1, BTC);
      const a3 = Amount.from(2, BTC);
      assert(a1.eq(a2));
      assert(!a1.eq(a3));
    });

    it("inequality", () => {
      const a1 = Amount.from(1, BTC);
      const a2 = Amount.from(2, BTC);
      assert(a1.ne(a2));
    });

    it("greater than", () => {
      const a1 = Amount.from(2, BTC);
      const a2 = Amount.from(1, BTC);
      assert(a1.gt(a2));
      assert(!a2.gt(a1));
    });

    it("less than", () => {
      const a1 = Amount.from(1, BTC);
      const a2 = Amount.from(2, BTC);
      assert(a1.lt(a2));
      assert(!a2.lt(a1));
    });

    it("greater than or equal", () => {
      const a1 = Amount.from(2, BTC);
      const a2 = Amount.from(1, BTC);
      const a3 = Amount.from(2, BTC);
      assert(a1.ge(a2));
      assert(!a2.ge(a1));
      assert(a1.ge(a3));
    });

    it("less than or equal", () => {
      const a1 = Amount.from(1, BTC);
      const a2 = Amount.from(2, BTC);
      const a3 = Amount.from(1, BTC);
      assert(a1.le(a2));
      assert(!a2.le(a1));
      assert(a1.le(a3));
    });
  });
});

