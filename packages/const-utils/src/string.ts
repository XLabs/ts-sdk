export const uppercase = <S extends string>(s: S): Uppercase<S> =>
  s.toUpperCase() as Uppercase<S>;

export const lowercase = <S extends string>(s: S): Lowercase<S> =>
  s.toLowerCase() as Lowercase<S>;

//charAt(0) returns "" for the empty string and is hence safe

export const capitalize = <S extends string>(s: S): Capitalize<S> =>
  (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<S>;

export const uncapitalize = <S extends string>(s: S): Uncapitalize<S> =>
  (s.charAt(0).toLowerCase() + s.slice(1)) as Uncapitalize<S>;

export type OtherCap<S extends string> =
  Capitalize<S> extends S ? Uncapitalize<S> : Capitalize<S>;

export const otherCap = <S extends string>(s: S): OtherCap<S> =>
  (capitalize(s) === s ? uncapitalize(s) : capitalize(s)) as OtherCap<S>;
