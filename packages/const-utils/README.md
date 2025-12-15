# @xlabs-xyz/const-utils

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/const-utils.svg)](https://www.npmjs.com/package/@xlabs-xyz/const-utils)

Type-safe utilities for readonly and const data structures, including bidirectional mappings, array transformations, and object manipulation. Also includes general-purpose typing utilities – const/readonly is the primary theme, but not the only one.

- [Type Utilities](#type-utilities) – core types, mutability helpers, `RoUint8Array`
- [Array Utilities](#array-utilities) – const-preserving array operations
- [Object Utilities](#object-utilities) – type-safe object manipulation
- [Const Maps](#const-maps) – type-safe bidirectional mappings from nested specs
- [String Utilities](#string-utilities) – type-preserving case functions
- [Branding](#branding) – hierarchical type branding with tag accumulation
- [Aliasing](#aliasing) – suppress union/type expansion in IDE tooltips

## Type Utilities

Core type utilities for readonly data and type manipulation.

### Tuple Types

- `Tuple<T>`, `NeTuple<T>` – mutable tuple, non-empty variant
- `RoTuple<T>`, `RoNeTuple<T>` – readonly tuple, non-empty variant
- `RoArray<T>` – `readonly T[]`
- `RoPair<T, U>` – `readonly [T, U]`

### RoUint8Array

A truly readonly `Uint8Array` type that correctly types `subarray`, `valueOf`, and callback methods. See [RoUint8Array.md](./RoUint8Array.md) for implementation details.

### Mutability Helpers

- `Ro<T>`, `DeepRo<T>` – shallow/deep readonly (handles `RoUint8Array`)
- `Mutable<T>`, `DeepMutable<T>` – shallow/deep mutable
- `ro(value)`, `deepRo(value)` – runtime casts
- `mutable(value)`, `deepMutable(value)` – runtime casts

### Other Utilities

- `Function<P, R>` – generic function type (more powerful than built-in)
- `Opts<T>` – make all properties optional and allow `undefined`
- `Simplify<T>` – flatten intersection types for readability
- `Widen<T>` – widen literal types to their base types
- `HeadTail<T, Head, Tail>` – pattern match on tuple head/tail
- `Extends<T, U>`, `IsAny<T>, If<C, T, F>` – type predicates
- `assertType<T>()(value)` – assert a value extends a type (for complex generics)

## Array Utilities

Const-preserving array operations that maintain tuple types through transformations.

### Type-Preserving Map

```typescript
const tup = [1, 2, 3] as const;
tup.map(x => x.toString());         // => string[] (loses tuple structure)
mapTo(tup)(x => x.toString());      // => readonly [string, string, string]
mapTo(1)(x => x.toString());        // => string (also works on scalars)
```

### Entries

```typescript
entries([10, 20, 30] as const);     // => [[0, 10], [1, 20], [2, 30]]
valueIndexEntries(["a", "b"]);      // => [["a", 0], ["b", 1]]
```

### Transformations

```typescript
range(3);                                   // => [0, 1, 2]
flatten([[1, 2], [3]]);                     // => [1, 2, 3]
chunk([1, 2, 3, 4, 5], 2);                  // => [[1, 2], [3, 4], [5]]
zip([["a", "b"], [1, 2]]);                  // => [["a", 1], ["b", 2]]
column([["a", 1], ["b", 2]], 0);            // => ["a", "b"]
pickWithOrder(["a", "b", "c"], [2, 0]);     // => ["c", "a"]
filterIndexes(["a", "b", "c"], [0, 2]);     // => ["a", "c"]
```

### Set Operations

```typescript
intersect(["a", "b", "c"], ["b", "c", "d"]);  // => ["b", "c"]
union(["a", "b"], ["b", "c"]);                // => ["a", "b", "c"]
difference(["a", "b", "c"], ["b"]);           // => ["a", "c"]
```

### Type Utilities

- `TupleRange<L>`, `Range<L>` – `[0, 1, ..., L-1]`
- `TupleWithLength<T, L>` – tuple of L elements of type T
- `Flatten<A>`, `InnerFlatten<A>`, `Unflatten<A>`
- `Chunk<A, N>`, `Zip<A>`, `Column<A, I>`
- `Cartesian<L, R>` – Cartesian product type
- `TupleFilter<T, Include>`, `TupleFilterOut<T, Exclude>`
- `Intersect<T, U>`, `Union<T, U>`, `Difference<T, U>`

## Object Utilities

Type-safe object manipulation.

```typescript
pick({ a: 1, b: 2, c: 3 }, ["a", "b"]);       // => { a: 1, b: 2 }
omit({ a: 1, b: 2, c: 3 }, "c");              // => { a: 1, b: 2 }
replace({ a: 1, b: 2 }, "a", "new");          // => { a: "new", b: 2 }

spread({ a: 1, n: { b: 2, c: 3 } }, "n");     // => { a: 1, b: 2, c: 3 }
nest({ a: 1, b: 2, c: 3 }, "n", ["b", "c"]);  // => { a: 1, n: { b: 2, c: 3 } }

// Deep operations with path support
deepOmit(obj, ["users", anyKey, "password"]); // remove password from all users
fromEntries([["a", 1], ["b", 2]] as const);   // => { a: 1, b: 2 } (typed)
```

## Const Maps

`constMap` provides a way to define type-safe mappings from hierarchical const data specifications.

### Example

```typescript
const networks = [[
  "Mainnet", [
    ["Ethereum",       1n],
    ["Bsc",           56n],
    ["Polygon",      137n],
  ]], [
  "Testnet", [
    ["Ethereum",       5n],
    ["Sepolia", 11155111n],
  ]]
] as const satisfies MappingEntries;
```

This specifies a relationship between EVM chain ids and their respective chains and networks. It is a shortened way to specify the full Cartesian product:

```typescript
[
  ["Mainnet", "Ethereum",       1n],
  ["Mainnet", "Bsc",           56n],
  ["Mainnet", "Polygon",      137n],
  ["Testnet", "Ethereum",       5n],
  ["Testnet", "Sepolia", 11155111n],
]
```

### Usage

```typescript
const chainId = constMap(networks);

chainId("Mainnet", "Ethereum");     // => 1n (typed as literal)
chainId("Testnet", "Sepolia");      // => 11155111n

chainId.has("Mainnet", "Solana");   // => false
chainId.get("Mainnet", "Solana");   // => undefined

const testnetChainId = chainId.subMap("Testnet");
testnetChainId("Sepolia");          // => 11155111n
```

### Custom Shapes

By default, the first n-1 columns are keys and the last column is the value. Custom shapes allow different mappings:

```typescript
// Reverse lookup: chainId -> [network, chain]
const networkAndChain = constMap(networks, [2, [0, 1]]);
networkAndChain(1n);                // => ["Mainnet", "Ethereum"]

// Chain -> networks (one-to-many)
const networksForChain = constMap(networks, [1, 0]);
networksForChain("Ethereum");       // => ["Mainnet", "Testnet"]
```

Supports `bigint` and `boolean` keys natively (unlike plain objects which coerce them to strings).

## String Utilities

Type-preserving string case functions.

```typescript
uppercase("hello");     // => "HELLO" (typed as Uppercase<"hello">)
lowercase("HELLO");     // => "hello"
capitalize("hello");    // => "Hello"
uncapitalize("Hello");  // => "hello"
otherCap("hello");      // => "Hello" (toggles first letter case)
```

## Branding

Branding allows you to create distinct types from a base type by attaching tags, to get around issues that stem from TypeScript using structural typing (duck-typing) where `type UserId = string;` and `type ProductId = string;` are considered equivalent, leading to accidental mixing of values that share the same underlying type but represent different concepts.

### Hierarchical Tag Accumulation

The key feature of this implementation on top of normal branding mechanics is that tags accumulate hierarchically. When you brand a type that's already branded, the new tag is added to the existing set of tags rather than replacing them:

```typescript
type UserId = Brand<string, "UserId">;
type AdminId = Brand<UserId, "AdminId">; // AdminId now has both "UserId" and "AdminId" tags
```

This allows for type hierarchies where more specific branded types inherit the constraints of their parent brands, but can be covariantly passed to functions that expect the parent type:

```typescript
function processUser(userId: UserId): void;
processUser(adminId); // works because AdminId is a subtype of UserId
```

### The `brand` Function

`brand()` captures the inferred type without requiring its explicit specification. Useful when branding complex types:

```typescript
import { address } from "@solana/kit";

const userAddress = brand<"user">()(address("3WxjT2rCBfncPvDHsnBc9nB3MQo2eYk25tV2SmC9E5HM"));
// => Brand<Address<"3WxjT2rCBfncPvDHsnBc9nB3MQo2eYk25tV2SmC9E5HM">, "user">
```

### Exports

- `Brand<T, Tag>` – apply a brand tag to a type
- `Branded<Base, Tags>` – the underlying branded type structure
- `Unbrand<T>` – strip branding, recover the base type
- `ExtractTags<T>` – get the tags from a branded type
- `IsBranded<T>` – check if a type is branded
- `SameBrand<T, U>` – check if two types have identical brands
- `PreserveBrand<T, R>` – transfer brand from T to R if base types match
- `BrandedSubArray<T>` – helper for branded Uint8Arrays with correct `subarray` return type
- `brand<Tag>()` – runtime branding function

## Aliasing

A hack to make large union types more readable in IDE tooltips.

TypeScript always expands union types like `type Letter = "a" | "b" | ... | "z"` in tooltips. This module provides a way to suppress that expansion:

```typescript
type Letter = "a" | "b" | "c" | "d" | "e" | "f";
interface AllLetters extends SuppressExpansion<Letter> {}

interface LetterAliases {
  AllLetters: [Letter, AllLetters];
}

type Test = ApplyAliases<LetterAliases, Letter>; // => keyof AllLetters (not expanded)
```

Subsets can also be registered:

```typescript
interface Vowels extends SuppressExpansion<"a" | "e"> {}
interface LetterAliases {
  Vowels: ["a" | "e", Vowels];
}

type Test = ApplyAliases<LetterAliases, "a" | "e" | "f">; // => keyof Vowels | "f"
```

### Exports

- `SuppressExpansion<T>` – create an interface that suppresses union expansion
- `ApplyAliases<Aliases, Union>` – apply registered aliases to a union
- `Expand<A>` – re-expand an alias back to its union
- `Opaque<T>` – prevent intellisense from expanding an already-aliased type
