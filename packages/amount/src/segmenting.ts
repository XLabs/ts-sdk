type Span = [number, number];

export type SegmentPair = {
  value:  Span;
  symbol: Span;
};

export type SegmentResult = {
  negative: boolean;
  pairs:    SegmentPair[];
};

export type StartResult = {
  pos:      number;
  negative: boolean;
};

export type PairResult = {
  pair: SegmentPair;
  end:  number;
};

const asciiSpace      = 32;
const asciiZero       = 48;
const asciiNine       = 57;
const asciiComma      = 44;
const asciiUnderscore = 95;
const asciiDot        = 46;
const asciiSlash      = 47;

const charIsDigit = (c: number) =>
  asciiZero <= c && c <= asciiNine;

const charIsNumPart = (c: number) =>
  charIsDigit(c)        ||
  c === asciiComma      ||
  c === asciiUnderscore ||
  c === asciiDot        ||
  c === asciiSlash;

const isValChar = charIsNumPart;
const isSymChar = (c: number) => c !== asciiSpace && !charIsNumPart(c);

const parseSpan = (
  str:      string,
  pos:      number,
  isValid:  (c: number) => boolean,
  expected: string
): { span: Span; end: number } => {
  const start = pos;
  while (pos < str.length && isValid(str.charCodeAt(pos)))
    ++pos;

  if (pos === start)
    throw new Error(`Expected ${expected} at position ${start}`);

  return { span: [start, pos], end: pos };
};

export const parseSign = (str: string): StartResult => {
  let pos = 0;
  if (str.length === 0)
    throw new Error("Empty input");

  const negative = str[0] === "-";
  if (negative && ++pos === str.length)
    throw new Error("Sign only input");

  return { pos, negative };
};

export const parsePair = (str: string, pos: number): PairResult => {
  const startsWithValue = charIsDigit(str.charCodeAt(pos));
  const [    pred1,    name1,     pred2,    name2] = startsWithValue
      ? [isValChar,  "value", isSymChar, "symbol"] as const
      : [isSymChar, "symbol", isValChar,  "value"] as const;

  const first = parseSpan(str, pos, pred1, name1);

  //this is the only leniency while parsing: we accept a space, even if the symbol is compact
  pos = first.end;
  if (str.charCodeAt(pos) === asciiSpace) {
    ++pos;
    if (pos >= str.length)
      throw new Error(`Unexpected end of input: Parsed ${name1}, expected ${name2} next`);
  }

  const second = parseSpan(str, pos, pred2, name2);

  const pair = startsWithValue
    ? { value: first.span,  symbol: second.span }
    : { value: second.span, symbol: first.span  };

  return { pair, end: second.end };
};

export const segment = (str: string): SegmentResult => {
  const start = parseSign(str);
  let   { pos      } = start;
  const { negative } = start;
  const pairs        = [] as SegmentPair[];

  while (true) {
    const { pair, end } = parsePair(str, pos);
    pairs.push(pair);
    pos = end;

    if (pos === str.length)
      break;

    if (str.charCodeAt(pos) !== asciiSpace)
      throw new Error("Expected space after value/symbol pair");

    ++pos;
    if (pos === str.length)
      throw new Error("Unexpected end of input: Expected another value/symbol pair");
  }

  return { negative, pairs };
};
