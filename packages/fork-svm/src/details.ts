import type {
  Address,
  Lamports,
  AccountInfoBase,
  Base64EncodedBytes,
  ReadonlyUint8Array,
  AccountInfoWithBase64EncodedData,
} from "@solana/kit";
import { getBase64Codec, getAddressDecoder } from "@solana/kit";
import type { AccountInfo as SvmAccountInfo } from "./liteSvm.js";

export type KitAccountInfo = AccountInfoBase & AccountInfoWithBase64EncodedData;
export { type SvmAccountInfo };

export type MaybeKitAccInfo = KitAccountInfo | null;
export type MaybeSvmAccInfo = SvmAccountInfo | null;

export const [systemProgramId, bpfUpgradeableLoaderProgramId] = [
  "11111111111111111111111111111111"            as Address,
  "BPFLoaderUpgradeab1e11111111111111111111111" as Address,
] as const;

export const emptyAccountInfo = {
  executable: false,
  owner: systemProgramId,
  lamports: 0n,
  space: 0n,
  data: new Uint8Array(),
} as const satisfies SvmAccountInfo;

export const [builtInProgramIds, sysvarProgramIds, defaultPrograms] = ([
  [ //see https://github.com/anza-xyz/solana-sdk/blob/master/sdk-ids/src/lib.rs
    systemProgramId,
    bpfUpgradeableLoaderProgramId,
    "Config1111111111111111111111111111111111111",
    "Stake11111111111111111111111111111111111111",
    "Vote111111111111111111111111111111111111111",
    "AddressLookupTab1e1111111111111111111111111",
    "Ed25519SigVerify111111111111111111111111111",
    "KeccakSecp256k11111111111111111111111111111",
    "NativeLoader1111111111111111111111111111111",
    "BPFLoader1111111111111111111111111111111111",
    "BPFLoader2111111111111111111111111111111111",
    "ComputeBudget111111111111111111111111111111",
  ], [ //see https://docs.solanalabs.com/runtime/sysvars/
    "SysvarC1ock11111111111111111111111111111111",
    "SysvarEpochSchedu1e111111111111111111111111",
    "SysvarFees111111111111111111111111111111111",
    "Sysvar1nstructions1111111111111111111111111",
    "SysvarRecentB1ockHashes11111111111111111111",
    "SysvarRent111111111111111111111111111111111",
    "SysvarS1otHashes111111111111111111111111111",
    "SysvarS1otHistory11111111111111111111111111",
    "SysvarStakeHistory1111111111111111111111111",
    "SysvarEpochRewards1111111111111111111111111",
    "SysvarLastRestartS1ot1111111111111111111111",
  ], [
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  ],
]).map(pids => new Set(pids)) as [Set<Address>, Set<Address>, Set<Address>];


export const decodeAddr = (bytes: ReadonlyUint8Array, offset: number = 0) =>
  getAddressDecoder().decode(bytes.subarray(offset, offset + 32));

//Strictly speaking, this isn't parsing compactU16s correctly because there could be a second
//  continuation bit, i.e. a value will take up 3 bytes for values >= 2^14 because the highest
//  order bits are used to indicate continuation.
//But seeing how Solana transactions are at most 1232 bytes, there's no way that we'll ever
//  have more than 2^14 of anything (not even bits).
export const decodeCompactU16 = (bytes: ReadonlyUint8Array, offset: number): [number, number] =>
  bytes[offset]! < 0x80
  ? [ bytes[offset]!,                                   offset + 1] as const
  : [(bytes[offset]! - 0x80) << 8 | bytes[offset + 1]!, offset + 2] as const;

const mapNonNull =
  <P, R>(f: (_: P) => R) =>
    (arg: P | null): R | null =>
      arg === null ? null : f(arg);

export const base64 = getBase64Codec();

export const liteSvmAccountToKitAccount =
  mapNonNull((acc: SvmAccountInfo): KitAccountInfo => ({
    executable: acc.executable,
    lamports: acc.lamports as Lamports,
    owner: acc.owner,
    data: [base64.decode(acc.data) as Base64EncodedBytes, "base64"],
    space: acc.space,
  }));

export const kitAccountToLiteSvmAccount =
  mapNonNull((acc: KitAccountInfo): SvmAccountInfo => ({
    executable: acc.executable,
    lamports: acc.lamports,
    owner: acc.owner,
    data: base64.encode(acc.data[0]) as Uint8Array,
    space: acc.space,
  }));
