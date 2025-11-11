import type { Brand, IsBranded } from "./branding.js";

export type TODO = any;

//Extend this type to create an object-like interface which is expected to be overridden,
//  e.g. via a type declaration. An empty interface is equivalent to `any`, and allows values
//  which are not object-like such as numbers or strings. A `Record<PropertyKey, never>` prohibits
//  declaration merging. `object` itself cannot be extended directly, so we define this type alias.
export type BaseObject = object;

export type Text = Brand<string, "Text">;
export type Url = Brand<string, "Url">;
export type Size = Brand<number, "Size">;

export interface BrandedSubArray<T extends Uint8Array> extends Uint8Array {
  subarray(
    ...params: Parameters<Uint8Array["subarray"]>
  ): T extends IsBranded<infer _> ? T : Uint8Array;
}

export const definedOrThrow = <const T>(value: T | undefined, errorMessage: Text) => {
  if (value === undefined)
    throw new Error(errorMessage);
  return value;
};

export function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

//works across realms
export function isUint8Array(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}
