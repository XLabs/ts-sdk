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
//   [functionName, solidityArgTypes, inputLayout, outputLayout | undefined]
// Read calls (outputLayout defined) return a layout triple for the query system.
// Write calls (outputLayout undefined) return pre-serialized data.

type FuncSpec<
  FuncName     extends string = string,
  ParaNames    extends RoTuple<string> = RoTuple<string>,
  ParaLayout   extends ProperLayout = ProperLayout,
  ReturnLayout extends Layout | undefined = Layout | undefined
> = readonly [FuncName, ParaNames, ParaLayout, ReturnLayout];
type ContractSpec = RoTuple<FuncSpec>;

type ContractMethodOf<IL extends ProperLayout, OL> =
  OL extends Layout
    ? (params: DeriveType<IL>) => Readonly<{
        to:   Address;
        data: QueryLayoutTriple<IL, OL>;
      }>
    : (from: Address, params: DeriveType<IL>) => Readonly<{
        from: Address;
        to:   Address;
        data: Uint8Array;
      }>;

export type ContractMethods<S extends RoTuple<any>> = {
  readonly [E in S[number] as E extends FuncSpec<infer N> ? N : never]:
    E extends FuncSpec<string, any, infer IL, infer OL>
    ? ContractMethodOf<IL, OL>
    : never;
};

export const contractFromSpec = <const S extends ContractSpec>(
  contract: Address,
  spec:     S,
): ContractMethods<S> => {
  const result: Record<string, Function<RoArray<any>>> = {};
  for (const [name, argTypes, inputLayout, outputLayout] of spec) {
    const sig = `${name}(${argTypes.join(",")})`;
    const layout = selectorLayout(sig)(inputLayout);

    result[name] = outputLayout !== undefined
      ? (params: any) => ({ to: contract, data: [layout, params, outputLayout] })
      : (from: Address, params: any) => ({ from, to: contract, data: serialize(layout, params) });
  }
  return result as any;
};
