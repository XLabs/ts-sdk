import type { Text } from "./misc.js";

export const assertDistinct = <T>(...values: T[]) => {
  const uniqueValues = new Set(values);
  if (uniqueValues.size !== values.length)
    throw new Error(`Values are not distinct: ${values.join(", ")}`);
};

export const assertEqual = <T>(
  a: T,
  b: T,
  message: Text = `Expected ${a} to equal ${b}` as Text,
) => {
  if (a !== b)
    throw new Error(message);
};
