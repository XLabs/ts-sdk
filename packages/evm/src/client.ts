import type { Address, AccessList } from "viem";
import type { RoUint8Array, RoArray, RoTuple, Function } from "@xlabs-xyz/const-utils";
import type { Layout, ProperLayout, DeriveType } from "@xlabs-xyz/binary-layout";
import type { QueryLayoutTriple } from "./query.js";
import { serialize } from "@xlabs-xyz/binary-layout";
import type { KindWithAtomic } from "@xlabs-xyz/amount";
import type { AmountOrAtomic } from "@xlabs-xyz/common";
import { selectorLayout } from "./layouting.js";

export interface ContractTx<K extends KindWithAtomic | undefined = undefined> {
  to:          Address;
  from?:       Address;
  value?:      AmountOrAtomic<K>;
  data:        RoUint8Array;
  accessList?: AccessList;
}

// ---- Contract spec builder ----
// Derives a typed contract interface from a spec array of
//   [functionName, solidityArgTypes, inputLayout, outputLayout | undefined, composer?]
// Read calls (outputLayout defined) return a layout triple for the query system.
// Write calls (outputLayout undefined) return pre-serialized data.
// The optional composer provides a positional-args overload with named parameters.

type FuncSpec<
  FuncName     extends string = string,
  ParaTypes    extends RoTuple<string> = RoTuple<string>,
  ParaLayout   extends ProperLayout = ProperLayout,
  ParaComposer extends Function<any, DeriveType<ParaLayout>> =
                       Function<any, DeriveType<ParaLayout>>,
  ReturnLayout extends Layout | undefined = Layout | undefined,
> = readonly [FuncName, ParaTypes, ParaLayout, ParaComposer, ReturnLayout];
type ContractSpec = RoTuple<FuncSpec>;

type ReadResult<IL extends ProperLayout, OL extends Layout> = Readonly<{
  to:   Address;
  data: QueryLayoutTriple<IL, OL>;
}>;

type WriteResult = Readonly<{
  from: Address;
  to:   Address;
  data: Uint8Array;
}>;

type ContractMethodOf<IL extends ProperLayout, OL, C extends Function<any>> =
  OL extends Layout
  ? ((...args: Parameters<C>) => ReadResult<IL, OL>) &
    ((params: DeriveType<IL>) => ReadResult<IL, OL>)
  : ((from: Address, ...args: Parameters<C>) => WriteResult) &
    ((from: Address, params: DeriveType<IL>) => WriteResult);

export type ContractMethods<S extends RoTuple<any>> = {
  readonly [E in S[number] as E extends FuncSpec<infer N> ? N : never]:
    E extends FuncSpec<string, any, infer IL, infer C, infer OL>
    ? ContractMethodOf<IL, OL, C>
    : never;
};

function resolveArgs(
  layout:   ProperLayout,
  composer: Function<any>,
  args:     RoArray,
): unknown {
  //For 0 or 2+ args, it's unambiguously the composer (positional) form.
  //For a single object arg, it's ambiguous only when the layout has exactly one non-omitted
  //  item — the arg could be the object form { name: value } or a struct passed positionally.
  //  We assume object form if the object has exactly one key matching that item's name.
  //  For 2+ non-omitted items, a single arg must be object form (positional would have multiple).
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    let nonOmittedCount = 0;
    let firstName: string | undefined;
    for (const item of layout) {
      if ("omit" in item && item.omit)
        continue;
      if (++nonOmittedCount > 1)
        return args[0];
      firstName = item.name;
    }
    //single non-omitted item: assume object form if the object has exactly one matching key
    const keys = Object.keys(args[0]);
    if (keys.length === 1 && keys[0] === firstName)
      return args[0];
  }
  return composer(...args);
}

export const contractFromSpec = <const S extends ContractSpec>(
  contract: Address,
  spec:     S,
): ContractMethods<S> => {
  const result: Record<string, Function<any>> = {};
  for (const [name, argTypes, inputLayout, composer, outputLayout] of spec) {
    const sig = `${name}(${argTypes.join(",")})`;
    const layout = selectorLayout(sig)(inputLayout);

    result[name] = outputLayout !== undefined
      ? (...args: any[]) => ({
          to:   contract,
          data: [layout, resolveArgs(inputLayout, composer, args), outputLayout],
        })
      : (from: Address, ...args: any[]) => ({
          from,
          to:   contract,
          data: serialize(layout, resolveArgs(inputLayout, composer, args) as any),
        });
  }
  return result as any;
};
