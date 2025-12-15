# @xlabs-xyz/utils

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/utils.svg)](https://www.npmjs.com/package/@xlabs-xyz/utils)

Common runtime utilities: encoding, hashing, JSON with bigint support, and simple assertions.

- [Encoding](#encoding) – hex, base58, base64, bech32, bignum, bytes
- [BigInt JSON](#bigint-json) – JSON serialization that preserves bigints
- [Hashing & Curves](#hashing--curves) – re-exports from @noble/hashes and @noble/curves
- [Assertions](#assertions) – simple runtime checks
- [Misc](#misc) – small helpers

## Encoding

### hex

```typescript
hex.decode("deadbeef");             // => Uint8Array
hex.decode("0xdeadbeef");           // => Uint8Array (0x prefix stripped)
hex.encode(bytes);                  // => "deadbeef"
hex.encode(bytes, true);            // => "0xdeadbeef"
hex.isValid("0xdeadbeef");          // => true
```

### base58 / base64

```typescript
base58.decode("3yZe7d");            // => Uint8Array
base58.encode(bytes);               // => "3yZe7d"

base64.decode("SGVsbG8=");          // => Uint8Array
base64.encode(bytes);               // => "SGVsbG8="
base64.isValid("SGVsbG8=");         // => true
```

### bech32

```typescript
bech32.decode("cosmos1...");        // => Uint8Array (bytes only, no prefix)
```

### bignum

Conversions between bigint, hex strings, and bytes.

```typescript
bignum.decode("0xff");              // => 255n
bignum.decode(bytes);               // => bigint from bytes
bignum.encode(255n);                // => "ff"
bignum.encode(255n, true);          // => "0xff"
bignum.toBytes(255n);               // => Uint8Array([0xff])
bignum.toBytes(255n, 4);            // => Uint8Array([0, 0, 0, 0xff]) (zero-padded)
bignum.toNumber(255n);              // => 255 (throws if out of safe integer range)
bignum.toBigInt(255);               // => 255n (throws if not safe integer)
```

### bytes

UTF-8 and byte array utilities.

```typescript
bytes.encode("hello");              // => Uint8Array (UTF-8)
bytes.decode(arr);                  // => "hello"
bytes.equals(a, b);                 // => true/false
bytes.zpad(arr, 32);                // => zero-padded to 32 bytes (left)
bytes.zpad(arr, 32, false);         // => zero-padded to 32 bytes (right)
bytes.concat(a, b, c);              // => concatenated Uint8Array
```

## BigInt JSON

JSON doesn't support bigint natively. This module provides serialization that wraps bigints as `{ $type: "bigint", value: "123" }`.

```typescript
const obj = { amount: 123456789012345678901234567890n };

stringifyWithBigints(obj);
// => '{"amount":{"$type":"bigint","value":"123456789012345678901234567890"}}'

parseWithBigints<typeof obj>(jsonString);
// => { amount: 123456789012345678901234567890n }
```

For use with `JSON.stringify`/`JSON.parse` directly:

```typescript
JSON.stringify(obj, bigintReplacer);
JSON.parse(str, bigintReviver);
```

For transforming objects in-place:

```typescript
serializeBigints(obj);    // bigints → { $type, value }
deserializeBigints(obj);  // { $type, value } → bigints
```

## Hashing & Curves

Re-exports from [@noble/hashes](https://github.com/paulmillr/noble-hashes) and [@noble/curves](https://github.com/paulmillr/noble-curves):

```typescript
import { sha256, sha512_256, keccak256, sha3_256 } from "@xlabs-xyz/utils";
import { secp256k1, ed25519 } from "@xlabs-xyz/utils";
```

## Assertions

Simple runtime checks that throw on failure.

```typescript
assertEqual(a, b);                  // throws if a !== b
assertEqual(a, b, "custom message");

assertDistinct(1, 2, 3);            // ok
assertDistinct(1, 2, 2);            // throws "Values are not distinct: 1, 2, 2"
```

## Misc

```typescript
definedOrThrow(value);              // returns value, throws if undefined
definedOrThrow(value, "not found"); // custom error message

throws(() => someFn());             // => true if someFn throws, false otherwise
```

`definedOrThrow` is a checked `!` assertion – useful in chains where breaking into an `if` block would be awkward:

```typescript
// instead of:
const result = await fetchMaybe();
if (result === undefined)
  throw new Error("not found");
await process(result);

// you can write:
await fetchMaybe().then(r => process(definedOrThrow(r, "not found")));
```
