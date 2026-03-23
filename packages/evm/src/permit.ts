import type { Address } from "viem";
import type {
  RoUint8Array,
  RoTuple,
  RoArray,
  HeadTail,
  Simplify,
  DeepRo,
} from "@xlabs-xyz/const-utils";
import type { Layout, DeriveType } from "@xlabs-xyz/binary-layout";
import { serialize } from "@xlabs-xyz/binary-layout";
import { keccak256, bytes } from "@xlabs-xyz/utils";
import type { KindWithAtomic } from "@xlabs-xyz/amount";
import type { AmountOrAtomic } from "@xlabs-xyz/common";
import { toAtomicIfAmount, hashItem, timestampConversion } from "@xlabs-xyz/common";

import { wordSize, addressItem, paddedSlotLayout } from "./layouting.js";

// ---- EIP-712 Types ----

export type Eip712Domain = Readonly<{
  name?:              string;
  version?:           string;
  chainId?:           bigint;
  verifyingContract?: Address;
  salt?:              RoUint8Array;
}>;

export type Eip712Data<Message = Record<string, unknown>> = Readonly<{
  types:       Record<string, Readonly<{ name: string; type: string }>[]>;
  primaryType: string;
  domain:      Eip712Domain;
  message:     DeepRo<Message>;
}>;

export type Eip2612Message = Readonly<{
  owner:    Address;
  spender:  Address;
  value:    bigint;
  nonce:    bigint;
  deadline: bigint;
}>;

export type Eip2612Data = Eip712Data<Eip2612Message>;

// ---- Domain Separator ----

const domainSeparatorFields = [
  { name: "name",              type: "string"  },
  { name: "version",           type: "string"  },
  { name: "chainId",           type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "salt",              type: "bytes32" },
] as const;
type DomainSeparatorField = typeof domainSeparatorFields[number];
type DomainSeparatorFieldName = DomainSeparatorField["name"];

const associatedLayoutItem = {
  name:              hashItem,
  version:           hashItem,
  chainId:           { binary: "uint", size: wordSize },
  verifyingContract: paddedSlotLayout(addressItem),
  salt:              hashItem,
} as const satisfies Record<DomainSeparatorFieldName, Layout>;

const hashString = (s: string) => keccak256(bytes.encode(s));

const typeString = (fields: RoArray<DomainSeparatorFieldName>) =>
  "EIP712Domain("
  + domainSeparatorFields
      .filter(dsf => fields.includes(dsf.name))
      .map(dsf => `${dsf.type} ${dsf.name}`)
      .join(",")
  + ")";

const typeHash = (fields: RoArray<DomainSeparatorFieldName>) => hashString(typeString(fields));

const typeHashItem = (fields: RoArray<DomainSeparatorFieldName>) =>
  ({ name: "typeHash", binary: "bytes", custom: typeHash(fields), omit: true } as const);

// Maps a tuple of field names to the corresponding layout items (preserving order)
type SeparatorLayoutImpl<
  F extends DomainSeparatorFieldName,
  DSF extends RoTuple<DomainSeparatorField> = typeof domainSeparatorFields,
> =
  DSF extends HeadTail<DSF, infer H, infer T>
  ? H["name"] extends F
    ? [ Simplify<{ name: H["name"] } & typeof associatedLayoutItem[H["name"]]>,
      ...SeparatorLayoutImpl<F, T>,
    ]
    : SeparatorLayoutImpl<F, T>
  : [];

type SeparatorLayout<F extends DomainSeparatorFieldName> =
  readonly [ReturnType<typeof typeHashItem>, ...SeparatorLayoutImpl<F>];

const separatorLayout =
  <const F extends RoArray<DomainSeparatorFieldName>>(fields: F): SeparatorLayout<F[number]> => [
    typeHashItem(fields),
    ...fields.map(f => ({ name: f, ...associatedLayoutItem[f] })),
  ] as any;

const matchesHash =
  <const L extends Layout>(layout: L, candidate: DeriveType<L>, expected: RoUint8Array) =>
    bytes.equals(keccak256(serialize(layout, candidate)), expected);

// ---- Domain Resolution ----
//
// Preferred: EIP-5267 eip712Domain() returns all domain fields directly.
// TODO: implement queryEip712Domain using the eip712Domain() selector once we need it.
//
// Fallback: guess the version by brute-forcing common values against the on-chain
// DOMAIN_SEPARATOR() hash. Works for USDC and most tokens that don't expose EIP-5267.

const typicalDomainFields = ["name", "chainId", "verifyingContract"] as const;
const unversionedLayout   = separatorLayout(typicalDomainFields);
const versionedLayout     = separatorLayout([...typicalDomainFields, "version"]);

const guessDomainSeparatorVersion = (
  known:           DeriveType<typeof unversionedLayout>,
  domainSeparator: RoUint8Array,
  guesses:         RoArray<string>,
) => {
  for (const version of guesses)
    if (matchesHash(
      versionedLayout,
      { ...known, version: hashString(version) },
      domainSeparator,
    ))
      return version;

  throw new Error("Could not determine domain separator version");
};

/** Reconstruct the EIP-712 domain from on-chain data, guessing the version if needed. */
export const guessEip712Domain = (
  name:              string,
  verifyingContract: Address,
  chainId:           bigint,
  domainSeparator:   RoUint8Array,
  versionGuesses:    RoArray<string> = ["1", "2", "0"],
) => {
  const known = { name: hashString(name), chainId, verifyingContract } as const;
  return {
    name,
    ...(matchesHash(unversionedLayout, known, domainSeparator)
      ? {}
      : { version: guessDomainSeparatorVersion(known, domainSeparator, versionGuesses) }
    ),
    chainId,
    verifyingContract,
  } as const;
};

// ---- EIP-2612 Permit Message ----

const maxUint256 = 2n ** 256n - 1n;

/** Compose an EIP-2612 permit message ready for `signTypedData`. */
export const composePermitMsg = <const K extends KindWithAtomic | undefined = undefined>(
  owner:    Address,
  spender:  Address,
  value:    AmountOrAtomic<K>,
  domain:   Eip712Domain,
  nonce:    number | bigint,
  deadline: Date | "infinity" = "infinity",
) => {
  const atomic = toAtomicIfAmount(value);
  if (atomic <= 0n)
    throw new Error("Value must be positive");

  const dateToUnix = timestampConversion(wordSize).from;
  const unixDeadline = deadline === "infinity" ? maxUint256 : dateToUnix(deadline);
  const bigNonce = typeof nonce === "number" ? BigInt(nonce) : nonce;

  return {
    types: {
      EIP712Domain: domainSeparatorFields.filter(f => f.name in domain),
      Permit: [
        { name: "owner",    type: "address" },
        { name: "spender",  type: "address" },
        { name: "value",    type: "uint256" },
        { name: "nonce",    type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    domain,
    message: { owner, spender, value: atomic, nonce: bigNonce, deadline: unixDeadline },
  } as const satisfies Eip2612Data;
};
