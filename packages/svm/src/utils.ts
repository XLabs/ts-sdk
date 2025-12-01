import type {
  Address,
  Lamports,
  Instruction,
  TransactionMessage,
  TransactionMessageWithFeePayer,
} from "@solana/kit";
import {
  AccountRole,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions,
} from "@solana/kit";
import type { RoArray, RoPair, MaybeArray } from "@xlabs-xyz/const-utils";
import { type RoUint8Array, isArray } from "@xlabs-xyz/const-utils";
import type { Layout, DeriveType } from "@xlabs-xyz/binary-layout";
import { serialize } from "@xlabs-xyz/binary-layout";
import { bytes, base58, sha256, ed25519, throws } from "@xlabs-xyz/utils";
import {
  associatedTokenProgramId,
  tokenProgramId,
  systemProgramId,
  emptyAccountSize,
  lamportsPerByte,
} from "./constants.js";

//since it's a very common SVM pattern to have a utf8 string as the first seed, we encode this
//  convention. To protect against an Address being accidentally encoded as utf8 (because
//  the @solana/kit Address type is just a branded string type), we enforce on the type level
//  that one can't pass an Address (or a union type that inclues an Address) as the first seed.
export type Seed<S = string> = RoUint8Array | S;
type IsAddress<S extends Seed> = S extends Address ? true : false;
type RefuseAddressImpl<S extends Seed> = [true] extends [Extract<IsAddress<S>, true>] ? never : S;
export type RefuseAddress<S extends Seed> = [S] extends [RefuseAddressImpl<S>] ? S : never;

export function findPdaAndBump<S extends Seed>(
  firstSeed: RefuseAddress<S>,
  ...args:   [...Seed<Address>[], programId: Address]
): [Address, number] {
  let bump = 255;
  const programId = args.pop() as Address;
  const seedsBytes = bytifySeeds(firstSeed, args as RoArray<Seed<Address>>);
  while (true) { //P(not finding a valid PDA) << P(cosmic ray mucking up the computation)
    const candidate = calcRawPda(seedsBytes, bump, programId);
    if (isOffCurve(candidate))
      return [toAddress(candidate), bump];

    --bump;
  }
}

export const findPda = <S extends Seed>(
  firstSeed: RefuseAddress<S>,
  ...args:   [...Seed<Address>[], programId: Address]
): Address =>
  findPdaAndBump(firstSeed, ...args)[0];

export const findAta = (addresses: {
  owner:         Address;
  mint:          Address;
  tokenProgram?: Address | undefined;
}): Address =>
  findPda(
    new Uint8Array(0), //no string seed - only address seeds
    addresses.owner,
    addresses.tokenProgram ?? tokenProgramId,
    addresses.mint,
    associatedTokenProgramId
  );

export function calcPda<S extends Seed>(
  firstSeed: RefuseAddress<S>,
  ...args:   [...Seed<Address>[], bump: number, programId: Address]
): Address {
  const additionalSeeds = args.slice(0, -2) as RoArray<Seed<Address>>;
  const [bump, programId] = args.slice(-2) as [number, Address];
  return toAddress(calcRawPda(bytifySeeds(firstSeed, additionalSeeds), bump, programId));
}

export const isOffCurve = (rawAddress: RoUint8Array) =>
  throws(() => ed25519.Point.fromBytes(rawAddress as Uint8Array));

const bytifySeeds = (firstSeed: Seed, additionalSeeds: RoArray<Seed<Address>>) =>
  bytes.concat(
    typeof firstSeed === "string" ? bytes.encode(firstSeed) : firstSeed as RoUint8Array,
    ...additionalSeeds.map(seed => typeof seed === "string" ? base58.decode(seed) : seed),
  ) as RoUint8Array;

const pdaStrConst = bytes.encode("ProgramDerivedAddress");
const calcRawPda = (seedsBytes: RoUint8Array, bump: number, programId: Address) =>
  sha256(bytes.concat(
    seedsBytes,
    new Uint8Array([bump]),
    base58.decode(programId),
    pdaStrConst,
  ));

const toAddress = (rawAddress: RoUint8Array): Address =>
  base58.encode(rawAddress) as Address;

// ----

const discriminatorTypeConverter = {
  instruction: "global",
  account:     "account",
  event:       "event",
  anchor:      "anchor",
} as const;
export type DiscriminatorType = keyof typeof discriminatorTypeConverter;

export const discriminatorLength = 8;
export const discriminatorOf = (type: DiscriminatorType, name: string) =>
  sha256(bytes.encode(`${discriminatorTypeConverter[type]}:${name}`))
    .subarray(0, discriminatorLength);

//see here: https://github.com/solana-foundation/anchor/blob/master/lang/src/event.rs
//Why they chose to use little endian here, when all other discriminators are big endian is
//  entirely beyond me.
export const anchorEmitCpiDiscriminator = discriminatorOf("anchor", "event").reverse();

// ----

export const minimumBalanceForRentExemption = (size: number): Lamports =>
  BigInt(emptyAccountSize + size) * lamportsPerByte as Lamports;

// ----

export type Ix = Required<Instruction>;
export const composeIx = <const L extends Layout>(
  addrRoles: RoArray<RoPair<Address, AccountRole>>,
  layout: L,
  params: DeriveType<L>,
  programAddress: Address,
) => ({
  accounts: addrRoles.map(([address, role]) => ({ address, role })),
  data: serialize(layout, params),
  programAddress,
} as const satisfies Ix);

export const feePayerTxFromIxs = (
  ixs: MaybeArray<Ix>,
  payer: Address,
  version: "legacy" | 0 = "legacy",
): TransactionMessage & TransactionMessageWithFeePayer =>
  pipe(
    createTransactionMessage({ version }),
    tx => setTransactionMessageFeePayer(payer, tx),
    tx => appendTransactionMessageInstructions(isArray(ixs) ? ixs : [ixs], tx),
  );

export function composeCreateAtaIx(
  addresses: {
    payer:         Address;
    owner:         Address;
    mint:          Address;
    tokenProgram?: Address | undefined;
  },
  idempotent: boolean = true,
): Ix {
  const ata = findAta(addresses);
  const tokenProgram = addresses.tokenProgram ?? tokenProgramId;

  const accounts = [
    [addresses.payer,  AccountRole.WRITABLE_SIGNER],
    [ata,              AccountRole.WRITABLE       ],
    [addresses.owner,  AccountRole.READONLY       ],
    [addresses.mint,   AccountRole.READONLY       ],
    [systemProgramId,  AccountRole.READONLY       ],
    [tokenProgram,     AccountRole.READONLY       ],
  ] as const;

  return composeIx(
    accounts,
    { binary: "uint", size: 1 }, //see https://docs.rs/spl-associated-token-account-interface/latest/spl_associated_token_account_interface/instruction/enum.AssociatedTokenAccountInstruction.html
    idempotent ? 1 : 0,
    associatedTokenProgramId,
  );
}
