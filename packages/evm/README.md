# @xlabs-xyz/evm

[![npm version](https://img.shields.io/npm/v/@xlabs-xyz/evm.svg)](https://www.npmjs.com/package/@xlabs-xyz/evm)

Ethereum/EVM utilities built on [viem](https://www.npmjs.com/package/viem). Provides type-safe ERC20 and EIP-2612 permit interactions, batched on-chain queries via Multicall3, and low-level EVM binary layout primitives.

- [Contract Specs](#contract-specs) – declarative contract interface definitions
- [ERC20](#erc20) – read/write ERC20 methods via spec
- [EIP-2612 Permit](#eip-2612-permit) – on-chain permit calls and off-chain message composition
- [Batched Queries](#batched-queries) – Multicall3-based read batching with block-consistent results
- [EVM Layout Primitives](#evm-layout-primitives) – word-aligned binary layouts, function selectors, storage slot computation

## Contract Specs

`contractFromSpec` generates a typed contract interface from a declarative spec. Each entry is a tuple of `[functionName, solidityArgTypes, inputLayout, outputLayout | undefined]`:

- **Read calls** (output layout defined) return a layout triple `[layout, params, outputLayout]` for use with `queryEvm`.
- **Write calls** (output `undefined`) take a `from` address and return pre-serialized call data.

```ts
import { contractFromSpec } from "@xlabs-xyz/evm";

const spec = [
  ["balanceOf", ["address"], [addr("owner")], uint256Item],
  ["transfer",  ["address", "uint256"], [addr("to"), u256("value")], undefined],
] as const;

const contract = contractFromSpec("0xA0b8...eB48", spec);

// Read call — returns { to, data: [layout, params, outputLayout] }
const call = contract.balanceOf({ owner: "0xd8dA...6045" });

// Write call — returns { from, to, data: Uint8Array }
const tx = contract.transfer("0xFROM...", { to: "0xd8dA...6045", value: 500n });
```

## ERC20

Built on `contractFromSpec`. Provides `name`, `symbol`, `decimals`, `balanceOf`, `allowance`, `approve`, and `transfer`. The optional `kind` parameter enables typed `Amount` values via `@xlabs-xyz/amount`.

```ts
import { erc20, queryEvm } from "@xlabs-xyz/evm";

const usdc = erc20("0xA0b8...eB48");

// Read calls — use with queryEvm
const [[name, decimals, balance]] = await query([
  usdc.name({}),
  usdc.decimals({}),
  usdc.balanceOf({ owner: "0xd8dA...6045" }),
]);

// Write calls
const approveTx = usdc.approve(ownerAddr, { spender: spenderAddr, value: 1000n });
const transferTx = usdc.transfer(fromAddr, { to: toAddr, value: 500n });
```

## EIP-2612 Permit

### On-chain calls

The `permit` function provides `DOMAIN_SEPARATOR`, `nonces`, and `permit` methods via `contractFromSpec`:

```ts
import { permit } from "@xlabs-xyz/evm";

const p = permit("0xA0b8...eB48");

// Read the domain separator and nonce
const [[domainSep, nonce]] = await query([
  p.DOMAIN_SEPARATOR({}),
  p.nonces({ owner: ownerAddr }),
]);

// Submit a permit (params match the Solidity signature directly)
const tx = p.permit(ownerAddr, {
  owner: ownerAddr, spender: spenderAddr, value: 1000n,
  deadline: new Date("2030-01-01"), v: 27n, r: rBytes, s: sBytes,
});
```

### Off-chain message composition

`guessEip712Domain` reconstructs the EIP-712 domain from on-chain data by brute-forcing the version field against the domain separator hash. `composePermitMsg` builds a ready-to-sign EIP-2612 permit.

```ts
import { composePermitMsg, guessEip712Domain } from "@xlabs-xyz/evm";

const domain = guessEip712Domain(
  tokenName, contractAddress, chainId, domainSeparator,
);

const permitData = composePermitMsg(
  owner, spender, amount, domain, nonce,
  deadline, // optional — defaults to max uint256
);
```

## Batched Queries

`queryEvm` batches arbitrary read calls into a single [Multicall3](https://www.multicall3.com/) request and returns the results together with the block number and timestamp — so everything you read is from the same point in time.

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { queryEvm, erc20 } from "@xlabs-xyz/evm";

const client = createPublicClient({ chain: mainnet, transport: http() });
const query = queryEvm(client);

const token = erc20("0xA0b8...eB48");

const [[balance, allowance], blockNumber, blockHash, blockTime] = await query(
  [
    token.balanceOf({ owner: "0xd8dA...6045" }),
    token.allowance({ owner: "0xd8dA...6045", spender: "0xBEEF...0000" }),
  ],
  "latest",
);
```

You can mix and match three call data formats freely — even within the same batch:

```ts
const [[rawBytes, amount, viemDecoded]] = await query(
  [
    // 1. Raw bytes — you serialize and get raw bytes back
    { to: token, data: serialize(balanceOfLayout, { owner }) },
    // 2. Layout triple — deserialized via the output layout
    { to: token, data: [balanceOfLayout, { owner }, evmAmountItem(ethKind)] },
    // 3. Function signature — viem ABI-encodes the call and decodes the return
    { to: token, data: ["balanceOf(address) view returns (uint256)", [owner]] },
  ],
  "latest",
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
