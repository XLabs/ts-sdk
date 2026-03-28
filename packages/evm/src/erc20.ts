import type { Address } from "viem";
import { named, stringConversion } from "@xlabs-xyz/binary-layout";
import type { KindWithAtomic } from "@xlabs-xyz/amount";
import { paddedSlotLayout, addressItem, evmAmountItem, abiEncodedBytesItem } from "./layouting.js";
import { type ContractMethods, contractFromSpec } from "./client.js";

const addr = (name: string) => named(name, paddedSlotLayout(addressItem));

const abiBytes = abiEncodedBytesItem();
const abiStringItem = {
  ...abiBytes,
  custom: {
    to:   (raw: any) => stringConversion.to(abiBytes.custom.to(raw)),
    from: (str: string) => abiBytes.custom.from(stringConversion.from(str)),
  },
} as const;
const decimalsItem  = paddedSlotLayout({ binary: "uint", size: 1 } as const);

const erc20Spec = <const K extends KindWithAtomic | undefined = undefined>(kind?: K) => {
  const amt  = (name: string) => named(name, evmAmountItem(kind));
  return [
    ["name",      [],                     [],                                 abiStringItem      ],
    ["symbol",    [],                     [],                                 abiStringItem      ],
    ["decimals",  [],                     [],                                 decimalsItem       ],
    ["balanceOf", ["address"           ], [addr("owner")                   ], evmAmountItem(kind)],
    ["allowance", ["address", "address"], [addr("owner"),   addr("spender")], evmAmountItem(kind)],
    ["approve",   ["address", "uint256"], [addr("spender"), amt("value")   ], undefined          ],
    ["transfer",  ["address", "uint256"], [addr("to"),      amt("value")   ], undefined          ],
  ] as const;
}

export const erc20 = <const K extends KindWithAtomic | undefined = undefined>(
  contract: Address,
  kind?: K,
): ContractMethods<ReturnType<typeof erc20Spec<K>>> =>
  contractFromSpec(contract, erc20Spec(kind));
