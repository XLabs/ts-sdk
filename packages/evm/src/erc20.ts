import type { Address } from "viem";
import { stringConversion } from "@xlabs-xyz/binary-layout";
import type { KindWithAtomic } from "@xlabs-xyz/amount";
import type { AmountOrAtomic } from "@xlabs-xyz/common";
import { paddedSlotLayout, addressItem, evmAmountItem, abiEncodedBytesItem } from "./layouting.js";
import type { ContractMethods } from "./client.js";
import { contractFromSpec } from "./client.js";
import { namer } from "@xlabs-xyz/common";

const addr = namer(paddedSlotLayout(addressItem));

const abiBytes = abiEncodedBytesItem();
const abiStringItem = {
  ...abiBytes,
  custom: {
    to:   (raw: any) => stringConversion.to(abiBytes.custom.to(raw)),
    from: (str: string) => abiBytes.custom.from(stringConversion.from(str)),
  },
} as const;
const decimalsItem = paddedSlotLayout({ binary: "uint", size: 1 } as const);

const erc20Spec = <const K extends KindWithAtomic | undefined = undefined>(kind?: K) => {
  type A = AmountOrAtomic<K>;
  const amt = namer(evmAmountItem(kind));

  const [noParams, owner, ownerSpender, spenderValue, toValue] = [[
      [                                  ],
      (                                  ) => ({})
    ], [
      [addr("owner")                     ],
      (owner: Address                    ) => ({ owner })
    ], [
      [addr("owner"),    addr("spender") ],
      (owner: Address,   spender: Address) => ({ owner, spender })
    ], [
      [addr("spender"),  amt("value")    ],
      (spender: Address, value: A        ) => ({ spender, value })
    ], [
      [addr("to"),       amt("value")    ],
      (to: Address,      value: A        ) => ({ to, value })
    ]] as const;

  return [
    ["name",      [],                     ...noParams,     abiStringItem      ],
    ["symbol",    [],                     ...noParams,     abiStringItem      ],
    ["decimals",  [],                     ...noParams,     decimalsItem       ],
    ["balanceOf", ["address"           ], ...owner,        evmAmountItem(kind)],
    ["allowance", ["address", "address"], ...ownerSpender, evmAmountItem(kind)],
    ["approve",   ["address", "uint256"], ...spenderValue, undefined          ],
    ["transfer",  ["address", "uint256"], ...toValue,      undefined          ],
  ] as const;
}

export const erc20 = <const K extends KindWithAtomic | undefined = undefined>(
  contract: Address,
  kind?: K,
): ContractMethods<ReturnType<typeof erc20Spec<K>>> =>
  contractFromSpec(contract, erc20Spec(kind));
