# @xlabs-xyz/evm

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/evm.svg)](https://www.npmjs.com/package/@xlabs-xyz/evm)

Ethereum/EVM utilities built on [viem](https://www.npmjs.com/package/viem). Provides type-safe ERC20 interactions, batched on-chain queries via Multicall3, EIP-712/EIP-2612 permit helpers, and low-level EVM binary layout primitives.

- [ERC20 Client](#erc20-client) – compose approve, transfer, permit, and query call data
- [Batched Queries](#batched-queries) – Multicall3-based read batching with block-consistent results
- [EIP-712 & EIP-2612 Permits](#eip-712--eip-2612-permits) – domain reconstruction and permit message composition
- [EVM Layout Primitives](#evm-layout-primitives) – word-aligned binary layouts, function selectors, storage slot computation

## ERC20 Client

Gives you a handle on any ERC20 token — call methods to compose transaction or query data without actually sending anything.

```ts
import { erc20 } from "@xlabs-xyz/evm";

const token = erc20("0xA0b8...eB48");

// Build an approve transaction
const approveTx = token.approve(ownerAddr, spenderAddr, 1000n);
// => { to, data, from }

// Build a transfer transaction
const transferTx = token.transfer(fromAddr, toAddr, 500n);

// Build read-call data for use with queryEvm
const balanceCall = token.balanceOfQuery(ownerAddr);
const allowanceCall = token.allowanceQuery(ownerAddr, spenderAddr);

// EIP-2612 permit transaction
const permitTx = token.permit(owner, spender, value, deadline, signature);
```

The optional `kind` type parameter enables unit-aware amounts via `@xlabs-xyz/amount`.

## Batched Queries

Why make five RPC calls when one will do? `queryEvm` batches arbitrary read calls into a single [Multicall3](https://www.multicall3.com/) request and hands back the results together with the block number and timestamp — so everything you read is from the same point in time.

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { queryEvm, erc20 } from "@xlabs-xyz/evm";

const client = createPublicClient({ chain: mainnet, transport: http() });
const query = queryEvm(client);

const token = erc20("0xA0b8...eB48");

const [results, blockNumber, blockTime] = await query(
  [
    token.balanceOfQuery("0xd8dA...6045"),
    token.allowanceQuery("0xd8dA...6045", "0xBEEF...0000"),
  ],
  "latest",
);

const [balance, allowance] = results;
```

You can mix and match three call data formats freely — even within the same batch. Here's the same `balanceOf` call in each style, all in one request:

```ts
import { serialize } from "@xlabs-xyz/binary-layout";
import {
  queryEvm,
  selectorLayout,
  paddedSlotLayout,
  addressItem,
  evmAmountItem,
} from "@xlabs-xyz/evm";

const query = queryEvm(client);
const token = "0xA0b8...eB48" as const;
const owner = "0xd8dA...6045" as const;

const balanceOfLayout = selectorLayout("balanceOf(address)")([
  { name: "owner", ...paddedSlotLayout(addressItem) },
]);

const [[rawBytes, amount, viemDecoded]] = await query(
  [
    // 1. Raw bytes — you serialize and get raw bytes back
    { to: token, data: serialize(balanceOfLayout, { owner }) },
    // 2. Layout triple — deserialized via evmAmountItem into a typed Amount
    { to: token, data: [balanceOfLayout, { owner }, evmAmountItem(ethKind)] },
    // 3. Function signature — viem ABI-encodes the call and decodes the return
    { to: token, data: ["balanceOf(address) view returns (uint256)", [owner]] },
  ],
  "latest",
);

console.log(rawBytes);     // Uint8Array (raw returndata, decode it yourself)
console.log(amount);       // Amount<ETH> (e.g. 1.5 ETH — typed, unit-aware)
console.log(viemDecoded);  // bigint (e.g. 1500000000000000000n — viem's ABI decoding)
```

## EIP-712 & EIP-2612 Permits

Not every token publishes its EIP-712 domain in a convenient way. `guessEip712Domain` reconstructs it from on-chain data by brute-forcing the version field against the domain separator hash. Once you have the domain, `composePermitMsg` builds a ready-to-sign EIP-2612 permit.

```ts
import { composePermitMsg, guessEip712Domain } from "@xlabs-xyz/evm";

const domain = guessEip712Domain(
  tokenName,
  contractAddress,
  chainId,
  domainSeparator,
);

const permitData = composePermitMsg(
  owner,
  spender,
  amount,
  domain,
  nonce,
  deadline, // optional — defaults to max uint256
);
```

## EVM Layout Primitives

The plumbing that the rest of the package is built on. Layout items for EVM's 32-byte word-aligned world, function selector helpers, and storage slot computation — all plugging into `@xlabs-xyz/binary-layout`.

```ts
import {
  uint256Item,
  addressItem,
  signatureItem,
  selectorOf,
  selectorLayout,
  evmAmountItem,
  mappingSlot,
  paddedSlotLayout,
} from "@xlabs-xyz/evm";

// Compute a 4-byte function selector
const sel = selectorOf("transfer(address,uint256)");

// Wrap a layout with a function selector prefix
const transferLayout = selectorLayout("transfer(address,uint256)")([
  { name: "to", ...paddedSlotLayout(addressItem) },
  { name: "value", ...paddedSlotLayout(uint256Item) },
]);

// Compute a Solidity mapping storage slot
const slot = mappingSlot(key, declarationSlot);
```

**Constants:** `wordSize` (32), `addressSize` (20), `selectorLength` (4).
