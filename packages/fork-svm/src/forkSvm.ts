import type { Address, Transaction, RpcTransport } from "@solana/kit";
import { createSolanaRpc, createSolanaRpcFromTransport } from "@solana/kit";
import { isJsonRpcPayload } from "@solana/rpc-spec";
import { range, zip } from "@xlabs-xyz/const-utils";
import { bpfLoaderUpgradeableProgramId, addressSize, hashSize } from "@xlabs-xyz/svm";
import { LiteSVM, TransactionMetadata } from "./liteSvm.js";
import type { MaybeSvmAccInfo, MaybeKitAccInfo } from "./details.js";
import {
  decodeAddr,
  decodeCompactU16,
  builtInSet,
  sysvarSet,
  defProgSet,
  kitAccountToLiteSvmAccount,
  liteSvmAccountToKitAccount,
  emptyAccountInfo,
} from "./details.js";

export type InnerInstruction = ReturnType<TransactionMetadata["innerInstructions"]>[number][number];
export type CompiledInstruction = ReturnType<InnerInstruction["instruction"]>;
export type TransactionReturnData = ReturnType<TransactionMetadata["returnData"]>;
export { type TransactionMetadata, type FailedTransactionMetadata } from "./liteSvm.js";

type Rpc = ReturnType<typeof createSolanaRpc>;
export type Settings = {
  url:                 string | undefined;
  withDefaultPrograms: boolean;
  withSysvars:         boolean;
  withBuiltins:        boolean;
};

export type Snapshot = Readonly<{
  settings:  Readonly<Settings>;
  accounts:  Readonly<Record<Address, MaybeSvmAccInfo>>;
  timestamp: Date;
  slot:      bigint;
}>;

export class ForkSvm {
  private settings: Settings;

  private rpc: Rpc | undefined;
  private liteSvm: LiteSVM;
  private addresses: { known: Set<Address>, special: Set<Address> };
  
  constructor(
    url?:                string,
    withDefaultPrograms: boolean = true,
    withSysvars:         boolean = true,
    withBuiltins:        boolean = true,
  ) {
    this.settings  = { url, withDefaultPrograms, withSysvars, withBuiltins };
    this.rpc       = url ? createSolanaRpc(url) : undefined;
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
    const forkSvm = new ForkSvm(
      snapshot.settings.url,
      snapshot.settings.withDefaultPrograms,
      snapshot.settings.withSysvars,
      snapshot.settings.withBuiltins
    );
    forkSvm.load(snapshot);
    return forkSvm;
  }

  save(): Snapshot {
    const { settings } = this;
    const accounts = Object.fromEntries(
      [...this.addresses.known.keys()].map(addr => [addr, this.liteSvm.getAccount(addr)])
    );
    const timestamp = this.latestTimestamp();
    const slot = this.latestSlot();
    return { settings, accounts, timestamp, slot };
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
      const clock = this.liteSvm.getClock();
      clock.slot = await this.rpc.getSlot().send();
      clock.unixTimestamp = await this.rpc.getBlockTime(clock.slot).send();
      //only setting the essentials, skipping all the epoch and leader schedule stuff
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
    await this.fetchUnfetchedOfTx(tx);
    const result = this.liteSvm.sendTransaction(tx);
    if (result instanceof TransactionMetadata)
      return result;

    throw result;
  }

  async simulateTransaction(tx: Transaction): Promise<TransactionMetadata> {
    await this.fetchUnfetchedOfTx(tx);
    const result = this.liteSvm.simulateTransaction(tx);
    if (result instanceof TransactionMetadata)
      return result;

    throw result;
  }

  async getAccount(address: Address): Promise<MaybeSvmAccInfo> {
    await this.fetchUnfetched([address]);
    return this.liteSvm.getAccount(address);
  }

  async getMultipleAccounts(addresses: readonly Address[]): Promise<MaybeSvmAccInfo[]> {
    await this.fetchUnfetched(addresses);
    return addresses.map(addr => this.liteSvm.getAccount(addr));
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
    this.liteSvm.setAccount(address, acc ?? emptyAccountInfo);
  }

  createForkRpc() {
    return createSolanaRpcFromTransport(this.createForkTransport());
  }

  createForkTransport(): RpcTransport {
    const createRpcResponse = <const T>(value: T) => ({
      jsonrpc: "2.0",
      result: {
        context: { apiVersion: "2.3.6", slot: Number(this.latestSlot()) },
        value,
      },
      id: 1 as number,
    } as const);

    type SolanaRpcResponse<T> = ReturnType<typeof createRpcResponse<T>>;

    const supportedMethods = {
      getAccountInfo:
        async (address: Address): Promise<SolanaRpcResponse<MaybeKitAccInfo>> =>
          createRpcResponse(liteSvmAccountToKitAccount(await this.getAccount(address))),
      getMultipleAccounts:
        async (addresses: Address[]): Promise<SolanaRpcResponse<MaybeKitAccInfo[]>> =>
          createRpcResponse((await this.getMultipleAccounts(addresses))
            .map(liteSvmAccountToKitAccount)),
    } as const;

    return function <TResponse>(transportConfig: Parameters<RpcTransport>[0]): Promise<TResponse> {
      const { payload } = transportConfig;

      if (!isJsonRpcPayload(payload))
        throw new Error(`Unsupported payload: ${payload}`);

      type PermissiveDict<R extends Record<PropertyKey, unknown>> = Record<string, R[keyof R]>;
      const method = (supportedMethods as PermissiveDict<typeof supportedMethods>)[payload.method];

      if (method === undefined)
        throw new Error(`Unsupported method: ${payload.method}`);

      if (!Array.isArray(payload.params) || payload.params.length < 2)
        throw new Error(`Unexpected params: ${JSON.stringify(payload.params)}`);

      const encoding = payload.params[1]?.encoding;

      if (encoding !== "base64")
        throw new Error(`Missing or unsupported encoding: ${encoding}, expected "base64"`);

      return method(payload.params[0]) as Promise<TResponse>;
    };
  }

  private async fetchUnfetchedOfTx(tx: Transaction): Promise<void> {
    //see https://solanacookbook.com/guides/versioned-transactions
    //backup: https://github.com/solana-developers/solana-cookbook/blob/master/docs/guides/versioned-transactions.md
    //(I deliberately chopped off the .html ending of the solanacookbook link because otherwise
    //  one is redirected to the official, shitty docs whose explanation is far too superficial)
    //We could use getCompiledTransactionMessageDecoder().decode(tx.messageBytes) here but
    //  it is more heavy weight than necessary and we can easily parse what we need ourselves
    const msgBytes = tx.messageBytes;
    const firstByte = msgBytes[0]!;
    const version = (firstByte & 0x80) === 0 ? "legacy" : firstByte & 0x7f;
    if (version !== "legacy" && version !== 0)
      throw new Error(`Unsupported transaction version: ${version}`);

    //for legacy transactions, the first 3 bytes are the header, for v0 transactions
    //  the first byte becomes the version and everything else is bumped back by 1
    let offset = version === "legacy" ? 3 : 4;
    //read static address compact array length and decode the addresses
    let count = msgBytes[offset++]!;
    const staticAddrs = range(count).map(i => decodeAddr(msgBytes, offset + i * addressSize));

    return this.fetchUnfetched(
      version === "legacy"
      ? staticAddrs
      : await (async () => {
        //step over static addresses and the recent blockhash
        offset += count * addressSize + hashSize;

        //step over instructions
        [count, offset] = decodeCompactU16(msgBytes, offset);
        const instructionCount = count;
        for (let i = 0; i < instructionCount; ++i) {
          ++offset; //skip programId index
          [count, offset] = decodeCompactU16(msgBytes, offset);
          offset += count; //skip account indices
          [count, offset] = decodeCompactU16(msgBytes, offset);
          offset += count; //skip instruction data
        }

        //parse all lookup tables of the tx and their associated indices
        const lookupTableCount = msgBytes[offset++]!;
        //early bailout
        if (lookupTableCount === 0)
          return staticAddrs;

        const [lookupTableAddresses, lookupTableIndices] = zip(
          range(lookupTableCount).map(() => { //mutates offset
            const address = decodeAddr(msgBytes, offset);
            offset += addressSize;
            const [wCount, wOffset] = decodeCompactU16(msgBytes, offset);
            offset = wOffset + wCount;
            const [rCount, rOffset] = decodeCompactU16(msgBytes, offset);
            offset = rOffset + rCount;
            const indices = [
              ...range(wCount).map(i => msgBytes[wOffset + i]!),
              ...range(rCount).map(i => msgBytes[rOffset + i]!),
            ];
            return [address, indices] as const;
          })
        );

        //fetch any missing lookup table accounts
        await this.fetchUnfetched(lookupTableAddresses);

        const lookupTableAccInfos = lookupTableAddresses.map(addr => this.liteSvm.getAccount(addr));
        const dynamicAddrs = lookupTableAccInfos.flatMap((accInfo, index) => {
          const address = lookupTableAddresses[index]!;
          const indices = lookupTableIndices[index]!;
          if (!accInfo)
            throw new Error(`Couldn't find lookup table: ${address}`);

          //ALT header is 56 bytes immediately followed by the array of addresses (on length prefix)
          //see here: https://github.com/solana-program/address-lookup-table/blob/740dddc683057a390f0f02e66e4aa1dfa63e96a7/program/src/state.rs#L15
          return indices.map(i => decodeAddr(accInfo.data, 56 + i * addressSize));
        });

        return [...staticAddrs, ...dynamicAddrs];
      })()
    );
  }

  private async fetchUnfetched(addresses: readonly Address[]): Promise<void> {
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
      .map(([acc, pId]) => [decodeAddr(acc!.data, 4), pId] as const)
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
