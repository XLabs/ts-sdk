import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { serialize, deserialize } from "@xlabs-xyz/binary-layout";
import { bignum } from "@xlabs-xyz/utils";

import { Amount, Conversion, Rational } from "@xlabs-xyz/amount";

import { Usd, Btc, Eth } from "../src/units.js";
import { amountItem, conversionItem, linearTransform } from "../src/layouting.js";

// ---- amountItem baseline tests ----

describe("amountItem", () => {
  it("round-trips a value using atomic unit", () => {
    const layout = amountItem(4, Usd, "¢");
    const amount = Amount.from(500, Usd, "¢"); // 500 cents = 5 USD
    const encoded = serialize(layout, amount);
    assert.deepStrictEqual(encoded, bignum.toBytes(500, 4));
    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded.in("$").toString(), "5");
  });

  it("round-trips a value using human unit", () => {
    const layout = amountItem(4, Usd, "$");
    const amount = Amount.from(50, Usd);
    const encoded = serialize(layout, amount);
    assert.deepStrictEqual(encoded, bignum.toBytes(50, 4));
    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded.in("$").toString(), "50");
  });

  it("round-trips with default atomic unit (KindWithAtomic)", () => {
    const layout = amountItem(4, Btc);
    const amount = Amount.from(1, Btc); // 1 BTC = 100_000_000 satoshi
    const encoded = serialize(layout, amount);
    assert.deepStrictEqual(encoded, bignum.toBytes(100_000_000, 4));
    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded.in("BTC").toString(), "1");
  });

  it("round-trips with a transform", () => {
    // stored value * 100 = converted value in USD
    const layout = amountItem(4, Usd, "$", linearTransform("stored", 100));
    const amount = Amount.from(500, Usd); // 500 USD => stored as 5
    const encoded = serialize(layout, amount);
    assert.deepStrictEqual(encoded, bignum.toBytes(5, 4));
    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded.in("$").toString(), "500");
  });

  it("round-trips bigint for large sizes", () => {
    const layout = amountItem(32, Eth, "wei");
    const amount = Amount.from(1, Eth); // 1 ETH = 10^18 wei
    const encoded = serialize(layout, amount);
    assert.deepStrictEqual(encoded, bignum.toBytes(10n ** 18n, 32));
    const decoded = deserialize(layout, encoded);
    assert.strictEqual(decoded.in("ETH").toString(), "1");
  });
});

// ---- conversionItem tests ----

describe("conversionItem", () => {
  const usd50kPerBtc = Conversion.from(Amount.from(50_000, Usd), Amount.from(1, Btc));

  describe("wrapping an amountItem (overloads 1 & 2)", () => {
    it("to: deserializes bytes into a valid conversion", () => {
      const numItem = amountItem(4, Usd, "$");
      const layout = conversionItem(numItem, Btc);

      // 50000 USD/BTC — numItem stores USD in human units, so raw value is 50000
      const conv = deserialize(layout, bignum.toBytes(50_000, 4));
      assert.strictEqual(conv.in("$", "BTC").toString(), "50000");
    });

    it("from: serializes a conversion back to bytes", () => {
      const numItem = amountItem(4, Usd, "$");
      const layout = conversionItem(numItem, Btc);

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(50_000, 4));
    });

    it("round-trips with default human denominator unit", () => {
      const numItem = amountItem(4, Usd, "$");
      const layout = conversionItem(numItem, Btc);

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(50_000, 4));
      const decoded = deserialize(layout, encoded);
      assert.strictEqual(decoded.in("$", "BTC").toString(), "50000");
    });

    it("round-trips with explicit denominator unit", () => {
      const numItem = amountItem(4, Usd, "$");
      const layout = conversionItem(numItem, Btc, "BTC");

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(50_000, 4));
      const decoded = deserialize(layout, encoded);
      assert.strictEqual(decoded.in("$", "BTC").toString(), "50000");
    });
  });

  describe("size-based (overloads 3 & 4)", () => {
    it("to: deserializes bytes into a valid conversion", () => {
      const layout = conversionItem(4, Usd, "$", Btc, "BTC");

      const conv = deserialize(layout, bignum.toBytes(50_000, 4));
      assert.strictEqual(conv.in("$", "BTC").toString(), "50000");
    });

    it("from: serializes a conversion back to bytes", () => {
      const layout = conversionItem(4, Usd, "$", Btc, "BTC");

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(50_000, 4));
    });

    it("round-trips without transform", () => {
      const layout = conversionItem(4, Usd, "$", Btc, "BTC");

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(50_000, 4));
      const decoded = deserialize(layout, encoded);
      assert.strictEqual(decoded.in("$", "BTC").toString(), "50000");
    });

    it("round-trips with default human denominator", () => {
      const layout = conversionItem(4, Usd, "$", Btc);

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(50_000, 4));
      const decoded = deserialize(layout, encoded);
      assert.strictEqual(decoded.in("$", "BTC").toString(), "50000");
    });

    it("round-trips with a transform", () => {
      // stored value * 100 = actual conversion ratio
      const layout = conversionItem(4, Usd, "$", Btc, "BTC", linearTransform("stored", 100));

      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(500, 4)); // 50000 / 100 = 500 stored
      const decoded = deserialize(layout, encoded);
      assert.strictEqual(decoded.in("$", "BTC").toString(), "50000");
    });

    it("round-trips with atomic numerator unit", () => {
      const layout = conversionItem(4, Usd, "¢", Btc, "BTC");

      // 50,000 USD/BTC — stored as 5,000,000 cents/BTC
      const encoded = serialize(layout, usd50kPerBtc);
      assert.deepStrictEqual(encoded, bignum.toBytes(5_000_000, 4));
      const decoded = deserialize(layout, encoded);
      assert.strictEqual(decoded.in("$", "BTC").toString(), "50000");
    });
  });
});

// ---- linearTransform tests ----

describe("linearTransform", () => {
  describe("3-param (returns SizedTransformFunc)", () => {
    it("stored mode: to = val * m, from = val / m", () => {
      const tf = linearTransform("stored", 100)(4);
      assert.strictEqual(tf.to(5).toString(), "500");
      assert.strictEqual(tf.from(Rational.from(500)), 5);
    });

    it("converted mode: to = val / m, from = val * m", () => {
      const tf = linearTransform("converted", 100)(4);
      assert.strictEqual(tf.to(500).toString(), "5");
      assert.strictEqual(tf.from(Rational.from(5)), 500);
    });

    it("stored mode with offset b: to = val * m + b", () => {
      const tf = linearTransform("stored", 10, 3)(4);
      assert.strictEqual(tf.to(7).toString(), "73"); // 7*10 + 3
      assert.strictEqual(tf.from(Rational.from(73)), 7); // (73-3)/10
    });

    it("converted mode with offset b: to = (val - b) / m", () => {
      const tf = linearTransform("converted", 10, 3)(4);
      assert.strictEqual(tf.to(73).toString(), "7"); // (73-3)/10
      assert.strictEqual(tf.from(Rational.from(7)), 73); // 7*10 + 3
    });
  });

  describe("4-param (returns TransformFunc directly)", () => {
    it("stored mode: equivalent to 3-param version", () => {
      const tf = linearTransform(4, "stored", 100);
      assert.strictEqual(tf.to(5).toString(), "500");
      assert.strictEqual(tf.from(Rational.from(500)), 5);
    });

    it("converted mode: equivalent to 3-param version", () => {
      const tf = linearTransform(4, "converted", 100);
      assert.strictEqual(tf.to(500).toString(), "5");
      assert.strictEqual(tf.from(Rational.from(5)), 500);
    });

    it("stored mode with offset b", () => {
      const tf = linearTransform(4, "stored", 10, 3);
      assert.strictEqual(tf.to(7).toString(), "73");
      assert.strictEqual(tf.from(Rational.from(73)), 7);
    });

    it("converted mode with offset b", () => {
      const tf = linearTransform(4, "converted", 10, 3);
      assert.strictEqual(tf.to(73).toString(), "7");
      assert.strictEqual(tf.from(Rational.from(7)), 73);
    });

    it("4-param round-trips through amountItem identically to 3-param", () => {
      const layout3 = amountItem(4, Usd, "$", linearTransform("stored", 100));
      const layout4 = amountItem(4, Usd, "$", linearTransform(4, "stored", 100));
      const amount = Amount.from(500, Usd);

      const enc3 = serialize(layout3, amount);
      const enc4 = serialize(layout4, amount);
      assert.deepStrictEqual(enc3, enc4);

      const dec3 = deserialize(layout3, enc3);
      const dec4 = deserialize(layout4, enc4);
      assert.strictEqual(dec3.in("$").toString(), dec4.in("$").toString());
    });
  });
});
