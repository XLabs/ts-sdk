import type { Opts, MaybeArray, Brand } from "@xlabs-xyz/const-utils";
import { isArray } from "@xlabs-xyz/const-utils";
import type { Rationalish, ToFixedOptions } from "./rational.js";
import { Rational } from "./rational.js";
import type { Kind, KindWithHuman, SymbolsOf, DecimalSymbolsOf } from "./kind.js";
import { getUnit } from "./kind.js";
import { type RejectScalar, Amount } from "./amount.js";
import { inUnit } from "./format.js";

//Same logic for leading _ as for Amount - check there for rationale
export class _Conversion<NK extends Kind, DK extends Kind> {
  readonly ratio: Rational;
  readonly num: NK;
  readonly den: DK;

  private constructor(ratio: Rational, num: NK, den: DK) {
    this.ratio = ratio;
    this.num   = num;
    this.den   = den;
  }

  static from<NK extends Kind, DK extends Kind>(
    ratio: Rationalish,
    num:   RejectScalar<NK, KindWithHuman & NK>,
    den:   RejectScalar<DK, KindWithHuman & DK>,
  ): Conversion<NK, DK>;
  static from<NK extends Kind, DK extends Kind>(
    num: RejectScalar<NK, Amount<NK>>,
    den: RejectScalar<DK, KindWithHuman & DK | Amount<DK>>,
  ): Conversion<NK, DK>;
  static from(
    ratioOrNum: Rationalish | Amount<Kind>,
    numOrDen:   KindWithHuman | Amount<Kind>,
    maybeDen?:  KindWithHuman,
  ): any {
    const [amtNum, den] = _Conversion.isAmount(ratioOrNum)
      ? [ratioOrNum, numOrDen]
      : [Amount.from(ratioOrNum, numOrDen as KindWithHuman, "human"), maybeDen];
    const amtDen = _Conversion.isAmount(den) ? den : Amount.from(1, den as KindWithHuman, "human");
    const numStd = amtNum.kind.units[amtNum.kind.standard.unit]!;
    const denStd = amtDen.kind.units[amtDen.kind.standard.unit]!;

    return _Conversion.checkedNew(
      amtNum.in(numStd.symbol as SymbolsOf<Kind>).div(amtDen.in(denStd.symbol as SymbolsOf<Kind>)),
      amtNum.kind,
      amtDen.kind,
    );
  }

  static parse<NK extends Kind, DK extends Kind>(
    str:      string,
    numKinds: MaybeArray<NK>,
    denKinds: MaybeArray<DK>
  ): Conversion<NK, DK> {
    const lastSlash = str.lastIndexOf("/");
    if (lastSlash === -1)
      throw new Error("Expected string in format 'numerator/denominator'");

    const numKindsArray = isArray(numKinds) ? numKinds : [numKinds];
    const denKindsArray = isArray(denKinds) ? denKinds : [denKinds];
    const numAmount     = Amount.parse(str.substring(0, lastSlash), ...numKindsArray);
    const denStr        = str.substring(lastSlash + 1);
    const denKindRes    = denKindsArray.filter(k => denStr in k.units);
    if (denKindRes.length !== 1)
      throw new Error("Could not identify denominator kind from string");

    const denKind = denKindRes[0]!;
    const denUnit = denKind.units[denStr]!;
    const ration  = numAmount.in("standard").div(denUnit.scale);

    return _Conversion.checkedNew(ration, numAmount.kind as NK, denKind);
  }

  static hasNum<C extends Conversion<Kind, Kind>, N extends string>(
    conv: C,
    numName: N
  ): conv is Extract<C, { num: { name: N } }> {
    return conv.num.name === numName;
  }

  static hasDen<C extends Conversion<Kind, Kind>, N extends string>(
    conv: C,
    denName: N
  ): conv is Extract<C, { den: { name: N } }> {
    return conv.den.name === denName;
  }

  toString<NS extends SymbolsOf<NK> = SymbolsOf<NK>>(opts?: Opts<ToFixedOptions & {
    numSymbol: NS;
    denSymbol: SymbolsOf<DK>;
    precision: number | (NS extends DecimalSymbolsOf<NK> ? DecimalSymbolsOf<NK> : never);
  }>): string {
    const numSym  = (opts?.numSymbol ?? this.num.human ?? this.num.standard.unit) as SymbolsOf<NK>;
    const denSym  = (opts?.denSymbol ?? this.den.human ?? this.den.standard.unit) as SymbolsOf<DK>;
    const numUnit = getUnit(this.num, numSym);
    const denUnit = getUnit(this.den, denSym);
    const stdVal  = this.ratio.mul(denUnit.scale);
    const prec    = opts?.precision ?? 0;
    const num     = inUnit(this.num, stdVal, numUnit.symbol, prec, opts);
    return `${num}/${denUnit.symbol}`;
  }

  toJSON(opts?: Opts<ToFixedOptions>): string {
    return this.toString(opts);
  }

  in<NS extends SymbolsOf<NK>, DS extends SymbolsOf<DK>>(numUnit: NS, denUnit: DS): Rational {
    const num = getUnit(this.num, numUnit);
    const den = getUnit(this.den, denUnit);
    return this.ratio.mul(den.scale).div(num.scale);
  }

  mul(scalar: Rationalish | Amount<Brand<Kind, "scalar">>): Conversion<NK, DK> {
    scalar = _Conversion.isAmount(scalar) ? scalar.in("standard") : scalar;
    return new _Conversion(this.ratio.mul(scalar), this.num, this.den) as Conversion<NK, DK>;
  }

  div(scalar: Rationalish | Amount<Brand<Kind, "scalar">>): Conversion<NK, DK> {
    scalar = _Conversion.isAmount(scalar) ? scalar.in("standard") : scalar;
    return new _Conversion(this.ratio.div(scalar), this.num, this.den) as Conversion<NK, DK>;
  }

  inv(): Conversion<DK, NK> {
    return new _Conversion(this.ratio.inv(), this.den, this.num) as Conversion<DK, NK>;
  }

  combine<NKO extends DK, DKO extends Kind>(other: Conversion<NKO, DKO>): Conversion<NK, DKO> {
    if (this.den.name !== other.num.name)
      throw new Error(`Kind mismatch: ${this.den.name} vs ${other.num.name}`);

    return _Conversion.checkedNew(
      this.ratio.mul(other.ratio),
      this.num,
      other.den,
    ) as Conversion<NK, DKO>;
  }

  eq(other: Conversion<NK, DK>): boolean {
    this.checkKinds(other);
    return this.ratio.eq(other.ratio);
  }

  ne(other: Conversion<NK, DK>): boolean {
    return !this.eq(other);
  }

  gt(other: Conversion<NK, DK>): boolean {
    this.checkKinds(other);
    return this.ratio.gt(other.ratio);
  }

  ge(other: Conversion<NK, DK>): boolean {
    this.checkKinds(other);
    return this.ratio.ge(other.ratio);
  }

  lt(other: Conversion<NK, DK>): boolean {
    return !this.ge(other);
  }

  le(other: Conversion<NK, DK>): boolean {
    return !this.gt(other);
  }

  private checkKinds(other: Conversion<NK, DK>): void {
    if (this.num.name !== other.num.name || this.den.name !== other.den.name)
      throw new Error(
        `Kind mismatch: ${this.num.name}/${this.den.name} vs ${other.num.name}/${other.den.name}`
      );
  }

  private static checkedNew<
    NK extends Kind,
    DK extends Kind,
  >(ratio: Rational, num: NK, den: DK): Conversion<NK, DK> {
    if (num.name === den.name)
      throw new Error(`Must be distinct kinds: ${num.name} vs ${den.name}`);

    return new _Conversion(ratio, num, den) as Conversion<NK, DK>;
  }

  private static isAmount(x: any): x is Amount<Kind> {
    return typeof x === "object" && "kind" in x;
  }
}

type Conversion<NK extends Kind, DK extends Kind> =
  NK extends Kind
    ? DK extends Kind
      ? _Conversion<NK, DK>
      : never
    : never;
const Conversion = _Conversion;
export { Conversion };
