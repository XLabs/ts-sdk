# @xlabs-xyz/ts-sdk

A collection of TypeScript utilities for building robust, type-safe blockchain applications. The monorepo provides foundational tools from low-level binary serialization to high-level Solana fork testing.

## Packages

| Package | Description |
|---------|-------------|
| [`@xlabs-xyz/const-utils`](./packages/const-utils) | Type-safe utilities for readonly/const data structures, branding, and type manipulation |
| [`@xlabs-xyz/utils`](./packages/utils) | Common runtime utilities: encoding, hashing, bigint JSON, assertions |
| [`@xlabs-xyz/binary-layout`](./packages/binary-layout) | Declarative DSL for binary serialization/deserialization with strong typing |
| [`@xlabs-xyz/amount`](./packages/amount) | Type-safe amounts with units and arbitrary-precision arithmetic |
| [`@xlabs-xyz/common`](./packages/common) | Glue layer tying lower-level packages into practical building blocks |
| [`@xlabs-xyz/svm`](./packages/svm) | Solana/SVM utilities and helpers |
| [`@xlabs-xyz/fork-svm`](./packages/fork-svm) | Anvil-style local SVM fork with lazy account fetching for testing |

## Dependency Graph

```
const-utils ──┬── utils ──────────┐
              ├── amount ─────────┼── common ── svm ── fork-svm
              └── binary-layout ──┘
```

## Package Summaries

### const-utils
The foundation layer providing type-safe utilities for working with readonly and const data structures:
- **Const Maps**: Bidirectional, type-safe mappings from hierarchical const specifications
- **Array/Object Utilities**: Const-preserving transformations (`mapTo`, `zip`, `pick`, `omit`, etc.)
- **Branding**: Hierarchical type branding with tag accumulation for nominal typing
- **Type Utilities**: `RoUint8Array`, deep readonly/mutable helpers, tuple types

### utils
Common runtime utilities with minimal dependencies:
- **Encoding**: hex, base58, base64, bech32, bignum, UTF-8 bytes
- **Hashing**: Re-exports from `@noble/hashes` and `@noble/curves`
- **BigInt JSON**: Serialization that preserves bigints
- **Assertions**: Simple runtime checks (`assertEqual`, `assertDistinct`, `definedOrThrow`)

### binary-layout
A declarative DSL for binary data serialization/deserialization:
- **Pure TypeScript**: No code generation or meta-compilation required
- **Strong Typing**: `DeriveType` infers types from layout definitions
- **Composable**: Nested structures, arrays, switches (tagged unions)
- **Automatic Discrimination**: Generates efficient discriminators for layout sets
- **Custom Conversions**: Transform between binary and domain types

### amount
Type-safe handling of amounts with units and arbitrary-precision arithmetic:
- **Rational**: Exact arithmetic via normalized fractions
- **Kind**: Define dimensions with multiple unit systems (ETH/Gwei/wei, USD/cents, etc.)
- **Amount**: Values paired with kinds, with unit conversion and formatting
- **Conversion**: Type-safe ratios between kinds (prices, exchange rates)

### common
Glue layer that ties the lower-level packages together:
- **Layout Items**: Binary-layout items that serialize to/from `Amount`, timestamps, etc.
- **Units**: Predefined kinds for currencies (USD, BTC, ETH, SOL), percentages, duration, bytes
- **Helpers**: Unit definition utilities for creating custom kinds

### svm
Solana/SVM utilities built on `@solana/kit`:
- **Client Utilities**: Type-safe RPC wrappers with optional `Amount` integration
- **PDA Derivation**: `findPda`, `findAta`, with type-safe seed handling
- **Binary Layouts**: Items for addresses, lamports, SPL accounts (mint, token, ALT)
- **Instruction Composition**: Type-safe instruction and transaction building
- **Constants**: All standard program IDs, sysvar IDs, size constants

### fork-svm
Anvil-style local SVM fork for Solana testing:
- **Lazy Forking**: Accounts fetched on-demand from mainnet/devnet
- **State Manipulation**: Modify accounts, clock, and balances
- **Snapshots**: Save/restore state; persist to disk for reproducible CI
- **Drop-in RPC**: Compatible interface for existing RPC-based code
- **In-Process**: Fast, no separate validator process

## Installation

```bash
# Install individual packages as needed
pnpm add @xlabs-xyz/const-utils
pnpm add @xlabs-xyz/binary-layout
pnpm add @xlabs-xyz/amount
# etc.
```

Packages use peer dependencies for internal cross-references, so install the packages you need directly.
