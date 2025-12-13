import type {
  Address,
  Lamports,
  AccountInfoBase,
  Base64EncodedBytes,
  AccountInfoWithBase64EncodedData,
  ReadonlyUint8Array as KitReadonlyUint8Array, //TODO remove if kit fixes their type
} from "@solana/kit";
import { getCompiledTransactionMessageDecoder } from "@solana/kit";
import type { RoUint8Array } from "@xlabs-xyz/const-utils";
import { mapTo } from "@xlabs-xyz/const-utils";
import { base64 } from "@xlabs-xyz/utils";
import {
  systemProgramId,
  builtInProgramIds,
  sysvarIds,
  defaultProgramIds,
} from "@xlabs-xyz/svm";
import type {
  AccountInfo as SvmAccountInfo,
  RoAccountInfo as RoSvmAccountInfo,
} from "./liteSvm.js";

export type KitAccountInfo = AccountInfoBase & AccountInfoWithBase64EncodedData;
export { type SvmAccountInfo, type RoSvmAccountInfo };

export const emptyAccountInfo = {
  executable: false,
  owner:      systemProgramId,
  lamports:   0n,
  space:      0n,
  data:       new Uint8Array(),
} as const satisfies RoSvmAccountInfo;

export const [builtInSet, sysvarSet, defProgSet] =
  mapTo([builtInProgramIds, sysvarIds, defaultProgramIds])(pids => new Set<Address>(pids));

const decompiledTransactionMessageDecoder = getCompiledTransactionMessageDecoder();
export const decodeCompiledTransactionMessage = (bytes: RoUint8Array) =>
  decompiledTransactionMessageDecoder.decode(bytes as KitReadonlyUint8Array);

const mapNonNull =
  <P, R>(f: (_: P) => R) =>
    (arg: P | null): R | null =>
      arg === null ? null : f(arg);

export const liteSvmAccountToKitAccount =
  mapNonNull((acc: RoSvmAccountInfo): KitAccountInfo => ({
    executable: acc.executable,
    lamports:   acc.lamports as Lamports,
    owner:      acc.owner,
    data:       [base64.encode(acc.data) as Base64EncodedBytes, "base64"],
    space:      acc.space,
  }));

export const kitAccountToLiteSvmAccount =
  mapNonNull((acc: KitAccountInfo): SvmAccountInfo => ({
    executable: acc.executable,
    lamports:   acc.lamports,
    owner:      acc.owner,
    data:       base64.decode(acc.data[0]),
    space:      acc.space,
  }));
