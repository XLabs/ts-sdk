import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Amount, scalar } from "../src/amount.js";
import { kind, powerOfTen, DecimalSymbolsOf } from "../src/kind.js";
import { Rational } from "../src/rational.js";
import { Conversion } from "../src/conversion.js";
import { identifyKind } from "../src/kind.js";
import { inUnit } from "../src/format.js";

const ETH = kind(
  "ETH",
  [ { symbols: [{ symbol: "wei"  }]          },
    { symbols: [{ symbol: "Gwei" }], oom:  9 },
    { symbols: [{ symbol: "ETH"  }], oom: 18 } ],
  { human: "ETH", atomic: "wei" },
);

const USD = kind(
  "USD",
  [ { symbols: [{ symbol: "$", spacing: "compact", position: "prefix" }] },
    { symbols: [{ symbol: "c", spacing: "compact" }], oom: -2            } ],
  { human: "$", atomic: "c" },
);

const Duration = kind(
  "Duration",
  [ { symbols: [{ symbol: "second", plural: "seconds" }]                 },
    { symbols: [{ symbol: "minute", plural: "minutes" }], scale:     60n },
    { symbols: [{ symbol: "hour",   plural: "hours"   }], scale:  3_600n },
    { symbols: [{ symbol: "day",    plural: "days"    }], scale: 86_400n } ],
  { human: "second" },
);

const Percentage = scalar(kind(
  "Percentage",
  [ { symbols: [{ symbol: "x"  }]          },
    { symbols: [{ symbol: "%"  }], oom: -2 },
    { symbols: [{ symbol: "bp" }], oom: -4 } ],
  { human: "%" },
));

describe("Amount", () => {
  describe("creation", () => {
    it("creates from number", () => {
      const amount = Amount.from(1, ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 1n]);
      assert.strictEqual(amount.kind.name, "ETH");
    });

    it("creates from bigint", () => {
      const amount = Amount.from(1n, ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 1n]);
      assert.strictEqual(amount.kind.name, "ETH");
    });

    it("creates from Rational", () => {
      const amount = Amount.from(Rational.from(1n, 2n), ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 2n]);
      assert.strictEqual(amount.kind.name, "ETH");
    });

    it("creates from string", () => {
      const amount = Amount.from("1.50", ETH, "wei");
      assert.deepStrictEqual(amount.in("wei").unwrap(), [3n, 2n]);
      assert.strictEqual(amount.kind.name, "ETH");
    });

    it("creates with specific unit", () => {
      const amount = Amount.from(1, ETH, "wei");
      assert.deepStrictEqual(amount.in("wei").unwrap(), [1n, 1n]);
      assert.strictEqual(amount.kind.name, "ETH");
    });

    it("creates with ofKind", () => {
      const amount = Amount.ofKind(ETH)(1);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 1n]);
      assert.strictEqual(amount.kind.name, "ETH");
    });

    it("creates non-decimal kind", () => {
      const amount = Amount.from(90, Duration, "minute");
      assert.deepStrictEqual(amount.in("second").unwrap(), [5400n, 1n]);
    });

    it("creates zero amount", () => {
      const amount = Amount.from(0, ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [0n, 1n]);
      assert.deepStrictEqual(amount.in("atomic"), 0n);
    });

    it("creates negative amount", () => {
      const amount = Amount.from(-1, ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [-1n, 1n]);
      assert.deepStrictEqual(amount.in("atomic"), -powerOfTen(18).floor());
    });

    it("creates from negative string", () => {
      const amount = Amount.from("-1.5", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [-3n, 2n]);
    });

    it("creates from very large number", () => {
      const amount = Amount.from(powerOfTen(19).floor(), ETH, "wei");
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [10n, 1n]);
    });

    it("creates from fractional Rational", () => {
      const amount = Amount.from(Rational.from(1n, 3n), ETH);
      assert.deepStrictEqual(
        amount.in("wei").unwrap(),
        Rational.from(powerOfTen(18).floor(), 3n).unwrap()
      );
    });

    it("creates with string containing thousands separators", () => {
      const amount = Amount.from("1,000.50", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [2001n, 2n]);
    });

    it("requires unit for non-human kind", () => {
      const NoHuman = kind(
        "NoHuman",
        [{ symbols: [{ symbol: "unit" }] }],
      );
      const amount = Amount.from(1, NoHuman, "unit");
      assert.deepStrictEqual(amount.in("unit").unwrap(), [1n, 1n]);
    });
  });

  describe("isOfKind", () => {
    it("narrows amount kind", () => {
      const amt: Amount<typeof ETH | typeof USD> = Amount.from(1, ETH);
      if (!Amount.isOfKind(amt, "ETH"))
        throw new Error("unexpected");
      // After narrowing, "wei" should be valid (ETH symbol)
      assert.strictEqual(amt.in("wei").toString(), "1000000000000000000");
    });

    it("returns false for non-matching kind", () => {
      const amt: Amount<typeof ETH | typeof USD> = Amount.from(1, ETH);
      assert.strictEqual(Amount.isOfKind(amt, "USD"), false);
    });
  });

  describe("string representation", () => {
    it("default stringification", () => {
      const amount = Amount.from(1, ETH);
      assert.strictEqual(amount.toString(), "1 ETH");
    });

    it("toJSON representation", () => {
      const amount = Amount.from(1, ETH);
      assert.strictEqual(amount.toJSON(), "1 ETH");
    });

    it("stringification without human unit", () => {
      const Wei = kind(
        "wei",
        [{ symbols: [{ symbol: "wei" }] }],
        { atomic: "wei" },
      );
      const amount = Amount.from(150_000_000n, Wei, "wei");
      assert.strictEqual(amount.toString(), "150,000,000 wei");
    });

    it("non-decimal compound stringification", () => {
      const amount = Amount.from(2, Duration, "hour");
      assert.strictEqual(amount.toString(), "2 hours");

      const amount2 = Amount.from(120, Duration, "minute");
      assert.strictEqual(amount2.toString(), "2 hours");
    });

    it("stringifies zero", () => {
      const amount = Amount.from(0, ETH);
      assert.strictEqual(amount.toString(), "0 ETH");
      assert.strictEqual(amount.toJSON(), "0 ETH");
    });

    it("stringifies negative values", () => {
      const amount = Amount.from(-1, ETH);
      assert.strictEqual(amount.toString(), "-1 ETH");
      assert.strictEqual(amount.toJSON(), "-1 ETH");
    });

    it("stringifies very large values", () => {
      const amount = Amount.from(1_000_000, ETH);
      assert.strictEqual(amount.toString(), "1,000,000 ETH");
    });

    it("stringifies fractional values", () => {
      const amount = Amount.from(1.5, ETH);
      assert.strictEqual(amount.toString(), "1.5 ETH");
    });

    it("stringifies with plural forms", () => {
      const amount1 = Amount.from(1, Duration, "hour");
      assert.strictEqual(amount1.toString(), "1 hour");

      const amount2 = Amount.from(2, Duration, "hour");
      assert.strictEqual(amount2.toString(), "2 hours");
    });

    it("stringifies compound non-decimal units", () => {
      const amount = Amount.from(90_000, Duration, "second");
      assert.strictEqual(amount.toString(), "1 day 1 hour");
    });

    it("stringifies small fractional amounts", () => {
      const amount = Amount.from(0.001, ETH);
      assert.strictEqual(amount.toString(), "0.001 ETH");
    });

    it("stringifies 0.001 ETH as ETH", () => {
      const amount = Amount.from(0.001, ETH);
      assert.strictEqual(amount.toString(), "0.001 ETH");
    });

    it("stringifies 0.0001 ETH as Gwei", () => {
      const amount = Amount.from(0.0001, ETH);
      assert.strictEqual(amount.toString(), "100,000 Gwei");
    });

    it("toJSON shows more precision than toString", () => {
      const amount = Amount.from(1.123456789, ETH);
      const json = amount.toJSON();
      const str = amount.toString();
      assert(json.length >= str.length);
    });

    it("toString with explicit approximate mode", () => {
      const amount = Amount.from(1.5, ETH);
      assert.strictEqual(amount.toString("approximate"),                        "1.5 ETH");
      assert.strictEqual(amount.toString("approximate", { thousandsSep: "_" }), "1.5 ETH");
      assert.strictEqual(amount.toString("approximate", { thousandsSep: "" }),  "1.5 ETH");

      const large = Amount.from(1_234.5, ETH);
      assert.strictEqual(large.toString("approximate"),                        "1,235 ETH");
      assert.strictEqual(large.toString("approximate", { thousandsSep: "_" }), "1_235 ETH");
      assert.strictEqual(large.toString("approximate", { thousandsSep: "" }),   "1235 ETH");
    });

    it("toString with precise mode", () => {
      const amount = Amount.from(Rational.from(1_000_123_456_789n, powerOfTen(9).floor()), ETH);
      assert.strictEqual(amount.toString("precise"),                        "1,000.123456789 ETH");
      assert.strictEqual(amount.toString("precise", { thousandsSep: "_" }), "1_000.123456789 ETH");
      assert.strictEqual(amount.toString("precise", { thousandsSep: "" }),   "1000.123456789 ETH");
    });

    it("toString with inUnit mode", () => {
      const amount = Amount.from(1, ETH);
      assert.strictEqual(
        amount.toString("inUnit", "Gwei"),
        "1,000,000,000 Gwei"
      );
      assert.strictEqual(
        amount.toString("inUnit", "Gwei", { precision: 0, thousandsSep: "_" }),
        "1_000_000_000 Gwei"
      );
      assert.strictEqual(amount.toString("inUnit", "ETH",  { precision: 2 }), "1 ETH");

      const fractional = Amount.from(1.5, ETH);
      assert.strictEqual(fractional.toString("inUnit", "ETH", { precision: 2 }),      "1.5 ETH");
      assert.strictEqual(fractional.toString("inUnit", "ETH", { precision: "Gwei" }), "1.5 ETH");
    });

    it("toString with inUnit mode using meta-symbols", () => {
      const amount = Amount.from(1n, ETH);
      assert.strictEqual(amount.toString("inUnit", "human", { precision: 2 }), "1 ETH");
      assert.strictEqual(amount.toString("inUnit", "atomic"),   "1,000,000,000,000,000,000 wei");
      assert.strictEqual(amount.toString("inUnit", "standard"), "1,000,000,000,000,000,000 wei");
    });
  });

  describe("conversion", () => {
    it("converts to specific units", () => {
      const amount = Amount.from(1, ETH);
      assert.deepStrictEqual(amount.in("wei").unwrap(), [powerOfTen(18).floor(), 1n]);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 1n]);
    });

    it("converts to atomic", () => {
      const amount = Amount.from(1, ETH);
      assert.strictEqual(amount.in("atomic"), powerOfTen(18).floor());
    });

    it("converts to human", () => {
      const amount = Amount.from(powerOfTen(18).floor(), ETH, "wei");
      assert.deepStrictEqual(amount.in("human").unwrap(), [1n, 1n]);
    });

    it("converts between kinds via mul", () => {
      const usdPerEth = Conversion.from(Rational.from(50_000n, 1n), USD, ETH);
      const amount = Amount.from(1n, ETH);
      const converted = amount.mul(usdPerEth);
      assert.deepStrictEqual(converted.in("human").unwrap(), [50_000n, 1n]);
    });

    it("converts between kinds via div", () => {
      const usdPerEth = Conversion.from(Rational.from(50_000n, 1n), USD, ETH);
      const amount = Amount.from(50_000n, USD);
      const converted = amount.div(usdPerEth);
      assert.deepStrictEqual(converted.in("human").unwrap(), [1n, 1n]);
    });

    it("throws on kind mismatch during mul conversion", () => {
      const usdPerEth = Conversion.from(Rational.from(50_000n, 1n), USD, ETH);
      const amount = Amount.from(1n, USD);
      // @ts-expect-error - USD amount can't be multiplied by USD/ETH (denominator must match)
      assert.throws(() => amount.mul(usdPerEth), /Kind mismatch: USD vs ETH/);
    });

    it("throws on kind mismatch during div conversion", () => {
      const usdPerEth = Conversion.from(Rational.from(50_000n, 1n), USD, ETH);
      const amount = Amount.from(1n, ETH);
      // @ts-expect-error - ETH amount can't be divided by USD/ETH (numerator must match)
      assert.throws(() => amount.div(usdPerEth), /Kind mismatch: ETH vs USD/);
    });

    it("floors to specific unit", () => {
      const amount = Amount.from(1.7, ETH);
      const floored = amount.floorTo("ETH");
      assert.deepStrictEqual(floored.in("ETH"), Rational.from(1));
    });

    it("ceils to specific unit", () => {
      const amount = Amount.from(1.3, ETH);
      const ceiled = amount.ceilTo("ETH");
      assert.deepStrictEqual(ceiled.in("ETH"), Rational.from(2));
    });

    it("floors to atomic unit", () => {
      const value = Rational.from(3n, 2n).mul(powerOfTen(18)).add(Rational.from(7n, 10n));
      const amount = Amount.from(value, ETH, "wei");
      const floored = amount.floorTo("wei");
      assert.strictEqual(
        floored.in("atomic"),
        Rational.from(3n, 2n).mul(powerOfTen(18)).floor()
      );
    });

    it("ceils to atomic unit", () => {
      const value = Rational.from(3n, 2n).mul(powerOfTen(18)).add(Rational.from(3n, 10n));
      const amount = Amount.from(value, ETH, "wei");
      const ceiled = amount.ceilTo("atomic");
      assert.strictEqual(
        ceiled.in("atomic"),
        Rational.from(3n, 2n).mul(powerOfTen(18)).floor() + 1n
      );
    });

    it("floors to human unit", () => {
      const amount = Amount.from(1.7, USD);
      const floored = amount.floorTo("human");
      assert.deepStrictEqual(floored.in("human"), Rational.from(1));
    });

    it("ceils to human unit", () => {
      const amount = Amount.from(1.3, USD);
      const ceiled = amount.ceilTo("human");
      assert.deepStrictEqual(ceiled.in("human"), Rational.from(2));
    });

    it("converts non-decimal units", () => {
      const amount = Amount.from(2, Duration, "hour");
      assert.deepStrictEqual(amount.in("minute").unwrap(), [120n, 1n]);
      assert.deepStrictEqual(amount.in("second").unwrap(), [7200n, 1n]);
    });

    it("rounds to specific unit", () => {
      const amount = Amount.from(1.5, ETH);
      const rounded = amount.roundTo("ETH");
      assert.deepStrictEqual(rounded.in("ETH"), Rational.from(2));

      const amount2 = Amount.from(1.4, ETH);
      const rounded2 = amount2.roundTo("ETH");
      assert.deepStrictEqual(rounded2.in("ETH"), Rational.from(1));
    });

    it("rounds to atomic unit", () => {
      const value = Rational.from(3n, 2n).mul(powerOfTen(18)).add(Rational.from(5n, 10n));
      const amount = Amount.from(value, ETH, "wei");
      const rounded = amount.roundTo("atomic");
      assert.strictEqual(
        rounded.in("atomic"),
        Rational.from(3n, 2n).mul(powerOfTen(18)).floor() + 1n
      );
    });

    it("rounds to human unit", () => {
      const amount = Amount.from(1.5, USD);
      const rounded = amount.roundTo("human");
      assert.deepStrictEqual(rounded.in("human"), Rational.from(2));
    });

    it("converts zero", () => {
      const amount = Amount.from(0, ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [0n, 1n]);
      assert.deepStrictEqual(amount.in("wei").unwrap(), [0n, 1n]);
      assert.strictEqual(amount.in("atomic"), 0n);
    });

    it("converts negative values", () => {
      const amount = Amount.from(-1, ETH);
      assert.deepStrictEqual(amount.in("wei").unwrap(), [-powerOfTen(18).floor(), 1n]);
      assert.strictEqual(amount.in("atomic"), -powerOfTen(18).floor());
    });

    it("converts very large values", () => {
      const amount = Amount.from(powerOfTen(19).floor(), ETH, "wei");
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [10n, 1n]);
    });

    it("converts fractional values accurately", () => {
      const amount = Amount.from(Rational.from(1n, 3n), ETH);
      const inWei = amount.in("wei");
      assert.deepStrictEqual(inWei.unwrap(), [powerOfTen(18).floor(), 3n]);
    });

    it("converts between units with different scales", () => {
      const amount = Amount.from(1, Duration, "day");
      assert.deepStrictEqual(amount.in("hour").unwrap(), [24n, 1n]);
      assert.deepStrictEqual(amount.in("minute").unwrap(), [1440n, 1n]);
      assert.deepStrictEqual(amount.in("second").unwrap(), [86400n, 1n]);
    });
  });

  describe("arithmetic", () => {
    it("addition", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(2, ETH);
      const sum = a1.add(a2);
      assert.deepStrictEqual(sum.in("ETH").unwrap(), [3n, 1n]);
    });

    it("subtraction", () => {
      const a1 = Amount.from(2, ETH);
      const a2 = Amount.from(1, ETH);
      const diff = a1.sub(a2);
      assert.deepStrictEqual(diff.in("ETH").unwrap(), [1n, 1n]);
    });

    it("multiplication", () => {
      const amount = Amount.from(2, ETH);
      const product = amount.mul(2);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [4n, 1n]);
    });

    it("division", () => {
      const amount = Amount.from(4, ETH);
      const quotient = amount.div(2);
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [2n, 1n]);
    });

    it("throws on kind mismatch", () => {
      const btc = Amount.from(1, ETH);
      const usd = Amount.from(1, USD);
      // @ts-expect-error | Disallowed by type system but possible at runtime
      assert.throws(() => btc.add(usd), /Kind mismatch: ETH vs USD/);
    });

    it("adds zero", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(0, ETH);
      const sum = a1.add(a2);
      assert.deepStrictEqual(sum.in("ETH").unwrap(), [1n, 1n]);
    });

    it("adds negative values", () => {
      const a1 = Amount.from(5, ETH);
      const a2 = Amount.from(-3, ETH);
      const sum = a1.add(a2);
      assert.deepStrictEqual(sum.in("ETH").unwrap(), [2n, 1n]);
    });

    it("subtracts to negative result", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(2, ETH);
      const diff = a1.sub(a2);
      assert.deepStrictEqual(diff.in("ETH").unwrap(), [-1n, 1n]);
    });

    it("subtracts zero", () => {
      const a1 = Amount.from(5, ETH);
      const a2 = Amount.from(0, ETH);
      const diff = a1.sub(a2);
      assert.deepStrictEqual(diff.in("ETH").unwrap(), [5n, 1n]);
    });

    it("multiplies by zero", () => {
      const amount = Amount.from(5, ETH);
      const product = amount.mul(0);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [0n, 1n]);
    });

    it("multiplies by negative", () => {
      const amount = Amount.from(5, ETH);
      const product = amount.mul(-2);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [-10n, 1n]);
    });

    it("multiplies by Rational", () => {
      const amount = Amount.from(4, ETH);
      const product = amount.mul(Rational.from(3n, 2n));
      assert.deepStrictEqual(product.in("ETH").unwrap(), [6n, 1n]);
    });

    it("multiplies by bigint", () => {
      const amount = Amount.from(2, ETH);
      const product = amount.mul(3n);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [6n, 1n]);
    });

    it("divides by Rational", () => {
      const amount = Amount.from(6, ETH);
      const quotient = amount.div(Rational.from(3n, 2n));
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [4n, 1n]);
    });

    it("divides by bigint", () => {
      const amount = Amount.from(6, ETH);
      const quotient = amount.div(3n);
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [2n, 1n]);
    });

    it("divides by negative", () => {
      const amount = Amount.from(6, ETH);
      const quotient = amount.div(-2);
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [-3n, 1n]);
    });

    it("throws on division by zero", () => {
      const amount = Amount.from(5, ETH);
      assert.throws(() => amount.div(0), /Cannot divide by zero/);
      assert.throws(() => amount.div(0n), /Cannot divide by zero/);
    });

    it("preserves precision in arithmetic", () => {
      const a1 = Amount.from(Rational.from(1n, 3n), ETH);
      const a2 = Amount.from(Rational.from(1n, 3n), ETH);
      const sum = a1.add(a2);
      assert.deepStrictEqual(sum.in("ETH").unwrap(), [2n, 3n]);
    });

    it("throws on kind mismatch in subtraction", () => {
      const btc = Amount.from(1, ETH);
      const usd = Amount.from(1, USD);
      // @ts-expect-error | Disallowed by type system but possible at runtime
      assert.throws(() => btc.sub(usd), /Kind mismatch: ETH vs USD/);
    });
  });

  describe("scalar operations", () => {
    it("multiplies by scalar amount", () => {
      const amount = Amount.from(100, ETH);
      const percentage = Amount.from(50, Percentage, "%");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [50n, 1n]);
    });

    it("multiplies by scalar amount with decimal percentage", () => {
      const amount = Amount.from(100, ETH);
      const percentage = Amount.from(0.5, Percentage, "x");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [50n, 1n]);
    });

    it("multiplies by scalar amount with basis points", () => {
      const amount = Amount.from(100, ETH);
      const percentage = Amount.from(5000, Percentage, "bp");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [50n, 1n]);
    });

    it("divides by scalar amount", () => {
      const amount = Amount.from(50, ETH);
      const percentage = Amount.from(50, Percentage, "%");
      const quotient = amount.div(percentage);
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [100n, 1n]);
    });

    it("divides by scalar amount with decimal percentage", () => {
      const amount = Amount.from(1, ETH);
      const percentage = Amount.from(0.5, Percentage, "x");
      const quotient = amount.div(percentage);
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [2n, 1n]);
    });

    it("multiplies USD by percentage", () => {
      const amount = Amount.from(100, USD);
      const percentage = Amount.from(10, Percentage, "%");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("$").unwrap(), [10n, 1n]);
    });

    it("multiplies Duration by percentage", () => {
      const amount = Amount.from(100, Duration);
      const percentage = Amount.from(25, Percentage, "%");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("second").unwrap(), [25n, 1n]);
    });

    it("preserves precision when multiplying by scalar", () => {
      const amount = Amount.from(Rational.from(1n, 3n), ETH);
      const percentage = Amount.from(50, Percentage, "%");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [1n, 6n]);
    });

    it("preserves precision when dividing by scalar", () => {
      const amount = Amount.from(Rational.from(1n, 3n), ETH);
      const percentage = Amount.from(50, Percentage, "%");
      const quotient = amount.div(percentage);
      assert.deepStrictEqual(quotient.in("ETH").unwrap(), [2n, 3n]);
    });

    it("multiplies by zero scalar", () => {
      const amount = Amount.from(100, ETH);
      const percentage = Amount.from(0, Percentage);
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [0n, 1n]);
    });

    it("multiplies by negative scalar", () => {
      const amount = Amount.from(100, ETH);
      const percentage = Amount.from(-10, Percentage, "%");
      const product = amount.mul(percentage);
      assert.deepStrictEqual(product.in("ETH").unwrap(), [-10n, 1n]);
    });

    it("throws on division by zero scalar", () => {
      const amount = Amount.from(100, ETH);
      const percentage = Amount.from(0, Percentage);
      assert.throws(() => amount.div(percentage), /Cannot invert zero/);
    });
  });

  describe("per", () => {
    it("creates conversion from amount and kind", () => {
      const usd = Amount.from(50_000, USD);
      const conv = usd.per(ETH);
      assert.strictEqual(conv.in("$", "ETH").toString(), "50000");
    });

    it("creates conversion from two amounts", () => {
      const usd = Amount.from(50_000, USD);
      const eth = Amount.from(2, ETH);
      const conv = usd.per(eth);
      assert.strictEqual(conv.in("$", "ETH").toString(), "25000");
    });

    it("produces same result as Conversion.from", () => {
      const usd = Amount.from(50_000, USD);
      const fromPer = usd.per(ETH);
      const fromConv = Conversion.from(usd, ETH);
      assert.strictEqual(
        fromPer.in("$", "ETH").toString(),
        fromConv.in("$", "ETH").toString(),
      );
    });

    it("throws on same kind", () => {
      const eth = Amount.from(1, ETH);
      assert.throws(() => eth.per(ETH), /Must be distinct kinds: ETH vs ETH/);
    });

    it("rejects scalar kinds at type level", () => {
      const pct = Amount.from(10, Percentage);
      const eth = Amount.from(1, ETH);
      // Type-level verification only - never executed at runtime
      if (false as boolean) {
        // @ts-expect-error - scalar as numerator is not allowed
        pct.per(ETH);
        // @ts-expect-error - scalar as denominator is not allowed
        eth.per(Percentage);
      }
    });
  });

  describe("comparison", () => {
    it("equality", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(1, ETH);
      const a3 = Amount.from(2, ETH);
      assert(a1.eq(a2));
      assert(!a1.eq(a3));
    });

    it("inequality", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(2, ETH);
      assert(a1.ne(a2));
    });

    it("greater than", () => {
      const a1 = Amount.from(2, ETH);
      const a2 = Amount.from(1, ETH);
      assert(a1.gt(a2));
      assert(!a2.gt(a1));
    });

    it("less than", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(2, ETH);
      assert(a1.lt(a2));
      assert(!a2.lt(a1));
    });

    it("greater than or equal", () => {
      const a1 = Amount.from(2, ETH);
      const a2 = Amount.from(1, ETH);
      const a3 = Amount.from(2, ETH);
      assert(a1.ge(a2));
      assert(!a2.ge(a1));
      assert(a1.ge(a3));
    });

    it("less than or equal", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(2, ETH);
      const a3 = Amount.from(1, ETH);
      assert(a1.le(a2));
      assert(!a2.le(a1));
      assert(a1.le(a3));
    });

    it("compares zero", () => {
      const zero = Amount.from(0, ETH);
      const positive = Amount.from(1, ETH);
      const negative = Amount.from(-1, ETH);
      assert(zero.eq(zero));
      assert(zero.lt(positive));
      assert(zero.gt(negative));
      assert(zero.le(positive));
      assert(zero.ge(negative));
    });

    it("compares negative values", () => {
      const a1 = Amount.from(-1, ETH);
      const a2 = Amount.from(-2, ETH);
      assert(a1.gt(a2));
      assert(a2.lt(a1));
      assert(a1.ge(a2));
      assert(a2.le(a1));
    });

    it("compares across units", () => {
      const a1 = Amount.from(1, ETH);
      const a2 = Amount.from(powerOfTen(18).floor(), ETH, "wei");
      assert(a1.eq(a2));
    });

    it("compares fractional values", () => {
      const a1 = Amount.from(1.5, ETH);
      const a2 = Amount.from(1.6, ETH);
      assert(a1.lt(a2));
      assert(a2.gt(a1));
    });

    it("throws on kind mismatch", () => {
      const btc = Amount.from(1, ETH);
      const usd = Amount.from(1, USD);
      // @ts-expect-error | Disallowed by type system but possible at runtime
      assert.throws(() => btc.eq(usd), /Kind mismatch: ETH vs USD/);
      // @ts-expect-error | Disallowed by type system but possible at runtime
      assert.throws(() => btc.gt(usd), /Kind mismatch: ETH vs USD/);
    });

    it("compares very close values", () => {
      const a1 = Amount.from(Rational.from(1n, 3n), ETH);
      const a2 = Amount.from(Rational.from(1n, 3n), ETH);
      assert(a1.eq(a2));
      assert(!a1.ne(a2));
    });
  });

  describe("parsing", () => {
    it("parses simple amount string", () => {
      const amount = Amount.parse("1 ETH", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 1n]);
    });

    it("parses amount with wei", () => {
      const amount = Amount.parse(`${powerOfTen(18).floor()} wei`, ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 1n]);
    });

    it("parses negative amount", () => {
      const amount = Amount.parse("-1 ETH", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [-1n, 1n]);
    });

    it("parses fractional amount", () => {
      const amount = Amount.parse("1.5 ETH", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [3n, 2n]);
    });

    it("parses ratio amount", () => {
      const amount = Amount.parse("1/3 ETH", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1n, 3n]);
    });

    it("parses compound non-decimal amount", () => {
      const amount = Amount.parse("2 hours 30 minutes", Duration);
      assert.deepStrictEqual(amount.in("second").unwrap(), [9000n, 1n]);
    });

    it("identifies kind from string", () => {
      const kind = identifyKind([ETH, USD], "1 ETH");
      assert.strictEqual(kind?.name, "ETH");
    });

    it("returns undefined for ambiguous kind", () => {
      const Both = kind(
        "Both",
        [
          { symbols: [{ symbol: "ETH" }], oom: 18 },
          { symbols: [{ symbol: "$", spacing: "compact", position: "prefix" }], oom: 2 },
        ],
        { human: "ETH" },
      );
      const result = identifyKind([ETH, Both], "1 ETH");
      assert.strictEqual(result, undefined);
    });

    it("returns all matches when ambiguous allowed", () => {
      const Both = kind(
        "Both",
        [
          { symbols: [{ symbol: "ETH" }], oom: 18 },
        ],
        { human: "ETH" },
      );
      const matches = identifyKind([ETH, Both], "1 ETH", true);
      assert(Array.isArray(matches));
      assert(matches.length === 2);
    });

    it("throws on unparseable string", () => {
      assert.throws(
        () => Amount.parse("invalid", ETH),
        /Expected value|Could not identify kind from string/
      );
    });

    it("parses amount with thousands separators", () => {
      const amount = Amount.parse("1,000 ETH", ETH);
      assert.deepStrictEqual(amount.in("ETH").unwrap(), [1000n, 1n]);
    });
  });

  describe("formatting utilities", () => {
    it("formats in specific unit with precision", () => {
      const amount = Amount.from(1.123456789, ETH);
      const stdVal = amount.in("wei");
      const formatted = inUnit(ETH, stdVal, "ETH", 2);
      assert.strictEqual(formatted, "1.12 ETH");
    });

    it("formats with custom thousands separator", () => {
      const amount = Amount.from(1_000_000, ETH);
      const stdVal = amount.in("wei");
      const formatted = inUnit(ETH, stdVal, "ETH", 0, { thousandsSep: "_" });
      assert.strictEqual(formatted, "1_000_000 ETH");
    });

    it("formats zero in unit", () => {
      const amount = Amount.from(0, ETH);
      const stdVal = amount.in("wei");
      const formatted = inUnit(ETH, stdVal, "ETH", 0);
      assert.strictEqual(formatted, "0 ETH");
    });

    it("formats negative in unit", () => {
      const amount = Amount.from(-1, ETH);
      const stdVal = amount.in("wei");
      const formatted = inUnit(ETH, stdVal, "ETH", 0);
      assert.strictEqual(formatted, "-1 ETH");
    });
  });

  describe("powerOfTen", () => {
    it("returns 1 for oom 0", () => {
      assert.deepStrictEqual(powerOfTen(0).unwrap(), [1n, 1n]);
    });

    it("returns positive powers of ten", () => {
      assert.deepStrictEqual(powerOfTen(1).unwrap(), [10n, 1n]);
      assert.deepStrictEqual(powerOfTen(2).unwrap(), [100n, 1n]);
      assert.deepStrictEqual(powerOfTen(3).unwrap(), [1000n, 1n]);
      assert.deepStrictEqual(powerOfTen(18).unwrap(), [1_000_000_000_000_000_000n, 1n]);
    });

    it("returns negative powers of ten", () => {
      assert.deepStrictEqual(powerOfTen(-1).unwrap(), [1n, 10n]);
      assert.deepStrictEqual(powerOfTen(-2).unwrap(), [1n, 100n]);
      assert.deepStrictEqual(powerOfTen(-3).unwrap(), [1n, 1000n]);
    });

    it("handles large exponents", () => {
      assert.deepStrictEqual(powerOfTen(30).floor(), 10n**30n);
      assert.deepStrictEqual(powerOfTen(-30).unwrap(), [1n, 10n**30n]);
    });

    it("handles exponents beyond cache limit", () => {
      assert.deepStrictEqual(powerOfTen(50).floor(), 10n**50n);
      assert.deepStrictEqual(powerOfTen(-50).unwrap(), [1n, 10n**50n]);
    });
  });
});

describe("Multi-system kinds", () => {
  const inch = Rational.from(254n, powerOfTen(4).floor());

  const Length = kind(
    "Length",
    [
      ["metric", [
        { symbols: [{ symbol: "m"  }]           },
        { symbols: [{ symbol: "cm" }], oom:  -2 },
        { symbols: [{ symbol: "mm" }], oom:  -3 },
        { symbols: [{ symbol: "km" }], oom:   3 },
      ]],
      ["imperial", [
        { symbols: [{ symbol: "in" }], scale: inch              },
        { symbols: [{ symbol: "ft" }], scale: inch.mul(12)      },
        { symbols: [{ symbol: "yd" }], scale: inch.mul(36)      },
        { symbols: [{ symbol: "mi" }], scale: inch.mul(36*1760) },
      ]],
    ],
    { human: "m" },
  );

  it("creates kind with multiple systems", () => {
    assert.strictEqual(Length.name, "Length");
    assert.deepStrictEqual(Object.keys(Length.systems).sort(), ["imperial", "metric"]);
  });

  it("has all symbols from all systems in units", () => {
    assert.ok("m" in Length.units);
    assert.ok("cm" in Length.units);
    assert.ok("ft" in Length.units);
    assert.ok("mi" in Length.units);
  });

  it("tracks which symbols belong to which system", () => {
    assert.ok(Length.systems.metric.symbols.includes("m"));
    assert.ok(Length.systems.metric.symbols.includes("cm"));
    assert.ok(Length.systems.imperial.symbols.includes("ft"));
    assert.ok(Length.systems.imperial.symbols.includes("mi"));
  });

  it("tracks decimal flag per system", () => {
    assert.strictEqual(Length.systems.metric.decimal, true);
    assert.strictEqual(Length.systems.imperial.decimal, false);

    // Type-level verification: DecimalSymbolsOf only includes metric (decimal) symbols
    const _oomSymbols: DecimalSymbolsOf<typeof Length> = "m";
    const _oomSymbols2: DecimalSymbolsOf<typeof Length> = "km";
    // @ts-expect-error - "ft" is imperial (non-decimal), not in DecimalSymbolsOf
    const _notOom: DecimalSymbolsOf<typeof Length> = "ft";
  });

  it("precision-as-symbol allowed for oom units", () => {
    // Use a value with decimals to show precision effect (toFixedPoint strips trailing zeros)
    const len = Amount.from("1.2345", Length, "m");
    // precision as symbol: calculates decimals from oom difference
    // m (oom=0) with precision "cm" (oom=-2) → 0-(-2)=2 decimals → rounds to 1.23
    assert.strictEqual(len.toString("inUnit", "m", { precision: "cm" }), "1.23 m");
    // km (oom=3) with precision "m" (oom=0) → 3-0=3 decimals
    assert.strictEqual(len.toString("inUnit", "km", { precision: "m" }), "0.001 km");
    // numeric precision works for any unit
    assert.strictEqual(len.toString("inUnit", "ft", { precision: 2 }), "4.05 ft");
  });

  it("precision-as-symbol rejects non-oom symbols at type level", () => {
    const len = Amount.from(1, Length, "m");
    // Type-level verification only - never executed at runtime
    if (false as boolean) {
      // @ts-expect-error - "in" is not an oom symbol (imperial is non-decimal)
      len.toString("inUnit", "m", { precision: "in" });
      // @ts-expect-error - "ft" is non-decimal, so NO symbol precision allowed
      len.toString("inUnit", "ft", { precision: "cm" });
    }
  });

  it("formats using (default) metric system", () => {
    const amount = Amount.from(1500, Length, "m");
    assert.strictEqual(amount.toString("approximate"), "1.5 km");
  });

  it("formats using imperial system (compound)", () => {
    const fiveTen = Amount.from(5, Length, "ft").add(Amount.from(10, Length, "in"));
    assert.strictEqual(fiveTen.toString("approximate", { system: "imperial" }), "1 yd 2 ft 10 in");
    assert.strictEqual(fiveTen.toString("imperial"), "1 yd 2 ft 10 in");

    const twoMiles = Amount.from(2, Length, "mi");
    assert.strictEqual(twoMiles.toString("imperial"), "2 mi");
    assert.strictEqual(twoMiles.toString("imperial", { thousandsSep: "_" }), "2 mi");
  });

  it("converts between systems", () => {
    const height = Amount.from(1.78, Length, "m");
    const inFeet = height.in("ft");
    assert.strictEqual(inFeet.toFixed(2), "5.84");

    const inInches = height.in("in");
    assert.strictEqual(inInches.toFixed(1), "70.1");
  });

  it("throws on conflicting scales for same symbol", () => {
    assert.throws(() => kind(
      "BadKind",
      [
        ["sys1", [{ symbols: [{ symbol: "X" }] }]],
        ["sys2", [{ symbols: [{ symbol: "X" }], scale: 2n }]],
      ],
    ), /conflicting scales/);
  });

  it("rejects non-primary system without scale/oom at type level", () => {
    // Type-level verification only - no runtime check needed
    if (false as boolean) {
      kind(
        "BadKind",
        // @ts-expect-error - only the first system can omit oom/scale
        [
          ["primary", [{ symbols: [{ symbol: "X" }] }]],
          ["secondary", [{ symbols: [{ symbol: "Y" }] }]],
        ],
      );
    }
  });
});
