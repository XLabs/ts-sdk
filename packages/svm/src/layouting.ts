import { Address, Lamports } from "@solana/kit";
import type { RoArray, RoUint8Array } from "@xlabs-xyz/const-utils";
import { valueIndexEntries, isArray, omit, assertType } from "@xlabs-xyz/const-utils";
import type {
  NumberSize,
  CustomizableBytes,
  CustomConversion,
  Item,
  Layout,
  ProperLayout,
  DeriveType,
} from "@xlabs-xyz/binary-layout";
import {
  customizableBytes,
  boolItem,
  enumItem,
  setEndianness,
  unwrapSingleton,
  stringConversion,
} from "@xlabs-xyz/binary-layout";
import type { KindWithAtomic, AmountFromArgs } from "@xlabs-xyz/amount";
import { Amount } from "@xlabs-xyz/amount";
import { amountItem, hashItem, paddingItem } from "@xlabs-xyz/common";
import { base58, bytes } from "@xlabs-xyz/utils";
import { type DiscriminatorType, discriminatorOf } from "./utils.js";
import { zeroAddress, addressSize } from "./constants.js";

export const littleEndian = <const L extends Layout>(layout: L) =>
  setEndianness(layout, "little");

export const bumpItem = { binary: "uint", size: 1 } as const satisfies Item;

export const u64Item = { binary: "uint", size: 8, endianness: "little" } as const satisfies Item;

export const svmAddressItem = {
  binary: "bytes",
  size: addressSize,
  custom: {
    to:   (encoded: RoUint8Array) => base58.encode(encoded) as Address,
    from: (address: Address     ) => base58.decode(address),
  } satisfies CustomConversion<RoUint8Array, Address>,
} as const satisfies Item;

const kitLamportsItem = {
  ...u64Item,
  custom: {
    to:   (lamports: bigint)   => lamports as Lamports,
    from: (lamports: Lamports) => lamports,
  } satisfies CustomConversion<bigint, Lamports>,
} as const satisfies Item;

export const svmAmountItem = <
  const K extends KindWithAtomic | undefined = undefined,
  S extends number = 8
>(kind?: K, size?: S):
      K extends KindWithAtomic ? ReturnType<typeof amountItem<S, K>> : typeof u64Item =>
    (kind ? littleEndian(amountItem(size ?? 8, kind)) : u64Item) as any;

export const lamportsItem = <const K extends KindWithAtomic | undefined = undefined>(kind?: K):
    K extends KindWithAtomic ? ReturnType<typeof svmAmountItem<K>> : typeof kitLamportsItem =>
  (kind ? svmAmountItem(kind) : kitLamportsItem) as any;

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
) =>
  unwrapSingleton(assertType<ProperLayout>()(
    [discriminatorItem(type, name), { name: "singleton", ...item }]
  ));

const discriminatedProperLayout = <const L extends ProperLayout>(
  type: DiscriminatorType,
  name: string,
  layout: L,
) => [discriminatorItem(type, name), ...layout] as const;

type DiscriminatedLayout<L extends Layout> =
  L extends readonly []
  ? Omit<ReturnType<typeof discriminatorItem>, "name">
  : L extends Item
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
  ? layout.length === 0
    ? omit(discriminatorItem(type, name), "name")
    : discriminatedProperLayout(type, name, layout as ProperLayout)
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

export const cEnumItem = <const E extends RoArray<string>>(names: E, size: NumberSize = 1) =>
  enumItem(valueIndexEntries(names), { size, endianness: "little" });

// named after https://docs.rs/solana-program-option/latest/solana_program_option/enum.COption.html
const baseCOptionLayout = <const L extends Layout>(layout: L, size: NumberSize) => [
  { name: "isSome",  ...boolItem(), size, endianness: "little" },
  { name: "value",   binary: "bytes", layout                   },
] as const;
type BaseCOptionLayout<L extends Layout> = DeriveType<ReturnType<typeof baseCOptionLayout<L>>>;

export const cOptionItem = <const L extends Layout>(
  layout: L,
  defaultValue: DeriveType<L>,
  size: NumberSize = 4,
) => ({
  binary: "bytes",
  layout: baseCOptionLayout(layout, size),
  custom: {
    to: (obj: BaseCOptionLayout<L>) =>
      obj.isSome ? obj.value : undefined,
    from: (value: DeriveType<L> | undefined) =>
      value === undefined ? { isSome: false, value: defaultValue } : { isSome: true, value },
  },
} as const);

export const cOptionAddressItem = (size: NumberSize = 4) =>
  cOptionItem(svmAddressItem, zeroAddress, size);

export const cOoptionLamportsItem =
  <const K extends KindWithAtomic | undefined = undefined>(kind?: K, size: NumberSize = 4) =>
    cOptionItem(
      lamportsItem(kind),
      ( kind
        ? Amount.from(0, ...([kind, "atomic"] as AmountFromArgs<K & KindWithAtomic>))
        : 0n as Lamports
      ) as DeriveType<ReturnType<typeof lamportsItem<K>>>,
      size
    );

const _mintAccountLayout = <const K extends KindWithAtomic | undefined = undefined>(kind?: K) => [
  { name: "mintAuthority",   ...cOptionAddressItem() },
  { name: "supply",          ...svmAmountItem(kind)  },
  { name: "decimals",        binary: "uint", size: 1 },
  { name: "isInitialized",   ...boolItem()           },
  { name: "freezeAuthority", ...cOptionAddressItem() },
] as const;

export const mintAccountLayout =
  <const K extends KindWithAtomic | undefined = undefined>(kind?: K):
    ReturnType<typeof _mintAccountLayout<K>> extends infer L extends ProperLayout ? L : never =>
      _mintAccountLayout(kind) as any;

export type MintAccount<K extends KindWithAtomic | undefined = undefined> =
  DeriveType<ReturnType<typeof mintAccountLayout<K>>>;

//TODO implement support/layouts for token2022 mint extensions

export const initStates = ["Uninitialized", "Initialized"] as const;

export const tokenStates = [...initStates, "Frozen"] as const;
const _tokenAccountLayout = <
  const KT extends KindWithAtomic | undefined = undefined,
  const KS extends KindWithAtomic | undefined = undefined,
>(tokenKind?: KT, solKind?: KS) => [
  { name: "mint",            ...svmAddressItem                },
  { name: "owner",           ...svmAddressItem                },
  { name: "amount",          ...svmAmountItem(tokenKind)      },
  { name: "delegate",        ...cOptionAddressItem()          },
  { name: "state",           ...cEnumItem(tokenStates)        },
  { name: "isNative",        ...cOoptionLamportsItem(solKind) },
  { name: "delegatedAmount", ...svmAmountItem(tokenKind)      },
  { name: "closeAuthority",  ...cOptionAddressItem()          },
] as const;

export const tokenAccountLayout = <
  const KT extends KindWithAtomic | undefined = undefined,
  const KS extends KindWithAtomic | undefined = undefined,
>(tokenKind?: KT, solKind?: KS):
  ReturnType<typeof _tokenAccountLayout<KT, KS>> extends infer L extends ProperLayout ? L : never =>
    _tokenAccountLayout(tokenKind, solKind) as any;

export type TokenAccount<
  KT extends KindWithAtomic | undefined = undefined,
  KS extends KindWithAtomic | undefined = undefined,
> = DeriveType<ReturnType<typeof tokenAccountLayout<KT, KS>>>;

//see https://github.com/solana-program/system/blob/main/clients/js/src/generated/accounts/nonce.ts
const nonceVersion = ["Legacy", "Current"] as const;
export const durableNonceAccountLayout =
  <const K extends KindWithAtomic | undefined = undefined>(kind?: K) => [
  { name: "version",         ...cEnumItem(nonceVersion, 4) },
  { name: "state",           ...cEnumItem(initStates,   4) },
  { name: "authority",       ...svmAddressItem             },
  { name: "blockhash",       ...hashItem                   },
  { name: "solPerSignature", ...lamportsItem(kind)         },
] as const satisfies ProperLayout;

export type DurableNonceAccount<K extends KindWithAtomic | undefined = undefined> =
  DeriveType<ReturnType<typeof durableNonceAccountLayout<K>>>;

//see https://github.com/solana-program/address-lookup-table/blob/main/program/src/state.rs#L64
const assumeInitializedAltItem = {
  binary: "uint", size: 4, endianness: "little", custom: 1, omit: true
} as const satisfies Item;

//see https://github.com/solana-program/address-lookup-table/blob/main/program/src/state.rs#L20
export const addressLookupTableLayout = [
  { name: "_state",                     ...assumeInitializedAltItem             },
  { name: "deactivationSlot",           ...u64Item                              },
  { name: "lastExtendedSlot",           ...u64Item                              },
  { name: "lastExtendedSlotStartIndex", binary: "uint", size: 1                 },
  { name: "authority",                  ...cOptionAddressItem(1)                },
  { name: "_alignmentPadding",          ...paddingItem(2)                       },
  { name: "addresses",                  binary: "array", layout: svmAddressItem },
] as const satisfies ProperLayout;

export type AddressLookupTable = DeriveType<typeof addressLookupTableLayout>;

//actual impl: https://github.com/anza-xyz/solana-sdk/blob/master/offchain-message/src/lib.rs#L162
//DO NOT TRUST THE OUTDATED PROPOSAL:
//  https://docs.solanalabs.com/proposals/off-chain-message-signing
const signingDomain = "\xffsolana offchain"; //16 bytes
const messageFormats = ["RestrictedAscii", "LimitedUtf8", "ExtendedUtf8"] as const;
export type OffchainMessageFormat = (typeof messageFormats)[number];
export const offchainMessageLayout = [
  { name: "signingDomain", binary: "bytes", custom: bytes.encode(signingDomain), omit: true },
  { name: "headerVersion", binary: "uint", size: 1, custom: 0, omit: true                   },
  { name: "messageFormat", ...enumItem(valueIndexEntries(messageFormats))                   },
  { name: "message",       ...vecBytesItem(stringConversion), lengthSize: 2                 },
] as const;
