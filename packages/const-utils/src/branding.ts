import type { RoUint8Array } from "./typing.js";

declare const __brand: unique symbol;
type Branded<Base, Tags extends string> = {
  [__brand]: { base: Base; tags: { [K in Tags]: never } }
};

type ExtractBase<T> =
  T extends { [__brand]: { base: infer B } } ? B : T;

type ExtractTags<T> =
  T extends { [__brand]: { tags: infer Tags } } ? keyof Tags & string : never;

export type Unbrand<T> = ExtractBase<T>;

export type Brand<T, B extends string> =
  ExtractBase<T> & Branded<ExtractBase<T>, ExtractTags<T> | B>;

export type IsBranded<T> = [ExtractTags<T>] extends [never] ? false : true;

export type PreserveBrand<T, R> =
  [ExtractTags<T>] extends [never]
  ? R
  : Unbrand<T> extends R
    ? Brand<R, ExtractTags<T>>
    : never;

export type SameBrand<T, U> =
  ExtractTags<T> extends ExtractTags<U>
  ? ExtractTags<U> extends ExtractTags<T>
    ? true
    : false
  : false;

export type BrandedSubArray<T extends RoUint8Array> = Omit<T, "subarray"> & {
  subarray(...params: Parameters<Uint8Array["subarray"]>): T;
}

//check for brands first to avoid interpreting branded strings as normal tags
type ResolveTags<B> =
  [ExtractTags<B>] extends [never]
  ? B extends string ? B : never
  : ExtractTags<B>;

type AnyBranded = { [__brand]: unknown };

//inherits all tags from the specified branded types and applies the specified tag
//
//sadly <B extends string | AnyBranded, const T = unknown>(base: T) and then calling via
//  brand<"someTag">(makeComplexType()) doesn't work because tsc doesn't handle partial
//  application of generic parameters. I.e. seeing "someTag" it will take the default i.e.
//  unknown for T instead of deducing it from the argument, so the split into two functions
//  and the slightly ugly syntax that goes with it is unavoidable.
export const brand =
  <B extends string | AnyBranded>() =>
    <const T>(base: T): Brand<T, ResolveTags<B> & string> =>
      base as Brand<T, ResolveTags<B> & string>;
