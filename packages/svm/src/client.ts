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
import type { RoArray, MaybeArray, MapArrayness } from "@xlabs-xyz/const-utils";
import { isArray, mapTo } from "@xlabs-xyz/const-utils";
import type { Layout, DeriveType } from "@xlabs-xyz/binary-layout";
import { deserialize } from "@xlabs-xyz/binary-layout";
import type { Amount, KindWithAtomic } from "@xlabs-xyz/amount";
import type { Byte } from "@xlabs-xyz/common";
import { byte } from "@xlabs-xyz/common";
import type {
  MintAccount,
  TokenAccount,
  DurableNonceAccount,
  AddressLookupTable,
} from "./layouting.js";
import {
  mintAccountLayout,
  tokenAccountLayout,
  durableNonceAccountLayout,
  addressLookupTableLayout,
} from "./layouting.js";

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

export const getAccountInfo = <const A extends MaybeArray<Address>>(
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
    accInfo !== undefined ? deserialize(layout, accInfo.data) : undefined
  )) as any;

export type AmountType<K extends KindWithAtomic | undefined> =
  K extends KindWithAtomic ? Amount<K> : bigint;

export const getMint = <const K extends KindWithAtomic | undefined = undefined>(
  client: SvmClient,
  mintAddress: Address,
  kind?: K,
): Promise<MintAccount<K> | undefined> =>
  getDeserializedAccount(client, mintAddress, mintAccountLayout(kind));

export const getTokenAccount = <
  const A extends MaybeArray<Address>,
  const K extends KindWithAtomic | undefined = undefined,
>(
  client: SvmClient,
  tokenAccs: A,
  kind?: K,
): Promise<MapArrayness<A, TokenAccount<K> | undefined>> =>
  getDeserializedAccount(client, tokenAccs, tokenAccountLayout(kind));

export const getTokenBalance = <
  const A extends MaybeArray<Address>,
  const K extends KindWithAtomic | undefined = undefined,
>(
  client: SvmClient,
  tokenAccs: A,
  kind?: K,
): Promise<MapArrayness<A, AmountType<K> | undefined>> =>
  getDeserializedAccount(client, tokenAccs, tokenAccountLayout(kind))
    .then(res => mapTo(res)(maybeToken =>
      (maybeToken as { amount: AmountType<K> } | undefined)?.amount,
    )) as any;

export const getDurableNonceAccount = (
  client: SvmClient,
  address: Address,
): Promise<DurableNonceAccount | undefined> =>
  getDeserializedAccount(client, address, durableNonceAccountLayout);

export const getAddressLookupTable = (
  client: SvmClient,
  address: Address,
): Promise<AddressLookupTable | undefined> =>
  getDeserializedAccount(client, address, addressLookupTableLayout);

export const getLatestBlockhash = (
  client: SvmClient,
): Promise<BlockHashInfo> =>
  client.getLatestBlockhash().send().then(res => res.value);

export const addLifetimeAndSendTx = (
  client: SvmClient,
  tx: TxMsgWithFeePayer,
  signers: RoArray<KeyPairSigner>,
): Promise<Signature> =>
  getLatestBlockhash(client)
    .then(blockhash => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx))
    .then(txWithLifetime => sendTx(client, txWithLifetime, signers));

export const sendTx = (
  client: SvmClient,
  tx: TxWithLifetime,
  signers: RoArray<KeyPairSigner>
): Promise<Signature> =>
  signTransaction(signers.map(kp => kp.keyPair), compileTransaction(tx)).then(
    signedTx => client.sendTransaction(getBase64EncodedWireTransaction(signedTx), encb64).send()
  );
