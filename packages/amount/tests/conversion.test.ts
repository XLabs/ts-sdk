import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Conversion } from "../src/conversion.js";
import { Amount, scalar } from "../src/amount.js";
import { kind, powerOfTen } from "../src/kind.js";
import { Rational } from "../src/rational.js";

const Percentage = scalar(kind(
  "Percentage",
  [ { symbols: [{ symbol: "x"  }] },
    { symbols: [{ symbol: "%"  }], oom: -2 } ],
  { human: "%" },
));

const BTC = kind(
  "BTC",
  [ { symbols: [{ symbol: "satoshi" }]     },
    { symbols: [{ symbol: "BTC" }], oom: 8 } ],
  { human: "BTC", atomic: "satoshi" },
);

const USD = kind(
  "USD",
  [ { symbols: [{ symbol: "cent" }]        },
    { symbols: [{ symbol: "USD" }], oom: 2 } ],
  { human: "USD", atomic: "cent" },
);

const ETH = kind(
  "ETH",
  [ { symbols: [{ symbol: "wei" }] },
    { symbols: [{ symbol: "ETH" }], oom: 18 } ],
  { human: "ETH", atomic: "wei" },
);

const SAT = kind(
  "SAT",
  [{ symbols: [{ symbol: "sat" }] }],
  { atomic: "sat" },
);

describe("Conversion", () => {
  describe("from", () => {
    it("creates from ratio", () => {
      const conv = Conversion.from(50_000n, USD, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("creates from amounts", () => {
      const usd = Amount.from(50_000n, USD);
      const btc = Amount.from(1n, BTC);
      const conv = Conversion.from(usd, btc);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("creates from amount and kind", () => {
      const usd = Amount.from(50_000, USD);
      const conv = Conversion.from(usd, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("throws on same kind", () => {
      assert.throws(() => Conversion.from(1, BTC, BTC), /Must be distinct kinds: BTC vs BTC/);
    });

    it("rejects scalar kinds at type level", () => {
      // Type-level verification only - never executed at runtime
      if (false as boolean) {
        // @ts-expect-error - scalar as numerator is not allowed
        Conversion.from(1, Percentage, USD);
        // @ts-expect-error - scalar as denominator is not allowed
        Conversion.from(1, USD, Percentage);
        // @ts-expect-error - scalar amount as numerator is not allowed
        Conversion.from(Amount.from(10, Percentage), USD);
      }
    });
  });

  describe("arithmetic", () => {
    it("multiplication", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      const doubled = conv.mul(2);
      assert.strictEqual(doubled.in("USD", "BTC").toString(), "100000");
    });

    it("division", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      const halved = conv.div(2);
      assert.strictEqual(halved.in("USD", "BTC").toString(), "25000");
    });

    it("inversion", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      const inverted = conv.inv();
      assert.strictEqual(inverted.in("BTC", "USD").toString(), "0.00002");
    });
  });

  describe("combination", () => {
    it("combines conversions", () => {
      const usdToBtc = Conversion.from(50_000, USD, BTC);
      const btcToEth = Conversion.from(2, BTC, ETH);
      const usdToEth = usdToBtc.combine(btcToEth);
      assert.strictEqual(usdToEth.in("USD", "ETH").toString(), "100000");
    });

    it("throws on kind mismatch", () => {
      const usdToBtc = Conversion.from(50_000, USD, BTC);
      const ethToBtc = Conversion.from(2n, ETH, BTC);
      // @ts-expect-error | Disabled by type system but possible at runtime
      assert.throws(() => usdToBtc.combine(ethToBtc), /Kind mismatch: BTC vs ETH/);
    });
  });

  describe("toString", () => {
    it("falls back to first unit symbol when human unit is not defined", () => {
      const conv = Conversion.from(Amount.from(100, SAT, "sat"), Amount.from(2, USD));
      assert.strictEqual(conv.toString(), "50 sat/USD");
    });

    it("formats with default options", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toString(), "50,000 USD/BTC");
    });

    it("supports precision option", () => {
      const conv = Conversion.from(50_000.5, USD, BTC);
      assert.strictEqual(conv.toString({ precision: 2 }), "50,000.5 USD/BTC");
    });

    it("supports thousandsSep option", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toString({ thousandsSep: "_" }), "50_000 USD/BTC");
      assert.strictEqual(conv.toString({ thousandsSep: "" }), "50000 USD/BTC");
    });

    it("supports numSymbol and denSymbol options", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toString({ numSymbol: "cent", denSymbol: "satoshi", precision: 2 }), "0.05 cent/satoshi");
      assert.strictEqual(conv.toString({ denSymbol: "satoshi", precision: 4 }), "0.0005 USD/satoshi");
      assert.strictEqual(conv.toString({ denSymbol: "BTC" }), "50,000 USD/BTC");
    });
  });

  describe("toJSON", () => {
    it("returns string representation", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toJSON(), "50,000 USD/BTC");
    });

    it("supports thousandsSep", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toJSON({ thousandsSep: "_" }), "50_000 USD/BTC");
    });
  });

  describe("in", () => {
    it("returns ratio for human/human units", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("supports atomic denominator scaling", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.in("USD", "satoshi").toString(), "0.0005");
    });

    it("supports atomic numerator scaling", () => {
      const btcToEth = Conversion.from(2, BTC, ETH);
      assert.strictEqual(btcToEth.in("satoshi", "ETH").toString(), "200000000");
    });

    it("works with combined conversions and different units", () => {
      const usdToBtc = Conversion.from(50_000, USD, BTC);
      const btcToEth = Conversion.from(2, BTC, ETH);
      const usdToEth = usdToBtc.combine(btcToEth);
      assert.strictEqual(usdToEth.in("USD", "ETH").toString(), "100000");

      const [num, den] = usdToEth.in("USD", "wei").unwrap();
      assert.strictEqual(num, 1n);
      assert.strictEqual(den, 10_000_000_000_000n);
    });
  });

  describe("hasNum", () => {
    it("narrows numerator kind", () => {
      const conv: Conversion<typeof USD | typeof ETH, typeof BTC> =
        Conversion.from(50_000, USD, BTC);
      if (!Conversion.hasNum(conv, "USD"))
        throw new Error("unexpected");
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("returns false for non-matching kind", () => {
      const conv: Conversion<typeof USD | typeof ETH, typeof BTC> =
        Conversion.from(50_000, USD, BTC);
      assert.strictEqual(Conversion.hasNum(conv, "ETH"), false);
    });
  });

  describe("hasDen", () => {
    it("narrows denominator kind", () => {
      const conv: Conversion<typeof USD, typeof BTC | typeof ETH> =
        Conversion.from(50_000, USD, BTC);
      if (!Conversion.hasDen(conv, "BTC"))
        throw new Error("unexpected");
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("returns false for non-matching kind", () => {
      const conv: Conversion<typeof USD, typeof BTC | typeof ETH> =
        Conversion.from(50_000, USD, BTC);
      assert.strictEqual(Conversion.hasDen(conv, "ETH"), false);
    });
  });

  describe("parse", () => {
    it("parses simple conversion string", () => {
      const conv = Conversion.parse("50,000 USD/BTC", USD, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("parses conversion with single kinds", () => {
      const conv = Conversion.parse("2 BTC/ETH", BTC, ETH);
      assert.strictEqual(conv.in("BTC", "ETH").toString(), "2");
    });

    it("parses conversion with arrays of kinds", () => {
      const conv = Conversion.parse("50,000 USD/BTC", [USD], [BTC]);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("parses conversion with multiple numerator candidates", () => {
      const conv = Conversion.parse("50,000 USD/BTC", [USD, ETH], BTC);
      if (!Conversion.hasNum(conv, "USD"))
        throw new Error("unexpected");
      assert.strictEqual(conv.in("USD", "BTC").toString(), "50000");
    });

    it("parses conversion with multiple denominator candidates", () => {
      const conv = Conversion.parse("2 BTC/ETH", BTC, [ETH, USD]);
      if (!Conversion.hasDen(conv, "ETH"))
        throw new Error("unexpected");
      assert.strictEqual(conv.in("BTC", "ETH").toString(), "2");
    });

    it("parses conversion with different unit symbols", () => {
      const conv = Conversion.parse("100 cent/BTC", USD, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "1");
    });

    it("parses conversion with fractional numerator", () => {
      const conv = Conversion.parse("0.5 BTC/ETH", BTC, ETH);
      assert.strictEqual(conv.in("BTC", "ETH").toString(), "0.5");
    });

    it("parses conversion with negative numerator", () => {
      const conv = Conversion.parse("-100 USD/BTC", USD, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "-100");
    });

    it("throws on invalid format - no slash", () => {
      assert.throws(
        () => Conversion.parse("50000 USD BTC", USD, BTC),
        /Expected string in format 'numerator\/denominator'/
      );
    });

    it("parses conversion with ratio in numerator", () => {
      const conv = Conversion.parse("1/2 USD/BTC", USD, BTC);
      assert.strictEqual(conv.in("USD", "BTC").toString(), "0.5");
    });

    it("throws on unidentifiable numerator kind", () => {
      assert.throws(
        () => Conversion.parse("50000 UNKNOWN/BTC", USD, BTC),
        /Could not identify kind from string/
      );
    });

    it("throws on unidentifiable denominator kind", () => {
      assert.throws(
        () => Conversion.parse("50000 USD/UNKNOWN", USD, BTC),
        /Could not identify denominator kind from string/
      );
    });

    it("creates equivalent conversion to from method", () => {
      const parsed = Conversion.parse("50000 USD/BTC", USD, BTC);
      const from = Conversion.from(50_000n, USD, BTC);
      assert.strictEqual(parsed.in("USD", "BTC").toString(), from.in("USD", "BTC").toString());
    });
  });

  describe("precision type constraints", () => {
    const inch = Rational.from(254n, powerOfTen(4).floor());
    const Length = kind(
      "Length",
      [
        ["metric", [
          { symbols: [{ symbol: "m" }] },
          { symbols: [{ symbol: "cm" }], oom: -2 },
        ]],
        ["imperial", [
          { symbols: [{ symbol: "in" }], scale: inch },
          { symbols: [{ symbol: "ft" }], scale: inch.mul(12) },
        ]],
      ],
      { human: "m" },
    );

    it("rejects non-oom precision symbols at type level", () => {
      const conv = Conversion.from(100, Length, USD);
      // Type-level verification only - never executed at runtime
      if (false as boolean) {
        // @ts-expect-error - "in" is not an oom symbol (imperial is non-decimal)
        conv.toString({ numSymbol: "m", precision: "in" });
        // @ts-expect-error - "ft" is non-decimal, so NO symbol precision allowed
        conv.toString({ numSymbol: "ft", precision: "cm" });
      }
    });
  });
});
