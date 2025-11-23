import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Item } from "../src/layout";
import { setEndianness } from "../src/setEndianness";
import { customizableBytes, optionItem, enumItem, bitsetItem } from "../src/items";

describe("setEndianness", () => {
  const endianness = "little";
  const lengthEndianness = endianness;
  const idEndianness = endianness;

  const uintItem = { binary: "uint", size: 2 } as const satisfies Item;
  const resultUintItem = { ...uintItem, endianness } as const satisfies Item;

  const intItem = { binary: "int", size: 2 } as const satisfies Item;
  const resultIntItem = { ...intItem, endianness } as const satisfies Item;

  const lengthSizedArrayItem = {
    binary: "array",
    lengthSize: 2,
    layout: [
      { name: "uint", ...uintItem },
      { name: "int",  ...intItem  },
    ]
  } as const satisfies Item;
  const resultLengthSizedArrayItem = {
    ...lengthSizedArrayItem,
    lengthEndianness,
    layout: [
      { name: "uint", ...resultUintItem },
      { name: "int",  ...resultIntItem  }
    ]
  } as const satisfies Item;

  const customBytesItem = customizableBytes({ lengthSize: 2 }, lengthSizedArrayItem);
  const resultCustomizableBytesItem =
    customizableBytes({ lengthSize: 2, lengthEndianness }, resultLengthSizedArrayItem);

  //jest compares functions by reference, so we need to do some ugly acrobatics here
  const optItem = optionItem(lengthSizedArrayItem);
  const resultOptItem = {...optItem, layout: { ...optItem.layout, layouts: [
    optItem.layout.layouts[0],
    [ optItem.layout.layouts[1][0],
      [{ ...optItem.layout.layouts[1][1][0], layout: resultLengthSizedArrayItem }]
    ],
  ]}} as const satisfies Item;

  const enItem = enumItem([["a", 1], ["b", 2]], { size: 2 });
  const resultEnItem = { ...enItem, endianness } as const satisfies Item;

  const bitsItem = bitsetItem(["zero", "one", "two", "", "", "", "", "seven", "eight"]);
  const resultBitsItem = { ...bitsItem, endianness } as const satisfies Item;

  const complexSwitchLayout = {
    binary: "switch",
    idSize: 2,
    idTag: "type",
    layouts: [
      [[1, "nums"], [
        { name: "uint", ...uintItem },
        { name: "int",  ...intItem  },
      ]],
      [[3, "lens"], [
        { name: "lenSize", ...lengthSizedArrayItem },
        { name: "custom",  ...customBytesItem      },
        { name: "option",  ...optItem              },
      ]],
      [[6, "misc"], [
        { name: "enum",   ...enItem   },
        { name: "bitset", ...bitsItem },
      ]],
    ]
  } as const satisfies Item;
  const resultComplexSwitchLayout = {
    ...complexSwitchLayout,
    idEndianness,
    layouts: [
      [[1, "nums"], [
        { name: "uint", ...resultUintItem },
        { name: "int",  ...resultIntItem  },
      ]],
      [[3, "lens"], [
        { name: "lenSize", ...resultLengthSizedArrayItem  },
        { name: "custom",  ...resultCustomizableBytesItem },
        { name: "option",  ...resultOptItem               },
      ]],
      [[6, "misc"], [
        { name: "enum",   ...resultEnItem   },
        { name: "bitset", ...resultBitsItem },
      ]],
    ]
  } as const satisfies Item;

  it("should set endianness for uint", () => {
    const res = setEndianness(uintItem, endianness);
    assert.deepStrictEqual(res, resultUintItem);
  });

  it("should set endianness for int", () => {
    const res = setEndianness(intItem, endianness);
    assert.deepStrictEqual(res, resultIntItem);
  });

  it("should set endianness for array", () => {
    const res = setEndianness(lengthSizedArrayItem, endianness);
    assert.deepStrictEqual(res, resultLengthSizedArrayItem);
  });

  it("should set endianness for customizable bytes", () => {
    const res = setEndianness(customBytesItem, endianness);
    assert.deepStrictEqual(res, resultCustomizableBytesItem);
  });

  it("should set endianness for option", () => {
    const res = setEndianness(optItem, endianness);
    assert.deepStrictEqual(res, resultOptItem);
  });

  it("should set endianness for enum", () => {
    const res = setEndianness(enItem, endianness);
    assert.deepStrictEqual(res, resultEnItem);
  });

  it("should set endianness for bitset", () => {
    const res = setEndianness(bitsItem, endianness);
    assert.deepStrictEqual(res, resultBitsItem);
  });

  it("should set endianness for complex switch", () => {
    const res = setEndianness(complexSwitchLayout, endianness);
    assert.deepStrictEqual(res, resultComplexSwitchLayout);
  });
});
