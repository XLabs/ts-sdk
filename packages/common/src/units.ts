import { type Kind, Amount, Rational } from "@xlabs-xyz/amount";

export type DistributiveAmount<K extends Kind, E extends Kind = Kind> =
  K extends E ? Amount<K> : never;

export const unit = <const T, const U>(symbol: T, scale: U) => ({ symbol, scale } as const);
export const oom = (order: number) => order < 0
  ? Rational.from(1n, 10n**BigInt(-order))
  : 10n**BigInt(order);

export const Percentage = {
  name: "Percentage",
  human: "%",
  units: [
    unit("scalar", 1),
    unit("%", oom(-2)),
    unit("bp", oom(-4)),
  ],
} as const satisfies Kind;
export type Percentage = Amount<typeof Percentage>;
export const percentage = Amount.ofKind(Percentage);

export const applyPercentage =
  <K extends Kind>(amount: Amount<K>, percentage: Percentage): Amount<K> =>
    amount.mul(percentage.toUnit("scalar"));

export const Duration = {
  name: "Duration",
  units: [
    unit("sec", 1),
    unit("min", 60),
    unit("hr", 60*60),
    unit("day", 60*60*24),
    unit("msec", oom(-3)),
    unit("µsec", oom(-6)),
    unit("nsec", oom(-9)),
  ],
} as const satisfies Kind;
export type Duration = Amount<typeof Duration>;
export const duration = Amount.ofKind(Duration);

export const Byte = {
  name: "Byte",
  //In a general use case, there probably shouldn't be a human unit type because specifying
  //  e.g. HDD sizes in bytes is very much not human.
  //But given our context, we are almost exclusively dealing with amounts < 1 kB and so this choice
  //  ought to be reasonable.
  human: "byte",
  atomic: "byte",
  units: [
    unit("byte", 1n),
    unit("kB", oom(3)),
    unit("MB", oom(6)),
    unit("KiB", 1024n),
    unit("MiB", 1024n**2n),
  ],
} as const satisfies Kind;
export type Byte = Amount<typeof Byte>;
export const byte = Amount.ofKind(Byte);

//for now, we don't make a distinction between usd and usdc
const Usd = {
  name: "Usd",
  units: [unit("$", 1n), unit("¢", oom(-2))],
  human:  "$",
  atomic: "¢",
  stringify: function (val: Rational) {
    return val.ge(1)
      ? `$${val.eq(val.floor()) ? val.toString() : val.toFixed(2)}`
      : `${val.mul(100).toString()}¢`;
  },
} as const satisfies Kind;
export type Usd = Amount<typeof Usd>;
export const usd = Amount.ofKind(Usd);
