import type { Opts } from "@xlabs-xyz/const-utils";

type ubigint = bigint; //just an annotation that these bigints are always guaranteed to be unsigned
//the mantissa of an IEEE double can reliably represent log10(2^53) ~= 15 decimal places
const NUMBER_RELIABLY_ACCURATE_DECIMALS = 15;

export type Rationalish = Rational | number | bigint;
export type ThousandsSep = "" | "," | "_";
export type ToFixedOptions = { thousandsSep: ThousandsSep; trimZeros: boolean };

export class Rational {
  private static defaultPrecision = 10;

  static setDefaultPrecision(precision: number) {
    Rational.defaultPrecision = Rational.checkPrecision(precision);
  }

  private readonly n: bigint;
  private readonly d: ubigint;

  //class invariants: n and d are always coprime, d is always positive
  private constructor(n: bigint, d: ubigint) {
    this.n = n;
    this.d = d;
  }

  //the first signature has to be Rationalish and not just Rational because otherwise tsc complains
  //  when trying to call from with a Rationalish type because it fails to realize that for each
  //  member of the union, there is a valid overload (albeit with an additional, optional parameter)
  static from(value: Rationalish | string): Rational;
  static from(value: number, precision?: number): Rational;
  static from(numerator: bigint, denominator?: bigint): Rational;
  static from(
    valueOrNumerator: Rationalish | string,
    precisionOrDenominator?: number | bigint,
  ): Rational {
    switch (typeof valueOrNumerator) {
      case "number": {
        const value = valueOrNumerator;
        if (Number.isInteger(value))
          return new Rational(BigInt(value), 1n);

        if (!Number.isFinite(value)) //handle infinities and NaNs
          throw new Error("Invalid value");

        const precision = precisionOrDenominator === undefined
          ? Rational.defaultPrecision
          : Rational.checkPrecision(precisionOrDenominator as number);

        //continued fractions to find best rational approximation with denominator ≤ 10^precision
        const maxDenom = 10 ** precision;
        const sign = value < 0 ? -1n : 1n;
        const target = Math.abs(value);
        let cur = target;

        let n2 = 0, n1 = 1, d2 = 1, d1 = 0;
        while (true) {
          const a = Math.floor(cur);
          const n = a * n1 + n2;
          const d = a * d1 + d2;

          if (d > maxDenom) {
            //check if a semi-convergent is better than the previous convergent
            const aMax = Math.floor((maxDenom - d2) / d1);
            if (aMax > 0) {
              const nSemi = aMax * n1 + n2;
              const dSemi = aMax * d1 + d2;
              if (Math.abs(target * dSemi - nSemi) * d1 < Math.abs(target * d1 - n1) * dSemi)
                return new Rational(sign * BigInt(nSemi), BigInt(dSemi));
            }
            return new Rational(sign * BigInt(n1), BigInt(d1));
          }

          const next = 1 / (cur - a);
          if (!Number.isFinite(next))
            return new Rational(sign * BigInt(n), BigInt(d));

          n2 = n1; n1 = n; d2 = d1; d1 = d;
          cur = next;
        }
      }

      case "bigint": {
        let numerator = valueOrNumerator;
        if (precisionOrDenominator === undefined)
          return new Rational(numerator, 1n);

        let denominator = precisionOrDenominator as bigint;
        if (denominator === 0n)
          throw new Error("Denominator cannot be zero");

        if (denominator < 0n)
          [numerator, denominator] = [-numerator, -denominator];

        return new Rational(...Rational.normalize(numerator, denominator));
      }

      case "string": {
        const parseBigInt = (s: string) => BigInt(s.replace(/[,_]/g, ""));
        const intPat = "\\d+|\\d{1,3}(?:[,_]\\d{3})+";

        const ratioMatch = new RegExp(`^(-?)(${intPat})/(${intPat})$`).exec(valueOrNumerator);
        if (ratioMatch) {
          const [, sign, numStr, denStr] = ratioMatch;
          const num = (sign === "-" ? -1n : 1n) * parseBigInt(numStr!);
          const den = parseBigInt(denStr!);
          if (den === 0n)
            throw new Error("Denominator cannot be zero");
          return new Rational(...Rational.normalize(num, den));
        }

        const decMatch = new RegExp(`^(-?)(${intPat})(?:\\.(\\d+))?$`).exec(valueOrNumerator);
        if (!decMatch)
          throw new Error(`Invalid rational value: ${valueOrNumerator}`);

        const [, sign, intStr, frac] = decMatch;
        const intPart = (sign === "-" ? -1n : 1n) * parseBigInt(intStr!);

        if (!frac)
          return new Rational(intPart, 1n);

        const denominator = 10n ** BigInt(frac.length);
        const numerator = intPart * denominator +
          (intPart < 0n ? -BigInt(frac) : BigInt(frac));
        return new Rational(...Rational.normalize(numerator, denominator));
      }

      default:
        return valueOrNumerator;
    }
  }

  unwrap(): [bigint, bigint] {
    return [this.n, this.d];
  }

  isInteger(): boolean {
    return this.d === 1n;
  }

  sign(): -1n | 0n | 1n {
    return this.n < 0n ? -1n : this.n > 0n ? 1n : 0n;
  }

  ceil(): bigint {
    const intPart = this.n / this.d;
    return this.n > 0n && this.n % this.d !== 0n ? intPart + 1n : intPart;
  }

  round(): bigint {
    const num = this.n * 2n + this.d;
    const den = this.d * 2n;
    const intPart = num / den;
    return num < 0n && num % den !== 0n ? intPart - 1n : intPart;
  }

  floor(): bigint {
    const intPart = this.n / this.d;
    return this.n < 0n && this.n % this.d !== 0n ? intPart - 1n : intPart;
  }

  toNumber(): number {
    return Number(this.n / this.d) + Number(this.n % this.d) / Number(this.d);
  }

  toString(): string {
    return this.toFixed(Rational.defaultPrecision, { trimZeros: true });
  }

  toFixed(precision: number = 0, opts?: Opts<ToFixedOptions>): string {
    const thousandsSep = opts?.thousandsSep ?? "";
    const trimZeros    = opts?.trimZeros    ?? false;

    const multiplier = 10n ** BigInt(precision);
    const nAbs = Rational.stripSign(this.n);
    const val = (nAbs * multiplier + this.d / 2n) / this.d;
    const sign = this.n < 0n && val !== 0n ? "-" : "";

    if (precision === 0)
      return sign + Rational.addSep(val.toString(), thousandsSep);

    const valStr = val.toString().padStart(precision + 1, "0");
    const intPartStr = Rational.addSep(valStr.slice(0, -precision), thousandsSep);
    let fracPartStr = valStr.slice(-precision);

    if (trimZeros) {
      fracPartStr = fracPartStr.replace(/0+$/, "");
      if (fracPartStr === "")
        return sign + intPartStr;
    }

    return sign + intPartStr + "." + fracPartStr;
  }

  eq(other: Rationalish): boolean {
    switch (typeof other) {
      case "number":
        return this.toNumber() === other;

      case "bigint":
        return this.n === other && this.d === 1n;

      default:
        return this.n === other.n && this.d === other.d;
    }
  }

  ne(other: Rationalish): boolean {
    return !this.eq(other);
  }

  gt(other: Rationalish): boolean {
    switch (typeof other) {
      case "number":
        return this.toNumber() > other;

      case "bigint":
        return this.n > other * this.d;

      default:
        return this.n * other.d > other.n * this.d;
    }
  }

  ge(other: Rationalish): boolean {
    switch (typeof other) {
      case "number":
        return this.toNumber() >= other;

      case "bigint":
        return this.n >= other * this.d;

      default:
        return this.n * other.d >= other.n * this.d;
    }
  }

  lt(other: Rationalish): boolean {
    return !this.ge(other);
  }

  le(other: Rationalish): boolean {
    return !this.gt(other);
  }

  abs(): Rational {
    return this.n < 0n ? this.neg() : this;
  }

  neg(): Rational {
    return this.n === 0n ? this : new Rational(-this.n, this.d);
  }

  inv(): Rational {
    if (this.n === 0n)
      throw new Error("Cannot invert zero");

    return (this.n < 0n)
      ? new Rational(-this.d, -this.n)
      : new Rational(this.d, this.n);
  }

  add(other: Rationalish): Rational {
    switch (typeof other) {
      case "number":
        return this.add(Number.isInteger(other) ? BigInt(other) : Rational.from(other));

      case "bigint":
        return new Rational(...Rational.normalize(this.n + other * this.d, this.d));

      default: {
        const gcd = Rational.gcd(this.d, other.d);
        const lcm = (this.d / gcd) * other.d;
        const num = this.n * (lcm / this.d) + other.n * (lcm / other.d);
        return new Rational(...Rational.normalize(num, lcm));
      }
    }
  }

  sub(other: Rationalish): Rational {
    return this.add(typeof other === "bigint" || typeof other === "number" ? -other : other.neg());
  }

  mul(other: Rationalish): Rational {
    switch (typeof other) {
      case "number":
        return this.mul(Number.isInteger(other) ? BigInt(other) : Rational.from(other));

      case "bigint": {
        const gcd = Rational.gcd(Rational.stripSign(other), this.d);
        return new Rational(this.n * (other / gcd), this.d / gcd);
      }

      default: {
        const gcd1 = Rational.gcd(Rational.stripSign(this.n), other.d);
        const gcd2 = Rational.gcd(Rational.stripSign(other.n), this.d);
        const num = (this.n / gcd1) * (other.n / gcd2);
        const den = (this.d / gcd2) * (other.d / gcd1);
        return new Rational(num, den);
      }
    }
  }

  div(other: Rationalish): Rational {
    switch (typeof other) {
      case "number":
        return this.div(Number.isInteger(other) ? BigInt(other) : Rational.from(other));

      case "bigint": {
        if (other === 0n)
          throw new Error("Cannot divide by zero");

        const [num, den] = Rational.normalize(this.n, other);
        return new Rational(num, den * this.d);
      }

      default:
        return this.mul(other.inv());
    }
  }

  mod(other: Rationalish): Rational {
    const divisor = Rational.from(other);
    return this.sub(divisor.mul(this.div(divisor).floor()));
  }

  private static addSep(intStr: string, thousandsSep: "" | "," | "_"): string {
    return thousandsSep ? intStr.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep) : intStr;
  }

  private static gcd(a: ubigint, b: ubigint): ubigint {
    while (b !== 0n)
      [a, b] = [b, a % b];

    return a;
  }

  private static stripSign(n: bigint): ubigint {
    return n < 0n ? -n : n;
  }

  private static normalize(n: bigint, d: ubigint): [bigint, ubigint] {
    const gcd = Rational.gcd(Rational.stripSign(n), d);
    return [n / gcd, d / gcd];
  }

  private static checkPrecision(precision: number) {
    if (!Number.isInteger(precision) ||
      precision < 0 ||
      precision > NUMBER_RELIABLY_ACCURATE_DECIMALS
    )
      throw new Error("Invalid precision");

    return precision;
  }
}
