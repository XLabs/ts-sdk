import type { Address, AccessList } from "viem";
import type { RoUint8Array } from "@xlabs-xyz/const-utils";
import { serialize } from "@xlabs-xyz/binary-layout";
import type { KindWithAtomic } from "@xlabs-xyz/amount";
import type { AmountOrAtomic } from "@xlabs-xyz/common";
import { timestampItem, hashItem, toAtomicIfAmount } from "@xlabs-xyz/common";
import {
  wordSize,
  selectorLayout,
  paddedSlotLayout,
  addressItem,
  uint256Item,
  evmAmountItem,
} from "./layouting.js";

export interface ContractTx<K extends KindWithAtomic | undefined = undefined> {
  to:          Address;
  from?:       Address;
  value?:      AmountOrAtomic<K>;
  data:        RoUint8Array;
  accessList?: AccessList;
}

const erc20Layouts = (() => {
  const addr = (name: string) => ({ name, ...paddedSlotLayout(addressItem) }) as const;
  const u256 = (name: string) => ({ name, ...uint256Item }) as const;
  const b32  = (name: string) => ({ name, ...hashItem } as const);
  const ts   = (name: string) => ({ name, ...timestampItem("uint", wordSize) } as const);
  return {
    approve: selectorLayout("approve(address,uint256)")
      ([addr("spender"), u256("value")]),
    transfer: selectorLayout("transfer(address,uint256)")
      ([addr("to"), u256("value")]),
    permit: selectorLayout("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")
      ([addr("owner"), addr("spender"), u256("value"), ts("deadline"),
        u256("v"), b32("r"), b32("s")]),
    balanceOf: selectorLayout("balanceOf(address)")
      ([addr("owner")]),
    allowance: selectorLayout("allowance(address,address)")
      ([addr("owner"), addr("spender")]),
  } as const;
})();

export const erc20 = <const K extends KindWithAtomic | undefined = undefined>(
  token: Address,
  kind?: K,
) => ({
  approve: (owner: Address, spender: Address, value: AmountOrAtomic<K>) => ({
    from: owner,
    to:   token,
    data: serialize(erc20Layouts.approve, { spender, value: toAtomicIfAmount(value) }),
  } as const),
  transfer: (from: Address, to: Address, value: AmountOrAtomic<K>) => ({
    from,
    to:   token,
    data: serialize(erc20Layouts.transfer, { to, value: toAtomicIfAmount(value) }),
  } as const),
  permit: (
    owner:    Address,
    spender:  Address,
    value:    AmountOrAtomic<K>,
    deadline: Date,
    sig:      RoUint8Array,
  ) => ({
    to: token,
    data: serialize(erc20Layouts.permit,
      { owner, spender, value: toAtomicIfAmount(value), deadline,
        v: ((v) => v < 2n ? v + 27n : v)(BigInt(sig[2*wordSize]!)),
        r: sig.subarray(0, wordSize),
        s: sig.subarray(wordSize, 2*wordSize),
      }
    ),
  } as const),
  balanceOfQuery: (owner: Address) => ({
    to:   token,
    data: [erc20Layouts.balanceOf, { owner }, evmAmountItem(kind)],
  } as const),
  allowanceQuery: (owner: Address, spender: Address) => ({
    to:   token,
    data: [erc20Layouts.allowance, { owner, spender }, evmAmountItem(kind)],
  } as const),
} as const);
