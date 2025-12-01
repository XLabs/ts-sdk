import type {
  Address,
  Transaction,
  RpcApi,
  RpcTransport,
  RpcPlan,
  Signature,
  Base64EncodedWireTransaction,
} from "@solana/kit";
import {
  DEFAULT_RPC_CONFIG,
  createSolanaRpc,
  createRpc,
  createSolanaRpcApi,
  getTransactionDecoder,
} from "@solana/kit";
import { isJsonRpcPayload } from "@solana/rpc-spec";
import type { RoArray, MaybeArray, Function } from "@xlabs-xyz/const-utils";
import { zip, mapTo, isArray, omit } from "@xlabs-xyz/const-utils";
import { base58, base64, definedOrThrow } from "@xlabs-xyz/utils";
import { deserialize } from "@xlabs-xyz/binary-layout";
import {
  svmAddressItem,
  addressLookupTableLayout,
  bpfLoaderUpgradeableProgramId,
  addressSize,
  signatureSize,
  svmMaxTxSize,
  minimumBalanceForRentExemption,
} from "@xlabs-xyz/svm";
import {
  LiteSVM,
  TransactionMetadata,
  FailedTransactionMetadata,
} from "./liteSvm.js";
import type { MaybeSvmAccInfo } from "./details.js";
import {
  builtInSet,
  sysvarSet,
  defProgSet,
  kitAccountToLiteSvmAccount,
  liteSvmAccountToKitAccount,
  emptyAccountInfo,
  decodeCompiledTransactionMessage,
} from "./details.js";

export type InnerInstruction = ReturnType<TransactionMetadata["innerInstructions"]>[number][number];
export type CompiledInstruction = ReturnType<InnerInstruction["instruction"]>;
export type TransactionReturnData = ReturnType<TransactionMetadata["returnData"]>;
export { TransactionMetadata, FailedTransactionMetadata } from "./liteSvm.js";

type Rpc = ReturnType<typeof createSolanaRpc>;
export type Settings = {
  url:                 string | undefined;
  withDefaultPrograms: boolean;
  withSysvars:         boolean;
  withBuiltins:        boolean;
};

export type Clock = Readonly<{
  timestamp:           Date;
  slot:                bigint;
  epoch:               bigint;
  epochStartTimestamp: bigint;
  leaderScheduleEpoch: bigint;
}>;

export type Snapshot = Readonly<{
  settings: Readonly<Settings>;
  accounts: Readonly<Record<Address, MaybeSvmAccInfo>>;
  clock:    Clock;
}>;

export class ForkSvm {
  private settings: Settings;

  private rpc: Rpc | undefined;
  private liteSvm: LiteSVM;
  private addresses: { known: Set<Address>, special: Set<Address> };

  constructor(
    settings?: Partial<{
      url:                 string | undefined,
      withDefaultPrograms: boolean;
      withSysvars:         boolean;
      withBuiltins:        boolean;
    }>,
  ) {
    const { url, withDefaultPrograms = true, withSysvars = true, withBuiltins = true } =
      settings ?? {};
    this.settings  = { url: url ?? undefined, withDefaultPrograms, withSysvars, withBuiltins };
    this.rpc       = url !== undefined ? createSolanaRpc(url) : undefined;
    this.liteSvm   = new LiteSVM();
    this.addresses = { known: new Set(), special: new Set() };

    if (withBuiltins) {
      this.liteSvm.withBuiltins();
      this.addresses.special = this.addresses.special.union(builtInSet);
    }
    if (withSysvars) {
      this.liteSvm.withSysvars();
      this.addresses.special = this.addresses.special.union(sysvarSet);
    }
    if (withDefaultPrograms) {
      this.liteSvm.withDefaultPrograms();
      this.addresses.special = this.addresses.special.union(defProgSet);
    }
  }

  static load(snapshot: Snapshot) {
    const forkSvm = new ForkSvm(snapshot.settings);
    forkSvm.load(snapshot);
    return forkSvm;
  }

  save(): Snapshot {
    const { settings } = this;
    const accounts = Object.fromEntries(
      [...this.addresses.known.keys()].map(addr => [addr, this.liteSvm.getAccount(addr)])
    );
    const timestamp           = this.latestTimestamp();
    const liteClock           = this.liteSvm.getClock();
    const slot                = liteClock.slot;
    const epoch               = liteClock.epoch;
    const epochStartTimestamp = liteClock.epochStartTimestamp;
    const leaderScheduleEpoch = liteClock.leaderScheduleEpoch;
    const clock = { timestamp, slot, epoch, epochStartTimestamp, leaderScheduleEpoch };
    return { settings, accounts, clock };
  }

  load(snapshot: Snapshot) {
    const settingNames = Object.keys(snapshot.settings) as (keyof Settings)[];
    for (const settingName of settingNames)
      if (snapshot.settings[settingName] !== this.settings[settingName]) {
        if (settingName === "url")
          this.setRpc(snapshot.settings.url);
        else
          throw new Error(`Restoring snapshots with different settings is not supported`);
      }

    const clear = this.addresses.known.intersection(new Set(Object.keys(snapshot.accounts)));
    for (const addr of clear)
      this.liteSvm.setAccount(addr, emptyAccountInfo);

    this.addresses.known = new Set();
    const executables = [] as [Address, MaybeSvmAccInfo][];
    for (const [addr, acc] of Object.entries(snapshot.accounts))
      if (acc && acc.executable)
        executables.push([addr as Address, acc]);
      else
        this.setAccount(addr as Address, acc);

    const { clock } = snapshot;
    const liteClock = this.liteSvm.getClock();
    liteClock.unixTimestamp       = BigInt(clock.timestamp.getTime() / 1000);
    liteClock.slot                = clock.slot;
    liteClock.epoch               = clock.epoch;
    liteClock.epochStartTimestamp = clock.epochStartTimestamp;
    liteClock.leaderScheduleEpoch = clock.leaderScheduleEpoch;
    this.liteSvm.setClock(liteClock);

    for (const [addr, acc] of executables)
      this.setAccount(addr, acc);
  }

  setRpc(url: string | undefined) {
    this.settings.url = url;
    this.rpc = url !== undefined ? createSolanaRpc(url) : undefined;
  }

  latestTimestamp = () =>
    new Date(Number(this.liteSvm.getClock().unixTimestamp) * 1000);

  latestSlot = () =>
    this.liteSvm.getClock().slot;

  getTransaction = (signature: Uint8Array) =>
    this.liteSvm.getTransaction(signature);

  latestBlockhash = () =>
    this.liteSvm.latestBlockhash();

  expireBlockhash = () =>
    this.liteSvm.expireBlockhash();

  async advanceToNow() {
    if (this.rpc) {
      const [slot, epochInfo] = await Promise.all([
        this.rpc.getSlot().send(),
        this.rpc.getEpochInfo().send(),
      ]);

      const clock = this.liteSvm.getClock();
      clock.slot                = slot;
      clock.unixTimestamp       = await this.rpc.getBlockTime(slot).send();
      clock.epoch               = epochInfo.epoch;
      clock.epochStartTimestamp = clock.unixTimestamp;
      clock.leaderScheduleEpoch = epochInfo.epoch + 1n;
      this.liteSvm.setClock(clock);
    }
  }

  setClock(timestamp?: Date, slot?: bigint) {
    const clock = this.liteSvm.getClock();
    clock.slot = slot ?? clock.slot;
    clock.unixTimestamp = timestamp ? BigInt(timestamp.getTime() / 1000) : clock.unixTimestamp;
    this.liteSvm.setClock(clock);
  }

  async sendTransaction(tx: Transaction): Promise<TransactionMetadata> {
    this.checkTxSize(tx);
    await this.fetchUnfetchedOfTx(tx);
    const result = this.liteSvm.sendTransaction(tx);
    if (result instanceof TransactionMetadata)
      return result;

    throw result;
  }

  async simulateTransaction(tx: Transaction): Promise<TransactionMetadata> {
    this.checkTxSize(tx);
    await this.fetchUnfetchedOfTx(tx);
    const result = this.liteSvm.simulateTransaction(tx);
    if (result instanceof FailedTransactionMetadata)
      throw result;

    return result.meta();
  }

  async getAccount<const A extends MaybeArray<Address>>(addressEs: A) {
    await this.fetchUnfetched(isArray(addressEs) ? addressEs : [addressEs]);
    return mapTo(addressEs)(addr => this.liteSvm.getAccount(addr))
  }

  async airdrop(address: Address, lamports: bigint): Promise<void> {
    await this.getAccount(address);
    this.liteSvm.airdrop(address, lamports);
  }

  addProgram(programId: Address, programBytes: Uint8Array): void {
    this.addresses.known.add(programId);
    this.liteSvm.addProgram(programId, programBytes);
  }

  addProgramFromFile = (programId: Address, path: string): void => {
    this.addresses.known.add(programId);
    this.liteSvm.addProgramFromFile(programId, path);
  };

  setAccount(address: Address, acc: MaybeSvmAccInfo): void {
    this.addresses.known.add(address);
    if (acc) {
      if (acc.space < acc.data.length)
        acc.space = BigInt(acc.data.length);

      if (acc.lamports < minimumBalanceForRentExemption(Number(acc.space)))
        acc.lamports = minimumBalanceForRentExemption(Number(acc.space));
    }
    this.liteSvm.setAccount(address, acc ?? emptyAccountInfo);
  }

  createForkRpc() {
    const baseTransport = this.createForkTransport();
    const baseApi = createSolanaRpcApi(DEFAULT_RPC_CONFIG);
    const recursivelyWrapUnavailable = (value: any): any =>
      value === null || value === undefined
      ? value
      : typeof value !== 'object'
      ? value
      : value.__unavailable === true && typeof value.__feature === 'string'
      ? new Proxy({}, {
          get: () => { throw new Error(`${value.__feature} is not provided by ForkSvm`); }
        })
      : Array.isArray(value)
      ? value.map(v => recursivelyWrapUnavailable(v))
      : Object.entries(value).reduce((wrapped, [key, val]) => {
          wrapped[key] = recursivelyWrapUnavailable(val);
          return wrapped;
        }, {} as any);

    //we wrap the api to transform our unavailable fields into proxies that throw when accessed
    const wrappedApi = new Proxy(baseApi, {
      defineProperty() {
        return false;
      },
      deleteProperty() {
        return false;
      },
      get(target, prop, receiver) {
        const originalPlanGetter = Reflect.get(target, prop, receiver);
        if (typeof originalPlanGetter !== 'function')
          return originalPlanGetter;

        return function(...args: unknown[]) {
          const originalPlan = originalPlanGetter(...args) as RpcPlan<any>;

          return {
            ...originalPlan,
            execute: async (options: Parameters<typeof originalPlan.execute>[0]) => {
              const response = await originalPlan.execute(options);
              return response === null
                ? null
                : (response && typeof response === 'object' &&
                  'value' in response && 'context' in response)
                ? { context: response.context, value: recursivelyWrapUnavailable(response.value) }
                : recursivelyWrapUnavailable(response);
            },
          };
        };
      },
    }) as RpcApi<any>;

    return createRpc({
      api: wrappedApi,
      transport: baseTransport,
    });
  }

  //see https://solana.com/docs/rpc/http
  private createForkTransport(): RpcTransport {
    const responseWithContext = <const T>(value: T) =>
      ({ value, context: { apiVersion: "3.0.11", slot: Number(this.latestSlot()) } } as const);

    const transactionDecoder = getTransactionDecoder();

    const decodeWireTransaction = (wireTx: Base64EncodedWireTransaction): Transaction =>
      transactionDecoder.decode(base64.decode(wireTx));

    const transactionMetadataToMeta =
      (result: TransactionMetadata | FailedTransactionMetadata) => {
        const succeeded = result instanceof TransactionMetadata;
        const meta = succeeded
          ? result
          : result.meta();

        const err = succeeded
          ? null
          : ({ code: -1, name: "TransactionError", message: result.toString() });

        const status = succeeded
          ? { Ok: null }
          : { Err: result.toString() };

        const returnData = succeeded
          ? ((result: TransactionMetadata) => {
              const rd = result.returnData();
              return {
                programId: base58.encode(rd.programId()),
                data:      [base64.encode(rd.data()), "base64"],
              }
            })(result)
          : null;

        const innerInstructions = succeeded
          ? ((result: TransactionMetadata) => {
              const innerInstructions = result.innerInstructions();
              return innerInstructions.length > 0
                ? innerInstructions.map((inner: any[], index: number) => ({
                    index,
                    instructions: inner.map((inst: any) => {
                      const compiled = inst.instruction();
                      return {
                        programIdIndex: compiled.programIdIndex(),
                        accounts:       Array.from(compiled.accounts()),
                        data:           base58.encode(compiled.data()),
                        stackHeight:    inst.stackHeight(),
                      };
                    }),
                  }))
                : null;
            })(result)
          : null;

        return {
          logMessages:          meta.logs(),
          computeUnitsConsumed: meta.computeUnitsConsumed(),
          err,
          innerInstructions,
          status,
          ...(returnData !== null && { returnData }),
        };
      };

    //magic value that will be converted to throwing proxy after JSON serialization
    const unavailable = (feature: string) => ({
      __unavailable: true as const,
      __feature: feature,
    });

    const transactionMetadataToRpcResponse =
      (result: TransactionMetadata | FailedTransactionMetadata) => {
        const slot = this.latestSlot();
        const blockTime = Number(this.latestTimestamp().getTime() / 1000);
        const transaction = unavailable("transaction");
        const meta = {
          fee:               unavailable("fee"),
          preBalances:       unavailable("preBalances"),
          postBalances:      unavailable("postBalances"),
          preTokenBalances:  unavailable("preTokenBalances"),
          postTokenBalances: unavailable("postTokenBalances"),
          rewards:           unavailable("rewards"),
          ...transactionMetadataToMeta(result),
        };
        return { slot, blockTime, transaction, meta };
      };

    const checkEncoding =
      <F extends Function>(f: F) =>
        (val: Parameters<F>[0], config?: { encoding?: string }): ReturnType<F> => {
          if (config?.encoding !== "base64" && config?.encoding !== undefined)
            throw new Error(`Unsupported encoding: ${config.encoding}, expected "base64"`);

          return f(val, config ? omit(config as any, "encoding") : undefined) as ReturnType<F>;
        }

    const supportedMethods = {
      getAccountInfo: checkEncoding(
        (address: Address) =>
          this.getAccount(address)
            .then(liteSvmAccountToKitAccount)
            .then(responseWithContext)
      ),

      getMultipleAccounts: checkEncoding(
        (addresses: RoArray<Address>) =>
          this.getAccount(addresses)
            .then(accs => accs.map(liteSvmAccountToKitAccount))
            .then(responseWithContext)
      ),

      getBalance: (address: Address) =>
        this.getAccount(address)
          .then(account => account?.lamports ?? 0n)
          .then(responseWithContext),

      getLatestBlockhash: () => Promise.resolve(
        responseWithContext({
          blockhash:            this.latestBlockhash(),
          lastValidBlockHeight: this.latestSlot(),
        })
      ),

      sendTransaction: checkEncoding(
        (wireTx: Base64EncodedWireTransaction) =>
          this.sendTransaction(decodeWireTransaction(wireTx))
            .then(meta => base58.encode(meta.signature()) as Signature)
      ),

      simulateTransaction: checkEncoding(
        (wireTx: Base64EncodedWireTransaction, config?: { innerInstructions?: boolean }) =>
          this.simulateTransaction(decodeWireTransaction(wireTx))
            .catch(error => {
              if (error instanceof FailedTransactionMetadata)
                return error;

              throw error;
            })
            .then(transactionMetadataToMeta)
            .then(meta => ({
              err:           meta.err,
              logs:          meta.logMessages,
              unitsConsumed: meta.computeUnitsConsumed,
              returnData:    meta.returnData ?? null,
              ...(config?.innerInstructions && { innerInstructions: meta.innerInstructions }),
            }))
            .then(responseWithContext)
      ),

      getTransaction: checkEncoding(
        (signature: Signature) => {
          const result = this.getTransaction(base58.decode(signature));
          return Promise.resolve(result ? transactionMetadataToRpcResponse(result) : null);
        }
      ),
    } as Record<string, (...args: any[]) => Promise<any>>;

    return function <TResponse>(transportConfig: Parameters<RpcTransport>[0]): Promise<TResponse> {
      const { payload } = transportConfig;

      if (!isJsonRpcPayload(payload))
        throw new Error(`Unsupported payload: ${payload}`);

      const method = supportedMethods[payload.method];

      if (method === undefined)
        throw new Error(`Unsupported method: ${payload.method}`);

      if (!Array.isArray(payload.params))
        throw new Error(`Unexpected params: ${JSON.stringify(payload.params)}`);

      return method(...payload.params)
        .then((result: any) => ({ jsonrpc: "2.0", result, id: 1 as number })) as Promise<TResponse>;
    };
  }

  private checkTxSize(tx: Transaction): void {
    const size = 1 + Object.keys(tx.signatures).length * signatureSize + tx.messageBytes.length;
    if (size > svmMaxTxSize)
      throw new Error(`Transaction is too large: ${size}/${svmMaxTxSize} bytes`);
  }

  private async fetchUnfetchedOfTx(tx: Transaction): Promise<void> {
    const decompiledTx = decodeCompiledTransactionMessage(tx.messageBytes);
    const accounts = decompiledTx.staticAccounts;
    if (decompiledTx.version === 0 && decompiledTx.addressTableLookups !== undefined) {
      const addressTableLookups = decompiledTx.addressTableLookups!;
      await this.fetchUnfetched(addressTableLookups!.map(lt => lt.lookupTableAddress));
      for (const lt of addressTableLookups) {
        const { lookupTableAddress: altAddr, readonlyIndexes, writableIndexes } = lt;
        const accInfo = this.liteSvm.getAccount(altAddr);
        if (!accInfo)
          throw new Error(`Couldn't find lookup table: ${altAddr}`);

        const { addresses } = deserialize(addressLookupTableLayout, accInfo.data);
        accounts.push(...[...writableIndexes, ...readonlyIndexes].map(i =>
          definedOrThrow(addresses[i], `Out of bounds index: ${i} for lookup table: ${altAddr}`)
        ));
      }
    }
    return this.fetchUnfetched(accounts);
  }

  private async fetchUnfetched(addresses: RoArray<Address>): Promise<void> {
    const unfetchedAddresses = addresses.filter(addr => this.isUnfetched(addr));
    if (unfetchedAddresses.length === 0)
      return;

    const fetched = zip([await this.fetchFromUpstream(unfetchedAddresses), unfetchedAddresses]);

    //handle upgradable programs:
    //special handling for upgradable programs:
    //  also fetches the program data account from upstream
    //the programId account contains the address of the program data account
    //  (it's a PDA of bpfUpgradeableLoader using the programId as its seed)
    const unfetchedUpgradable = fetched
      .filter(([acc]) => acc?.executable && acc.owner === bpfLoaderUpgradeableProgramId)
      //the first 4 bytes of a bpf upgradeable loader account are the encoded enum type
      //see https://bonfida.github.io/doc-dex-program/solana_program/bpf_loader_upgradeable/enum.UpgradeableLoaderState.html#variant.ProgramData
      .map(([acc, pId]) =>
        [deserialize(svmAddressItem, acc!.data.subarray(4, 4 + addressSize)), pId] as const
      )
      .filter(([bytecodeAddr]) => this.isUnfetched(bytecodeAddr));

    if (unfetchedUpgradable.length > 0) {
      const bytecode = zip([
        await this.fetchFromUpstream(unfetchedUpgradable.map(([bytecodeAddr]) => bytecodeAddr)),
        ...zip(unfetchedUpgradable)
      ]);

      const missing = bytecode.filter(([acc]) => !acc);
      if (missing.length > 0) {
        const str = missing.map(([, bcAddr, pId]) => `(${pId}, ${bcAddr})`).join(", ");
        throw new Error(`Couldn't find bytecode account for (pId, bytecodeAddr): ${str}`);
      }

      //liteSvm requires that we set the bytecode account before setting the programId account
      //  (because it implicitly invokes the bpf upgradeable loader)
      for (const [bcAcc, bcAddr] of bytecode)
        this.setAccount(bcAddr, bcAcc);
    }

    for (const [acc, addr] of fetched)
      this.setAccount(addr, acc);
  }

  private async fetchFromUpstream(addresses: readonly Address[]): Promise<MaybeSvmAccInfo[]> {
    if (addresses.length === 0)
      return [];

    //if we don't have an RPC, we assume that uncached accounts don't exist
    if (!this.rpc)
      return addresses.map(() => null);

    const enc = { encoding: "base64" } as const;
    const rpcCall =
      addresses.length > 1
      ? this.rpc.getMultipleAccounts(addresses as Address[], enc).send().then(res => res.value)
      : this.rpc.getAccountInfo(addresses[0]!, enc).send().then(res => [res.value]);

    return rpcCall.then(res => res.map(kitAccountToLiteSvmAccount));
  }

  private isUnfetched(address: Address) {
    return !this.addresses.special.has(address) && !this.addresses.known.has(address);
  }
}
