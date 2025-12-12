import { Amount, kind, scalar } from "@xlabs-xyz/amount";

export const Percentage = scalar(kind(
  "Percentage",
  [ { symbols: [{ symbol: "scalar" },
                { symbol: "x" } ]          },
    { symbols: [{ symbol: "%" } ], oom: -2 },
    { symbols: [{ symbol: "bp" }], oom: -4 },
  ],
  { human: "%" },
));
export type Percentage = Amount<typeof Percentage>;
export const percentage = Amount.ofKind(Percentage);

export const Duration = kind(
  "Duration",
  [ { symbols: [{ symbol: "sec",  plural: "secs"  }], scale:               1 },
    { symbols: [{ symbol: "min",  plural: "mins"  }], scale:              60 },
    { symbols: [{ symbol: "hr",   plural: "hrs"   }], scale:           60*60 },
    { symbols: [{ symbol: "day",  plural: "days"  }], scale:        24*60*60 },
    { symbols: [{ symbol: "week", plural: "weeks" }], scale:      7*24*60*60 },
    { symbols: [{ symbol: "year", plural: "years" }], scale: 365.25*24*60*60 }, //Julian year
    { symbols: [{ symbol: "msec", plural: "msecs" }], scale:          10**-3 },
    { symbols: [{ symbol: "µsec", plural: "µsecs" }], scale:          10**-6 },
    { symbols: [{ symbol: "nsec", plural: "nsecs" }], scale:          10**-9 },
  ],
);
export type Duration = Amount<typeof Duration>;
export const duration = Amount.ofKind(Duration);

const symbolByte = { symbol: "byte", plural: "bytes" } as const;
export const Byte = kind(
  "Byte",
  [
    ["SI", [
      { symbols: [  symbolByte    ]          },
      { symbols: [{ symbol: "kB" }], oom:  3 },
      { symbols: [{ symbol: "MB" }], oom:  6 },
      { symbols: [{ symbol: "GB" }], oom:  9 },
      { symbols: [{ symbol: "TB" }], oom: 12 },
    ]],
    ["binary", [
      { symbols: [  symbolByte     ], scale: 1024n**0n },
      { symbols: [{ symbol: "KiB" }], scale: 1024n**1n },
      { symbols: [{ symbol: "MiB" }], scale: 1024n**2n },
      { symbols: [{ symbol: "GiB" }], scale: 1024n**3n },
      { symbols: [{ symbol: "TiB" }], scale: 1024n**4n },
    ]],
  ],
  { human: "byte", atomic: "byte" },
);
export type Byte = Amount<typeof Byte>;
export const byte = Amount.ofKind(Byte);

export const Usd = kind(
  "Usd",
  [ { symbols: [
      { symbol: "$", spacing: "compact", position: "prefix" },
      { symbol: "USD" },
    ]},
    { symbols: [
      { symbol: "¢", spacing: "compact" },
      { symbol: "c", spacing: "compact" },
      { symbol: "cent", plural: "cents" },
    ], oom: -2 },
  ],
  { human: "$", atomic: "¢" },
);
export type Usd = Amount<typeof Usd>;
export const usd = Amount.ofKind(Usd);
