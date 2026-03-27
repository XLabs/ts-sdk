import type { Function, Guard, Nullish, Predicate, RoTuple, RoArray } from "./typing.js";

//composes functions via chaining:
//  for f: A -> B, g: B -> C, h: C -> D
//  pipe(f, g, h) gives A -> D
export type Pipe<FT extends RoTuple<Function>> =
  FT extends readonly [
    infer F extends Function,
    infer G extends Function,
    ...infer Tail extends RoTuple<Function>
  ]
  ? Pipe<[Function<Parameters<F>, ReturnType<G>>, ...Tail]>
  : FT[0];

export const pipe = <const FT extends RoTuple<Function>>(...fns: FT): Pipe<FT> =>
  ((x: unknown) => fns.reduce((acc, fn) => fn(acc), x)) as any;

// --- utils ---

export const identity = <const T>(val: T) => val;

export const tap =
  <const T>(fn: Function<[T], void>) =>
    (val: T): T => { fn(val); return val; };

export const tryOr =
  <const F>(fallback: F) =>
    <const T, U>(fn: Function<[T], U>): Function<[T], U | F> =>
      (val: T) => {
        try { return fn(val); }
        catch { return fallback; }
      };

export const map =
  <const T, U>(val: T | Nullish, fn: Function<[T], U>) =>
      (val != null ? fn(val) : val) as U | Nullish;

export const fallback =
  <const F>(val: F) =>
    <const T>(input: T | Nullish): T | F =>
      (input != null ? input : val) as T | F;

type Msg<T> = string | Function<[T], string>;

const evalMsg = (msg: Msg<unknown>, val: unknown): string =>
  typeof msg === "function" ? msg(val) : msg;

export function ensure<T, U extends T>(val: T, pred: Guard<T, U>, msg?: Msg<T>): U;
export function ensure<T>(val: T, pred: Predicate<T>, msg?: Msg<T>): T;
export function ensure(val: unknown, pred: Predicate<unknown>, msg?: Msg<unknown>) {
  if (!pred(val))
    throw new Error(evalMsg(msg ?? "Required condition not met", val));
  return val;
}

export function forbid<T, U extends T>(val: T, pred: Guard<T, U>, msg?: Msg<T>): Exclude<T, U>;
export function forbid<T>(val: T, pred: Predicate<T>, msg?: Msg<T>): T;
export function forbid(val: unknown, pred: Predicate<unknown>, msg?: Msg<unknown>) {
  if (pred(val))
    throw new Error(evalMsg(msg ?? "Forbidden condition violated", val));
  return val;
}

// --- predicates ---

export const and =
  <T>(...preds: RoArray<Predicate<T>>): Predicate<T> =>
    val => preds.every(p => p(val));

export const or =
  <T>(...preds: RoArray<Predicate<T>>): Predicate<T> =>
    val => preds.some(p => p(val));

export const not = (val: boolean) => !val;

export const isUndefined = (val: unknown): val is undefined => val === undefined;
export const isNullish   = (val: unknown): val is Nullish   => val == null;
export const isDefined   = <const T>(val: T | undefined): val is T => val !== undefined;
export const exists      = <const T>(val: T | Nullish  ): val is T => val != null;

export const succeeds = (fn: Function<[]>): boolean => {
  try {
    fn();
    return true;
  }
  catch {
    return false;
  }
}

export const throws = pipe(succeeds, not);

export const throwOnUndefined = <const T>(val: T | undefined, msg?: Msg<T | undefined>) =>
  ensure(val, isDefined, msg);
export const throwOnNullish = <const T>(val: T | Nullish, msg?: Msg<T | Nullish>) =>
  ensure(val, exists, msg);
