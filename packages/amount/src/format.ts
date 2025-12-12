import type { Opts, RoArray } from "@xlabs-xyz/const-utils";
import { type ToFixedOptions, Rational } from "./rational.js";
import { type Unit, powerOfTen, Kind } from "./kind.js";
import { segment, SegmentPair } from "./segmenting.js";

const approxDigits = 3;

export function inUnit<U extends string>(
  kind:      Kind<U>,
  stdVal:    Rational,
  symbol:    U,
  precision: number | U = 0,
  opts?:     Opts<ToFixedOptions>,
): string {
  const unit = kind.units[symbol]!;
  const decimals = typeof precision === "number"
    ? precision
    : unit.oom! - kind.units[precision]!.oom!;

  if (decimals < 0)
    throw new Error("Precision must be non-negative");

  return formatWithSymbol(stdVal.div(unit.scale), decimals, unit, opts);
}

export function approximate(
  kind:   Kind,
  stdVal: Rational,
  opts?:  Opts<ToFixedOptions & { system: string }>,
): string {
  const sortedByScale = getSystemUnits(kind, opts?.system);

  if (isDecimal(kind, opts?.system)) {
    if (stdVal.eq(0))
      return formatZero(kind, opts);

    const { lbIndex, lbUnit, lbValue } = lowerBoundInfo(stdVal, sortedByScale);
    const precision = getApproxPrec(lbIndex, lbValue);

    let ubUnit:  Unit;
    let ubValue: Rational;

    return formatWithSymbol(...
      lbIndex === 0
      || precision > 0
      || lbValue.lt(1000n)
      || (() => {
          ubUnit = sortedByScale[lbIndex - 1]!;
          return (ubUnit.oom! - lbUnit.oom! < 2 * approxDigits);
        })()
      || (() => {
          ubValue = stdVal.div(ubUnit.scale);
          return ubValue.lt(powerOfTen(-approxDigits));
        })()
      ? [lbValue,  precision,    lbUnit,  opts] as const
      : [ubValue!, approxDigits, ubUnit!, opts] as const
    );
  }

  return compound(kind, sortedByScale, stdVal, true, opts);
}

export function precise(
  kind:    Kind,
  stdVal:  Rational,
  opts?:   Opts<ToFixedOptions & { system: string }>,
): string {
  const sortedByScale = getSystemUnits(kind, opts?.system);

  if (isDecimal(kind, opts?.system)) {
    if (stdVal.eq(0))
      return formatZero(kind, opts);

    const { lbUnit } = lowerBoundInfo(stdVal.abs(), sortedByScale);
    const smallestUnit = sortedByScale.at(-1)!;
    const precision = lbUnit.oom! - smallestUnit.oom! + approxDigits;
    return formatWithSymbol(stdVal.div(lbUnit.scale), precision, lbUnit, opts);
  }

  return compound(kind, sortedByScale, stdVal, false, opts);
}

export function parse(kind: Kind, str: string): Rational {
  const processPair = (pair: SegmentPair) => {
    const value  = Rational.from(str.substring(pair.value[0], pair.value[1]));
    const symbol = str.substring(pair.symbol[0], pair.symbol[1]);
    const unit   = kind.units[symbol];
    if (!unit)
      throw new Error(`Unknown unit: ${symbol}`);

    return { value, unit };
  };

  const { negative, pairs } = segment(str);

  if (pairs.length === 1) {
    const { value, unit } = processPair(pairs[0]!);
    const absVal = value.mul(unit.scale);
    return negative ? absVal.neg() : absVal;
  }

  let total = Rational.from(0n);
  let lastScale: Rational | undefined = undefined;
  for (let i = 0; i < pairs.length; ++i) {
    const { value, unit } = processPair(pairs[i]!);

    if (i !== pairs.length - 1 && !value.isInteger())
      throw new Error("Decimal only allowed in final unit");

    if (lastScale && lastScale.le(unit.scale))
      throw new Error("Units must be in descending order");

    total = total.add(value.mul(unit.scale));
    lastScale = unit.scale;
  }

  return negative ? total.neg() : total;
}

const compound = (
  kind:          Kind,
  sortedByScale: Unit[],
  stdVal:        Rational,
  approx:        boolean,
  opts?:         Opts<ToFixedOptions>,
): string => {
  if (stdVal.eq(0))
    return formatZero(kind, opts);

  const parts: string[] = [];
  const absStdVal = stdVal.abs();
  const tolerance = approx ? absStdVal.div(powerOfTen(approxDigits)) : null;
  let remainder = absStdVal;
  let startFrom = 0;

  while (remainder.ne(0)) {
    const { lbIndex, lbUnit, lbValue } = lowerBoundInfo(remainder, sortedByScale, startFrom);
    const atSmallest = lbIndex === -1 || lbIndex === sortedByScale.length - 1;

    const precision = atSmallest
      ? (approx ? (parts.length === 0 ? getApproxPrec(lbIndex, lbValue) : 0) : approxDigits)
      : 0;

    parts.push(formatWithSymbol(Rational.from(lbValue.floor()), precision, lbUnit, opts));

    if (atSmallest)
      break;

    const nextRemainder = remainder.mod(lbUnit.scale);
    if (tolerance?.le(nextRemainder) === false)
      break;

    remainder = nextRemainder;
    startFrom = lbIndex + 1;
  }

  return (stdVal.lt(0) ? "-" : "") + parts.join(" ");
};

const formatZero = (kind: Kind, opts?: Opts<ToFixedOptions>): string => {
  const unit = kind.units[kind.human ?? kind.standard.unit]!;
  return formatWithSymbol(Rational.from(0n), 0, unit, opts);
};

function formatWithSymbol(
  value:    Rational,
  decimals: number,
  unit:     Unit,
  opts?:    Opts<ToFixedOptions>,
): string {
  const thousandsSep = opts?.thousandsSep ?? ",";
  const trimZeros    = opts?.trimZeros    ?? true;

  const valStr = value.toFixed(decimals, { thousandsSep, trimZeros });
  const sym    = unit.plural && value.ne(1n) ? unit.plural : unit.symbol;
  const space  = (unit.spacing ?? "spaced") === "spaced" ? " " : "";

  return (unit.position ?? "postfix") === "postfix"
    ? valStr + space + sym
    : sym + space + valStr;
}

const getSystem = (kind: Kind, system?: string) => {
  const name = system ?? kind.standard.system;
  const sys = kind.systems[name];
  if (!sys)
    throw new Error(`Unknown system: ${name}`);

  return sys;
};

const getSystemUnits = (kind: Kind, system?: string): Unit[] =>
  Array.from(new Set(getSystem(kind, system).symbols.map(s => kind.units[s]!).filter(Boolean)));

const isDecimal = (kind: Kind, system?: string): boolean =>
  getSystem(kind, system).decimal;

const getApproxPrec = (lbIndex: number, lbValue: Rational): number => {
  if (lbIndex === -1)
    return approxDigits;

  let precision = approxDigits;
  while (precision > 0 && lbValue.ge(powerOfTen(approxDigits - precision)))
    --precision;

  return precision;
};

const lowerBoundInfo = (
  stdVal:        Rational,
  sortedByScale: RoArray<Unit>,
  startIndex:    number = 0,
) => {
  const absStdVal = stdVal.abs();
  let lbIndex = startIndex;
  for (; lbIndex < sortedByScale.length; ++lbIndex)
    if (absStdVal.ge(sortedByScale[lbIndex]!.scale))
      break;

  if (lbIndex === sortedByScale.length)
    lbIndex = -1;

  const lbUnit  = sortedByScale.at(lbIndex)!;
  const lbValue = stdVal.div(lbUnit.scale);
  return { lbIndex, lbUnit, lbValue } as const;
};
