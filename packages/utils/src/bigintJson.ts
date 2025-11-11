export interface SerializedBigint {
  $type: "bigint";
  value: string;
}

const isSerializedBigint = (value: unknown): value is SerializedBigint =>
  typeof value === "object" &&
  value !== null &&
  "$type" in value &&
  "value" in value &&
  (value as any).$type === "bigint" &&
  typeof (value as any).value === "string";

export const bigintReplacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint"
    ? ({
        $type: "bigint",
        value: value.toString(10),
      } satisfies SerializedBigint)
    : value;

export const bigintReviver = (_key: string, value: unknown): unknown =>
  isSerializedBigint(value) ? BigInt(value.value) : value;

export const serializeBigints = (
  obj: Record<string, unknown>,
): Record<string, unknown> => JSON.parse(JSON.stringify(obj, bigintReplacer));

export const deserializeBigints = <T>(obj: Record<string, unknown>): T =>
  JSON.parse(JSON.stringify(obj), bigintReviver) as T;

export const stringifyWithBigints = (obj: unknown): string =>
  JSON.stringify(obj, bigintReplacer);

export const parseWithBigints = <T>(jsonString: string): T =>
  JSON.parse(jsonString, bigintReviver) as T;
