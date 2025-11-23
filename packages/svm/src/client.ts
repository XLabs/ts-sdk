import type {
  Address,
  Signature,
  Base64EncodedWireTransaction,
  KeyPairSigner,
  Base64EncodedDataResponse,
  Lamports,
  TransactionMessage,
  TransactionMessageWithFeePayer,
  TransactionWithLifetime,
  Blockhash,
} from "@solana/kit";
import {
  createSolanaRpc,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  getBase64Codec,
  getBase64EncodedWireTransaction,
  compileTransaction,
} from "@solana/kit";
import type { MaybeArray, MapArrayness } from "@xlabs-xyz/const-utils";
import { isArray, mapTo } from "@xlabs-xyz/const-utils";
import { type Layout, type DeriveType, deserialize } from "@xlabs-xyz/binary-layout";
import { type KindWithAtomic } from "@xlabs-xyz/amount";
import type { DistributiveAmount, Byte } from "@xlabs-xyz/common";
import { byte } from "@xlabs-xyz/common";
import { tokenAccountLayout } from "./layouting.js";

const base64 = getBase64Codec();

export type SvmClient = ReturnType<typeof createSolanaRpc>;
export type TxMsg = TransactionMessage;
export type TxMsgWithFeePayer = TransactionMessage & TransactionMessageWithFeePayer;
export type SignableTx = ReturnType<typeof compileTransaction>;
export type TxWithLifetime = Parameters<typeof compileTransaction>[0] & TransactionWithLifetime;

export type AccountInfo = {
  executable: boolean;
  owner:      Address;
  lamports:   Lamports;
  space:      Byte;
  data:       Uint8Array;
};

export type BlockHashInfo = {
  blockhash:            Blockhash;
  lastValidBlockHeight: bigint;
};

type RpcAccountInfo = Readonly<{
  executable: boolean;
  lamports:   Lamports;
  owner:      Address;
  space:      bigint;
  data:       Base64EncodedDataResponse;
}> | null;

const toAccountInfo = (accInfo: RpcAccountInfo): AccountInfo | undefined => 
  accInfo ? {
    ...accInfo,
    space: byte(accInfo.space),
    data: base64.encode(accInfo.data[0]) as Uint8Array,
  }
  : undefined;

const encb64 = { encoding: "base64" } as const;    

export const sendTransaction =
  (client: SvmClient, wireTx: Base64EncodedWireTransaction): Promise<string> =>
    client.sendTransaction(wireTx, encb64).send();

export const getAccountInfo = async <const A extends MaybeArray<Address>>(
  client: SvmClient,
  addressEs: A,
): Promise<MapArrayness<A, AccountInfo | undefined>> =>
  (isArray(addressEs)
    //TODO remove cast once https://github.com/anza-xyz/kit/pull/978 has been released
    //  and readonly arrays are supported
    ? client.getMultipleAccounts(addressEs as Address[], encb64)
    : client.getAccountInfo(addressEs, encb64)
  ).send().then(res => mapTo(res.value)(toAccountInfo)) as any;

export const getDeserializedAccount = <
  const A extends MaybeArray<Address>,
  const L extends Layout,
>(
  client: SvmClient,
  addressEs: A,
  layout: L,
): Promise<MapArrayness<A, DeriveType<L> | undefined>> =>
  getAccountInfo(client, addressEs).then(res => mapTo(res)(accInfo =>
    accInfo ? deserialize(layout, accInfo.data) : undefined
  )) as any;

export type AmountType<K extends KindWithAtomic | undefined> =
  K extends KindWithAtomic ? DistributiveAmount<K> : bigint;
export const getTokenBalance = <
  const A extends MaybeArray<Address>,
  const K extends KindWithAtomic | undefined = undefined,
>(
  client: SvmClient,
  tokenAccs: A,
  kind?: K,
): Promise<MapArrayness<A, AmountType<K> | undefined>> =>
  getDeserializedAccount(client, tokenAccs, tokenAccountLayout(kind)).then(res => mapTo(res)(
    maybeToken => (maybeToken as { amount: AmountType<K> } | undefined)?.amount,
  )) as any;

export const getLatestBlockhash = (client: SvmClient): Promise<BlockHashInfo> =>
  client.getLatestBlockhash().send().then(res => res.value);

export const addLifetimeAndSendTx = (
  client: SvmClient,
  tx: TxMsgWithFeePayer,
  signers: readonly KeyPairSigner[],
): Promise<Signature> =>
  getLatestBlockhash(client)
    .then(blockhash => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx))
    .then(txWithLifetime => sendTx(client, txWithLifetime, signers));

export async function sendTx(
  client: SvmClient,
  tx: TxWithLifetime,
  signers: readonly KeyPairSigner[]
): Promise<Signature> {
  const compiledTx = compileTransaction(tx);
  const signedTx = await signTransaction(signers.map(kp => kp.keyPair), compiledTx);
  const wireTx: Base64EncodedWireTransaction = getBase64EncodedWireTransaction(signedTx);
  return client.sendTransaction(wireTx, encb64).send();
}
