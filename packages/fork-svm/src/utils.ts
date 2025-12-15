import assert from "node:assert";
import type {
  Address,
  Lamports,
  KeyPairSigner,
  AddressesByLookupTableAddress,
} from "@solana/kit";
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
} from "@solana/kit";
import type { RoArray, RoUint8Array, MaybeArray, MapArrayness, Opts } from "@xlabs-xyz/const-utils";
import { zip } from "@xlabs-xyz/const-utils";
import { base58, definedOrThrow } from "@xlabs-xyz/utils";
import { serialize, deserialize, calcStaticSize } from "@xlabs-xyz/binary-layout";
import type { KindWithAtomic, KindWithHumanAndAtomic } from "@xlabs-xyz/amount";
import { Amount, getDecimals } from "@xlabs-xyz/amount";
import { fromAtomicIfKind } from "@xlabs-xyz/common";
import type { Ix, TokenAccount, LamportsType, AmountType, TxMsgWithFeePayer } from "@xlabs-xyz/svm";
import {
  addressLookupTableLayout,
  tokenProgramId,
  nativeMint,
  findAta,
  mintAccountLayout,
  tokenAccountLayout,
  curryMinimumBalanceForRentExemption,
  curryGetAccountInfo,
  curryGetDeserializedAccount,
  curryGetBalance,
  curryGetMint,
  curryGetTokenAccount,
  curryGetTokenBalance,
  curryAddLifetimeAndSendTx,
  systemProgramId,
} from "@xlabs-xyz/svm";
import { ForkSvm, TransactionMetadata, FailedTransactionMetadata } from "./forkSvm.js";

export const assertTxSuccess = async (txResult: Promise<TransactionMetadata>) => {
  try {
    return await txResult;
  } catch (error) {
    if (error instanceof FailedTransactionMetadata)
      assert.fail(`tx should succeed but failed with error:\n${error.toString()}`);

    throw error;
  }
};

export const createCurried = <const SOL extends KindWithAtomic | undefined = undefined>(
  forkSvm: ForkSvm,
  solKind?: SOL,
) => {
  const minimumBalanceForRentExemption = curryMinimumBalanceForRentExemption(solKind);
  const inLamports = (lamports: SOL extends KindWithAtomic ? Amount<SOL> : Lamports) =>
    solKind ? (lamports as Amount<SOL & KindWithAtomic>).in("atomic") : lamports as bigint;

  const airdrop = (
    address:  Address,
    lamports: SOL extends KindWithAtomic ? Amount<SOL> : Lamports,
  ) => forkSvm.airdrop(address, inLamports(lamports));

  const rpc = forkSvm.createForkRpc();

  const getAccountInfo         = curryGetAccountInfo(solKind)(rpc);
  const getDeserializedAccount = curryGetDeserializedAccount(rpc);
  const getMint                = curryGetMint(rpc);
  const addLifetimeAndSendTx   = curryAddLifetimeAndSendTx(rpc);
  const getTokenAccount        = curryGetTokenAccount(solKind)(rpc);

  // Wrap to provide zero fallback for undefined balances
  const getBalanceRaw = curryGetBalance(solKind)(rpc);
  const getBalance = <const A extends MaybeArray<Address>>(address: A) =>
    getBalanceRaw(address).then(b => b ?? fromAtomicIfKind(0n, solKind)) as
      Promise<MapArrayness<A, LamportsType<SOL>>>;

  const getTokenBalanceRaw = curryGetTokenBalance(rpc);
  const getTokenBalance =
    <const KT extends KindWithAtomic | undefined = undefined>(tokenKind?: KT) =>
      <const A extends MaybeArray<Address>>(tokenAccs: A) =>
        getTokenBalanceRaw(tokenKind)(tokenAccs).then(b => b ?? fromAtomicIfKind(0n, tokenKind)) as
          Promise<MapArrayness<A, AmountType<KT>>>;

  const createAccount = (
    address:   Address,
    opts?: Opts<{
      data:      RoUint8Array,
      programId: Address,
      lamports:  SOL extends KindWithAtomic ? Amount<SOL> : Lamports,
    }>
   ) => {
    const {
      data      = new Uint8Array(),
      programId = systemProgramId,
      lamports  = minimumBalanceForRentExemption(data.length),
    } = opts ?? {};

    forkSvm.setAccount(address, {
      owner:      programId,
      executable: false,
      lamports:   inLamports(lamports),
      space:      BigInt(data.length),
      data,
    });
  };

  type MintOpts<K extends KindWithAtomic | undefined = undefined> =
    Opts<{ mintAuthority: Address }> & (
      K extends KindWithAtomic
      ? { supply: Amount<K> }
      : Opts<{ supply: bigint; decimals: number }>
    );

  const createMint = <const K extends KindWithHumanAndAtomic | undefined = undefined>(
    address: Address,
    opts?:   MintOpts<K>
  ) => {
    let { mintAuthority, supply } = opts ?? {};
    let decimals: number;

    if (typeof supply === "undefined" || typeof supply === "bigint") {
      supply   ??= 0n;
      decimals ??= 9;
    }
    else {
      decimals = getDecimals(supply.kind, { of: "human", in: "atomic" });
      supply = supply.in("atomic");
    }

    supply = supply as bigint;

    createAccount(address, {
      data: serialize(mintAccountLayout(), {
        mintAuthority,
        supply,
        decimals,
        isInitialized: true,
        freezeAuthority: undefined
      }),
    });
  };

  const createTokenAccount = <const K extends KindWithAtomic | undefined = undefined>(
    address:   Address,
    mint:      Address,
    owner:     Address,
    balance:   K extends KindWithAtomic ? Amount<K> : bigint,
  ) => {
    const tokenAccountSize = calcStaticSize(tokenAccountLayout())!;
    const rentExempt = minimumBalanceForRentExemption(tokenAccountSize) as any;
    const solBalance = (
      solKind
      ? mint === nativeMint
        ? rentExempt.add(balance)
        : rentExempt
      : mint === nativeMint
      ? rentExempt + balance
      : rentExempt
    ) as SOL extends KindWithAtomic ? Amount<SOL> : Lamports;

    createAccount(address, {
      data: serialize(
        tokenAccountLayout((balance as any).kind as K, solKind), {
          mint,
          owner,
          amount:          balance,
          state:           "Initialized",
          isNative:        mint === nativeMint ? rentExempt : undefined,
          delegate:        undefined,
          delegatedAmount: fromAtomicIfKind(0n, (balance as any).kind),
          closeAuthority:  undefined,
        } as TokenAccount<K, SOL>
      ),
      programId: tokenProgramId,
      lamports: solBalance,
    });
  };

  const createAta = <const K extends KindWithAtomic | undefined = undefined>(
    owner:   Address,
    mint:    Address,
    balance: K extends KindWithAtomic ? Amount<K> : bigint
  ) => {
    const ata = findAta({ owner, mint });
    createTokenAccount(ata, mint, owner, balance);
    return ata;
  };

  const createTx = async (
    instructions: RoArray<Ix>,
    feePayer:     Address | KeyPairSigner,
    alts:         RoArray<Address> = [],
  ) => {
    const altDict =
      zip([alts, await forkSvm.getAccount(alts)])
      .reduce((acc, [altAddr, altInfo]) => {
          acc[altAddr] = deserialize(
            addressLookupTableLayout,
            definedOrThrow(altInfo?.data)
          ).addresses as Address[];
          return acc;
        },
        {} as AddressesByLookupTableAddress
      );

    const feePayerAddress = typeof feePayer === "string" ? feePayer : feePayer.address;

    return pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(feePayerAddress, tx),
      (tx) => appendTransactionMessageInstructions(instructions, tx),
      (tx) => compressTransactionMessageUsingAddressLookupTables(tx, altDict),
    );
  };

  const sendTx = async (
    tx:                TxMsgWithFeePayer,
    feePayer:          KeyPairSigner,
    additionalSigners: RoArray<KeyPairSigner> = [],
  ) => {
    const signature = await addLifetimeAndSendTx(tx, [feePayer, ...additionalSigners]);
    const txMetadata = forkSvm.getTransaction(base58.decode(signature));
    if (!txMetadata)
      throw new Error(`Transaction ${signature} not found`);

    if ("err" in txMetadata)
      throw new Error(`Transaction failed: ${txMetadata.toString()}`);

    return txMetadata;
  };

  const createAndSendTx = (
    instructions:      RoArray<Ix>,
    feePayer:          KeyPairSigner,
    additionalSigners: RoArray<KeyPairSigner> = [],
    alts:              RoArray<Address> = [],
  ) =>
    createTx(instructions, feePayer, alts).then(tx => sendTx(tx, feePayer, additionalSigners));

  return {
    minimumBalanceForRentExemption,
    getAccountInfo,
    getDeserializedAccount,
    getMint,
    getTokenAccount,
    getBalance,
    getTokenBalance,
    airdrop,
    createAccount,
    createMint,
    createTokenAccount,
    createAta,
    createTx,
    sendTx,
    createAndSendTx,
  };
};

