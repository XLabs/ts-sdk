export type NeTuple  <T = unknown> = [T, ...T[]];
export type Tuple    <T = unknown> = NeTuple<T> | [];
export type RoTuple  <T = unknown> = Readonly<Tuple<T>>;
export type RoNeTuple<T = unknown> = Readonly<NeTuple<T>>;
export type RoArray  <T = unknown> = readonly T[];
export type RoPair   <T = unknown, U = unknown> = readonly [T, U];

//see ../RoUint8Array.md for detailed explanation of this implementation
declare const roBrand: unique symbol;
interface Marker<TArrayBuffer extends ArrayBufferLike>
    extends Uint8Array<TArrayBuffer> {
  [roBrand]: true;
}

type ReplaceMarker<T, Self, TArrayBuffer extends ArrayBufferLike> =
  T extends Marker<TArrayBuffer>
  ? Self
  : T extends Uint8Array | ArrayBuffer | IteratorObject<unknown>
  ? T
  : T extends Function<infer A, infer R>
  ? Function<ReplaceMarker<A, Self, TArrayBuffer>, ReplaceMarker<R, Self, TArrayBuffer>>
  : T extends RoArray
  ? { readonly [K in keyof T]: ReplaceMarker<T[K], Self, TArrayBuffer> }
  : T extends object
  ? { [K in keyof T]: ReplaceMarker<T[K], Self, TArrayBuffer> }
  : T;

type TypedArrayMutableProperties = "copyWithin" | "fill" | "reverse" | "set" | "sort";
type Uint8ArrayMutableProperties = "setFromBase64" | "setFromHex";
type Uint8ArrayOmittedProperties =
  TypedArrayMutableProperties | Uint8ArrayMutableProperties | "subarray" | typeof roBrand;

type RoUint8ArrayBase<Self, TArrayBuffer extends ArrayBufferLike> =
  ReplaceMarker<Omit<Marker<TArrayBuffer>, Uint8ArrayOmittedProperties>, Self, TArrayBuffer> & {
    readonly [n: number]: number;
    subarray(...params: Parameters<Uint8Array["subarray"]>): Self;
  };

export interface RoUint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike>
  extends RoUint8ArrayBase<RoUint8Array<TArrayBuffer>, TArrayBuffer> {}

//Function is is a generic overload of the built-in type
//  It should work as a more powerful drop-in replacement.
//  Since the built-in type is not generic and permissive, we have to use RoArray<any> as the
//    default type of the parameters, otherwise `Test` would become false after our overload:
// type TestFunc = (...args: [string, number]) => boolean;
// type Test = TestFunc extends Function ? true : false; //true for built-in
export type Function<P extends RoArray<unknown> = RoArray<any>, R = unknown> =
  (...args: P) => R;

//Extend this type to create an object-like interface which is expected to be overridden,
//  e.g. via a type declaration. An empty interface is equivalent to `any`, and allows values
//  which are not object-like such as numbers or strings. A `Record<PropertyKey, never>` prohibits
//  declaration merging. `object` itself cannot be extended directly, so we define this type alias.
export type BaseObject = object;

export type If<C extends boolean, T, F> = C extends true ? T : F;

export type Opts<T> = { readonly [K in keyof T]?: T[K] | undefined };

export type Simplify<T> = { [K in keyof T]: T[K] } & unknown;

//utility type to reduce boilerplate of iteration code by replacing:
// `T extends readonly [infer Head extends T[number], ...infer Tail extends RoTuple<T[number]>]`
//with just:
// `T extends HeadTail<T, infer Head, infer Tail>`
//this also avoids the somewhat common mistake of accidentally dropping the readonly modifier
export type HeadTail<T extends RoTuple, Head extends T[number], Tail extends RoTuple<T[number]>> =
  readonly [Head, ...Tail];

export type Widen<T> =
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  T extends bigint ? bigint :
  T extends object ? object :
  T;

export type Extends<T, U> = T extends U ? true : false;

//see here: https://stackoverflow.com/a/55541672
export type IsAny<T> = Extends<0, 1 & T>;

//helper for when TypeScript can't infer that a type will be another type after instantiation.
//e.g.
//```
//const doSomethingWithLayout = <const L extends ProperLayout>(layout: L) => { ... };
//
//const layoutBuilder = <const I extends Item>(item: I) =>
//  [fixedItem, {name: "foo", ...item}] as const;
//
//doSomethingWithLayout(layoutBuilder({ binary: "uint", size: 8 })); //<< error!
//```
//The type returned by `layoutBuilder` will not be recognized as a ProperLayout, because it
//  struggles with `...item` (and there's no good way to help it along).
//
//This, however, will fix it:
//```
//const layoutBuilder = <const I extends Item>(item: I) =>
//  assertType<ProperLayout>()([fixedItem, {name: "foo", ...item}])
//```
//
//`const assertType = <T, const V>(val: V) ...` does not work since TypeScript does not
//  support partial instantiation of generic types, hence the ugly intermediary.
export const assertType =
  <T>() =>
    <const V>(val: V): V extends T ? V : never =>
      val as any;

export type Ro<T> =
  T extends RoUint8Array<infer TArrayBuffer>
  ? RoUint8Array<TArrayBuffer>
  : Readonly<T>;

export const ro = <const T>(value: T): Ro<T> => value as Ro<T>;

export type DeepRo<T> =
  IsAny<T> extends true //prevent DeepRo<any> from giving type instantiation too deep error
  ? any
  : T extends RoUint8Array<infer TArrayBuffer>
  ? RoUint8Array<TArrayBuffer>
  : T extends object
  ? { readonly [K in keyof T]: DeepRo<T[K]> }
  : T;

export const deepRo = <const T>(value: T): DeepRo<T> => value as DeepRo<T>;

export type Mutable<T> =
  T extends RoUint8Array<infer TArrayBuffer>
  ? Uint8Array<TArrayBuffer>
  : { -readonly [P in keyof T]: T[P] };

export const mutable = <const T>(value: T): Mutable<T> => value as Mutable<T>;

export type DeepMutable<T> =
  IsAny<T> extends true
  ? any
  : T extends RoUint8Array<infer TArrayBuffer>
  ? Uint8Array<TArrayBuffer>
  : T extends object
  ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T;

export const deepMutable = <const T>(value: T): DeepMutable<T> => value as DeepMutable<T>;
