export const definedOrThrow = <const T>(value: T | undefined, errorMessage?: string): T => {
  if (value === undefined)
    throw new Error(errorMessage ?? "Value is undefined");
  return value;
};

export function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  }
  catch {
    return true;
  }
}
