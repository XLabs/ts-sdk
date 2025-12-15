# @xlabs-xyz/fork-svm

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/fork-svm.svg)](https://www.npmjs.com/package/@xlabs-xyz/fork-svm)

Anvil for Solana: a local SVM fork with lazy account fetching. Built on [LiteSVM](https://github.com/LiteSVM/litesvm) and [@solana/kit](https://www.npmjs.com/package/@solana/kit).

## Why?

Testing Solana programs is painful. Your options:

* **solana-test-validator**
  - Slow startup
  - Separate process
  - Must pre-declare every account to clone
  - State doesn't persist nicely between test runs
* **LiteSVM**
  - Fast and in-process
  - But Rust-first; Node bindings are outdated and `@solana/web3.js`-based
  - No transparent forking
  - Manual account setup for everything
* **Just use devnet**
  - Slow, flaky, funds-limited, rate-limited
  - No state manipulation

Meanwhile, EVM developers have had Anvil and Hardhat for years - local nodes that lazily fork state from mainnet/testnet, let you manipulate time, and provide a drop-in RPC.

This package brings that experience to Solana:

```typescript
const fork = new ForkSvm({ url: "https://api.mainnet-beta.solana.com" });

// Load the program you're testing
fork.addProgramFromFile(programId, "./target/deploy/my_program.so");

// Read and modify any account
const acc = await fork.getAccount(someAddress);
fork.setAccount(someAddress, { ...acc, data: modifiedData });

// Accounts are fetched lazily - no upfront cloning
// Works with both legacy and v0 transactions (including ALTs)
const tx = await buildSomeTransaction();
await fork.sendTransaction(tx); // fetches what it needs automatically

// Or use as a drop-in RPC
const rpc = fork.createForkRpc();
await rpc.getBalance(myWallet).send(); // works with existing code ...
await myProgramSdk.doSomething(rpc, ...); //... including your contract's sdk

// Snapshot and restore
const snapshot = fork.save();
// ... run destructive tests ...
fork.load(snapshot);

// Persist to disk for reproducible CI
await writeToDisc("./fixtures/my-test", snapshot);
```

## Quick Start

```typescript
import { ForkSvm } from "@xlabs-xyz/fork-svm";

// Create a network fork
const fork = new ForkSvm({ url: "https://api.mainnet-beta.solana.com" });

// Or create an empty local SVM (no upstream)
const localSvm = new ForkSvm();

// Fund a test wallet
const wallet = address("...");
await fork.airdrop(wallet, 10_000_000_000n); // 10 SOL - see utils below for nicer amount spec

// Send transactions
await fork.sendTransaction(tx).then(meta => {
  console.log(meta.logs()); // transaction logs
  console.log(meta.computeUnitsConsumed()); // CU used
});

// Get account data (fetched from upstream if not cached)
const account = await fork.getAccount(someAddress);
```

## Core API

### Constructor

```typescript
new ForkSvm({
  url?:                 string,  // RPC URL to fork from (undefined = empty local SVM)
  withDefaultPrograms?: boolean, // include SPL Token, ATA, etc. (default: true)
  withSysvars?:         boolean, // include clock, rent, etc.    (default: true)
  withBuiltins?:        boolean, // include system program, etc. (default: true)
});
```

### Transactions

```typescript
// Send a transaction (modifies state)
const meta = await fork.sendTransaction(tx);
meta.signature();           // transaction signature
meta.logs();                // program logs
meta.computeUnitsConsumed();
meta.returnData();          // program return data
meta.innerInstructions();   // CPI instructions

// Simulate without modifying state
const simMeta = await fork.simulateTransaction(tx);

// Retrieve a previously sent transaction
const retrieved = fork.getTransaction(signatureBytes);
```

### Account Management

```typescript
// Get account(s) - fetches from upstream if not cached
const acc = await fork.getAccount(address);
const accs = await fork.getAccount([addr1, addr2, addr3]);

// Manually set account state
fork.setAccount(address, {
  owner: programId,
  lamports: 1_000_000_000n,
  data: new Uint8Array([...]),
  executable: false,
  space: 100n,
});

// Airdrop SOL (creates account if needed)
await fork.airdrop(address, lamports);

// Load a program from bytes or file
fork.addProgram(programId, programBytes);
fork.addProgramFromFile(programId, "./target/deploy/my_program.so");
```

### Clock

```typescript
// Get full clock state
const clock = fork.getClock();
// => { timestamp, slot, epoch, epochStartTimestamp, leaderScheduleEpoch }

// Set any subset of clock fields
fork.setClock({ timestamp: new Date("2025-06-01") });
fork.setClock({ slot: 300_000_000n });
fork.setClock({ timestamp: new Date("2025-06-01"), slot: 300_000_000n });

// Convenience shortcuts
fork.latestTimestamp(); // Date
fork.latestSlot();      // bigint

// Sync to current network time (requires RPC)
await fork.advanceToNow();

// Blockhash management
fork.latestBlockhash(); // current blockhash
fork.expireBlockhash(); // expire current, generate new
```

### Snapshots

```typescript
// Save current state
const snapshot = fork.save();

// Restore state
fork.load(snapshot);

// Create new fork from snapshot
const newFork = ForkSvm.load(snapshot);
```

### Disk Persistence

Persist snapshots to disk for reproducible tests that don't depend on network state:

```typescript
import { writeToDisc, readFromDisc } from "@xlabs-xyz/fork-svm";

// Save a snapshot after fetching the accounts you need
await writeToDisc("./fixtures/my-scenario", fork.save());

// Later (or in CI), load from disk - no RPC calls needed
const snapshot = await readFromDisc("./fixtures/my-scenario");
const fork = ForkSvm.load(snapshot);
```

This is invaluable for:
- **Reproducible CI** - tests run against a fixed snapshot, not the live network
- **Offline development** - work without network access once you've captured state
- **Debugging** - save state at a specific point and replay transactions against it

### Drop-in RPC

For code that expects a standard Solana RPC, create a compatible interface:

```typescript
const rpc = fork.createForkRpc();

// Works with existing RPC-based code
const balance = await rpc.getBalance(address).send();
const account = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
const blockhash = await rpc.getLatestBlockhash().send();

// Transactions go through the fork
await rpc.sendTransaction(wireTransaction, { encoding: "base64" }).send();
```

Supported methods: `getAccountInfo`, `getMultipleAccounts`, `getBalance`, `getLatestBlockhash`, `sendTransaction`, `simulateTransaction`, `getTransaction`.

## Utilities

### `createCurried`

Creates a set of convenience functions that work with the fork's RPC and optionally integrate with [`@xlabs-xyz/amount`](https://github.com/XLabs/ts-sdk/blob/main/packages/amount/README.md) for type-safe, human-readable amounts (see [`@xlabs-xyz/common`](https://github.com/XLabs/ts-sdk/blob/main/packages/common/src/units.ts) for `Sol`, `sol`, and `usdc`):

```typescript
import { createCurried } from "@xlabs-xyz/fork-svm";
import { Sol, sol, usdc } from "@xlabs-xyz/common";

const {
  minimumBalanceForRentExemption,
  getAccountInfo,
  getDeserializedAccount,
  getMint,
  getTokenAccount,
  getBalance,
  getTokenBalance,
  airdrop,
  createAccount,
  createAta,
  createTx,
  sendTx,
  createAndSendTx,
} = createCurried(fork, Sol); // Sol kind for typed amounts (optional)

// Now with nicer ergonomics
await airdrop(wallet, sol(0.1));
const balance = await getBalance(wallet); // Amount<Sol>
const ata = createAta(wallet, usdcMint, usdc(100));
await createAndSendTx(instructions, feePayer, additionalSigners, alts);
```

### `assertTxSuccess`

Unwraps a transaction result, failing with a clear message if it errors:

```typescript
import { assertTxSuccess } from "@xlabs-xyz/fork-svm";

const meta = await assertTxSuccess(fork.sendTransaction(tx));
// throws with logs if tx fails
```

## Comparison

| Feature            | ForkSvm | solana-test-validator | LiteSVM (Node) |
|--------------------|---------|-----------------------|----------------|
| In-process         | ✅      | ❌                    | ✅             |
| Lazy forking       | ✅      | ❌ (explicit --clone) | ❌             |
| State manipulation | ✅      | ❌                    | ✅             |
| Snapshots          | ✅      | ❌                    | ❌             |
| Drop-in RPC        | ✅      | ✅                    | ❌             |
| @solana/kit        | ✅      | N/A                   | ❌ (web3.js)   |

## Notes

### LiteSVM

This package includes a modified copy of [LiteSVM](https://github.com/LiteSVM/litesvm)'s Node.js bindings (in `src/liteSvm/`). The upstream npm package was both outdated (crashes on newer Solana programs) and built on the legacy `@solana/web3.js`. The version here uses freshly built binaries and has been ported to `@solana/kit`.

Binaries for macOS (ARM64) and Linux (x64) are included. For other platforms, run `scripts/build.sh` (requires yarn and Rust).
