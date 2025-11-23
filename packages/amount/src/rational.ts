type ubigint = bigint; //just an annotation that these bigints are always guaranteed to be unsigned
//the mantissa of an IEEE double can reliably represent log10(2^53) ~= 15 decimal places
const NUMBER_RELIABLY_ACCURATE_DECIMALS = 15;

export type Rationalish = Rational | number | bigint;

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

        //TODO: use Farney sequence to more efficiently convert floating point to rational
        const intPart = Math.floor(value);
        const fracPart = value - intPart;
        const mul = 10 ** precision;
        const [fracNum, den] = Rational.normalize(BigInt(Math.round(fracPart * mul)), BigInt(mul));
        return new Rational(BigInt(intPart)*den + fracNum, den);
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
        // This allows for things like "-000.100" for -0.1
        const parts = /^(-?\d+)(\.(\d+))?$/.exec(valueOrNumerator);
        if (parts === null)
          throw new Error(`Invalid rational value: ${valueOrNumerator}`);

        const [, intPart, , fracPart] = parts;
        const bigIntPart = BigInt(intPart!);
        if (fracPart === undefined)
          return new Rational(bigIntPart, 1n);

        /** @todo: Should we do something with the precision here? */
        // Right now the precision is infinite
        const denominator = 10n ** BigInt(fracPart.length);
        const numerator = bigIntPart * denominator +
          (bigIntPart < 0n ? -BigInt(fracPart) : BigInt(fracPart));

        return new Rational(...Rational.normalize(numerator, denominator));
      }

      default:
        return new Rational(valueOrNumerator.n, valueOrNumerator.d);
    }
  }

  unwrap(): [bigint, bigint] {
    return [this.n, this.d];
  }

  isInteger(): boolean {
    return this.d === 1n;
  }

  floor(): bigint {
    const intPart = this.n / this.d;
    return this.n < 0n && this.n % this.d !== 0n ? intPart - 1n : intPart;
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

  toNumber(): number {
    return Number(this.n / this.d) + Number(this.n % this.d) / Number(this.d);
  }

  toString(): string {
    return this.toFixedPoint(Rational.defaultPrecision);
  }

  toFixed(precision: number = 0): string {
    const multiplier = 10n ** BigInt(precision);
    const nAbs = Rational.stripSign(this.n);
    const val = (nAbs * multiplier + this.d / 2n) / this.d;
    const sign = this.n < 0n && val !== 0n ? "-" : "";

    if (precision === 0)
      return sign + val.toString();

    const valStr = val.toString().padStart(precision + 1, "0");
    const intPartStr  = valStr.slice(0, -precision);
    const fracPartStr = valStr.slice(-precision);

    return sign + intPartStr + "." + fracPartStr;
  }

  //like toFixed, but without the trailing zeros
  toFixedPoint(precision: number): string {
    const str = this.toFixed(precision);
    if (!str.includes("."))
      return str;

    let end = str.length - 1;
    while (end >= 0 && str[end] === "0")
      --end;

    if (end >= 0 && str[end] === ".")
      --end;

    return str.slice(0, end + 1);
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
    return this.n < 0n ? this.neg() : new Rational(this.n, this.d);
  }

  neg(): Rational {
    return new Rational(-this.n, this.d);
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
