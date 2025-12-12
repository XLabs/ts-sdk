import type {
  RoPair,
  RoTuple,
  Column,
  Entries,
  TupleZip,
} from "@xlabs-xyz/const-utils";
import { column, entries, zip } from "@xlabs-xyz/const-utils";
import type {
  Item,
  CustomConversion,
  NumberSize,
  Endianness,
} from "@xlabs-xyz/binary-layout";
import { numberMaxSize, defaultEndianness } from "@xlabs-xyz/binary-layout";
import { bignum } from "@xlabs-xyz/utils";
import type {
  Rationalish,
  Kind,
  KindWithHuman,
  KindWithAtomic,
  SymbolsOf,
} from "@xlabs-xyz/amount";
import { type AmountFromArgs, Amount, Conversion, Rational } from "@xlabs-xyz/amount";

export const hashItem = {
  binary: "bytes", size: 32,
} as const satisfies Item;

export const paddingItem = (size: number) => ({
  binary: "bytes", custom: new Uint8Array(size), omit: true,
} as const satisfies Item);

type EnumVariants = RoTuple<RoPair<string, RoTuple>>;

type EnumSwitchVariants<V extends EnumVariants> =
  Entries<Column<V, 0>> extends infer VE extends RoTuple
  ? Column<V, 1> extends infer VC extends RoTuple
    ? TupleZip<[VE, VC]>
    : never
  : never;

export const enumSwitchVariants =
  <const V extends EnumVariants>(variants: V): EnumSwitchVariants<V> =>
    zip([entries(column(variants, 0)), column(variants, 1)]) as any;

export const byteSwitchItem = <
  const I extends string,
  const L extends RoTuple,
>(idTag: I, layouts: L) =>
  ({ binary: "switch", idSize: 1, idTag, layouts } as const);

// ---- timestamp Conversion/Item ----

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
  E extends Endianness = typeof defaultEndianness
  >(binary: B, size: S, endianness?: E) => ({
    binary,
    size,
    custom: timestampConversion(size),
    endianness: endianness ?? defaultEndianness,
  } as const);

// ---- Amount / Conversion / Linear Transform ----

type NumericType<S extends number> =
  S extends NumberSize
  ? number
  : number extends S
  ? number | bigint
  : bigint;

type TransformFunc<S extends number> = {
  to: (val: NumericType<S>) => Rationalish;
  from: (val: Rational) => NumericType<S>;
};

type SizedTransformFunc<S extends number> = (size: S) => TransformFunc<S>;
type TransformFuncUnion<S extends number> = TransformFunc<S> | SizedTransformFunc<S>;

function numericReturn<S extends number>(size: S): TransformFunc<S>["from"] {
  return size > numberMaxSize
    ? (val: Rational) => val.floor() as NumericType<S>
    : (val: Rational) => bignum.toNumber(val.floor()) as NumericType<S>;
}

type SizedReturnItem<S extends number, T> = {
  binary: "uint";
  size: S;
  custom: CustomConversion<NumericType<S>, T>;
};

type AmountReturnItem<S extends number, K extends Kind> =
  SizedReturnItem<S, Amount<K>>;
//conversion happens in 3 stages:
// 1. raw value is read from layout
// 2. then it is optionally transformed (e.g. scaled/multiplied/etc.)
// 3. finally it is converted into an amount of the given kind and unit
//and likewise but inverted for the opposite direction
export function amountItem<S extends number, const K extends KindWithAtomic>(
  size: S,
  kind: K, //uses "atomic" by default
  unitSymbolOrTransform?: SymbolsOf<K> | TransformFuncUnion<S>,
): AmountReturnItem<S, K>;
export function amountItem<S extends number, const K extends Kind>(
  size: S,
  kind: K,
  unitSymbol: SymbolsOf<K>,
  transform?: TransformFuncUnion<S>,
): AmountReturnItem<S, K>;
export function amountItem<S extends number, const K extends Kind>(
  size: S,
  kind: K,
  unitSymbolOrTransform?: SymbolsOf<K> | TransformFuncUnion<S>,
  transform?: TransformFuncUnion<S>,
): AmountReturnItem<S, K> {
  let unitSymbol: SymbolsOf<K> | undefined;
  if (transform)
    unitSymbol = unitSymbolOrTransform as SymbolsOf<K>;
  else if (typeof unitSymbolOrTransform === "string")
    unitSymbol = unitSymbolOrTransform;
  else if (unitSymbolOrTransform)
    transform = unitSymbolOrTransform;

  if (unitSymbol === undefined || unitSymbol === "atomic")
    unitSymbol = kind.atomic as SymbolsOf<K>;

  if (typeof transform === "function")
    transform = transform(size);

  const toFunc = (val: Rationalish): Amount<K> =>
    Amount.from(val, ...[kind, unitSymbol] as AmountFromArgs<K>);

  const custom = transform === undefined
    ? {
      to: (val: NumericType<S>) =>
        toFunc(val),
      from: (amount: Amount<K>): NumericType<S> =>
        numericReturn(size)(amount.in(unitSymbol) as Rational),
    }
    : {
      to: (val: NumericType<S>) =>
        toFunc(transform.to(val)),
      from: (amount: Amount<K>): NumericType<S> =>
        transform.from(amount.in(unitSymbol) as Rational),
    };

  return { binary: "uint", size, custom };
}

type ConversionReturnItem<S extends number, NK extends Kind, DK extends Kind> =
  SizedReturnItem<S, Conversion<NK, DK>>;

type AmountItem = {
  binary: "uint";
  size: number;
  custom: CustomConversion<any, Amount<any>>;
};

//annoyingly, using AI extends AmountReturnItem<number, Kind> here breaks things for reasons
//  that are somewhat unclear to me (incompatible CustomConversion types), hence the AmountItem
//  workaround
export function conversionItem<const AI extends AmountItem, const DK extends KindWithHuman>(
  amntItem: AI,
  denKind: DK, //uses "human" unit by default
): AI extends AmountReturnItem<infer S, infer NK> ? ConversionReturnItem<S, NK, DK> : never;
export function conversionItem<const AI extends AmountItem, const DK extends Kind>(
  amntItem: AI,
  denKind: DK,
  //eslint-disable-next-line @typescript-eslint/unified-signatures
  denUnit: SymbolsOf<DK>,
): AI extends AmountReturnItem<infer S, infer NK> ? ConversionReturnItem<S, NK, DK> : never;
export function conversionItem<
  S extends number,
  const NK extends Kind,
  const DK extends KindWithHuman,
>(size: S,
  numKind: NK,
  numUnit: SymbolsOf<NK>,
  denKind: DK, //uses "human" unit by default
  transform?: TransformFuncUnion<S>,
): ConversionReturnItem<S, NK, DK>;
export function conversionItem<S extends number, const NK extends Kind, const DK extends Kind>(
  size: S,
  numKind: NK,
  numUnit: SymbolsOf<NK>,
  denKind: DK,
  denUnit: SymbolsOf<DK>,
  transform?: TransformFuncUnion<S>,
): ConversionReturnItem<S, NK, DK>;
export function conversionItem(
  amntItemOrSize: AmountItem | number,
  denKindOrNumKind: Kind,
  denUnitOrNumUnit?: string,
  denKind?: Kind,
  transformOrDenUnit?: TransformFuncUnion<number> | string,
  transform?: TransformFuncUnion<number>,
): any {
  if (typeof amntItemOrSize === "number") {
    const size = amntItemOrSize;
    const numKind = denKindOrNumKind;
    let numUnit = denUnitOrNumUnit!;
    denKind = denKind!;
    let denUnit;
    if (typeof transformOrDenUnit === "string")
      denUnit = transformOrDenUnit;
    else {
      denUnit = "human";
      transform = transformOrDenUnit;
    }

    if (typeof transform === "function")
      transform = transform(size);

    //atomic units are special because .toUnit() returns a bigint but we always want a Rational
    if (numUnit === "atomic")
      numUnit = numKind.atomic!;
    if (denUnit === "atomic")
      denUnit = denKind.atomic!;

    const denAmnt = Amount.from(1, denKind, denUnit);

    const toFunc = (val: Rationalish): Conversion<Kind, Kind> =>
      Conversion.from(Amount.from(val, numKind, numUnit), denAmnt);

    const fromFunc = (conv: Conversion<Kind, Kind>): Rational =>
      denAmnt.div(conv).in(numUnit);

    const custom = typeof transform === "object"
      ? {
        to: (val: NumericType<number>) =>
          toFunc(val),
        from: (conv: Conversion<Kind, Kind>): NumericType<number> =>
          numericReturn(size)(fromFunc(conv)),
      }
      : {
        to: (val: NumericType<number>) =>
          toFunc((transform as TransformFunc<number>).to(val)),
        from: (conv: Conversion<Kind, Kind>): NumericType<number> =>
          (transform as TransformFunc<number>).from(fromFunc(conv)),
      };

    return { binary: "uint", size, custom };
  }

  const amntItem = amntItemOrSize;
  denKind = denKindOrNumKind;
  let denUnit = denUnitOrNumUnit ?? "human";
  denUnit = denUnit === "atomic" ? denKind.atomic! : denUnit;
  const denAmnt = Amount.from(1, denKind, denUnit);
  const custom = {
    to: (val: NumericType<number>): Conversion<Kind, Kind> =>
      Conversion.from(amntItem.custom.to(val), denAmnt),
    from: (conv: Conversion<Kind, Kind>): NumericType<number> =>
      amntItem.custom.from(denAmnt.div(conv)),
  };

  return { ...amntItem, custom };
}

export function linearTransform<S extends number>(
  direction: "to->from" | "from->to",
  coefficient: Rationalish,
  constant?: Rationalish,
): SizedTransformFunc<S> {
  coefficient = Rational.from(coefficient);
  constant = Rational.from(constant ?? 0);
  return (size: S) => {
    const numRet = numericReturn(size);
    return direction === "to->from"
      ? {
        to: (val: NumericType<S>) => Rational.from(val).mul(coefficient).add(constant),
        from: (val: Rational) => numRet(val.sub(constant).div(coefficient)),
      }
      : {
        to: (val: NumericType<S>) => Rational.from(val).sub(constant).div(coefficient),
        from: (val: Rational) => numRet(val.mul(coefficient).add(constant)),
      };
  };
}
