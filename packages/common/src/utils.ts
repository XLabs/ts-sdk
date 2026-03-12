import type { KindWithAtomic, AmountFromArgs } from "@xlabs-xyz/amount";
import { Amount } from "@xlabs-xyz/amount";

export type AmountOrAtomic<K extends KindWithAtomic | undefined> =
  K extends KindWithAtomic ? Amount<K & KindWithAtomic> : bigint;

export const fromAtomicIfKind = <const K extends KindWithAtomic | undefined = undefined>(
  amount: bigint,
  kind?:  K,
): AmountOrAtomic<K> =>
  ( kind
    ? Amount.from(amount, ...([kind, "atomic"] as AmountFromArgs<K & KindWithAtomic>))
    : amount
  ) as any;

export const toAtomicIfAmount =
  <const K extends KindWithAtomic | undefined = undefined>(aoa: AmountOrAtomic<K>): bigint =>
    typeof aoa === "bigint" ? aoa : aoa.in("atomic");