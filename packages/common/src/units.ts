import { RoArray, RoPair, Opaque } from "@xlabs-xyz/const-utils";
import { otherCap, column, zip, pickWithOrder } from "@xlabs-xyz/const-utils";
import type {
  Rationalish,
  DecimalKind,
  SystemInfo,
  ValidStandardInfo,
} from "@xlabs-xyz/amount";
import { Amount, Rational, kind, scalar } from "@xlabs-xyz/amount";

export const currencyFormats = ["default", "uniform", "fancy"] as const;
export type CurrencyFormat = (typeof currencyFormats)[number];

export type CurrencyKind<
  U extends string = string,
  N extends string = string,
  Y extends SystemInfo<CurrencyFormat, U, true> = SystemInfo<CurrencyFormat, U, true>,
  S extends ValidStandardInfo<Y> = ValidStandardInfo<Y>,
  H extends U = U,
  A extends U = U,
> = DecimalKind<U, N, Y, S, H, A>;

export const withPluralS = <S extends string>(symbol: S) =>
  ({ symbol, plural: (symbol + "s") as `${S}s` } as const);

export const allowPluralS = <S extends string>(symbol: S) =>
  [{ symbol }, { symbol: (symbol + "s") as `${S}s` }] as const;

export const allowOtherCap = <S extends string>(symbol: S) =>
  [{ symbol }, { symbol: otherCap(symbol) }] as const;

export const withPluralSBothCaps = <S extends string>(symbol: S) =>
  [withPluralS(symbol), withPluralS(otherCap(symbol))] as const;

export const allowPluralSBothCaps = <S extends string>(symbol: S) =>
  [...allowPluralS(symbol), ...allowPluralS(otherCap(symbol))] as const;

type ToUnits<K extends "scale" | "oom", T extends RoArray<RoPair<Rationalish, RoArray>>> =
  { [I in keyof T]: T[I] extends RoPair<infer V, infer Symbols>
      ? K extends "scale"
        ? { scale: V, symbols: Symbols }
        : { oom:   V, symbols: Symbols }
      : never
  };

export const toCompoundUnits =
  <const T extends RoArray<RoPair<Rationalish, RoArray>>>(spec: T): ToUnits<"scale", T> =>
    spec.map(([scale, symbols]) => ({ scale, symbols })) as any;

export const toDecimalUnits =
  <const T extends RoArray<RoPair<Rationalish, RoArray>>>(spec: T): ToUnits<"oom", T> =>
    spec.map(([oom, symbols]) => ({ oom, symbols })) as any;

const _PercentageKind = scalar(kind(
  "Percentage",
  toDecimalUnits([
    [  0, [{ symbol: "x", spacing: "compact" }, { symbol: "scalar" }] ],
    [ -2, [{ symbol: "%" }                                          ] ],
    [ -4, [withPluralS("bp")                                        ] ],
  ]),
  { human: "%" },
));
export interface PercentageKind extends Opaque<typeof _PercentageKind> {}
export const Percentage = _PercentageKind as PercentageKind;
export type  Percentage = Amount<typeof Percentage>;
export const percentage = Amount.ofKind(Percentage);

const durationSpec = [
  //         scale              long                        short
  [              1, [withPluralS("second")     ], [{ symbol: "s"  }, { symbol: "sec"  }]],
  [           1e-3, [withPluralS("millisecond")], [{ symbol: "ms" }, { symbol: "msec" }]],
  [           1e-6, [withPluralS("microsecond")], [{ symbol: "µs" }, { symbol: "µsec" }]],
  [           1e-9, [withPluralS("nanosecond") ], [{ symbol: "ns" }, { symbol: "nsec" }]],
  [             60, [withPluralS("minute")     ], [{ symbol: "m"  }, { symbol: "min"  }]],
  [          60*60, [withPluralS("hour")       ], [{ symbol: "h"  }, { symbol: "hr"   }]],
  [       24*60*60, [withPluralS("day")        ], [{ symbol: "d"  }, { symbol: "day"  }]],
  [     7*24*60*60, [withPluralS("week")       ], [{ symbol: "w"  }, { symbol: "wk"   }]],
  [365.25*24*60*60, [withPluralS("julianYear") ], [{ symbol: "y"  }, { symbol: "yr"   },
                                                   { symbol: "year" }                  ]],
] as const;

const _Duration = kind(
  "Duration",
  [ [ "long",  toCompoundUnits(zip([column(durationSpec, 0), column(durationSpec, 1)])) ],
    [ "short", toCompoundUnits(zip([column(durationSpec, 0), column(durationSpec, 2)])) ],
  ],
);
export interface DurationKind extends Opaque<typeof _Duration> {}
export const Duration = _Duration as DurationKind;
export type  Duration = Amount<typeof Duration>;
export const duration = Amount.ofKind(Duration);

const symbolByte = { symbol: "byte", plural: "bytes" } as const;
const bitScale = Rational.from(1n, 8n);
const _Byte = kind(
  "Byte",
  [ [ "SI", toDecimalUnits([
      [  0, [  symbolByte    ] ],
      [  3, [{ symbol: "kB" }] ],
      [  6, [{ symbol: "MB" }] ],
      [  9, [{ symbol: "GB" }] ],
      [ 12, [{ symbol: "TB" }] ],
    ])],
    [ "binary", toCompoundUnits([
      [ bitScale,  [{ symbol: "bit" }] ],
      [ 1024n**0n, [  symbolByte     ] ],
      [ 1024n**1n, [{ symbol: "KiB" }] ],
      [ 1024n**2n, [{ symbol: "MiB" }] ],
      [ 1024n**3n, [{ symbol: "GiB" }] ],
      [ 1024n**4n, [{ symbol: "TiB" }] ],
    ])],
  ],
  { human: "byte", atomic: "byte" },
);
export interface ByteKind extends Opaque<typeof _Byte> {}
export const Byte = _Byte as ByteKind;
export type  Byte = Amount<typeof Byte>;
export const byte = Amount.ofKind(Byte);

const usdSymbolic = toDecimalUnits([
  [  0, [{ symbol: "$", spacing: "compact", position: "prefix" }] ],
  [ -2, [{ symbol: "¢", spacing: "compact"                     }] ],
]);

const _UsdKind = kind(
  "Usd",
  [ [ "default", usdSymbolic ],
    [ "uniform", toDecimalUnits([
      [  0, [{ symbol: "USD" }]                                        ],
      [ -2, [withPluralS("cent"), { symbol: "c", spacing: "compact" }] ],
    ])],
    [ "fancy", usdSymbolic ],
  ],
  { human: "$", atomic: "¢" },
);
export interface UsdKind extends Opaque<typeof _UsdKind> {}
export const Usd = _UsdKind as UsdKind;
export type  Usd = Amount<typeof Usd>;
export const usd = Amount.ofKind(Usd);

const usdtUniform = toDecimalUnits([
  [  0, [{ symbol: "USDT" }]                       ],
  [ -6, [{ symbol: "µUSDT" }, { symbol: "microUSDT" }] ],
]);

const _UsdtKind = kind(
  "Usdt",
  [ [ "default", usdtUniform ],
    [ "uniform", usdtUniform ],
    [ "fancy", toDecimalUnits([
      [  0, [{ symbol: "USD₮"  }] ],
      [ -6, [{ symbol: "µUSD₮" }] ],
    ])],
  ],
  { human: "USDT", atomic: "µUSDT" },
);
export interface UsdtKind extends Opaque<typeof _UsdtKind> {}
export const Usdt = _UsdtKind as UsdtKind;
export type  Usdt = Amount<typeof Usdt>;
export const usdt = Amount.ofKind(Usdt);

const usdcUniform = toDecimalUnits([
  [  0, [{ symbol: "USDC" }]                           ],
  [ -6, [{ symbol: "µUSDC" }, { symbol: "microUSDC" }] ],
]);

const _UsdcKind = kind(
  "Usdc",
  [ [ "default", usdcUniform ],
    [ "uniform", usdcUniform ],
    [ "fancy",   usdcUniform ],
  ],
  { human: "USDC", atomic: "µUSDC" },
);
export interface UsdcKind extends Opaque<typeof _UsdcKind> {}
export const Usdc = _UsdcKind as UsdcKind;
export type  Usdc = Amount<typeof Usdc>;
export const usdc = Amount.ofKind(Usdc);

const btcUniform = toDecimalUnits([
  [  0, [{ symbol: "BTC" }]                  ],
  [ -8, [...allowPluralSBothCaps("satoshi")] ],
]);

const _BtcKind = kind(
  "Btc",
  [ [ "default", btcUniform ],
    [ "uniform", btcUniform ],
    [ "fancy", toDecimalUnits([
      [  0, [{ symbol: "₿" }]                ],
      [ -8, [...allowPluralSBothCaps("sat")] ],
    ])],
  ],
  { human: "BTC", atomic: "satoshi" },
);
export interface BtcKind extends Opaque<typeof _BtcKind> {}
export const Btc = _BtcKind as BtcKind;
export type  Btc = Amount<typeof Btc>;
export const btc = Amount.ofKind(Btc);

const ethUniform = toDecimalUnits([
  [   0, [{ symbol: "ETH" }]   ],
  [  -9, allowOtherCap("Gwei") ],
  [ -18, allowOtherCap("wei")  ],
]);

const _EthKind = kind(
  "Eth",
  [ [ "default", ethUniform ],
    [ "uniform", ethUniform ],
    [ "fancy", [
      { oom: 0, symbols: [{ symbol: "Ξ" }] },
      ...pickWithOrder(ethUniform, [1, 2]),
    ]],
  ],
  { human: "ETH", atomic: "wei" },
);
export interface EthKind extends Opaque<typeof _EthKind> {}
export const Eth = _EthKind as EthKind;
export type  Eth = Amount<typeof Eth>;
export const eth = Amount.ofKind(Eth);

const solUniform = toDecimalUnits([
  [   0, [{ symbol: "SOL" }]                                            ],
  [  -9, [...allowPluralSBothCaps("lamport")]                           ],
  [ -15, [...allowPluralS("µLamport"), ...allowPluralS("microLamport")] ],
]);

const _SolKind = kind(
  "Sol",
  [ [ "default", solUniform ],
    [ "uniform", solUniform ],
    [ "fancy",   solUniform ],
  ],
  { human: "SOL", atomic: "lamport" },
);
export interface SolKind extends Opaque<typeof _SolKind> {}
export const Sol = _SolKind as SolKind;
export type  Sol = Amount<typeof Sol>;
export const sol = Amount.ofKind(Sol);
