import type { KindWithAtomic, AmountFromArgs } from "@xlabs-xyz/amount";
import { Amount } from "@xlabs-xyz/amount";

export const toAmountIfKind = <const K extends KindWithAtomic | undefined = undefined>(
  amount: bigint,
  kind?:  K,
): K extends KindWithAtomic ? Amount<K & KindWithAtomic> : bigint =>
  ( kind
    ? Amount.from(amount, ...([kind, "atomic"] as AmountFromArgs<K & KindWithAtomic>))
    : amount
  ) as any;
