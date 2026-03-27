import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  pipe, identity, tap, tryOr, map, fallback,
  ensure, forbid,
  and, or, not,
  isUndefined, isNullish, isDefined, exists,
  succeeds, throws,
  throwOnUndefined, throwOnNullish,
} from "../src/piping.js";
import type { Nullish } from "../src/typing.js";

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

type Assert<T extends true> = T;
type Eq<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

// ---------------------------------------------------------------------------
// pipe
// ---------------------------------------------------------------------------

describe("pipe", () => {
  it("should compose functions left-to-right", () => {
    const inc = (n: number) => n + 1;
    const double = (n: number) => n * 2;
    const toString = (n: number) => String(n);

    const fn = pipe(inc, double, toString);
    assert.equal(fn(3), "8"); // (3+1)*2 = 8

    // type-level: input is number, output is string
    type _PipeReturnType = Assert<Eq<ReturnType<typeof fn>, string>>;
    type _PipeParamType = Assert<Eq<Parameters<typeof fn>, [number]>>;
  });

  it("should work with a single function", () => {
    const inc = (n: number) => n + 1;
    const fn = pipe(inc);
    assert.equal(fn(5), 6);
  });
});

// ---------------------------------------------------------------------------
// identity
// ---------------------------------------------------------------------------

describe("identity", () => {
  it("should return its input unchanged", () => {
    assert.equal(identity(42), 42);
    assert.equal(identity("hello"), "hello");

    const obj = { a: 1 };
    assert.equal(identity(obj), obj);
  });
});

// ---------------------------------------------------------------------------
// tap
// ---------------------------------------------------------------------------

describe("tap", () => {
  it("should execute side effect and return original value", () => {
    const log: number[] = [];
    const result = tap((n: number) => { log.push(n); })(42);
    assert.equal(result, 42);
    assert.deepEqual(log, [42]);
  });

  it("should work in a pipe", () => {
    const log: number[] = [];
    const fn = pipe(
      (n: number) => n + 1,
      tap((n: number) => { log.push(n); }),
      (n: number) => n * 2,
    );
    assert.equal(fn(3), 8);
    assert.deepEqual(log, [4]);
  });
});

// ---------------------------------------------------------------------------
// tryOr
// ---------------------------------------------------------------------------

describe("tryOr", () => {
  it("should return the function result on success", () => {
    const safeParse = tryOr(null)((s: string) => JSON.parse(s));
    assert.deepEqual(safeParse('{"a":1}'), { a: 1 });
  });

  it("should return the fallback on error", () => {
    const safeParse = tryOr(null)((s: string) => JSON.parse(s));
    assert.equal(safeParse("not json"), null);
  });

  it("should infer union return type", () => {
    const safeParse = tryOr("oops" as const)((s: string) => JSON.parse(s) as number);
    type _R = Assert<Eq<ReturnType<typeof safeParse>, number | "oops">>;
  });
});

// ---------------------------------------------------------------------------
// map
// ---------------------------------------------------------------------------

describe("map", () => {
  it("should apply fn when value is non-nullish", () => {
    assert.equal(map(5, (n: number) => n * 2), 10);
    assert.equal(map("hi", (s: string) => s.length), 2);
  });

  it("should pass through null/undefined", () => {
    assert.equal(map(null, () => 42), null);
    assert.equal(map(undefined, () => 42), undefined);
  });

  it("should work inline in a pipe", () => {
    const fn = pipe(
      (n: number) => n > 0 ? n : null,
      (v: number | null) => map(v, (n: number) => n * 2),
    );
    assert.equal(fn(3), 6);
    assert.equal(fn(-1), null);
  });
});

// ---------------------------------------------------------------------------
// fallback
// ---------------------------------------------------------------------------

describe("fallback", () => {
  it("should return input when non-nullish", () => {
    assert.equal(fallback(0)(42), 42);
    assert.equal(fallback("default")("hello"), "hello");
  });

  it("should return fallback when nullish", () => {
    assert.equal(fallback(0)(null), 0);
    assert.equal(fallback(0)(undefined), 0);
  });

  it("should work in a pipe", () => {
    const fn = pipe(
      (n: number) => n > 0 ? n : null as number | null,
      fallback(0),
    );
    assert.equal(fn(5), 5);
    assert.equal(fn(-1), 0);
  });
});

// ---------------------------------------------------------------------------
// ensure
// ---------------------------------------------------------------------------

describe("ensure", () => {
  it("should return value when predicate passes", () => {
    assert.equal(ensure(5, (n: number) => n > 0), 5);
  });

  it("should throw when predicate fails", () => {
    assert.throws(() => ensure(0, (n: number) => n > 0));
  });

  it("should throw with custom message", () => {
    assert.throws(
      () => ensure(0, (n: number) => n > 0, "must be positive"),
      { message: "must be positive" },
    );
  });

  it("should throw with message function", () => {
    assert.throws(
      () => ensure(0, (n: number) => n > 0, (n) => `got ${n}`),
      { message: "got 0" },
    );
  });

  it("should narrow type with a type guard", () => {
    const val = "hello" as string | undefined;
    const result = ensure(val, isDefined);
    type _Narrowed = Assert<Eq<typeof result, string>>;
    assert.equal(result, "hello");
  });

  it("should narrow with exists guard", () => {
    const val = "hello" as string | Nullish;
    const result = ensure(val, exists);
    type _Narrowed = Assert<Eq<typeof result, string>>;
    assert.equal(result, "hello");
    assert.throws(() => ensure(null as string | null, exists));
    assert.throws(() => ensure(undefined as string | undefined, exists));
  });

  it("should narrow in a pipe via inline lambda", () => {
    const fn = pipe(
      (input: { val?: number }) => input.val,
      v => ensure(v, isDefined, "missing val"),
      (n: number) => n * 2,
    );
    assert.equal(fn({ val: 5 }), 10);
    assert.throws(() => fn({}));
  });
});

// ---------------------------------------------------------------------------
// forbid
// ---------------------------------------------------------------------------

describe("forbid", () => {
  it("should return value when predicate is false", () => {
    assert.equal(forbid(5, (n: number) => n === 0), 5);
  });

  it("should throw when predicate is true", () => {
    assert.throws(() => forbid(0, (n: number) => n === 0));
  });

  it("should narrow type with inline guard", () => {
    const val = "hello" as string | Nullish;
    // isNullish takes `unknown`, which widens T to `unknown` in forbid's overload resolution,
    // so forbid + isNullish doesn't narrow. Use an inline guard or ensure + exists instead.
    const result = forbid(val, (v): v is Nullish => v == null);
    type _Narrowed = Assert<Eq<typeof result, string>>;
    assert.equal(result, "hello");
  });

  it("should narrow in a pipe via inline lambda", () => {
    const lookup: Record<string, number> = { a: 1 };
    const fn = pipe(
      (key: string) => lookup[key] as number | undefined,
      v => ensure(v, isDefined, "not found"),
      (n: number) => n + 10,
    );
    assert.equal(fn("a"), 11);
    assert.throws(() => fn("z"), { message: "not found" });
  });
});

// ---------------------------------------------------------------------------
// predicates
// ---------------------------------------------------------------------------

describe("predicates", () => {
  it("isUndefined", () => {
    assert(isUndefined(undefined));
    assert(!isUndefined(null));
    assert(!isUndefined(0));
    assert(!isUndefined(""));
  });

  it("isNullish", () => {
    assert(isNullish(null));
    assert(isNullish(undefined));
    assert(!isNullish(0));
    assert(!isNullish(""));
    assert(!isNullish(false));
  });

  it("isDefined", () => {
    assert(isDefined(0));
    assert(isDefined(""));
    assert(isDefined(null));
    assert(!isDefined(undefined));
  });

  it("exists", () => {
    assert(exists(0));
    assert(exists(""));
    assert(exists(false));
    assert(!exists(null));
    assert(!exists(undefined));
  });

  it("and", () => {
    const positive = (n: number) => n > 0;
    const even = (n: number) => n % 2 === 0;
    const positiveEven = and(positive, even);
    assert(positiveEven(4));
    assert(!positiveEven(3));
    assert(!positiveEven(-2));
  });

  it("or", () => {
    const zero = (n: number) => n === 0;
    const one = (n: number) => n === 1;
    const binary = or(zero, one);
    assert(binary(0));
    assert(binary(1));
    assert(!binary(2));
  });

  it("not", () => {
    assert.equal(not(true), false);
    assert.equal(not(false), true);
  });
});

// ---------------------------------------------------------------------------
// succeeds / throws
// ---------------------------------------------------------------------------

describe("succeeds / throws", () => {
  it("succeeds returns true when fn does not throw", () => {
    assert(succeeds(() => 42));
  });

  it("succeeds returns false when fn throws", () => {
    assert(!succeeds(() => { throw new Error(); }));
  });

  it("throws returns true when fn throws", () => {
    assert(throws(() => { throw new Error(); }));
  });

  it("throws returns false when fn does not throw", () => {
    assert(!throws(() => 42));
  });
});

// ---------------------------------------------------------------------------
// throwOnUndefined / throwOnNullish
// ---------------------------------------------------------------------------

describe("throwOnUndefined", () => {
  it("should return value when defined", () => {
    assert.equal(throwOnUndefined("hello"), "hello");
    assert.equal(throwOnUndefined(0), 0);
    assert.equal(throwOnUndefined(null), null);
  });

  it("should throw on undefined", () => {
    assert.throws(() => throwOnUndefined(undefined));
  });

  it("should throw with custom message", () => {
    assert.throws(
      () => throwOnUndefined(undefined, "missing"),
      { message: "missing" },
    );
  });
});

describe("throwOnNullish", () => {
  it("should return value when non-nullish", () => {
    assert.equal(throwOnNullish("hello"), "hello");
    assert.equal(throwOnNullish(0), 0);
    assert.equal(throwOnNullish(false), false);
  });

  it("should throw on null and undefined", () => {
    assert.throws(() => throwOnNullish(null));
    assert.throws(() => throwOnNullish(undefined));
  });

  it("should throw with custom message", () => {
    assert.throws(
      () => throwOnNullish(null, "gone"),
      { message: "gone" },
    );
  });
});

// ---------------------------------------------------------------------------
// Type-level: pipe composition types
// ---------------------------------------------------------------------------

// Verify Pipe infers correct composed types
{
  const fn = pipe(
    (s: string) => s.length,
    (n: number) => n > 3,
    (b: boolean) => b ? "yes" : "no" as const,
  );
  type _Params = Assert<Eq<Parameters<typeof fn>, [string]>>;
  type _Return = Assert<Eq<ReturnType<typeof fn>, "yes" | "no">>;
}

// Verify ensure narrows with guard
{
  const val = "test" as string | undefined;
  const narrowed = ensure(val, isDefined);
  type _EnsureNarrowed = Assert<Eq<typeof narrowed, string>>;
}

// Verify forbid narrows with inline guard (isNullish widens T to unknown)
{
  const val = "test" as string | Nullish;
  const narrowed = forbid(val, (v): v is Nullish => v == null);
  type _ForbidNarrowed = Assert<Eq<typeof narrowed, string>>;
}

// Verify ensure + exists as the idiomatic alternative to forbid + isNullish
{
  const val = "test" as string | Nullish;
  const narrowed = ensure(val, exists);
  type _EnsureExistsNarrowed = Assert<Eq<typeof narrowed, string>>;
}

// Verify exists narrows
{
  const val = 42 as number | Nullish;
  if (exists(val)) {
    type _ExistsNarrowed = Assert<Eq<typeof val, number>>;
  }
}
