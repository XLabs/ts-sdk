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
import { type Layout, type DeriveType, serialize } from "@xlabs-xyz/binary-layout";
import { bytes, base58, sha256, ed25519, throws } from "@xlabs-xyz/utils";
import {
  associatedTokenProgramId,
  tokenProgramId,
  systemProgramId,
  emptyAccountSize,
  lamportsPerByte,
} from "./constants.js";

const discriminatorTypeConverter = {
  instruction: "global",
  account:     "account",
  event:       "event",
  anchor:      "anchor",
} as const;
export type DiscriminatorType = keyof typeof discriminatorTypeConverter;

export const discriminatorLength = 8;
export const discriminatorOf = (type: DiscriminatorType, name: string) =>
  sha256(`${discriminatorTypeConverter[type]}:${name}`).subarray(0, discriminatorLength);

//see here: https://github.com/solana-foundation/anchor/blob/master/lang/src/event.rs
//Why they chose to use little endian here, when all other discriminators are big endian is
//  entirely beyond me.
export const anchorEmitCpiDiscriminator = discriminatorOf("anchor", "event").reverse();


export type FirstSeed = RoUint8Array | string;
const firstSeedToBytes = (seed: FirstSeed) =>
  typeof seed === "string" ? bytes.encode(seed) : seed as RoUint8Array;

export type AdditionalSeed = RoUint8Array | Address;
const additionalSeedToBytes = (seed: AdditionalSeed) =>
  typeof seed === "string" ? base58.decode(seed) : seed;

//the first seed is interpreted as a normal string, every other "string" is assumed to be an address
type NotAddress<S extends string> = S extends Address ? never : S;
export type Seeds<S extends string> =
  RoUint8Array |
  NotAddress<S> |
  readonly [NotAddress<S>, ...AdditionalSeed[]] |
  readonly [RoUint8Array, ...NotAddress<S>[]];
const bytifySeeds = <S extends string>(seeds: Seeds<S>) =>
  isArray(seeds)
  ? bytes.concat(
      firstSeedToBytes(seeds[0]),
      ...(seeds.slice(1) as AdditionalSeed[]).map(additionalSeedToBytes),
    ) as RoUint8Array
  : firstSeedToBytes(seeds);

const pdaStrConst = bytes.encode("ProgramDerivedAddress");
const calcRawPda = <S extends string>(seeds: Seeds<S>, bump: number, programId: Address) =>
  sha256(bytes.concat(
    bytifySeeds(seeds),
    new Uint8Array([bump]),
    bytes.encode(programId),
    pdaStrConst,
  ));

const toAddress = (rawAddress: RoUint8Array): Address =>
  base58.encode(rawAddress) as Address;

export const calcPda =
  <S extends string>(seeds: Seeds<S>, bump: number, programId: Address): Address =>
    toAddress(calcRawPda(seeds, bump, programId));

const isOffCurve = (rawAddress: RoUint8Array) =>
  throws(() => ed25519.Point.fromHex(rawAddress as Uint8Array));

export function findPda<S extends string>(seeds: Seeds<S>, programId: Address): [Address, number] {
  let bump = 255;
  seeds = bytifySeeds(seeds);
  while (true) { //P(not finding a valid PDA) << P(cosmic ray mucking up the computation)
    const candidate = calcRawPda(seeds, bump, programId);
    if (isOffCurve(candidate))
      return [toAddress(candidate), bump];

    --bump;
  }
}

export const findAta = (
  owner: Address,
  mint: Address,
  tokenProgram: Address = tokenProgramId,
): Address =>
  findPda(["", owner, tokenProgram, mint], associatedTokenProgramId)[0];

export const minimumBalanceForRentExemption = (size: number): Lamports =>
  BigInt(emptyAccountSize + size) * lamportsPerByte as Lamports;

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
  payer: Address,
  owner: Address,
  mint: Address,
  idempotent: boolean = true,
  tokenProgram: Address = tokenProgramId,
): Ix {
  const ata = findAta(owner, mint, tokenProgram);
  const accounts = [
    [payer,           AccountRole.WRITABLE_SIGNER],
    [ata,             AccountRole.WRITABLE       ],
    [owner,           AccountRole.READONLY       ],
    [mint,            AccountRole.READONLY       ],
    [systemProgramId, AccountRole.READONLY       ],
    [tokenProgram,    AccountRole.READONLY       ],
  ] as const;
  return composeIx(
    accounts,
    { binary: "uint", size: 1 }, //see https://docs.rs/spl-associated-token-account-interface/latest/spl_associated_token_account_interface/instruction/enum.AssociatedTokenAccountInstruction.html
    idempotent ? 1 : 0,
    associatedTokenProgramId,
  );
}
