import type { Opts, RoArray, RoNeTuple, RoPair } from "@xlabs-xyz/const-utils";
import { omit, fromEntries, pick, isArray } from "@xlabs-xyz/const-utils";
import { Rational, Rationalish } from "./rational.js";
import { segment } from "./segmenting.js";

// ---- Public API types ----

export type SymbolSpec = Readonly<{
  symbol:    string;
  plural?:   string;
  position?: "postfix" | "prefix";
  spacing?:  "spaced" | "compact";
}>

export type DecimalSpec<N extends number = number> = { readonly oom: N };

export type ScaleSpec<N extends Rationalish = Rationalish> = { readonly scale: N };

export type Unit = SymbolSpec & { readonly scale: Rational } & Partial<DecimalSpec>;

export type SystemInfo<
  N extends string  = string,
  U extends string  = string,
  D extends boolean = boolean,
> = { name: N; symbols: U; decimal: D };

export type StandardInfo<
  SY extends string = string,
  SU extends string = string,
> = { system: SY; unit: SU };

export type ValidStandardInfo<Y extends SystemInfo> =
  Y extends SystemInfo<infer N, infer U, boolean> ? StandardInfo<N, U> : never;

export type Kind<
  U extends string               = string,
  N extends string               = string,
  Y extends SystemInfo           = SystemInfo,
  S extends ValidStandardInfo<Y> = ValidStandardInfo<Y>,
  H extends U | undefined        = U | undefined,
  A extends U | undefined        = U | undefined,
> = Readonly<{
    name:     N;
    units:    KindUnits<U>; //guaranteed to be in descending order by scale
    standard: S;
    systems:  KindSystems<Y>;
  } & (
    [U | undefined] extends [H] ? { human?:  U } : [H] extends [U] ? { human:  H } : unknown
  ) & (
    [U | undefined] extends [A] ? { atomic?: U } : [A] extends [U] ? { atomic: A } : unknown
  )>;

export type KindWithHuman<
  U extends string               = string,
  N extends string               = string,
  Y extends SystemInfo           = SystemInfo,
  S extends ValidStandardInfo<Y> = ValidStandardInfo<Y>,
  H extends U                    = U,
  A extends U | undefined        = U | undefined,
> = Kind<U, N, Y, S, H, A>;

export type KindWithAtomic<
  U extends string               = string,
  N extends string               = string,
  Y extends SystemInfo           = SystemInfo,
  S extends ValidStandardInfo<Y> = ValidStandardInfo<Y>,
  H extends U | undefined        = U | undefined,
  A extends U                    = U,
> = Kind<U, N, Y, S, H, A>;

export type SymbolsOf<K extends Kind> =
  Extract<keyof K["units"], string> |
  "standard" |
  (K["human"]  extends string ? "human"  : never) |
  (K["atomic"] extends string ? "atomic" : never);

export type DecimalSymbolsOf<K extends Kind> =
  K extends Kind<string, string, infer Y extends SystemInfo>
  ? Y extends { symbols: infer Syms extends string; decimal: true } ? Syms : never
  : never;

export type GetUnitSymbol<K extends Kind, M extends SymbolsOf<K>> =
  M extends "standard" ? K["standard"]["unit"] :
  M extends "human"    ? K["human"] :
  M extends "atomic"   ? K["atomic"] :
  M;

export type GetUnit<K extends Kind, M extends SymbolsOf<K>> =
  GetUnitSymbol<K, M> extends infer S extends keyof K["units"]
  ? K["units"][S] extends Unit ? K["units"][S] : never
  : never;

export function getUnit<
  const K extends Kind,
  const S extends SymbolsOf<K>,
>(kind: K, unitSymbol: S): GetUnit<K, S> {
  const symbol =
    unitSymbol === "standard" ? kind.standard.unit :
    unitSymbol === "human"    ? kind.human :
    unitSymbol === "atomic"   ? kind.atomic :
    unitSymbol;

  return kind.units[symbol!] as any;
}

export function kind<
  N extends string,
  const I extends KindUnitsInput,
  H extends UnitSymbolsOf<UnitsSpecOf<I>> | undefined = undefined,
  A extends UnitSymbolsOf<UnitsSpecOf<I>> | undefined = undefined
>(name:       N,
  unitsInput: I,
  opts?: Opts<{
    human:   H;
    atomic:  A;
  }>
): Kind<UnitSymbolsOf<UnitsSpecOf<I>>, N, SystemInfoOf<I>, StandardInfoOf<I>, H, A> {
  const isSystemsSpec = isArray(unitsInput) && isArray(unitsInput[0]);
  const systemEntries = (
    isSystemsSpec ? unitsInput : [["default", unitsInput]]
  ) as RoArray<SystemEntry>;

  const firstSpec = systemEntries[0]![1];
  const standard = {
    system: systemEntries[0]![0],
    unit:   firstSpec[0]!.symbols[0]!.symbol,
  } as const;
  const meta = pick(opts ?? {}, ["human", "atomic"]);

  const allUnits: [string, Unit][] = [];
  const systems: Record<string, { symbols: string[]; decimal: boolean }> = {};

  for (let i = 0; i < systemEntries.length; ++i) {
    const [sysName, unitsSpec] = systemEntries[i]!;
    const sysDecimal = i === 0
      ? (firstSpec.length === 1 || "oom" in firstSpec[1]!)
      : unitsSpec.every(u => "oom" in u);

    systems[sysName] = { symbols: [], decimal: sysDecimal };

    const processed = unitsSpec
      .map(u => ({ ...u, ...ensureScale(sysDecimal, u) }) as UnitBaseSpec & { scale: Rational })
      .sort((a, b) => b.scale.gt(a.scale) ? 1 : b.scale.lt(a.scale) ? -1 : 0);

    for (const unit of processed) {
      const magScale = omit(unit, "symbols");
      for (const symbolSpec of unit.symbols) {
        const unitData = { ...symbolSpec, ...magScale };
        const symbols = [symbolSpec.symbol, ...(symbolSpec.plural ? [symbolSpec.plural] : [])];
        for (const symbol of symbols) {
          systems[sysName]!.symbols.push(symbol);
          const existing = allUnits.find(([s]) => s === symbol);
          if (!existing)
            allUnits.push([symbol, unitData as Unit]);
          else if (!existing[1].scale.eq(unitData.scale))
            throw new Error(`Symbol "${symbol}" has conflicting scales across systems`);
        }
      }
    }
  }

  //sort to guarantee descending order by scale (relied upon by formatting functions)
  allUnits.sort((a, b) => b[1].scale.gt(a[1].scale) ? 1 : b[1].scale.lt(a[1].scale) ? -1 : 0);
  const units = fromEntries(allUnits);

  return { name, units, standard, systems, ...meta } as any;
}

export const powerOfTen = (() => {
  const limit = 30;
  const scales: Rational[] = Array.from({ length: 2 * limit + 1 });
  scales[limit] = Rational.from(1n, 1n);
  for (let [i, oom] = [1, 10n]; i <= limit; ++i, oom *= 10n) {
    scales[limit + i] = Rational.from(oom);
    scales[limit - i] = Rational.from(1n, oom);
  }

  return (oom: number) =>
    -limit <= oom && oom <= limit
    ? scales[limit + oom]!
    : oom < 0
      ? Rational.from(1n, 10n**BigInt(-oom))
      : Rational.from(10n**BigInt(oom));
})();

export function identifyKind<K extends Kind, A extends boolean = false>(
  kinds:           RoArray<K>,
  str:             string,
  allowAmbiguous?: A
): A extends true ? K[] : K | undefined {
  const { pairs } = segment(str);
  const symbols = pairs.map(p => str.substring(p.symbol[0], p.symbol[1]));

  const matches = kinds.filter(k => symbols.every(s => s in k.units));

  return (allowAmbiguous ? matches : matches.length === 1 ? matches[0] : undefined) as any;
}

// ---- Implementation details ----

type UnitBaseSpec = { readonly symbols: RoNeTuple<SymbolSpec> };

type UnitSpec<D extends boolean> = UnitBaseSpec & (D extends true ? DecimalSpec : ScaleSpec);

type StandardUnitSpec<D extends boolean> =
  UnitBaseSpec & (D extends true ? Partial<DecimalSpec<0>> : Partial<ScaleSpec<1 | 1n>>);

type KindUnitsSpec<F extends boolean, D extends boolean> =
  F extends true
  ? readonly [StandardUnitSpec<D>, ...UnitSpec<D>[]]
  : RoNeTuple<UnitSpec<D>>;

type KindUnits<U extends string> = { readonly [K in U]?: Unit };

type KindSystems<Y extends SystemInfo> = {
  readonly [Sys in Y as Sys["name"]]: Readonly<{
    symbols: RoArray<Sys["symbols"]>; //guaranteed to be in descending order by scale
    decimal: Sys["decimal"];
  }>;
};

type UnitSymbolsOf<U extends RoArray<UnitBaseSpec>> =
  U[number]["symbols"][number] extends infer S extends SymbolSpec
  ? S["symbol"] | (S["plural"] extends string ? S["plural"] : never)
  : never;

type SystemEntry<
  F extends boolean                   = boolean,
  N extends string                    = string,
  S extends KindUnitsSpec<F, boolean> = KindUnitsSpec<F, boolean>,
> = RoPair<N, S>;

type SystemsSpec = readonly [SystemEntry<true>, ...SystemEntry<false>[]];

type KindUnitsInput = KindUnitsSpec<true, boolean> | SystemsSpec;

type IsSystemDecimal<Spec extends KindUnitsSpec<boolean, boolean>> =
  Spec[0] extends DecimalSpec
  ? true
  : Spec[0] extends ScaleSpec
  ? false
  : Spec extends readonly [unknown] | readonly [unknown, DecimalSpec, ...unknown[]]
  ? true
  : false;

type SystemInfoOf<I extends KindUnitsInput> =
  I extends SystemsSpec
  ? { [K in keyof I & `${number}`]:
        I[K] extends SystemEntry<boolean, infer Name, infer Spec>
        ? SystemInfo<Name, UnitSymbolsOf<Spec>, IsSystemDecimal<Spec>>
        : never
    }[keyof I & `${number}`]
  : I extends KindUnitsSpec<true, boolean>
  ? SystemInfo<"default", UnitSymbolsOf<I>, IsSystemDecimal<I>>
  : never;

type UnitsSpecOf<I extends KindUnitsInput> =
  I extends SystemsSpec ? I[number][1] : I;

type StandardSystemOf<I extends KindUnitsInput> =
  I extends SystemsSpec ? I[0][0] : "default";

type StandardUnitOf<I extends KindUnitsInput> =
  I extends SystemsSpec
  ? I[0][1][0]["symbols"][0]["symbol"]
  : I extends KindUnitsSpec<boolean, boolean>
    ? I[0]["symbols"][0]["symbol"]
    : never;

type StandardInfoOf<I extends KindUnitsInput> =
  StandardInfo<StandardSystemOf<I>, StandardUnitOf<I>> extends infer S
    extends ValidStandardInfo<SystemInfoOf<I>> //tell tsc that this must hold
  ? S
  : never;

const addScale = (spec: DecimalSpec) =>
  ({ oom: spec.oom, scale: powerOfTen(spec.oom) });

const ensureScale = (decimal: boolean, spec: UnitBaseSpec) =>
  "oom" in spec
  ? addScale(spec as DecimalSpec)
  : "scale" in spec
  ? { scale: Rational.from((spec as ScaleSpec).scale) } as const
  : decimal
  ? { oom: 0, scale: Rational.from(1n) } as const
  : { scale: Rational.from(1n) } as const;
