import type {
  Abi,
  AbiStateMutability,
  Address,
  PublicClient,
  ParseAbi,
  ContractFunctionName,
  ContractFunctionArgs,
  ContractFunctionReturnType,
} from "viem";
import {
  multicall3Abi,
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
} from "viem";
import type { RoUint8Array, RoArray, RoPair } from "@xlabs-xyz/const-utils";
import { MaybeArray, isArray } from "@xlabs-xyz/const-utils";
import type { Layout, DeriveType } from "@xlabs-xyz/binary-layout";
import { serialize, deserialize } from "@xlabs-xyz/binary-layout";
import { hex } from "@xlabs-xyz/utils";
import { timestampItem } from "@xlabs-xyz/common";
import { selectorLayout, uint256Item } from "./layouting.js";

// ---- ABI string type utilities ----
// Signatures omit the `function` keyword: "balanceOf(address) view returns (uint256)"

type FnSig<S extends string> = `function ${S}`;

type ExtractFnName<S extends string> = S extends `${infer N}(${string}` ? N : never;

// Defer ParseAbi via `infer` so TypeScript doesn't eagerly check
// the Abi constraint when S is still a generic type parameter.
// string extends S guards the fully-generic case.
type AbiArgs<S extends string> =
  string extends S ? RoArray<unknown> :
  ParseAbi<[FnSig<S>]> extends infer A extends Abi ?
    ExtractFnName<S> extends infer N extends ContractFunctionName<A, AbiStateMutability> ?
      ContractFunctionArgs<A, AbiStateMutability, N>
    : never
  : never;

type AbiReturn<S extends string> =
  string extends S ? unknown :
  ParseAbi<[FnSig<S>]> extends infer A extends Abi ?
    ExtractFnName<S> extends infer N extends ContractFunctionName<A, AbiStateMutability> ?
      ContractFunctionReturnType<A, AbiStateMutability, N>
    : never
  : never;

type LayoutTriple<CL extends Layout = Layout, P = unknown, RL extends Layout = Layout> =
  readonly [CL, P, RL];

// Structural constraint — specific typing flows through ResultOf
type CallData = RoUint8Array | LayoutTriple | RoPair<string, RoArray<unknown>>;

// ---- ReadCall ----

export type ReadCall<D extends CallData = CallData> = Readonly<{
  to:    Address;
  from?: Address;
  data:  D;
  allowFailure?: boolean;
}>;

// ---- Call validation ----
// Reconstructs each call with the correct params type derived from its own layout/ABI.
// If the actual call doesn't match the reconstruction, the extends check fails.

type CheckCall<C> = C extends { data: infer D } ?
  D extends RoUint8Array ? C :
  D extends LayoutTriple<infer CL, unknown, infer RL> ?
    Omit<C, 'data'> & { data: LayoutTriple<CL, DeriveType<CL>, RL> } :
  D extends RoPair<infer S extends string, unknown> ?
    Omit<C, 'data'> & { data: RoPair<S, AbiArgs<S>> } :
  never : never;

type CheckCalls<A> = A extends RoArray<ReadCall>
  ? { [K in keyof A]: CheckCall<A[K]> }
  : CheckCall<A>;

// ---- Result type mapping ----

type ResultOf<D> =
  D extends RoUint8Array ? RoUint8Array :
  D extends LayoutTriple<Layout, unknown, infer RL> ? DeriveType<RL> :
  D extends RoPair<infer S extends string, unknown> ? AbiReturn<S> :
  never;

type CallResult<C extends ReadCall> =
  C extends { allowFailure: true }
  ? { success: true; data: ResultOf<C['data']> } | { success: false; revertData: RoUint8Array }
  : ResultOf<C['data']>;

export type QueryResult<A> =
  A extends RoArray<ReadCall>
  ? { [K in keyof A]: A[K] extends ReadCall ? CallResult<A[K]> : never }
  : A extends ReadCall
  ? CallResult<A>
  : never;

// ---- Runtime encoding/decoding ----

// viem's parseAbi requires const string literals at the type level;
// cast to a simple signature for dynamic runtime use
const dynamicParseAbi = parseAbi as (sigs: RoArray<string>) => Abi;

const fnNameRe = /^(\w+)\s*\(/;
const extractFnName = (sig: string) => {
  const match = sig.match(fnNameRe);
  if (!match)
    throw new Error(`Invalid function signature: ${sig}`);

  return match[1]!;
};

const toViemSig = (sig: string): string => `function ${sig}`;
const viemAbi = (sig: string) =>
  ({ abi: dynamicParseAbi([toViemSig(sig)]), functionName: extractFnName(sig) } as const);

type HexStr = `0x${string}`;

const deserializeHex = <const L extends Layout>(resultLayout: L, returnData: HexStr) =>
  deserialize(resultLayout, hex.decode(returnData));

const encodeCallData = (data: CallData): HexStr =>
    !Array.isArray(data)
  ? hex.encode(data as RoUint8Array, true)
  : typeof data[0] === "string"
  ? encodeFunctionData({ ...viemAbi(data[0]), args: data[1] })
  : hex.encode(serialize(data[0], data[1]), true)

const decodeResult = (data: CallData, returnData: HexStr) =>
    !Array.isArray(data)
  ? hex.decode(returnData)
  : typeof data[0] === "string"
  ? decodeFunctionResult({ ...viemAbi(data[0]), data: returnData })
  : deserializeHex(data[2], returnData);

const processResult = (
  call: ReadCall,
  raw: { success: boolean; returnData: HexStr },
) => {
  if (!raw.success) {
    if (call.allowFailure)
      return { success: false, revertData: hex.decode(raw.returnData) };

    throw new Error(`Call to ${call.to} reverted: ${raw.returnData}`);
  }

  const decoded = decodeResult(call.data, raw.returnData);
  return call.allowFailure ? { success: true, data: decoded } : decoded;
};

// ---- Multicall3 ----

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

const mc3Call = (funcSig: string) => ({
  target:       MULTICALL3,
  allowFailure: false,
  callData:     hex.encode(serialize(selectorLayout(funcSig)([]), {}), true),
}) as const;

const mc3TimestampItem   = timestampItem("uint", 32);
const mc3BlockNumberItem = uint256Item;

const getBlockTimestampCall = mc3Call("getCurrentBlockTimestamp()");
const getBlockNumberCall    = mc3Call("getBlockNumber()");

// ---- queryEvm ----

export type EvmQuery = ReturnType<typeof queryEvm>;

export const queryEvm = (viemClient: PublicClient) =>
  async <const A extends MaybeArray<ReadCall>>(
    callS: A & CheckCalls<A>,
    block: bigint | "latest" | "finalized" = "latest"
  ): Promise<[QueryResult<A>, bigint, Date]> => {
    const calls: RoArray<ReadCall> = isArray(callS) ? callS : [callS];
    const knownBlock = typeof block === "bigint";

    const results = await viemClient.readContract({
      address:      MULTICALL3,
      abi:          multicall3Abi,
      functionName: "aggregate3",
      args: [[
        ...calls.map(c => ({
          target:       c.to,
          allowFailure: true,
          callData:     encodeCallData(c.data),
        })),
        getBlockTimestampCall,
        ...(knownBlock ? [] : [getBlockNumberCall]),
      ]],
      ...(knownBlock ? { blockNumber: block } : { blockTag: block }),
    });

    const blocktime = deserializeHex(mc3TimestampItem, results[calls.length]!.returnData);
    const blocknumber =
      knownBlock ? block : deserializeHex(mc3BlockNumberItem, results.at(-1)!.returnData);

    const resultS = (
      isArray(callS)
      ? calls.map((c, i) => processResult(c, results[i]!))
      : processResult(calls[0]!, results[0]!)
    ) as QueryResult<A>;

    return [resultS, blocknumber, blocktime];
  };
