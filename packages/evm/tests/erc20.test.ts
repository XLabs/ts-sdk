import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Address } from "viem";
import { serialize } from "@xlabs-xyz/binary-layout";
import { hex, bignum } from "@xlabs-xyz/utils";

import { selectorOf, wordSize } from "../src/layouting.js";
import { erc20 } from "../src/erc20.js";
import { permit } from "../src/permit.js";

const token = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address; // USDC
const alice = "0x1111111111111111111111111111111111111111" as Address;
const bob   = "0x2222222222222222222222222222222222222222" as Address;

const contract = erc20(token);

describe("erc20 spec", () => {
  describe("read calls", () => {
    it("name() returns a layout triple with the correct selector", () => {
      const call = contract.name({});
      assert.strictEqual(call.to, token);
      const [layout, params, _outputLayout] = call.data;
      const encoded = serialize(layout, params);
      // name() selector = keccak256("name()")[0:4]
      assert.deepStrictEqual(encoded, selectorOf("name()"));
    });

    it("symbol() returns a layout triple with the correct selector", () => {
      const call = contract.symbol({});
      const encoded = serialize(call.data[0], call.data[1]);
      assert.deepStrictEqual(encoded, selectorOf("symbol()"));
    });

    it("decimals() returns a layout triple with the correct selector", () => {
      const call = contract.decimals({});
      const encoded = serialize(call.data[0], call.data[1]);
      assert.deepStrictEqual(encoded, selectorOf("decimals()"));
    });

    it("balanceOf encodes owner address after selector", () => {
      const call = contract.balanceOf({ owner: alice });
      const [layout, params] = call.data;
      const encoded = serialize(layout, params);
      const expected = new Uint8Array(4 + wordSize);
      expected.set(selectorOf("balanceOf(address)"));
      expected.set(hex.decode(alice), 4 + wordSize - 20);
      assert.deepStrictEqual(encoded, expected);
    });

    it("allowance encodes owner and spender", () => {
      const call = contract.allowance({ owner: alice, spender: bob });
      const [layout, params] = call.data;
      const encoded = serialize(layout, params);
      assert.strictEqual(encoded.length, 4 + 2 * wordSize);
      assert.deepStrictEqual(encoded.subarray(0, 4), selectorOf("allowance(address,address)"));
    });
  });

  describe("write calls", () => {
    it("approve serializes from, selector, spender, and value", () => {
      const result = contract.approve(alice, { spender: bob, value: 1000n });
      assert.strictEqual(result.from, alice);
      assert.strictEqual(result.to, token);
      assert.ok(result.data instanceof Uint8Array);
      assert.deepStrictEqual(
        result.data.subarray(0, 4),
        selectorOf("approve(address,uint256)"),
      );
    });

    it("transfer serializes from, selector, to, and value", () => {
      const result = contract.transfer(alice, { to: bob, value: 500n });
      assert.strictEqual(result.from, alice);
      assert.strictEqual(result.to, token);
      assert.deepStrictEqual(
        result.data.subarray(0, 4),
        selectorOf("transfer(address,uint256)"),
      );
    });

    it("approve round-trips value through the layout", () => {
      const value = 10n ** 18n;
      const result = contract.approve(alice, { spender: bob, value });
      // value is in the last 32 bytes
      const encodedValue = bignum.decode(result.data.subarray(result.data.length - wordSize));
      assert.strictEqual(encodedValue, value);
    });
  });
});

// ---- Live query tests (require network) ----

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { queryEvm } from "../src/query.js";

const hasNetwork = await fetch("https://cloudflare.com", { method: "HEAD" })
  .then(() => true)
  .catch(() => false);

const client = createPublicClient({ chain: mainnet, transport: http() });
const query = queryEvm(client);

// Circle's USDC treasury — reliably holds a non-zero balance
const usdcTreasury = "0x55FE002aefF02F77364de339a1292923A15844B8" as Address;

describe("erc20 live query", { skip: !hasNetwork && "no network" }, () => {
  it("reads name, symbol, and decimals", async () => {
    const usdc = erc20(token);
    const [[name, symbol, decimals]] = await query([
      usdc.name({}),
      usdc.symbol({}),
      usdc.decimals({}),
    ]);
    assert.strictEqual(name, "USD Coin");
    assert.strictEqual(symbol, "USDC");
    assert.strictEqual(decimals, 6);
  });

  it("reads a non-zero balance", async () => {
    const usdc = erc20(token);
    const [[balance]] = await query([usdc.balanceOf({ owner: usdcTreasury })]);
    assert.strictEqual(typeof balance, "bigint");
    assert.ok(balance > 0n, `Expected positive balance, got ${balance}`);
  });
});

describe("permit spec", () => {
  const p = permit(token);

  describe("read calls", () => {
    it("DOMAIN_SEPARATOR() has the correct selector", () => {
      const call = p.DOMAIN_SEPARATOR({});
      assert.strictEqual(call.to, token);
      const encoded = serialize(call.data[0], call.data[1]);
      assert.deepStrictEqual(encoded, selectorOf("DOMAIN_SEPARATOR()"));
    });

    it("nonces(address) encodes owner after selector", () => {
      const call = p.nonces({ owner: alice });
      const encoded = serialize(call.data[0], call.data[1]);
      assert.deepStrictEqual(encoded.subarray(0, 4), selectorOf("nonces(address)"));
      assert.strictEqual(encoded.length, 4 + wordSize);
    });
  });

  describe("write calls", () => {
    it("permit serializes all 7 params with correct selector", () => {
      const result = p.permit(alice, {
        owner: alice,
        spender: bob,
        value: 1000n,
        deadline: new Date("2030-01-01T00:00:00Z"),
        v: 27n,
        r: new Uint8Array(32),
        s: new Uint8Array(32),
      });
      assert.strictEqual(result.from, alice);
      assert.strictEqual(result.to, token);
      assert.deepStrictEqual(
        result.data.subarray(0, 4),
        selectorOf("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"),
      );
      // 4 byte selector + 7 × 32 byte slots
      assert.strictEqual(result.data.length, 4 + 7 * wordSize);
    });
  });
});

describe("permit live query", { skip: !hasNetwork && "no network" }, () => {
  it("reads DOMAIN_SEPARATOR and nonce", async () => {
    const p = permit(token);
    const [[domainSep, nonce]] = await query([
      p.DOMAIN_SEPARATOR({}),
      p.nonces({ owner: usdcTreasury }),
    ]);
    assert.strictEqual(domainSep.length, 32);
    assert.strictEqual(typeof nonce, "bigint");
  });
});
