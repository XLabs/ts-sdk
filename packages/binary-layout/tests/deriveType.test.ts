import type { RoArray, RoUint8Array } from "@xlabs-xyz/const-utils";

import type { DeriveType, LayoutObject } from "../src/index.js";

type Assert<T extends true> = T;
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;

// ============================================================================
// NumItem
// ============================================================================

// Plain uint → number
type _Num1 = Assert<Equals<DeriveType<{ binary: "uint"; size: 2 }>, number>>;

// Plain uint → bigint (size > 6)
type _Num2 = Assert<Equals<DeriveType<{ binary: "uint"; size: 8 }>, bigint>>;

// Plain int → number
type _Num3 = Assert<Equals<DeriveType<{ binary: "int"; size: 4 }>, number>>;

// Plain int → bigint
type _Num4 = Assert<Equals<DeriveType<{ binary: "int"; size: 16 }>, bigint>>;

// Uint with CustomConversion → ToType
type _Num5 = Assert<Equals<
  DeriveType<{
    binary: "uint";
    size: 2;
    custom: { to: (val: number) => string; from: (val: string) => number };
  }>,
  string
>>;

// Uint with FixedConversion → ToType
type _Num6 = Assert<Equals<
  DeriveType<{
    binary: "uint";
    size: 2;
    custom: { to: "hello"; from: 42 };
  }>,
  "hello"
>>;

// Bigint uint with CustomConversion → ToType
type _Num7 = Assert<Equals<
  DeriveType<{
    binary: "uint";
    size: 8;
    custom: { to: (val: bigint) => string; from: (val: string) => bigint };
  }>,
  string
>>;

// ============================================================================
// BytesItem — pure (no layout)
// ============================================================================

// Plain bytes → RoUint8Array
type _Bytes1 = Assert<Equals<
  DeriveType<{ binary: "bytes"; size: 4 }>,
  RoUint8Array
>>;

// Bytes with lengthSize → RoUint8Array
type _Bytes2 = Assert<Equals<
  DeriveType<{ binary: "bytes"; lengthSize: 2 }>,
  RoUint8Array
>>;

// Bytes with CustomConversion → ToType
type _Bytes3 = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    size: 32;
    custom: { to: (val: RoUint8Array) => string; from: (val: string) => RoUint8Array };
  }>,
  string
>>;

// Realistic conversion: `to` returns mutable Uint8Array, `from` accepts readonly RoUint8Array.
// Inference resolves ToType = Uint8Array via covariance (to's return), which satisfies
// from's contravariant param (RoUint8Array is wider than Uint8Array).
type _Bytes3a = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    size: 32;
    custom: {
      to: (val: RoUint8Array) => Uint8Array<ArrayBuffer>;
      from: (val: RoUint8Array) => RoUint8Array;
    };
  }>,
  Uint8Array<ArrayBuffer>
>>;

// Same pattern with readonly/mutable arrays: `to` returns mutable Array, `from` accepts RoArray.
type _Bytes3b = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    size: 64;
    custom: {
      to: (val: RoUint8Array) => number[];
      from: (val: RoArray<number>) => RoUint8Array;
    };
  }>,
  number[]
>>;

// Bytes with FixedConversion → ToType
type _Bytes4 = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    size: 20;
    custom: { to: "0xdead"; from: Uint8Array<ArrayBuffer> };
  }>,
  "0xdead"
>>;

// ============================================================================
// BytesItem — with layout
// ============================================================================

// Bytes with layout, no custom → derives inner layout
type _BytesLayout1 = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    layout: { binary: "uint"; size: 2 };
  }>,
  number
>>;

// Bytes with layout + CustomConversion on LayoutObject → ToType
type _BytesLayout2 = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    layout: [
      { name: "a"; binary: "uint"; size: 2 },
      { name: "b"; binary: "uint"; size: 8 },
    ];
    custom: {
      to: (val: LayoutObject) => string;
      from: (val: string) => LayoutObject;
    };
  }>,
  string
>>;

// Bytes with layout + CustomConversion on PrimitiveType (the bug case) → ToType
type _BytesLayout3 = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    layout: { binary: "uint"; size: 2 };
    custom: {
      to: (val: number) => string;
      from: (val: string) => number;
    };
  }>,
  string
>>;

// Bytes with layout + FixedConversion → ToType
type _BytesLayout4 = Assert<Equals<
  DeriveType<{
    binary: "bytes";
    layout: [
      { name: "x"; binary: "uint"; size: 1 },
    ];
    custom: {
      to: "fixed-value";
      from: { readonly x: number };
    };
  }>,
  "fixed-value"
>>;

// ============================================================================
// ArrayItem
// ============================================================================

// Fixed-length array → readonly tuple
type _Arr1 = Assert<Equals<
  DeriveType<{
    binary: "array";
    length: 3;
    layout: { binary: "uint"; size: 1 };
  }>,
  Readonly<[number, number, number]>
>>;

// Length-prefixed array → readonly array
type _Arr2 = Assert<Equals<
  DeriveType<{
    binary: "array";
    lengthSize: 2;
    layout: { binary: "uint"; size: 1 };
  }>,
  RoArray<number>
>>;

// Array of proper layout objects
type _Arr3 = Assert<Equals<
  DeriveType<{
    binary: "array";
    lengthSize: 1;
    layout: [
      { name: "id"; binary: "uint"; size: 2 },
      { name: "data"; binary: "bytes"; size: 4 },
    ];
  }>,
  RoArray<{ readonly id: number; readonly data: RoUint8Array }>
>>;

// ============================================================================
// ProperLayout (named items)
// ============================================================================

// Object with multiple named fields
type _Obj1 = Assert<Equals<
  DeriveType<[
    { name: "version"; binary: "uint"; size: 1 },
    { name: "payload"; binary: "bytes"; size: 32 },
    { name: "count"; binary: "uint"; size: 8 },
  ]>,
  { readonly version: number; readonly payload: RoUint8Array; readonly count: bigint }
>>;

// Omitted fields should not appear in derived type
type _Obj2 = Assert<Equals<
  DeriveType<[
    { name: "visible"; binary: "uint"; size: 1 },
    { name: "hidden"; binary: "uint"; size: 1; omit: true },
  ]>,
  { readonly visible: number }
>>;

// ============================================================================
// Nested layout
// ============================================================================

type _Nested = Assert<Equals<
  DeriveType<[
    { name: "header"; binary: "bytes"; layout: [
      { name: "version"; binary: "uint"; size: 1 },
      { name: "flags"; binary: "uint"; size: 1 },
    ]},
    { name: "body"; binary: "bytes"; size: 64 },
  ]>,
  {
    readonly header: { readonly version: number; readonly flags: number };
    readonly body: RoUint8Array;
  }
>>;
