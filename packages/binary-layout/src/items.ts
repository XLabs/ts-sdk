import type { RoUint8Array, RoPair, RoArray } from "@xlabs-xyz/const-utils";
import { isUint8Array } from "@xlabs-xyz/const-utils";
import type {
  Endianness,
  NumberSize,
  NumSizeToPrimitive,
  DeriveType,
  Layout,
  BytesItem,
  FixedConversion,
  CustomConversion
} from "./layout.js";
import { numberMaxSize, defaultEndianness } from "./layout.js";
import { isLayout, isFixedBytesConversion } from "./utils.js";

//-------------------------------- customizableBytes --------------------------------

export type CustomizableBytes =
  undefined |
  Layout |
  RoUint8Array |
  FixedConversion<RoUint8Array, any> |
  CustomConversion<RoUint8Array, any> |
  RoPair<Layout, FixedConversion<any, any> | CustomConversion<any, any>>;

export type BytesBase =
  ( {} | { readonly name: string } ) & Omit<BytesItem, "binary" | "custom" | "layout">;

type CombineObjects<T, U> = {
  readonly [K in keyof T | keyof U]: K extends keyof T ? T[K] : K extends keyof U ? U[K] : never;
};

export type CustomizableBytesReturn<B extends BytesBase, P extends CustomizableBytes> =
  CombineObjects<
    B,
    P extends undefined
    ? { binary: "bytes" }
    : P extends Layout
    ? { binary: "bytes", layout: P }
    : P extends RoUint8Array | FixedConversion<RoUint8Array, any> | CustomConversion<RoUint8Array, any>
    ? { binary: "bytes", custom: P }
    : P extends readonly [Layout, FixedConversion<any, any> | CustomConversion<any, any>]
    ? { binary: "bytes", layout: P[0], custom: P[1] }
    : never
  >;

export const customizableBytes = <
  const B extends BytesBase,
  const C extends CustomizableBytes
>(base: B, spec?: C) => ({
  ...base,
  binary: "bytes",
  ...(() => {
    if (spec === undefined)
      return {};

    if (isLayout(spec))
      return { layout: spec };

    if (isUint8Array(spec) || isFixedBytesConversion(spec) || !Array.isArray(spec))
      return { custom: spec };

    return { layout: spec[0], custom: spec[1] };
  })()
} as CustomizableBytesReturn<B, C>);

//-------------------------------- boolItem --------------------------------

export function boolItem(permissive: boolean = false) {
  return {
    binary: "uint",
    size: 1,
    custom: {
      to: (encoded: number): boolean => {
        if (encoded === 0)
          return false;

        if (permissive || encoded === 1)
          return true;

        throw new Error(`Invalid bool value: ${encoded}`);
      },
      from: (value: boolean): number => value ? 1 : 0,
    }
  } as const;
}

//-------------------------------- enumItem --------------------------------

export function enumItem<
  const E extends RoArray<RoPair<string, number>>,
  const S extends NumberSize = 1,
  const EN extends Endianness = typeof defaultEndianness
>(entries: E, opts?: { size?: S, endianness?: EN }) {
  const valueToName = Object.fromEntries(entries.map(([name, value]) => [value, name]));
  const nameToValue = Object.fromEntries(entries);
  return {
    binary: "uint",
    size: (opts?.size ?? 1) as S,
    endianness: (opts?.endianness ?? defaultEndianness) as EN,
    custom: {
      to: (encoded: number): E[number][0] => {
        const name = valueToName[encoded];
        if (name === undefined)
          throw new Error(`Invalid enum value: ${encoded}`);

        return name;
      },
      from: (name: E[number][0]) => nameToValue[name]!,
    }
  } as const;
}

//-------------------------------- optionItem --------------------------------

const baseOptionItem = <const T extends CustomizableBytes>(someType: T) => ({
  binary: "switch",
  idSize: 1,
  idTag: "isSome",
  layouts: [
    [[0, false], []],
    [[1, true ], [customizableBytes({ name: "value"}, someType)]],
  ]
} as const);

type BaseOptionItem<T extends CustomizableBytes> =
  DeriveType<ReturnType<typeof baseOptionItem<T>>>;

type BaseOptionValue<T extends CustomizableBytes> =
  DeriveType<CustomizableBytesReturn<{}, T>> | undefined;

export function optionItem<const T extends CustomizableBytes>(optVal: T) {
  return {
    binary: "bytes",
    layout: baseOptionItem(optVal),
    custom: {
      to: (obj: BaseOptionItem<T>): BaseOptionValue<T> =>
        obj.isSome === true
        //typescript is not smart enough to narrow the outer type based on the inner type
        ? (obj as Exclude<typeof obj, {isSome: false}>)["value"]
        : undefined,
      from: (value: BaseOptionValue<T>): BaseOptionItem<T> =>
        value === undefined
        ? { isSome: false }
        : { isSome: true, value } as any, //good luck narrowing this type
    } satisfies CustomConversion<BaseOptionItem<T>, BaseOptionValue<T>>
  } as const
};

//-------------------------------- bitsetItem --------------------------------

export type BitsetKey = string | undefined;
export type Bitset<B extends RoArray<BitsetKey>> =
  { [K in B[number] as K extends "" | undefined ? never : K]: boolean };

type ByteSize = [
  never,
  1, 1, 1, 1, 1, 1, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2,
  3, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6,
];

type BitsizeToBytesize<N extends number> = N extends keyof ByteSize ? ByteSize[N] : number;

export type BitsetItem<
  B extends RoArray<BitsetKey>,
  S extends number = BitsizeToBytesize<B["length"]>,
> = {
  binary: "uint";
  size: S;
  custom: {
    to: (encoded: NumSizeToPrimitive<S>) => Bitset<B>;
    from: (obj: Bitset<B>) => NumSizeToPrimitive<S>;
  };
};

export function bitsetItem<
  const B extends RoArray<BitsetKey>,
  const S extends number = BitsizeToBytesize<B["length"]>,
>(bitnames: B, size?: S): BitsetItem<B, S> {
  return {
    binary: "uint",
    size: (size ?? Math.ceil(bitnames.length / 8)) as S,
    custom: {
      to: (encoded: NumSizeToPrimitive<S>): Bitset<B> => {
        const ret: Bitset<B> = {} as Bitset<B>;
        for (let i = 0; i < bitnames.length; ++i)
          if (bitnames[i]) //skip undefined and empty string
            //always use bigint for simplicity
            ret[bitnames[i] as keyof Bitset<B>] = (BigInt(encoded) & (1n << BigInt(i))) !== 0n;

        return ret;
      },
      from: (obj: Bitset<B>): NumSizeToPrimitive<S> => {
        let val = 0n;
        for (let i = 0; i < bitnames.length; ++i)
          if (bitnames[i] && obj[bitnames[i] as keyof Bitset<B>])
            val |= 1n << BigInt(i);

        return (bitnames.length > numberMaxSize ? val : Number(val)) as NumSizeToPrimitive<S>;
      },
    },
  } as const
}

//-------------------------------- stringConversion --------------------------------

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const stringConversion = {
  to:   (encoded: RoUint8Array) => textDecoder.decode(encoded as Uint8Array),
  from: (decoded: string      ) => textEncoder.encode(decoded),
} as const satisfies CustomConversion<RoUint8Array, string>;

//-------------------------------- timestampConversion --------------------------------

const numberTimestampConversion = {
  to: (value: number) => new Date(value * 1000),
  from: (value: Date) => Math.floor(value.getTime() / 1000),
} as const;

const bigintTimestampConversion = {
  to: (value: bigint) => new Date(Number(value) * 1000),
  from: (value: Date) => BigInt(value.getTime() / 1000),
} as const;

export const timestampConversion =
  <S extends number>(size: S):
    number extends S
    ? never
    : S extends NumberSize
    ? typeof numberTimestampConversion
    : typeof bigintTimestampConversion => (
  size > numberMaxSize
    ? bigintTimestampConversion
    : numberTimestampConversion
  ) as any;

export const timestampItem = <
  B extends "int" | "uint",
  S extends number,
  E extends Endianness = "big"
  >(binary: B, size: S, endianness?: E) => ({
    binary,
    size,
    custom: timestampConversion(size),
    ...{ endianness: endianness ?? "big" },
  } as const);