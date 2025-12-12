# @xlabs-xyz/amount

Type-safe handling of amounts with units and arbitrary-precision arithmetic.

## Why?

```typescript
// Seconds or milliseconds?
function retry(timeout: number) { ... }

// From your config - quick: is this 0.15 ETH 1.5 ETH or 15 ETH? Or is it even ETH at all?
JSON.parse('{ "maxTransfer": "1500000000000000000" }')

// A 2% fee on a bigint
const fee = amount * 2n / 100n;  // annoying AF
```

But hey, it works, right? Not like anyone ever [lost money because they got their orders of magnitude wrong](https://x.com/threesigmaxyz/status/1929838159019299072), or a [Mars Orbiter](https://en.wikipedia.org/wiki/Mars_Climate_Orbiter) because of unit or dimensional mixups.

Now you could:
1. pray this won't happen to you
2. chest thump and say this won't happen to you
3. drown yourself in branded types and a bunch of utility functions to handle different currencies, different systems of unit, ...

... or you could use this package, which gives you that rigor without the headache/boilerplate:

```typescript
// unambiguous
const timeout = duration(30, "seconds");

// convenient and readable ...
const maxTransfer = eth(1.5);

// ... even in your config
maxTransfer.toJSON(); //"1.5 ETH"

// define prices/conversions ...
const ethPrice = usd(3_000).per(ETH);

// ... and apply them in a type-safe manner
const maxInUsd = maxTransfer.div(ethPrice); // == usd(4_500)

// gives you the atomic unit (wei, sats,...) no matter if ETH, BTC, ...
amount.in("atomic");

// just works
const withFee = amount.mul(1.02);
```

## Quick Start

```typescript
import { Amount, Conversion, Rational, kind, powerOfTen } from "@xlabs-xyz/amount";

// Define a currency with units
const ETH = kind(
  "ETH",
  [ { symbols: [{ symbol: "ETH"  }] },
    { symbols: [{ symbol: "Gwei" }], oom:  -9 },
    { symbols: [{ symbol: "wei"  }], oom: -18 },
  ],
  { human: "ETH", atomic: "wei" }
);
const eth = Amount.ofKind(ETH);

// Create and manipulate amounts
const balance = eth(1.5);
balance.in("ETH");     // Rational(1.5)
balance.in("Gwei");    // Rational(1_500_000_000)
balance.in("atomic");  // 1_500_000_000_000_000_000n

// Arithmetic
balance.mul(2);      // 3 ETH
balance.add(eth(1)); // 2.5 ETH

// Parse from strings
Amount.parse("25 Gwei", ETH);  // == eth(25, "Gwei")

// Convert between kinds
const USD = kind(
  "USD",
  [{ symbols: [{ symbol: "$", spacing: "compact", position: "prefix" }] }],
  { human: "$" }
);
const usd = Amount.ofKind(USD);

const ethPrice = usd(3000).per(ETH);
eth(0.5).mul(price);  // $1,500
```

## Core Concepts

### Rational

Arbitrary-precision rational numbers for exact arithmetic. Stored as normalized fractions.

```typescript
import { Rational } from "@xlabs-xyz/amount";

Rational.from(5);       // from integer
Rational.from(0.5);     // from float (continued fractions approximation)
Rational.from(5n, 2n);  // from bigint numerator/denominator
Rational.from("1.5");   // from decimal string
Rational.from("1/3");   // from ratio string
```

Supports standard arithmetic (`add`, `sub`, `mul`, `div`, `mod`, `neg`, `abs`, `inv`), comparison (`eq`, `ne`, `lt`, `le`, `gt`, `ge`), and conversion (`floor`, `ceil`, `round`, `toNumber`, `toFixed`).

### Kind

A `Kind` defines a dimension (like currency, time, or data) with its units and their relationships.

#### Decimal Kinds

For dimensions where units relate by powers of 10, use `oom` (order of magnitude):

```typescript
import { kind } from "@xlabs-xyz/amount";

const ETH = kind(
  "ETH",
  [ { symbols: [{ symbol: "ETH"  }] },         // oom: 0 (implicit)
    { symbols: [{ symbol: "Gwei" }], oom: -9 },
    { symbols: [{ symbol: "wei"  }], oom: -18 },
  ],
  { human: "ETH", atomic: "wei" }
);
```

The first unit without an explicit `oom` is the standard unit (scale = 1). Other units are defined relative to it: `oom: -9` means the unit is 10⁻⁹ of the standard.

#### Non-Decimal Kinds

For dimensions with arbitrary scale ratios, use `scale`:

```typescript
const Duration = kind(
  "Duration",
  [ { symbols: [{ symbol: "second", plural: "seconds" }] },
    { symbols: [{ symbol: "minute", plural: "minutes" }], scale:     60n },
    { symbols: [{ symbol: "hour",   plural: "hours"   }], scale:   3600n },
    { symbols: [{ symbol: "day",    plural: "days"    }], scale:  86400n },
  ]
);
```

#### Symbol Options

Each unit can have multiple symbols with display options ("spaced" and "postfix" are default):

```typescript
const USD = kind(
  "USD",
  [ { symbols: [
      { symbol: "$", spacing: "compact", position: "prefix" },
      { symbol: "USD" },
    ]},
    { symbols: [
      { symbol: "¢", spacing: "compact" },
      { symbol: "c", spacing: "compact" },
      { symbol: "cent", plural: "cents" },
    ], oom: -2 },
  ],
  { human: "$", atomic: "¢" },
);
const usd = Amount.ofKind(USD);

// Formatting respects these options:
const amt = usd(100);
amt.toString();      // "$100"
amt.toString("USD"); // "100 USD"
amt.toString("c");   // "10,000c"

const centAmt = usd(50, "c");
centAmt.toString(); // "50¢"
```

Options:
- `position`: `"prefix"` or `"postfix"` (default)
- `spacing`: `"spaced"` (default) or `"compact"`
- `plural`: alternate symbol when value ≠ 1

The first symbol for each oom/scale is always the default unit for display. Other unts can be used for convenience ("¢" prints nicely but is impossible to type, while "c" is easy) or when a certain symbol is desired (as in the example).

#### Multi-System Kinds

Some dimensions have multiple unit systems (e.g., metric vs imperial):

```typescript
const inch = Rational.from(254n, 10000n);  // 0.0254 m

const Length = kind(
  "Length",
  [
    ["metric", [
      { symbols: [{ symbol: "m"  }] },
      { symbols: [{ symbol: "cm" }], oom: -2 },
      { symbols: [{ symbol: "km" }], oom:  3 },
    ]],
    ["imperial", [
      { symbols: [{ symbol: "in" }], scale: inch },
      { symbols: [{ symbol: "ft" }], scale: inch.mul(12) },
      { symbols: [{ symbol: "mi" }], scale: inch.mul(63360) },
    ]],
  ],
);

// Format in different systems
const height = Amount.from(1.78, Length, "m");
height.toString();            // "1.78 m" (standard system, standard unit)
height.toString("imperial");  // "5 ft 10 in" (compound)
```

The first system is the "standard" system and the first unit in it is the "standard" unit. Non-decimal systems format as compound units (e.g., "5 ft 10 in", "5 hours 10 minutes 1 second").

#### The `human` and `atomic` Designations

These provide a uniform interface across kinds:

```typescript
// Generic code that works with any kind
function displayBalance<K extends KindWithHuman>(amount: Amount<K>): string {
  return amount.toString();  // uses human unit
}

function toChainFormat<K extends KindWithAtomic>(amount: Amount<K>): bigint {
  return amount.in("atomic");  // wei, satoshis, lamports, etc.
}
```

- `human`: The unit people naturally think in (ETH, USD, meters)
- `atomic`: The indivisible unit for storage/transmission (wei, cents, mm)

Note: `atomic` is context-dependent. Lamports are atomic for SOL transfers, but compute prices use microlamports. The designation reflects the common case.

### Amount

An `Amount` pairs a value with a `Kind`. Internally stored in standard units as `Rational`.

```typescript
// Creation (number, string, bigint, or Rational)
Amount.from(1.5, ETH);          // uses human unit by default
Amount.from(1.5, ETH, "Gwei");  // explicit unit
Amount.from("1,000.5", ETH);    // from string

// Parsing
Amount.parse("1.5 ETH", ETH);
Amount.parse("2 hours 30 minutes", Duration);

// Unit conversion
amt.in("ETH");      // Rational
amt.in("atomic");   // bigint (floors)
amt.in("human");    // Rational

// Rounding
amt.floorTo("Gwei");  amt.ceilTo("Gwei");  amt.roundTo("Gwei");

// Arithmetic (same kind required for add/sub)
a.add(b);  a.sub(b);  a.mul(2);  a.div(2);

// Comparison
a.eq(b);  a.ne(b);  a.lt(b);  a.le(b);  a.gt(b);  a.ge(b);

// Kind conversion via Conversion (dimensional analysis)
ethAmount.mul(usdPerEth);  // ETH × USD/ETH = USD
usdAmount.div(usdPerEth);  // USD ÷ USD/ETH = ETH
```

#### Formatting

```typescript
const amt = Amount.from(1234.56789, ETH);

amt.toString();                 // "1,235 ETH" (approximate, default)
amt.toString("precise");        // "1,234.56789 ETH"
amt.toString("inUnit", "Gwei"); // "1,234,567,890,000 Gwei"
amt.toString("inUnit", "ETH", { precision: 2 });  // "1,234.57 ETH"

// Options: thousandsSep ("," | "_" | ""), trimZeros, system (for multi-system kinds)
amt.toString("approximate", { thousandsSep: "_" });  // "1_235 ETH"
amt.toString("inUnit", "ETH", { precision: 6, trimZeros: false });  // "1,234.567890 ETH"
amt.toString("imperial");  // format using imperial system
```

### Conversion

A `Conversion` represents a ratio between two `Kind`s (e.g., a price).

```typescript
// Creation
Conversion.from(3000, USD, ETH);         // 3000 USD per ETH
usd(3_000).per(ETH);                     // equivalent to ^
Conversion.from(usdAmount, ethAmount);   // from two amounts
usdAmount.per(ethAmount);                // equivalent to ^

// Parsing
Conversion.parse("3000 USD/ETH", USD, ETH);
Conversion.parse("1/2 BTC/ETH", BTC, ETH);  // ratio syntax

// Get ratio in specific units
conv.in("USD", "ETH");  // Rational(3000)

// Arithmetic
conv.mul(2);  conv.div(2);

// Invert
conv.inv(); // now ETH / USD

// Chain conversions
usdToEth.combine(ethToBtc);  // USD/BTC

// Formatting
conv.toString();  // "3,000 USD/ETH"
```

### Scalar Kinds

For dimensionless quantities (percentages, multipliers), use `scalar`:

```typescript
import { kind, scalar, Amount } from "@xlabs-xyz/amount";

const Percentage = scalar(kind(
  "Percentage",
  [ { symbols: [{ symbol: "x"  }] },
    { symbols: [{ symbol: "%"  }], oom: -2 },
    { symbols: [{ symbol: "bp" }], oom: -4 },  // basis points
  ],
  { human: "%" }
));
const percent = Amount.ofKind(Percentage);

const fee = percent(10);
const total = usd(1000);
total.mul(fee);  // $100
total.div(fee);  // $10,000
```

## Type Narrowing

Use type guards when working with unions:

```typescript
if (Amount.isOfKind(amt, "ETH"))    amt.in("wei");        // narrowed
if (Conversion.hasNum(conv, "ETH")) conv.in("Gwei", "$"); // narrowed numerator
if (Conversion.hasDen(conv, "USD")) ...                   // narrowed denominator
```

## Limitations

### Symbol Characters

Symbols cannot contain:
- Digits (0-9)
- Spaces
- Commas, underscores, dots, or slashes (used in number parsing)

Unicode symbols work fine: `$`, `€`, `¥`, `m³`, `µs`, `°C`.

If you need a symbol like "m3", use the Unicode superscript: `m³`.

### Linear Unit Systems / Conversion only

Kinds like temperature where different systems use affine rather than just linear transforms (i.e. they have an additive componenet e.g. `x °C = 9/5 x + 32 °F`) are not supported (adding support wouldn't be too hard, but the additional complexity is likely not worth it).
