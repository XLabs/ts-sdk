# @xlabs-xyz/svm

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/svm.svg)](https://www.npmjs.com/package/@xlabs-xyz/svm)

Solana/SVM utilities built on [@solana/kit](https://www.npmjs.com/package/@solana/kit). Provides type-safe RPC helpers, PDA derivation, binary layouts for standard accounts, and instruction composition.

- [Client Utilities](#client-utilities) – RPC wrappers with optional `Amount` integration
- [PDA & Address Utilities](#pda--address-utilities) – PDA derivation, ATA lookup
- [Binary Layouts](#binary-layouts) – Layout items for Solana data structures
- [Instruction Composition](#instruction-composition) – Type-safe instruction building
- [Constants](#constants) – Program IDs, sysvar IDs, size constants
- [Ed25519 Program](#ed25519-program) – Signature verification instruction

## Client Utilities

Thin wrappers around `@solana/kit` RPC methods with optional `Amount` kind integration for type-safe lamports/token amounts.

```typescript
import { createSolanaRpc } from "@solana/kit";
import { Sol } from "@xlabs-xyz/common";

const client = createSolanaRpc("https://api.mainnet-beta.solana.com");

// Basic account info (lamports as bigint by default)
const account = await getAccountInfo(client, address);

// With Amount kind - lamports become Amount<Sol>
const accountTyped = await getAccountInfo(client, address, Sol);
accountTyped?.lamports.in("SOL");  // Rational

// Batch fetching
const accounts = await getAccountInfo(client, [addr1, addr2, addr3]);

// Balances
const balance = await getBalance(client, address, Sol);  // Amount<Sol> | undefined

// SPL Token accounts
const mint = await getMint(client, mintAddress);
const tokenAcc = await getTokenAccount(client, ataAddress);

// With typed amounts
const typedMint = await getMint(client, mintAddress, MyTokenKind);
typedMint?.supply;  // Amount<MyTokenKind>
```

### Curried Variants

All client functions have curried versions for partial application:

```typescript
const getBalanceInSol = curryGetBalance(Sol)(client);
await getBalanceInSol(address);  // Amount<Sol> | undefined

const getTypedTokenAccount = curryGetTokenAccount(Sol)(client)(MyTokenKind);
await getTypedTokenAccount(ataAddress);
```

### Transaction Helpers

```typescript
// Get blockhash
const { blockhash, lastValidBlockHeight } = await getLatestBlockhash(client);

// Send with automatic lifetime
const signature = await addLifetimeAndSendTx(client, txMessage, signers);

// Or manually
const signature = await sendTx(client, txWithLifetime, signers);
```

## PDA & Address Utilities

### PDA Derivation

```typescript
// Find PDA (returns address only)
const pda = findPda("my_seed", userAddress, programId);

// Find PDA with bump
const [pda, bump] = findPdaAndBump("my_seed", userAddress, programId);

// Calculate PDA with known bump (no search)
const pda = calcPda("my_seed", userAddress, bump, programId);
```

The first seed is type-checked to prevent accidentally passing an `Address` as a UTF-8 string:

```typescript
findPda(userAddress, programId);  // Type error! First seed can't be an Address
findPda("seed", userAddress, programId);  // OK - string seeds are UTF-8 encoded
findPda(new Uint8Array([...]), userAddress, programId);  // OK - raw bytes
```

### Associated Token Account

```typescript
const ata = findAta({ owner: walletAddress, mint: tokenMint });

// With Token-2022
const ata2022 = findAta({
  owner: walletAddress,
  mint: tokenMint,
  tokenProgram: token2022ProgramId,
});
```

### Anchor Discriminators

```typescript
discriminatorOf("instruction", "initialize");  // 8-byte discriminator
discriminatorOf("account", "MyAccount");
discriminatorOf("event", "MyEvent");
```

### Rent Exemption

```typescript
const lamports = minimumBalanceForRentExemption(165);  // Lamports (bigint)
const amount = minimumBalanceForRentExemption(165, Sol);  // Amount<Sol>
```

## Binary Layouts

Layout items for Solana data structures, designed for use with `@xlabs-xyz/binary-layout`.

### Basic Items

- `svmAddressItem` – 32-byte base58 Address
- `lamportsItem` – u64 little-endian, optionally as Amount
- `svmAmountItem` – u64 little-endian for token amounts
- `u64Item` – raw u64 little-endian
- `bumpItem` – single byte
- `vecBytesItem` – length-prefixed bytes (u32 LE)
- `vecArrayItem` – length-prefixed array (u32 LE)
- `littleEndian` – set endianness on any layout

### Account Layouts

Standard SPL account layouts with optional `Amount` kind support:

```typescript
import { deserialize } from "@xlabs-xyz/binary-layout";

// Deserialize a mint account
const mint = deserialize(mintAccountLayout(), accountData);
// => { mintAuthority, supply, decimals, isInitialized, freezeAuthority }

// With typed supply
const typedMint = deserialize(mintAccountLayout(MyTokenKind), accountData);
typedMint.supply;  // Amount<MyTokenKind>
```

### Discriminated Layouts (Anchor-style)

```typescript
// Automatically prepends 8-byte Anchor discriminator
const myAccountLayout = accountLayout("MyAccount", [
  { name: "owner",   ...svmAddressItem     },
  { name: "balance", ...amountItem(8, Sol) },
]);

const myIxLayout = instructionLayout("initialize", [
  { name: "amount", ...amountItem(8, Sol) },
]);
```

### C-style Options

For SPL's `COption<T>` pattern:

```typescript
// COption<Pubkey> - common in SPL Token
const layout = [
  { name: "authority", ...cOptionAddressItem() },
];
// Deserializes to Address | undefined
```

## Instruction Composition

```typescript
import { AccountRole } from "@solana/kit";

// Build an instruction from a layout
const ix = composeIx(
  [
    [authority,       AccountRole.WRITABLE_SIGNER],
    [account,         AccountRole.WRITABLE       ],
    [systemProgramId, AccountRole.READONLY       ],
  ],
  myIxLayout,
  { amount: sol(0.1) },
  programId,
);

// Create ATA instruction
const ataIx = composeCreateAtaIx({
  payer: walletAddress,
  owner: walletAddress,
  mint: tokenMint,
});

// Build transaction message
const txMessage = feePayerTxFromIxs([ix1, ix2], feePayer);
```

## Constants

All standard Solana program IDs, sysvar IDs, and size constants:

- **Built-in programs**: `systemProgramId`, `computeBudgetProgramId`, `bpfLoaderUpgradeableProgramId`, `ed25519SigVerifyProgramId`, ...
- **Sysvars**: `clockSysvarId`, `rentSysvarId`, `instructionsSysvarId`, ...
- **SPL programs**: `tokenProgramId`, `token2022ProgramId`, `associatedTokenProgramId`, ...
- **Addresses**: `nativeMint`, `nativeMint2022`, `incinerator`, ...
- **Sizes**: `addressSize` (32), `signatureSize` (64), `svmMaxTxSize` (1232), `lamportsPerByte` (6960n)

## Ed25519 Program

The Ed25519 signature verification program is notably absent from the official [solana-program](https://github.com/solana-program/) repositories, so we provide a TypeScript implementation here.

Compose Ed25519 signature verification instructions:

```typescript
// Verify a signature
const ix = composeEd25519VerifyIx({
  publicKey: pubkeyBytes,  // or Address, or reference to another ix
  signature: signatureBytes,
  message: messageBytes,
});

// Multiple verifications in one instruction
const ix = composeEd25519VerifyIx([
  { publicKey: pk1, signature: sig1, message: msg1 },
  { publicKey: pk2, signature: sig2, message: msg2 },
]);

// Reference data from another instruction (for secp256k1 recovery, etc.)
const ix = composeEd25519VerifyIx({
  publicKey: { ixIndex: 0, offset: 12 },
  signature: sigBytes,
  message: { ixIndex: 0, offset: 77, size: 32 },
});
```
