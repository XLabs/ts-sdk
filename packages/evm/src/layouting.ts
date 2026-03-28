import type { Address } from "viem";
import type { RoUint8Array } from "@xlabs-xyz/const-utils";
import type { Layout, ProperLayout, DeriveType, Item } from "@xlabs-xyz/binary-layout";
import { calcStaticSize } from "@xlabs-xyz/binary-layout";
import { keccak256, bytes, hex, bignum } from "@xlabs-xyz/utils";
import type { KindWithAtomic } from "@xlabs-xyz/amount";
import { amountItem, paddingItem } from "@xlabs-xyz/common";

export const wordSize = 32;
export const addressSize = 20;

export const uint256Item = { binary: "uint", size: wordSize } as const;

export const evmAmountItem = <
  const K extends KindWithAtomic | undefined = undefined,
  S extends number = typeof wordSize,
>(kind?: K, size?: S) => amountItem((size ?? wordSize) as S, kind);

export const addressItem = {
  binary: "bytes",
  size:   addressSize,
  custom: {
    to:   (encoded: RoUint8Array) => hex.encode(encoded, true) as Address,
    from: (addr:    Address     ) => hex.decode(addr),
  },
} as const satisfies Item;

export const signatureItem = { binary: "bytes", size: 65 } as const;

export const selectorLength = 4;
export const selectorOf = (funcSig: string) =>
  keccak256(bytes.encode(funcSig)).subarray(0, selectorLength);

export const selectorItem = (funcSig: string) => ({
  name:   "selector",
  binary: "bytes",
  custom: selectorOf(funcSig),
  omit:   true,
} as const);

export const selectorLayout =
  (funcSig: string) =>
    <const L extends ProperLayout>(layout: L) =>
      [selectorItem(funcSig), ...layout] as const;

type PaddedSlotLayout<T extends ProperLayout | Item> =
  T extends ProperLayout
  ? ReturnType<typeof paddedLayout<T>>
  : T extends Item
  ? ReturnType<typeof paddedItem<T>>
  : never;

export const paddedSlotLayout =
  <const T extends ProperLayout | Item>(layoutOrItem: T): PaddedSlotLayout<T> =>
    (Array.isArray(layoutOrItem) ? paddedLayout as any : paddedItem as any)(layoutOrItem);

const paddedLayout = <const L extends ProperLayout>(layout: L) =>
  ({ binary: "bytes", layout: [padding(layout), ...layout] } as const);

//we'd love to use unwrapSingleton([padding(item), { name: "item", ...item }]);
//  as the implementation of paddedItem instead, but tsc chokes hard on assigning the spread
//  to a NamedItem, which is required to pass the entire thing as a concrete ProperLayout to
//   unwrapSingleton...
const paddedItem = <const I extends Item>(item: I) => ({
  binary: "bytes",
  layout: [padding(item), { name: "item", ...item }],
  custom: {
    to:   (raw: { item: DeriveType<I> }) => raw.item,
    from: (item: DeriveType<I>         ) => ({ item }),
  },
} as const);

const padding = <const L extends Layout>(layout: L) =>
  ({ name: "_padding", ...paddingItem(wordSize - calcStaticSize(layout)!) } as const);

export const mappingSlot = (key: RoUint8Array, declareSlot: bigint): bigint => {
  const buf = new Uint8Array(2 * wordSize);
  buf.set(key, wordSize - key.length); // left-pad key
  buf.set(bignum.toBytes(declareSlot, wordSize), wordSize);
  return bignum.decode(keccak256(buf));
};

export const addressMappingSlot = (addr: Address, declareSlot: bigint): bigint =>
  mappingSlot(hex.decode(addr), declareSlot);

export const keccakSlot = (slot: bigint): bigint =>
  bignum.decode(keccak256(bignum.toBytes(slot, wordSize)));

//poor man's abi.encode/decode(bytes)
const lengthSize = 4;
export const abiEncodedBytesItem = <const L extends Layout | undefined = undefined>(
  opts?: { layout?: L; position?: number },
) => ({
  binary: "bytes",
  layout: [
    { name: "offset", ...uint256Item,
      custom: BigInt(((opts?.position ?? 0) + 1) * wordSize), omit: true,
    },
    { name: "lengthPadding", binary: "bytes",
      custom: new Uint8Array(wordSize - lengthSize), omit: true,
    },
    { name: "item", binary: "bytes",
      lengthSize, layout: opts?.layout as L,
    },
    { name: "postPadding", binary: "bytes" },
  ],
  custom: {
    //we drop postPadding (without checking) when deserializing and skip it on serialization
    to: (wrapped: { item: L extends Layout ? DeriveType<L> : RoUint8Array }) => wrapped.item,
    from: (item: L extends Layout ? DeriveType<L> : RoUint8Array) =>
      ({ item, postPadding: new Uint8Array(0) }),
  },
} as const);
