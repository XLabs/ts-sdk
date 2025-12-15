# @xlabs-xyz/common

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/common.svg)](https://www.npmjs.com/package/@xlabs-xyz/common)

Glue layer that ties together the lower-level packages (`const-utils`, `utils`, `binary-layout`, `amount`) into practical building blocks.

- [Layout Items](#layout-items) – binary-layout items that serialize/deserialize to Amount types
- [Units](#units) – predefined Amount kinds for common units (currencies, duration, bytes, etc.)
- [Utilities](#utilities)

## Layout Items

Binary-layout items that serialize to/from `Amount` and related types.

### amountItem

Deserialize numeric bytes directly to an `Amount`:

```typescript
const layout = [
  { name: "balance", ...amountItem(8, Sol) },  // uses atomic (lamports) by default
  { name: "timeout", ...amountItem(4, Duration, "second") },  // explicit unit
] as const;
```

With a transform for scaled and/or shifted values:

```typescript
import { linearTransform } from "@xlabs-xyz/common";

//Sol amount squeezed into 4 bytes with kLamport precision (0 to ~4k SOL range)
amountItem(4, Sol, linearTransform("stored", 1_000));
```

### conversionItem

For exchange rates / conversion factors. Has many overloads – can wrap an existing `amountItem` or be built from scratch:

```typescript
// Wrap an existing amountItem
const priceItem = amountItem(8, Sol, "lamport");
conversionItem(priceItem, Usd);          // => Conversion<Sol, Usd>

// Or build from scratch: size, numKind, numUnit, denKind, [denUnit], [transform]
conversionItem(8, Sol, "lamport", Usd);  // => Conversion<Sol, Usd>
```

### Other Items

```typescript
timestampItem("uint", 4);  // unix timestamp → Date (use "int" for signed, e.g. Solana)
hashItem;                  // 32-byte hash field
paddingItem(4);            // 4 bytes of padding (omitted in output)
```

`byteSwitchItem` / `enumSwitchVariants` – helpers for byte-discriminated tagged unions; see source for details.

## Units

Predefined `Amount` kinds for common use cases. These are sensible defaults – not authoritative definitions. Feel free to roll your own if they don't fit your needs.

- **Currencies**: `Usd`, `Usdt`, `Usdc`, `Btc`, `Eth`, `Sol` – each with a `CurrencyKind` type and three formatting systems:
  - `default` – native symbols where available ($, ₿, Ξ)
  - `uniform` – ticker-style (USD, BTC, ETH)
  - `fancy` – unicode symbols (₿, Ξ, USD₮)
- **Percentage** – supports `%`, `bp` (basis points), and `x` (scalar)
- **Duration** – seconds through years, with `long` and `short` formatting systems
- **Byte** – SI (kB, MB, GB) and binary (KiB, MiB, GiB) systems

### Unit Definition Helpers

For defining your own kinds:

```typescript
toDecimalUnits([
  [0,  [{ symbol: "FOO" }]],        // oom: 0 (base unit)
  [-6, [{ symbol: "µFOO" }]],       // oom: -6 (micro)
]);

toCompoundUnits([
  [1,    [withPluralS("second")]],  // scale: 1
  [60,   [withPluralS("minute")]],  // scale: 60
]);

withPluralS("hour");                // => { symbol: "hour", plural: "hours" }
allowPluralS("hour");               // => [{ symbol: "hour" }, { symbol: "hours" }]
allowOtherCap("Gwei");              // => [{ symbol: "Gwei" }, { symbol: "gwei" }]
```

## Utilities

```typescript
fromAtomicIfKind(1_000_000n);       // => 1_000_000n (no kind, returns bigint)
fromAtomicIfKind(1_000_000n, Sol);  // => Amount<Sol> (=0.001 SOL)
```
