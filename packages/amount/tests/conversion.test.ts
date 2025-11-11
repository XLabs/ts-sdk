import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Conversion } from "../src/conversion.js";
import { Amount } from "../src/amount.js";

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
    { symbol: "USD", scale: 1n },
    { symbol: "cent", scale: 1n },
  ] as const,
  human: "USD",
  atomic: "cent",
} as const;

const ETH = {
  name: "ETH",
  units: [
    { symbol: "wei", scale: 1n },
    { symbol: "ETH", scale: 1_000_000_000_000_000_000n },
  ] as const,
  human: "ETH",
  atomic: "wei",
} as const;

const SAT = {
  name: "SAT",
  units: [
    { symbol: "sat", scale: 1n },
  ] as const,
  atomic: "sat",
} as const;

describe("Conversion", () => {
  describe("from", () => {
    it("creates from ratio", () => {
      const conv = Conversion.from(50_000n, USD, BTC);
      assert.strictEqual(conv.toString(), "50000 USD/BTC");
    });

    it("creates from amounts", () => {
      const usd = Amount.from(50_000n, USD);
      const btc = Amount.from(1n, BTC);
      const conv = Conversion.from(usd, btc);
      assert.strictEqual(conv.toString(), "50000 USD/BTC");
    });

    it("creates from amount and kind", () => {
      const usd = Amount.from(50_000, USD);
      const conv = Conversion.from(usd, BTC);
      assert.strictEqual(conv.toString(), "50000 USD/BTC");
    });

    it("throws on same kind", () => {
      assert.throws(() => Conversion.from(1, BTC, BTC), /Must be distinct kinds: BTC vs BTC/);
    });
  });

  describe("arithmetic", () => {
    it("multiplication", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      const doubled = conv.mul(2);
      assert.strictEqual(doubled.toString(), "100000 USD/BTC");
    });

    it("division", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      const halved = conv.div(2);
      assert.strictEqual(halved.toString(), "25000 USD/BTC");
    });

    it("inversion", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      const inverted = conv.inv();
      assert.strictEqual(inverted.toString(), "0.00002 BTC/USD");
    });
  });

  describe("combination", () => {
    it("combines conversions", () => {
      const usdToBtc = Conversion.from(50_000, USD, BTC);
      const btcToEth = Conversion.from(2, BTC, ETH);
      const usdToEth = usdToBtc.combine(btcToEth);
      assert.strictEqual(usdToEth.toString(), "100000 USD/ETH");
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
  });

  describe("toUnit", () => {
    it("returns ratio for human/human units", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toUnit("USD", "BTC").toString(), "50000");
    });

    it("supports atomic denominator scaling", () => {
      const conv = Conversion.from(50_000, USD, BTC);
      assert.strictEqual(conv.toUnit("USD", "satoshi").toString(), "0.0005");
    });

    it("supports atomic numerator scaling", () => {
      const btcToEth = Conversion.from(2, BTC, ETH);
      assert.strictEqual(btcToEth.toUnit("satoshi", "ETH").toString(), "200000000");
    });

    it("works with combined conversions and different units", () => {
      const usdToBtc = Conversion.from(50_000, USD, BTC);
      const btcToEth = Conversion.from(2, BTC, ETH);
      const usdToEth = usdToBtc.combine(btcToEth);
      assert.strictEqual(usdToEth.toUnit("USD", "ETH").toString(), "100000");

      const [num, den] = usdToEth.toUnit("USD", "wei").unwrap();
      assert.strictEqual(num, 1n);
      assert.strictEqual(den, 10_000_000_000_000n);
    });
  });
});

