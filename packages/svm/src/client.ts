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
import { fromAtomicIfKind } from "@xlabs-xyz/common";
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

export type LamportsType<KS extends KindWithAtomic | undefined> =
  KS extends KindWithAtomic ? Amount<KS> : Lamports;

export type AmountType<K extends KindWithAtomic | undefined> =
  K extends KindWithAtomic ? Amount<K> : bigint;

export type AccountInfo<KS extends KindWithAtomic | undefined = undefined> = {
  executable: boolean;
  owner:      Address;
  lamports:   LamportsType<KS>;
  space:      bigint;
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

const toAccountInfo = <const KS extends KindWithAtomic | undefined = undefined>(
  accInfo: RpcAccountInfo,
  solKind?: KS,
): AccountInfo<KS> | undefined =>
  accInfo
  ? { ...accInfo,
      data: base64.encode(accInfo.data[0]) as Uint8Array,
      lamports: fromAtomicIfKind(accInfo.lamports, solKind) as LamportsType<KS>,
    } : undefined;

const encb64 = { encoding: "base64" } as const;

export const sendTransaction =
  (client: SvmClient, wireTx: Base64EncodedWireTransaction): Promise<string> =>
    client.sendTransaction(wireTx, encb64).send();

export const getAccountInfo = <
  const A extends MaybeArray<Address>,
  const KS extends KindWithAtomic | undefined = undefined
>(
  client: SvmClient,
  addressEs: A,
  solKind?: KS,
): Promise<MapArrayness<A, AccountInfo<KS> | undefined>> =>
  (isArray(addressEs)
    ? client.getMultipleAccounts(addressEs, encb64)
    : client.getAccountInfo(addressEs, encb64)
  ).send().then(res => mapTo(res.value)(accInfo => toAccountInfo(accInfo, solKind))) as any;

export const getBalance = <
  const A extends MaybeArray<Address>,
  const KS extends KindWithAtomic | undefined = undefined
>(
  client: SvmClient,
  address: A,
  solKind?: KS,
): Promise<MapArrayness<A, LamportsType<KS> | undefined>> =>
  getAccountInfo(client, address, solKind).then(res => mapTo(res)(accInfo =>
    accInfo?.lamports
  )) as any;

export const getDeserializedAccount = <
  const A extends MaybeArray<Address>,
  const L extends Layout,
>(
  client:    SvmClient,
  addressEs: A,
  layout:    L,
): Promise<MapArrayness<A, DeriveType<L> | undefined>> =>
  getAccountInfo(client, addressEs).then(res => mapTo(res)(accInfo =>
    accInfo !== undefined ? deserialize(layout, accInfo.data) : undefined
  )) as any;

export const getMint = <const K extends KindWithAtomic | undefined = undefined>(
  client:      SvmClient,
  mintAddress: Address,
  kind?:       K,
): Promise<MintAccount<K> | undefined> =>
  getDeserializedAccount(client, mintAddress, mintAccountLayout(kind));

export const getTokenAccount = <
  const A extends MaybeArray<Address>,
  const KT extends KindWithAtomic | undefined = undefined,
  const KS extends KindWithAtomic | undefined = undefined,
>(
  client:     SvmClient,
  tokenAccs:  A,
  tokenKind?: KT,
  solKind?:   KS,
): Promise<MapArrayness<A, TokenAccount<KT, KS> | undefined>> =>
  getDeserializedAccount(client, tokenAccs, tokenAccountLayout(tokenKind, solKind));

export const getTokenBalance = <
  const A extends MaybeArray<Address>,
  const K extends KindWithAtomic | undefined = undefined,
>(
  client:     SvmClient,
  tokenAccs:  A,
  tokenKind?: K,
): Promise<MapArrayness<A, AmountType<K> | undefined>> =>
  getDeserializedAccount(client, tokenAccs, tokenAccountLayout(tokenKind))
    .then(res => mapTo(res)(maybeToken =>
      (maybeToken as { amount: AmountType<K> } | undefined)?.amount,
    )) as any;

export const getDurableNonceAccount = <
  const K extends KindWithAtomic | undefined = undefined,
>(
  client:  SvmClient,
  address: Address,
  kind?:   K,
): Promise<DurableNonceAccount<K> | undefined> =>
  getDeserializedAccount(client, address, durableNonceAccountLayout(kind));

export const getAddressLookupTable = (
  client:  SvmClient,
  address: Address,
): Promise<AddressLookupTable | undefined> =>
  getDeserializedAccount(client, address, addressLookupTableLayout);

export const getLatestBlockhash = (
  client: SvmClient,
): Promise<BlockHashInfo> =>
  client.getLatestBlockhash().send().then(res => res.value);

export const addLifetimeAndSendTx = (
  client:  SvmClient,
  tx:      TxMsgWithFeePayer,
  signers: RoArray<KeyPairSigner>,
): Promise<Signature> =>
  getLatestBlockhash(client)
    .then(blockhash => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx))
    .then(txWithLifetime => sendTx(client, txWithLifetime, signers));

export const sendTx = (
  client:  SvmClient,
  tx:      TxWithLifetime,
  signers: RoArray<KeyPairSigner>,
): Promise<Signature> =>
  signTransaction(signers.map(kp => kp.keyPair), compileTransaction(tx)).then(
    signedTx => client.sendTransaction(getBase64EncodedWireTransaction(signedTx), encb64).send()
  );

// Curried functions below

export const curryGetAccountInfo =
  <const KS extends KindWithAtomic | undefined = undefined>(solKind?: KS) =>
    (client: SvmClient) =>
      <const A extends MaybeArray<Address>>(addressEs: A) =>
        getAccountInfo(client, addressEs, solKind);

export const curryGetBalance =
  <const KS extends KindWithAtomic | undefined = undefined>(solKind?: KS) =>
    (client: SvmClient) =>
      <const A extends MaybeArray<Address>>(addressEs: A) =>
        getBalance(client, addressEs, solKind);

export const curryGetTokenAccount =
  <const KS extends KindWithAtomic | undefined = undefined>(solKind?: KS) =>
    (client: SvmClient) =>
      <const KT extends KindWithAtomic | undefined = undefined>(tokenKind?: KT) =>
        <const A extends MaybeArray<Address>>(tokenAccs: A) =>
          getTokenAccount(client, tokenAccs, tokenKind, solKind);

export const curryGetMint =
  (client: SvmClient) =>
    <const KT extends KindWithAtomic | undefined = undefined>(tokenKind?: KT) =>
      (mintAddress: Address) =>
        getMint(client, mintAddress, tokenKind);

export const curryGetTokenBalance =
  (client: SvmClient) =>
    <const KT extends KindWithAtomic | undefined = undefined>(tokenKind?: KT) =>
      <const A extends MaybeArray<Address>>(tokenAccs: A) =>
        getTokenBalance(client, tokenAccs, tokenKind);

export const curryGetDurableNonceAccount =
  <const KS extends KindWithAtomic | undefined = undefined>(solKind?: KS) =>
    (client: SvmClient) =>
      (address: Address) =>
        getDurableNonceAccount(client, address, solKind);

export const curryGetDeserializedAccount =
  (client: SvmClient) =>
    <const L extends Layout>(layout: L) =>
      <const A extends MaybeArray<Address>>(addressEs: A) =>
        getDeserializedAccount(client, addressEs, layout);

export const curryGetAddressLookupTable =
  (client: SvmClient) =>
    (address: Address) =>
      getAddressLookupTable(client, address);

export const curryGetLatestBlockhash =
  (client: SvmClient) =>
    () =>
      getLatestBlockhash(client);

export const curryAddLifetimeAndSendTx =
  (client: SvmClient) =>
    (tx: TxMsgWithFeePayer, signers: RoArray<KeyPairSigner>) =>
      addLifetimeAndSendTx(client, tx, signers);

export const currySendTx =
  (client: SvmClient) =>
    (tx: TxWithLifetime, signers: RoArray<KeyPairSigner>) =>
      sendTx(client, tx, signers);

export const currySendTransaction =
  (client: SvmClient) =>
    (wireTx: Base64EncodedWireTransaction) =>
      sendTransaction(client, wireTx);