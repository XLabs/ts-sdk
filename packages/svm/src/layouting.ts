import { Address, Lamports } from "@solana/kit";
import { type RoUint8Array, valueIndexEntries, isArray } from "@xlabs-xyz/const-utils";
import type {
  NumberSize,
  CustomizableBytes,
  CustomConversion,
  Item,
  UintItem,
  Layout,
  ProperLayout,
  DeriveType,
} from "@xlabs-xyz/binary-layout";
import {
  customizableBytes,
  boolItem,
  enumItem,
  setEndianness,
  serialize,
  deserialize,
  unwrapSingleton,
  stringConversion,
} from "@xlabs-xyz/binary-layout";
import { type KindWithAtomic } from "@xlabs-xyz/amount";
import {
  paddingItem,
  amountItem,
  hashItem,
} from "@xlabs-xyz/common";
import { base58, bytes } from "@xlabs-xyz/utils";
import { type DiscriminatorType, discriminatorOf } from "./utils.js";
import { zeroAddress, addressSize } from "./constants.js";

export const littleEndian = <const L extends Layout>(layout: L) =>
  setEndianness(layout, "little");

export const bumpItem = { binary: "uint", size: 1 } as const satisfies Item;

export const svmAddressItem = {
  binary: "bytes",
  size: addressSize,
  custom: {
    to:   (encoded: RoUint8Array) => base58.encode(encoded) as Address,
    from: (address: Address     ) => base58.decode(address),
  } satisfies CustomConversion<RoUint8Array, Address>,
} as const satisfies Item;

export const lamportsItem = {
  binary: "uint",
  size: 8,
  endianness: "little",
  custom: {
    to:   (lamports: bigint)   => lamports as Lamports,
    from: (lamports: Lamports) => lamports,
  } satisfies CustomConversion<bigint, Lamports>,
} as const satisfies Item;

export const vecBytesItem = <const P extends CustomizableBytes>(spec?: P) =>
  customizableBytes({ lengthSize: 4, lengthEndianness: "little" }, spec);

export const vecArrayItem = <const L extends Layout>(layout: L) =>
  ({ binary: "array", lengthSize: 4, lengthEndianness: "little", layout } as const);

const discriminatorItem = (type: DiscriminatorType, name: string) => ({
  name: "discriminator",
  binary: "bytes",
  custom: discriminatorOf(type, name),
  omit: true,
} as const);

const discriminatedItem = <const I extends Item>(
  type: DiscriminatorType,
  name: string,
  item: I,
) => unwrapSingleton([discriminatorItem(type, name), { ...item, name: "singleton" }]);

const discriminatedProperLayout = <const L extends ProperLayout>(
  type: DiscriminatorType,
  name: string,
  layout: L,
) => [discriminatorItem(type, name), ...layout] as const;

type DiscriminatedLayout<L extends Layout> =
  L extends Item
  ? ReturnType<typeof discriminatedItem<L>>
  : L extends ProperLayout
  ? ReturnType<typeof discriminatedProperLayout<L>>
  : never;
const discriminatedLayout = <const L extends Layout>(
  type: DiscriminatorType,
  name: string,
  layout: L,
): DiscriminatedLayout<L> => (
  isArray(layout)
  ? discriminatedProperLayout(type, name, layout as ProperLayout)
  : discriminatedItem(type, name, layout as Item)
) as any;

//can't use bind here because it doesn't preserve the const generic
export const accountLayout =
  <const L extends Layout>(name: string, layout: L) =>
    discriminatedLayout("account", name, layout);

export const instructionLayout =
  <const L extends Layout>(name: string, layout: L) =>
    discriminatedLayout("instruction", name, layout);

export const eventLayout =
  <const L extends Layout>(name: string, layout: L) =>
    discriminatedLayout("event", name, layout);

export const cEnumItem = <const E extends readonly string[]>(names: E, size: NumberSize = 1) =>
  enumItem(valueIndexEntries(names), { size, endianness: "little" });

// named after https://docs.rs/solana-program-option/latest/solana_program_option/enum.COption.html
const baseCOptionLayout = <const L extends Layout>(layout: L) => [
  { name: "padding", ...paddingItem(3)       },
  { name: "isSome",  ...boolItem()           },
  { name: "value",   binary: "bytes", layout },
] as const;
type BaseCOptionLayout<L extends Layout> = DeriveType<ReturnType<typeof baseCOptionLayout<L>>>;

export const cOptionItem = <const L extends Layout>(layout: L, defaultValue: DeriveType<L>) => ({
  binary: "bytes",
  layout: baseCOptionLayout(layout),
  custom: {
    to: (obj: BaseCOptionLayout<L>) =>
      obj.isSome ? obj.value : undefined,
    from: (value: DeriveType<L> | undefined) =>
      value === undefined ? { isSome: false, value: defaultValue } : { isSome: true, value },
  },
} as const);

export const cOptionAddressItem = cOptionItem(svmAddressItem, zeroAddress);

const baseMintAccountLayout = <const I extends UintItem>(item: I) => [
  { name: "mintAuthority",   ...cOptionAddressItem   },
  { name: "supply",          ...item                 },
  { name: "decimals",        binary: "uint", size: 1 },
  { name: "isInitialized",   ...boolItem()           },
  { name: "freezeAuthority", ...cOptionAddressItem   },
] as const satisfies ProperLayout;

const untypedMintAccountLayout = baseMintAccountLayout(lamportsItem);
const typedMintAccountLayout = <const K extends KindWithAtomic>(kind: K) =>
  baseMintAccountLayout(amountItem(8, kind));

export const mintAccountLayout =
  <const K extends KindWithAtomic | undefined = undefined>(kind?: K):
      ReturnType<typeof littleEndian<
        K extends KindWithAtomic
        ? ReturnType<typeof typedMintAccountLayout<K>>
        : typeof untypedMintAccountLayout
      >> =>
    littleEndian(kind ? typedMintAccountLayout(kind) : untypedMintAccountLayout) as any;

//TODO implement support/layouts for token2022 mint extensions

const initStates = ["Uninitialized", "Initialized"] as const;

const tokenStates = [...initStates, "Frozen"] as const;
const baseTokenAccountLayout = <const I extends UintItem>(item: I) => [
  { name: "mint",            ...svmAddressItem                            },
  { name: "owner",           ...svmAddressItem                            },
  { name: "amount",          ...item                                      },
  { name: "delegate",        ...cOptionAddressItem                        },
  { name: "state",           ...cEnumItem(tokenStates)                    },
  { name: "isNative",        ...cOptionItem(lamportsItem, 0n as Lamports) },
  { name: "delegatedAmount", ...item                                      },
  { name: "closeAuthority",  ...cOptionAddressItem                        },
] as const;

const untypedTokenAccountLayout = baseTokenAccountLayout(lamportsItem);
const typedTokenAccountLayout = <const K extends KindWithAtomic>(kind: K) =>
  baseTokenAccountLayout(amountItem(8, kind));

export const tokenAccountLayout =
  <const K extends KindWithAtomic | undefined = undefined>(kind?: K):
    ReturnType<typeof littleEndian<
      K extends KindWithAtomic
      ? ReturnType<typeof typedTokenAccountLayout<K>>
      : typeof untypedTokenAccountLayout
    >> =>
    littleEndian(kind ? typedTokenAccountLayout(kind) : untypedTokenAccountLayout) as any;

//see https://github.com/solana-program/system/blob/main/clients/js/src/generated/accounts/nonce.ts
const nonceVersion = ["Legacy", "Current"] as const;
export const durableNonceAccountLayout = [
  { name: "version",         ...cEnumItem(nonceVersion, 4) },
  { name: "state",           ...cEnumItem(initStates,   4) },
  { name: "authority",       ...svmAddressItem             },
  { name: "blockhash",       ...hashItem                   },
  { name: "solPerSignature", ...lamportsItem               },
] as const satisfies ProperLayout;

//actual impl: https://github.com/anza-xyz/solana-sdk/blob/master/offchain-message/src/lib.rs#L162
//DO NOT TRUST THE OUTDATED PROPOSAL:
//  https://docs.solanalabs.com/proposals/off-chain-message-signing
const signingDomain = "\xffsolana offchain"; //16 bytes
const messageFormats = ["restrictedAscii", "limitedUtf8", "extendedUtf8"] as const;
export type OffchainMessageFormat = (typeof messageFormats)[number];
export const offchainMessageLayout = [
  { name: "signingDomain", binary: "bytes", custom: bytes.encode(signingDomain), omit: true },
  { name: "headerVersion", binary: "uint", size: 1, custom: 0, omit: true                   },
  { name: "messageFormat", ...enumItem(valueIndexEntries(messageFormats))                   },
  { name: "message",       ...vecBytesItem(stringConversion), lengthSize: 2                 },
] as const;

export const OffchainMessage = {
  serialize: (messageFormat: OffchainMessageFormat, message: string) =>
    serialize(offchainMessageLayout, { messageFormat, message }),
  deserialize: (encoded: RoUint8Array) =>
    deserialize(offchainMessageLayout, encoded),
}