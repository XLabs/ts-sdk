import type { ProperLayout, NamedItem, DeriveType } from "./layout.js";

export type DeriveTuple<L extends ProperLayout> =
  ProperLayout extends L
  ? unknown[]
  : L extends readonly [infer Head extends NamedItem, ...infer Tail extends ProperLayout]
  ? Head extends { readonly omit: true }
    ? DeriveTuple<Tail>
    : [DeriveType<Head>, ...DeriveTuple<Tail>]
  : [];

export function toTuple<const L extends ProperLayout>(
  layout: L,
  obj: DeriveType<L>,
): DeriveTuple<L> {
  const result = [];
  for (const item of layout)
    if (!("omit" in item && item.omit))
      result.push((obj as any)[(item as NamedItem).name]);

  return result as DeriveTuple<L>;
}

export function fromTuple<const L extends ProperLayout>(
  layout: L,
  values: DeriveTuple<L>,
): DeriveType<L> {
  const result: Record<string, unknown> = {};
  let vi = 0;
  for (const item of layout)
    if (!("omit" in item && item.omit))
      result[(item as NamedItem).name] = (values as unknown[])[vi++];

  return result as DeriveType<L>;
}
