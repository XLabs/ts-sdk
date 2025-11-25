import type { Spread as ObjSpread, PlainObject } from "@xlabs-xyz/const-utils";
import { spread as objSpread, nest as objNest } from "@xlabs-xyz/const-utils";
import type {
  Layout,
  Item,
  NamedItem,
  ProperLayout,
  DeriveType,
} from "./layout.js";

export const transform = <const L extends Layout, T>(
  layout: L,
  to: (derived: DeriveType<L>) => T,
  from: (transformed: T) => DeriveType<L>,
) => ({ binary: "bytes", layout, custom: { to, from } } as const);

// ----

type NestedObjectNames<L extends ProperLayout, N extends string = never> =
  L extends readonly [infer I extends NamedItem, ...infer Tail extends ProperLayout]
  ? Omit<I, "name"> extends infer II extends Item
    ? DeriveType<II> extends PlainObject
      ? NestedObjectNames<Tail, N | I["name"]>
      : NestedObjectNames<Tail, N>
    : NestedObjectNames<Tail, N>
  : N;

type LayoutSpread<L extends ProperLayout, N extends NestedObjectNames<L>> =
  DeriveType<L> extends infer O extends PlainObject
  ? N extends keyof O
    ? ReturnType<typeof transform<L, ObjSpread<O, N>>>
    : never
  : never;

export const spread = <
  const L extends ProperLayout,
  N extends NestedObjectNames<L>,
>(layout: L, name: N): LayoutSpread<L, N> =>
  transform(
    layout,
    derived => objSpread(derived as any, name),
    transformed => objNest(
      transformed,
      name,
      ((layout as any).find((i: any) => i.name === name)!).layout.map((i: any) => i.name)
    ) as any
  ) as any;

// ----

type SingletonName<L extends ProperLayout, N extends string[] = []> =
  L extends readonly [infer Head extends NamedItem, ...infer Tail extends ProperLayout]
  ? Head extends { omit: true }
    ? SingletonName<Tail, N>
    : SingletonName<Tail, [...N, Head["name"]]>
  : N;

type LayoutUnwrapSingleton<L extends ProperLayout> =
  SingletonName<L> extends [infer N extends string]
  ? DeriveType<L> extends infer O extends PlainObject
    ? N extends keyof O
      ? ReturnType<typeof transform<L, O[N]>>
      : never
    : never
  : never;

export const unwrapSingleton = <const L extends ProperLayout>(
  layout: L,
): LayoutUnwrapSingleton<L> => {
  const { name } = (layout as any).find((item: any) => !item.omit);
  return transform(
    layout,
    derived => (derived as any)[name],
    unwrapped => ({ [name]: unwrapped }) as any,
  ) as any;
};
