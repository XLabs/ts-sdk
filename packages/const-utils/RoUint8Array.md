# RoUint8Array: A readonly Uint8Array type with fully strict typing

## The Problem

Creating a truly readonly `Uint8Array` type in TypeScript is annoyingly difficult. Various solutions have been proposed in the [associated TypeScript Github issue #37792](https://github.com/microsoft/TypeScript/issues/37792#issuecomment-1140888933), but all are incomplete.

The [first solution](https://github.com/microsoft/TypeScript/issues/37792#issuecomment-1140888933) proposed in the issue was:

```typescript
type MutableProperties = "copyWithin" | "fill" | "reverse" | "set" | "sort";
interface RoUint8Array extends Omit<Uint8Array, MutableProperties> {
  readonly [n: number]: number;
}
```

This removes mutating methods and makes index access readonly.

However, as [someone else a bit further down points out](https://github.com/microsoft/TypeScript/issues/37792#issuecomment-1264705598) this does not handle `subarray` and `valueOf` correctly, which both continue to return a mutable `Uint8Array` to the same underlying buffer or even the same object respectively.

And likewise, callback methods also leak a mutable reference in their predicates:

```typescript
every(predicate: (value: number, index: number, array: Uint8Array) => unknown): boolean;
//                                                     ^^^^^^^^^^
//                                                     WRONG! Should be RoUint8Array
```

### Why these issues occur

The root cause is how `Omit` interacts with TypeScript's polymorphic `this` type.

TypeScript's `lib.es5.d.ts` defines many Uint8Array methods using `this`:

```typescript
every(predicate: (value: number, index: number, array: this) => unknown): boolean;
valueOf(): this;
```

When you write `interface Foo extends Uint8Array`, the `this` in inherited methods correctly rebinds to `Foo`. However, `Omit` is a mapped type that extracts method signatures via indexed access (`Uint8Array["every"]`). At that moment, `this` is resolved/frozen to `Uint8Array`. The resulting mapped type has concrete `Uint8Array` where `this` used to be — and extending it doesn't rebind anything.

`subarray` has an additional wrinkle covered below.

## The Solution (in a nutshell)

We use a CRTP-inspired pattern (Curiously Recurring Template Pattern from C++):

1. Create a "marker" interface that extends Uint8Array with a brand property. When we access `Marker["every"]`, the `this` type becomes `Marker`, not `Uint8Array`.

2. Use a recursive type transformer `ReplaceMarker` that walks through all method signatures and replaces `Marker` with `RoUint8Array`.

3. The brand property lets us distinguish `Marker` from plain `Uint8Array`. This way, callback `array` parameters (typed as marker via `this`) get replaced, while explicit return types like `slice(): Uint8Array` don't.

4. Use CRTP: `RoUint8Array extends RoUint8ArrayBase<RoUint8Array>` passes the final type as a parameter, breaking the circular reference.

---

## Step 1: Marker interface

Extends `Uint8Array` so that inherited methods have `this` bound to `Marker` instead of `Uint8Array`.

By adding `roBrand`, `Uint8Array` no longer extends `Marker`, allowing us to distinguish them.

```typescript
declare const roBrand: unique symbol;
interface Marker<TArrayBuffer extends ArrayBufferLike>
    extends Uint8Array<TArrayBuffer> {
  [roBrand]: true;
}
```

---

## Step 2: The type transformer

Recursively walks through type `T` and replaces `Marker` with `Self`.

**Parameters:**
- `T` — The type to transform
- `Self` — The replacement type (will be `RoUint8Array`)
- `TArrayBuffer` — Preserved for generic consistency

### Full type definition

```typescript
type ReplaceMarker<T, Self, TArrayBuffer extends ArrayBufferLike> =
  T extends Marker<TArrayBuffer>
  ? Self
  : T extends Uint8Array | ArrayBuffer | IteratorObject<unknown>
  ? T
  : T extends (...args: infer A) => infer R
  ? (...args: ReplaceMarker<A, Self, TArrayBuffer>) => ReplaceMarker<R, Self, TArrayBuffer>
  : T extends readonly unknown[]
  ? { readonly [K in keyof T]: ReplaceMarker<T[K], Self, TArrayBuffer> }
  : T extends object
  ? { [K in keyof T]: ReplaceMarker<T[K], Self, TArrayBuffer> }
  : T;
```

### Line-by-line breakdown

#### Check 1: Is T the marker? Replace with Self.

This is the core transformation — when we find `Marker`, we replace it with `RoUint8Array`.

#### Check 2: Is T a Uint8Array, ArrayBuffer, or IteratorObject? Preserve unchanged.

- **Uint8Array**: Methods like `slice()`, `map()`, `filter()` return `Uint8Array<ArrayBuffer>`. We do NOT want to transform these — they return new, mutable copies. Without this check, they'd be recursed into via the `object` branch and get mangled into expanded mapped types.

- **ArrayBuffer**: The `buffer` property and related types should stay as-is.

- **IteratorObject**: Uint8Array has `[Symbol.iterator]()` and related iterator methods. These return complex `IteratorObject` types with their own deeply nested method signatures (map, filter, etc. on the iterator protocol). If we recurse into these via the `object` branch, the transformation mangles the iterator types, causing assignability errors like: `"Types of '[Symbol.iterator](...).map(...).filter' are incompatible"`. We don't need to transform iterators — they don't contain our marker.

#### Check 3: Is T a function? Recurse into parameters and return type.

This handles method signatures. For example: `(cb: (value, index, array: Marker) => R) => Uint8Array`. We recurse into the parameter tuple (A) and return type (R).

#### Check 4: Is T an array/tuple? Recurse into elements.

Function parameters are tuples, e.g., `[callbackfn: ..., thisArg?: any]`. We need to recurse into each element to find nested functions (callbacks). Using `readonly` to preserve tuple readonly-ness.

#### Check 5: Is T an object? Recurse into properties.

The result of `Omit<Marker, ...>` is an object type with method properties. We need to recurse into each property to transform the method signatures inside.

#### Default: Primitive types pass through.

---

## Step 3: Omitted properties

```typescript
type TypedArrayMutableProperties = "copyWithin" | "fill" | "reverse" | "set" | "sort";
type Uint8ArrayMutableProperties = "setFromBase64" | "setFromHex";
type Uint8ArrayOmittedProperties =
  | TypedArrayMutableProperties  // Mutating methods from TypedArray
  | Uint8ArrayMutableProperties  // Uint8Array-specific mutating methods
  | "subarray"                    // We re-add this with correct return type (Self)
  | typeof roBrand;              // Remove the internal brand from the final type
```

---

## Step 4: Assemble the base type

Apply the transformer to the Omit'd marker, then add:
- `readonly [n: number]: number` — Makes index access readonly
- `subarray(...): Self` — Returns `RoUint8Array` since it's a view, not a copy

**Why `subarray` needs manual handling:** Unlike methods like `valueOf()` which return `this`, the lib defines `subarray` with an explicit return type `Uint8Array<TArrayBuffer>` rather than `this`. This means our marker-replacement trick doesn't apply automatically. Since `subarray` returns a view into the same underlying buffer, mutations through it would affect the original, so it must return `RoUint8Array`.

```typescript
type RoUint8ArrayBase<Self, TArrayBuffer extends ArrayBufferLike> =
  ReplaceMarker<
    Omit<Marker<TArrayBuffer>, Uint8ArrayOmittedProperties>,
    Self,
    TArrayBuffer
  > & {
    readonly [n: number]: number;
    subarray(...params: Parameters<Uint8Array["subarray"]>): Self;
  };
```

---

## Step 5: The final exported type (CRTP pattern)

By passing `RoUint8Array<TArrayBuffer>` as the `Self` parameter, we close the loop: all occurrences of `Marker` in method signatures become `RoUint8Array`.

```typescript
export interface RoUint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike>
  extends RoUint8ArrayBase<RoUint8Array<TArrayBuffer>, TArrayBuffer> {}
```
