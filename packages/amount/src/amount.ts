import type { Brand, Opts } from "@xlabs-xyz/const-utils";
import { brand } from "@xlabs-xyz/const-utils";
import type { Rationalish, ToFixedOptions } from "./rational.js";
import { Rational } from "./rational.js";
import type { Kind, KindWithHuman, SymbolsOf, DecimalSymbolsOf } from "./kind.js";
import { getUnit, identifyKind } from "./kind.js";
import { type Conversion, _Conversion } from "./conversion.js";
import { approximate, precise, inUnit, parse as parseFormat } from "./format.js";

export type AmountFromArgs<K extends Kind> =
  K extends any ? [kind: K, unitSymbol: SymbolsOf<K>] : never;

export const scalar = brand<"scalar">();

export type RejectScalar<K extends Kind, T> = K extends Brand<Kind, "scalar"> ? never : T;

//See end of file for actual exports
//The issue with exporting the Amount class directly is its behavior with unions of kinds:
//_Amount<K1 | K2> is not a supertype of _Amount<K1> due to contravariance in method parameters
//  (e.g. .in() on _Amount<K1> only accepts SymbolsOf<K1>, not SymbolsOf<K1 | K2>).
//This breaks the intuitive expectation that _Amount<K1> should be assignable to _Amount<K1 | K2>.
//Distribution fixes this: Amount<K1> is trivially assignable to Amount<K1> | Amount<K2>.
//So ultimately, nobody ever wants to deal with an Amount that hasn't been distributed and so
//  we export its distributive type, along with the runtime factory function as Amount instead.
export class _Amount<K extends Kind> {
  private readonly amount: Rational; //class invariant: stored in standard units
  readonly kind: K;

  private constructor(amount: Rational, kind: K) {
    this.amount = amount;
    this.kind = kind;
  }

  static ofKind<const K extends KindWithHuman>(kind: K):
    (amount: Rationalish | string, unitSymbol?: SymbolsOf<K>) => Amount<K>;
  static ofKind<const K extends Kind>(kind: K):
    (amount: Rationalish | string, unitSymbol: SymbolsOf<K>) => Amount<K>;
  static ofKind(kind: Kind) {
    return (amount: Rationalish | string, unitSymbol?: string) =>
      _Amount.fromInternal(amount, kind, unitSymbol ?? kind.human) as Amount<Kind>;
  }

  static from<const K extends KindWithHuman>(
    amount: Rationalish | string,
    ...args: K extends any ? [kind: K, unitSymbol?: SymbolsOf<K>] : never
  ): Amount<K>;
  static from<const K extends Kind>(
    amount: Rationalish | string,
    ...args: AmountFromArgs<K>
  ): Amount<K>;
  static from<const K extends Kind>(
    amount: Rationalish | string,
    ...args: [kind: K, unitSymbol?: SymbolsOf<K>]
  ): Amount<K> {
    return _Amount.fromInternal(amount, args[0], args[1]) as Amount<K>;
  }

  static parse<const K extends Kind>(str: string, ...kinds: K[]): Amount<K> {
    const kind = identifyKind(kinds, str);
    if (!kind)
      throw new Error("Could not identify kind from string");

    const value = parseFormat(kind, str);
    return _Amount.fromInternal(value, kind, kind.standard.unit) as Amount<K>;
  }

  static isOfKind<A extends Amount<Kind>, N extends string>(
    amt: A,
    kindName: N,
  ): amt is Extract<A, { kind: { name: N } }> {
    return amt.kind.name === kindName;
  }

  toString(): string;
  toString(
    system: Extract<keyof K["systems"], string>,
    opts?:  Opts<ToFixedOptions>,
  ): string;
  toString(
    mode: "approximate" | "precise",
    opts?: Opts<ToFixedOptions & { system: Extract<keyof K["systems"], string> }>,
  ): string;
  toString<S extends SymbolsOf<K>>(
    mode:   "inUnit",
    symbol: S,
    opts?:  Opts<ToFixedOptions & {
      precision: number | (S extends DecimalSymbolsOf<K> ? DecimalSymbolsOf<K> : never);
    }>,
  ): string;
  toString(
    modeOrSys?:    string,
    symbolOrOpts?: SymbolsOf<K> | Opts<ToFixedOptions & { system?: string }>,
    opts?:         Opts<ToFixedOptions & { precision?: number | DecimalSymbolsOf<K> }>,
  ): string {
    if (modeOrSys === "inUnit") {
      const symbol = getUnit(this.kind, symbolOrOpts as SymbolsOf<K>).symbol;
      const prec = typeof opts?.precision === "string"
        ? getUnit(this.kind, opts.precision as SymbolsOf<K>).symbol
        : opts?.precision;

      return inUnit(this.kind, this.amount, symbol, prec, opts);
    }

    const isMode = !modeOrSys || modeOrSys === "approximate" || modeOrSys === "precise";
    const o = (
      isMode ? symbolOrOpts : { system: modeOrSys, ...(symbolOrOpts as object) }
    ) as Opts<ToFixedOptions & { system?: string }> | undefined;

    return modeOrSys === "precise"
      ? precise(this.kind, this.amount, o)
      : approximate(this.kind, this.amount, o);
  }

  toJSON(opts?: Opts<ToFixedOptions>): string {
    return precise(this.kind, this.amount, opts);
  }

  in<S extends SymbolsOf<K>>(unitSymbol: S): S extends "atomic" ? bigint : Rational;
  in(unitSymbol: K extends { human: string } ? "human" : never): Rational;
  in(unitSymbol: K extends { atomic: string } ? "atomic" : never): bigint;
  in<S extends SymbolsOf<K>>(unitSymbol: S): S extends "atomic" ? bigint : Rational {
    const rat = this.getIn(unitSymbol);
    return (unitSymbol === "atomic" ? rat.floor() : rat) as S extends "atomic" ? bigint : Rational;
  }

  ceilTo<S extends SymbolsOf<K>>(unitSymbol: S): _Amount<K> {
    return _Amount.fromInternal(this.getIn(unitSymbol).ceil(), this.kind, unitSymbol);
  }

  roundTo<S extends SymbolsOf<K>>(unitSymbol: S): _Amount<K> {
    return _Amount.fromInternal(this.getIn(unitSymbol).round(), this.kind, unitSymbol);
  }

  floorTo<S extends SymbolsOf<K>>(unitSymbol: S): _Amount<K> {
    return _Amount.fromInternal(this.getIn(unitSymbol).floor(), this.kind, unitSymbol);
  }

  eq(other: _Amount<K>): boolean {
    this.checkKind(other);
    return this.amount.eq(other.amount);
  }

  ne(other: _Amount<K>): boolean {
    this.checkKind(other);
    return this.amount.ne(other.amount);
  }

  lt(other: _Amount<K>): boolean {
    this.checkKind(other);
    return this.amount.lt(other.amount);
  }

  le(other: _Amount<K>): boolean {
    this.checkKind(other);
    return this.amount.le(other.amount);
  }

  gt(other: _Amount<K>): boolean {
    this.checkKind(other);
    return this.amount.gt(other.amount);
  }

  ge(other: _Amount<K>): boolean {
    this.checkKind(other);
    return this.amount.ge(other.amount);
  }

  add(other: _Amount<K>): _Amount<K> {
    this.checkKind(other);
    return new _Amount(this.amount.add(other.amount), this.kind);
  }

  sub(other: _Amount<K>): _Amount<K> {
    this.checkKind(other);
    return new _Amount(this.amount.sub(other.amount), this.kind);
  }

  mul(other: Rationalish | Amount<Brand<Kind, "scalar">>): Amount<K>;
  mul<NK extends Kind>(other: Conversion<NK, K>): Amount<NK>;
  mul(other: Rationalish | Amount<Brand<Kind, "scalar">> | Conversion<Kind, K>): Amount<Kind> {
    if (_Amount.isConversion(other)) {
      this.checkKind(other.den);
      return new _Amount(this.amount.mul(other.ratio), other.num) as Amount<Kind>;
    }
    const rhs = other instanceof _Amount ? other.getIn("standard") : other;
    return new _Amount(this.amount.mul(rhs), this.kind) as Amount<Kind>;
  }

  div(other: Rationalish | Amount<Brand<Kind, "scalar">>): Amount<K>;
  div<DK extends Kind>(other: Conversion<K, DK>): Amount<DK>;
  div(other: Rationalish | Amount<Brand<Kind, "scalar">> | Conversion<K, Kind>): Amount<Kind> {
    if (_Amount.isConversion(other)) {
      this.checkKind(other.num);
      return new _Amount(this.amount.div(other.ratio), other.den) as Amount<Kind>;
    }
    const rhs = other instanceof _Amount ? other.getIn("standard") : other;
    return new _Amount(this.amount.div(rhs), this.kind) as Amount<Kind>;
  }

  per<DK extends Kind>(
    this: RejectScalar<K, Amount<K>>,
    den:  RejectScalar<DK, KindWithHuman & DK | Amount<DK>>,
  ): Conversion<K, DK> {
    //casts are safe: the `this` and `den` types already guarantee non-scalar
    return _Conversion.from(this as any, den as any);
  }

  private static fromInternal<const K extends Kind>(
    amount: Rationalish | string,
    kind: K,
    unitSymbol?: string,
  ): _Amount<K> {
    const unit = getUnit(kind, (unitSymbol ?? "human") as SymbolsOf<K>);
    amount = Rational.from(amount).mul(unit.scale);
    return new _Amount(amount, kind);
  }

  private getIn<S extends SymbolsOf<K>>(unitSymbol: S): Rational {
    return this.amount.div(getUnit<K, S>(this.kind, unitSymbol).scale);
  }

  private checkKind(other: Kind | _Amount<any>): void {
    const otherKind = "kind" in other ? other.kind : other;
    if (this.kind !== otherKind)
      throw new Error(`Kind mismatch: ${this.kind.name} vs ${otherKind.name}`);
  }

  private static isConversion(x: unknown): x is Conversion<Kind, Kind> {
    return typeof x === "object" && x !== null && "ratio" in x && "num" in x && "den" in x;
  }
}

//always distribute because _Amount<KindUnion> is useless
type Amount<K extends Kind> = K extends Kind ? _Amount<K> : never;
const Amount = _Amount;
export { Amount };
