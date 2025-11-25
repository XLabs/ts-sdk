import type { IsBranded } from "./branding.js";

//Extend this type to create an object-like interface which is expected to be overridden,
//  e.g. via a type declaration. An empty interface is equivalent to `any`, and allows values
//  which are not object-like such as numbers or strings. A `Record<PropertyKey, never>` prohibits
//  declaration merging. `object` itself cannot be extended directly, so we define this type alias.
export type BaseObject = object;

export interface BrandedSubArray<T extends Uint8Array> extends Uint8Array {
  subarray(
    ...params: Parameters<Uint8Array["subarray"]>
  ): T extends IsBranded<infer _> ? T : Uint8Array;
}

export const definedOrThrow = <const T>(value: T | undefined, errorMessage: string): T => {
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
