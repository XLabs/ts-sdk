import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Address, Lamports, Signature, Blockhash } from "@solana/kit";
import { serialize } from "@xlabs-xyz/binary-layout";
import {
  address,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  generateKeyPair,
  generateKeyPairSigner,
  getAddressFromPublicKey,
} from "@solana/kit";
import { base58 } from "@xlabs-xyz/utils";
import { Amount, kind } from "@xlabs-xyz/amount";
import { Sol, sol } from "@xlabs-xyz/common";
import {
  tokenProgramId,
  systemProgramId,
  mintAccountLayout,
  tokenAccountLayout,
  findAta,
  nativeMint,
} from "@xlabs-xyz/svm";
import { ForkSvm } from "../src/forkSvm.js";
import { assertTxSuccess, createCurried } from "../src/utils.js";

// Helper to create a test account
const createTestAccount = (lamports: bigint, data: Uint8Array, owner: Address) => ({
  lamports: lamports as Lamports, // Lamports is a nominal type
  data,
  owner,
  executable: false,
  space: BigInt(data.length),
});

// Helper to create a mint account
const createMintAccount = (mintAuthority: Address, supply = 0n) => {
  const layout = mintAccountLayout();
  const data = serialize(layout, {
    mintAuthority,
    supply,
    decimals: 9,
    isInitialized: true,
    freezeAuthority: undefined, // cOptionItem custom property transforms undefined
  });
  return createTestAccount(1000000n, data, tokenProgramId);
};

// Helper to create a token account
const createTokenAccount = (mint: Address, owner: Address, amount: bigint) => {
  const layout = tokenAccountLayout();
  const data = serialize(layout, {
    mint,
    owner,
    amount: amount as Lamports, // Token amount uses Lamports type
    delegate: undefined, // cOptionItem custom property transforms undefined
    state: "Initialized",
    isNative: undefined, // cOptionItem custom property transforms undefined
    delegatedAmount: 0n as Lamports,
    closeAuthority: undefined, // cOptionItem custom property transforms undefined
  });
  return createTestAccount(1000000n, data, tokenProgramId);
};

// Helper to create a signed transaction (without sending)
const createSignedTransaction =
  async (forkSvm: ForkSvm, payer: Address, keypair: CryptoKeyPair) => {
    const blockhashStr = forkSvm.latestBlockhash();
    const slot = forkSvm.latestSlot();
    const blockhash = { blockhash: blockhashStr as Blockhash, lastValidBlockHeight: slot };
    const message = createTransactionMessage({ version: "legacy" });
    const messageWithPayer = setTransactionMessageFeePayer(payer, message);
    const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(blockhash, messageWithPayer);
    const compiled = compileTransaction(messageWithLifetime);
    return await signTransaction([keypair], compiled);
  };

// Helper to create a transaction and get its signature
const createAndSendTransaction =
  async (forkSvm: ForkSvm, payer: Address, keypair: CryptoKeyPair) => {
    const signed = await createSignedTransaction(forkSvm, payer, keypair);
    const tx = await forkSvm.sendTransaction(signed);
    return { tx, meta: tx, signature: base58.encode(tx.signature()) as Signature };
  };

// Helper to create a base64-encoded wire transaction for RPC calls
const createWireTransaction =
  async (forkSvm: ForkSvm, payer: Address, keypair: CryptoKeyPair) => {
    const signed = await createSignedTransaction(forkSvm, payer, keypair);
    return getBase64EncodedWireTransaction(signed);
  };

// Helper to setup token accounts
const setupTokenAccounts =
  async (forkSvm: ForkSvm, payer: Address, mint: Address, tokenAccount: Address, amount: bigint) => {
    await forkSvm.airdrop(payer, 1000000n);
    forkSvm.setAccount(mint, createMintAccount(payer));
    forkSvm.setAccount(tokenAccount, createTokenAccount(mint, payer, amount));
  };

// Helper to test unavailable field access
const testUnavailableField = (
  getValue: () => any,
  fieldPath: string,
  fieldName: string
) => {
  it(`should throw when accessing ${fieldPath}`, () => {
    assert.throws(
      () => {
        // Access the value - this should return the Proxy
        const val = getValue();
        // Try multiple ways to access properties to trigger the Proxy trap
        // This should throw immediately on any property access
        if (val && typeof val === 'object') {
          // Try accessing as array index
          const _ = val[0];
          // Try accessing as object property
          const __ = val.test;
          // Try accessing length (common for arrays)
          const ___ = val.length;
        }
      },
      (err: Error) => {
        return err.message.includes(`${fieldName} is not provided by ForkSvm`);
      }
    );
  });
};

describe("ForkSvm", () => {
  let forkSvm: ForkSvm;
  let payer: Address;
  let payerKeypair: CryptoKeyPair;
  let mint: Address;
  let tokenAccount: Address;
  const nonExistentAddress = address("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");

  beforeEach(async () => {
    forkSvm = new ForkSvm();
    payerKeypair = await generateKeyPair();
    payer = await getAddressFromPublicKey(payerKeypair.publicKey);
    mint = address("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So");
    tokenAccount = findAta({ owner: payer, mint });
  });

  describe("constructor", () => {
    it("should create a ForkSvm instance with default settings", () => {
      const instance = new ForkSvm();
      assert(instance instanceof ForkSvm);
    });

    it("should create a ForkSvm instance with custom settings", () => {
      const instance = new ForkSvm({
        url: "https://api.mainnet-beta.solana.com",
        withDefaultPrograms: false,
        withSysvars: false,
        withBuiltins: false,
      });
      assert(instance instanceof ForkSvm);
    });
  });

  describe("save and load", () => {
    it("should save and load a snapshot", async () => {
      const balance = 10n**9n;
      await forkSvm.airdrop(payer, balance);
      forkSvm.setAccount(mint, createMintAccount(payer));

      const snapshot = forkSvm.save();
      assert(snapshot.settings);
      assert(snapshot.accounts);
      assert(snapshot.clock);

      const newForkSvm = ForkSvm.load(snapshot);
      const account = await newForkSvm.getAccount(payer);
      assert(account);
      assert.strictEqual(account.lamports, balance);
    });
  });

  describe("getAccount", () => {
    it("should return account info for a single address", async () => {
      await forkSvm.airdrop(payer, 5000n);
      const account = await forkSvm.getAccount(payer);
      assert(account);
      assert.strictEqual(account.lamports, 5000n);
    });

    it("should return account info for multiple addresses", async () => {
      const keypair2 = await generateKeyPair();
      const payer2 = await getAddressFromPublicKey(keypair2.publicKey);
      await forkSvm.airdrop(payer, 1000n);
      await forkSvm.airdrop(payer2, 2000n);

      const accounts = await forkSvm.getAccount([payer, payer2]);
      assert(Array.isArray(accounts));
      assert.strictEqual(accounts.length, 2);
      assert.strictEqual(accounts[0]?.lamports, 1000n);
      assert.strictEqual(accounts[1]?.lamports, 2000n);
    });

    it("should return token account data", async () => {
      await setupTokenAccounts(forkSvm, payer, mint, tokenAccount, 1000n);

      const account = await forkSvm.getAccount(tokenAccount);
      assert(account);
      assert.strictEqual(account.owner, tokenProgramId);
      assert(account.data.length > 0);
    });
  });

  describe("airdrop", () => {
    it("should airdrop lamports to an address", async () => {
      await forkSvm.airdrop(payer, 10000n);
      const account = await forkSvm.getAccount(payer);
      assert(account);
      assert.strictEqual(account.lamports, 10000n);
    });
  });

  describe("setClock", () => {
    it("should set the clock timestamp and slot", () => {
      const timestamp = new Date("2024-01-01T00:00:00Z");
      const slot = 100n;
      forkSvm.setClock(timestamp, slot);

      const clockTimestamp = forkSvm.latestTimestamp();
      const clockSlot = forkSvm.latestSlot();

      assert.strictEqual(clockTimestamp.getTime(), timestamp.getTime());
      assert.strictEqual(clockSlot, slot);
    });
  });

  describe("sendTransaction", () => {
    it("should send a transaction and return metadata", async () => {
      await forkSvm.airdrop(payer, 1000000n);
      const { tx } = await createAndSendTransaction(forkSvm, payer, payerKeypair);

      assert(tx);
      assert(typeof tx.signature === 'function');
      assert(typeof tx.logs === 'function');
      assert(typeof tx.computeUnitsConsumed === 'function');
    });
  });

  describe("simulateTransaction", () => {
    it("should simulate a transaction and return metadata", async () => {
      await forkSvm.airdrop(payer, 1000000n);
      const signed = await createSignedTransaction(forkSvm, payer, payerKeypair);

      const result = await forkSvm.simulateTransaction(signed);
      assert(result);
      assert(typeof result.logs === 'function');
      assert(typeof result.computeUnitsConsumed === 'function');
      const logs = result.logs();
      assert(Array.isArray(logs));
    });
  });

  describe("RPC client", () => {
    let rpc: any; // RPC client type is complex, using any for tests

    beforeEach(() => {
      rpc = forkSvm.createForkRpc();
    });

    describe("getAccountInfo", () => {
      it("should return account info via RPC", async () => {
        await forkSvm.airdrop(payer, 5000n);

        const accountInfo = await rpc.getAccountInfo(payer, { encoding: "base64" }).send();

        assert(accountInfo.value);
        assert.strictEqual(accountInfo.value.lamports, 5000n);
        assert(accountInfo.value.data);
      });

      it("should return null for non-existent account", async () => {
        const accountInfo =
          await rpc.getAccountInfo(nonExistentAddress, { encoding: "base64" }).send();
        assert.strictEqual(accountInfo.value, null);
      });

      it("should return token account info", async () => {
        await setupTokenAccounts(forkSvm, payer, mint, tokenAccount, 5000n);

        const accountInfo = await rpc.getAccountInfo(tokenAccount, { encoding: "base64" }).send();

        assert(accountInfo.value);
        assert.strictEqual(accountInfo.value.owner, tokenProgramId);
      });
    });

    describe("getMultipleAccounts", () => {
      it("should return multiple account infos via RPC", async () => {
        const keypair2 = await generateKeyPair();
        const payer2 = await getAddressFromPublicKey(keypair2.publicKey);
        await forkSvm.airdrop(payer, 1000n);
        await forkSvm.airdrop(payer2, 2000n);

        const accounts =
          await rpc.getMultipleAccounts([payer, payer2], { encoding: "base64" }).send();

        assert.strictEqual(accounts.value.length, 2);
        assert(accounts.value[0]);
        assert.strictEqual(accounts.value[0]?.lamports, 1000n);
        assert(accounts.value[1]);
        assert.strictEqual(accounts.value[1]?.lamports, 2000n);
      });
    });

    describe("getBalance", () => {
      it("should return account balance via RPC", async () => {
        await forkSvm.airdrop(payer, 7500n);

        const balance = await rpc.getBalance(payer).send();

        assert.strictEqual(balance.value, 7500n);
      });

      it("should return 0 for non-existent account", async () => {
        const balance = await rpc.getBalance(nonExistentAddress).send();
        assert.strictEqual(balance.value, 0n);
      });
    });

    describe("getLatestBlockhash", () => {
      it("should return latest blockhash via RPC", async () => {
        const blockhash = await rpc.getLatestBlockhash().send();

        assert(blockhash.value.blockhash);
        assert(typeof blockhash.value.blockhash === "string");
        assert(typeof blockhash.value.lastValidBlockHeight === "bigint");
      });
    });

    describe("sendTransaction", () => {
      it("should send a transaction and return a signature", async () => {
        await forkSvm.airdrop(payer, 1000000n);
        const wireTx = await createWireTransaction(forkSvm, payer, payerKeypair);

        const signature = await rpc.sendTransaction(wireTx, { encoding: "base64" }).send();

        assert(signature, `Expected signature but got: ${signature}`);
        assert(typeof signature === "string", `Expected string but got type: ${typeof signature}, value: ${signature}`);

        // Decode the base58 signature to verify it's 64 bytes
        const signatureBytes = base58.decode(signature);
        assert.strictEqual(signatureBytes.length, 64, `Expected signature to decode to 64 bytes but got: ${signatureBytes.length}`);
      });
    });

    describe("simulateTransaction", () => {
      it("should simulate a successful transaction", async () => {
        await forkSvm.airdrop(payer, 1000000n);
        const wireTx = await createWireTransaction(forkSvm, payer, payerKeypair);

        const result = await rpc.simulateTransaction(wireTx, { encoding: "base64" }).send();

        assert.strictEqual(result.value.err, null);
        assert(Array.isArray(result.value.logs));
        assert(typeof result.value.unitsConsumed === "bigint");
      });

      it("should include innerInstructions when requested", async () => {
        await forkSvm.airdrop(payer, 1000000n);
        const wireTx = await createWireTransaction(forkSvm, payer, payerKeypair);

        const result = await rpc.simulateTransaction(wireTx, {
          encoding: "base64",
          innerInstructions: true,
        }).send();

        assert.strictEqual(result.value.err, null);
        assert(result.value.innerInstructions === null || Array.isArray(result.value.innerInstructions));
      });
    });

    describe("getTransaction", () => {
      it("should return transaction metadata for a sent transaction", async () => {
        await forkSvm.airdrop(payer, 1000000n);
        const { signature } = await createAndSendTransaction(forkSvm, payer, payerKeypair);

        const response = await rpc.getTransaction(signature, { encoding: "base64" }).send();
        const result = (response as any).value ?? response;

        assert(result);
        assert.strictEqual(result.slot, forkSvm.latestSlot());
        assert(result.meta);
        assert.strictEqual(result.meta.err, null);
        assert(Array.isArray(result.meta.logMessages));
      });

      it("should return null for non-existent transaction", async () => {
        const fakeSignature = base58.encode(new Uint8Array(64).fill(1)) as Signature;
        const result = await rpc.getTransaction(fakeSignature, { encoding: "base64" }).send();
        assert.strictEqual(result, null);
      });
    });

    describe("unavailable fields", () => {
      let transactionResult: any;

      beforeEach(async () => {
        await forkSvm.airdrop(payer, 1000000n);
        const { signature } = await createAndSendTransaction(forkSvm, payer, payerKeypair);
        const response = await rpc.getTransaction(signature, { encoding: "base64" }).send();
        assert(response, "getTransaction should return a result");
        // Handle both wrapped and unwrapped responses
        transactionResult = (response as any).value ?? response;
        assert(transactionResult, "transaction result should exist");
        assert(transactionResult.meta, "meta should exist on transaction result");
      });

      testUnavailableField(
        () => transactionResult.transaction,
        "transaction",
        "transaction"
      );

      testUnavailableField(
        () => transactionResult.meta.fee,
        "meta.fee",
        "fee"
      );

      testUnavailableField(
        () => transactionResult.meta.preBalances,
        "meta.preBalances",
        "preBalances"
      );

      testUnavailableField(
        () => transactionResult.meta.preBalances[0],
        "meta.preBalances[0]",
        "preBalances"
      );

      testUnavailableField(
        () => transactionResult.meta.postBalances,
        "meta.postBalances",
        "postBalances"
      );

      testUnavailableField(
        () => transactionResult.meta.preTokenBalances,
        "meta.preTokenBalances",
        "preTokenBalances"
      );

      testUnavailableField(
        () => transactionResult.meta.postTokenBalances,
        "meta.postTokenBalances",
        "postTokenBalances"
      );

      testUnavailableField(
        () => transactionResult.meta.rewards,
        "meta.rewards",
        "rewards"
      );
    });

    describe("encoding validation", () => {
      it("should reject non-base64 encoding for getAccountInfo", async () => {
        await assert.rejects(
          () => rpc.getAccountInfo(payer, { encoding: "base58" } as any).send(),
          /Unsupported encoding: base58, expected "base64"/
        );
      });

      it("should reject non-base64 encoding for getMultipleAccounts", async () => {
        await assert.rejects(
          () => rpc.getMultipleAccounts([payer], { encoding: "base58" } as any).send(),
          /Unsupported encoding: base58, expected "base64"/
        );
      });
    });
  });
});

const TestToken = kind(
  "TestToken",
  [ { symbols: [{ symbol: "TOK"  }] },
    { symbols: [{ symbol: "µTOK" }], oom:  -6 } ],
  { human: "TOK", atomic: "µTOK" },
);

describe("forkSvm utils", () => {
  let forkSvm: ForkSvm;
  let mint: Address;
  let curried: ReturnType<typeof createCurried>;

  beforeEach(async () => {
    forkSvm = new ForkSvm();
    mint = (await generateKeyPairSigner()).address;
    curried = createCurried(forkSvm);
  });

  describe("assertTxSuccess", () => {
    it("should return metadata on success", async () => {
      const signer = await generateKeyPairSigner();
      await forkSvm.airdrop(signer.address, 10n ** 9n);

      const metadata = await assertTxSuccess(
        curried.createAndSendTx([], signer)
      );

      assert(metadata);
      assert(typeof metadata.computeUnitsConsumed === "function");
    });

    it("should throw FailedTransactionMetadata on failure", async () => {
      const signer = await generateKeyPairSigner();
      // No airdrop - transaction will fail due to insufficient funds for fee

      await assert.rejects(
        assertTxSuccess(curried.createAndSendTx([], signer)),
        (err: Error) => err.message.includes("tx should succeed but failed")
      );
    });
  });

  describe("createCurried without solKind", () => {
    it("should create accounts with bigint lamports", async () => {
      const { address: addr } = await generateKeyPairSigner();

      curried.createAccount(
        addr,
        new Uint8Array(0),
        systemProgramId,
        1_000_000n as Lamports
      );

      const account = await forkSvm.getAccount(addr);
      assert(account);
      assert.strictEqual(account.lamports, 1_000_000n);
    });

    it("should get balance as bigint", async () => {
      const { address: addr } = await generateKeyPairSigner();
      await forkSvm.airdrop(addr, 5_000_000n);

      const balance = await curried.getBalance(addr);

      assert.strictEqual(balance, 5_000_000n);
    });

    it("should return 0n for non-existent account balance", async () => {
      const { address: addr } = await generateKeyPairSigner();

      const balance = await curried.getBalance(addr);
      assert.strictEqual(balance, 0n);
    });

    it("should create and send transactions", async () => {
      const signer = await generateKeyPairSigner();
      await forkSvm.airdrop(signer.address, 10n ** 9n);

      const metadata = await curried.createAndSendTx([], signer);

      assert(metadata);
      const logs = metadata.logs();
      assert(Array.isArray(logs));
    });
  });

  describe("createCurried with solKind (Amount support)", () => {
    it("should create accounts with Amount lamports", async () => {
      const { address: addr } = await generateKeyPairSigner();
      const curried = createCurried(forkSvm, Sol);

      curried.createAccount(
        addr,
        new Uint8Array(0),
        systemProgramId,
        sol(1),
      );

      const account = await forkSvm.getAccount(addr);
      assert(account);
      assert.strictEqual(account.lamports, 10n ** 9n);
    });

    it("should get balance as Amount when kind is passed", async () => {
      const { address: addr } = await generateKeyPairSigner();
      await forkSvm.airdrop(addr, 10n ** 9n);

      const curried = createCurried(forkSvm, Sol);
      const balance = await curried.getBalance(addr);

      assert(balance instanceof Amount);
      assert.strictEqual(balance.in("atomic"), 10n ** 9n);
    });

    it("should return zero Amount for non-existent account when solKind provided", async () => {
      const { address: addr } = await generateKeyPairSigner();
      const curried = createCurried(forkSvm, Sol);
      const balance = await curried.getBalance(addr);

      assert(balance instanceof Amount);
      assert.strictEqual(balance.in("atomic"), 0n);
    });
  });

  describe("createAta", () => {
    it("should create ATA with bigint balance", async () => {
      const { address: owner } = await generateKeyPairSigner();
      forkSvm.setAccount(mint, createMintAccount(owner));

      const ata = curried.createAta(owner, mint, 1000n);

      const account = await forkSvm.getAccount(ata);
      assert(account);
      assert.strictEqual(account.owner, tokenProgramId);
    });

    it("should create native SOL ATA with rent + balance", async () => {
      const { address: owner } = await generateKeyPairSigner();
      forkSvm.setAccount(nativeMint, createMintAccount(owner));

      const tokenBalance = 500_000n;
      const ata = curried.createAta(owner, nativeMint, tokenBalance);

      const account = await forkSvm.getAccount(ata);
      assert(account);
      // Native SOL ATAs have lamports = rent + token balance
      assert(account.lamports > tokenBalance);
    });
  });

  describe("getTokenBalance", () => {
    it("should get token balance as bigint", async () => {
      const { address: owner } = await generateKeyPairSigner();
      forkSvm.setAccount(mint, createMintAccount(owner));

      const tokenAmount = 42_000_000n;
      const ata = curried.createAta(owner, mint, tokenAmount);

      const balance = await curried.getTokenBalance()(ata);
      assert.strictEqual(balance, tokenAmount);
    });

    it("should get token balance as Amount with kind", async () => {
      const { address: owner } = await generateKeyPairSigner();
      forkSvm.setAccount(mint, createMintAccount(owner));

      const atomicAmount = 42_000_000n;
      const ata = curried.createAta(owner, mint, atomicAmount);

      const balance = await curried.getTokenBalance(TestToken)(ata);

      assert(balance instanceof Amount);
      assert.strictEqual(balance.in("atomic"), atomicAmount);
    });

    it("should return 0 for non-existent token account", async () => {
      const { address: addr } = await generateKeyPairSigner();

      const balance = await curried.getTokenBalance()(addr);
      assert.strictEqual(balance, 0n);
    });
  });

  describe("createTx and sendTx", () => {
    it("should create transaction with fee payer address", async () => {
      const signer = await generateKeyPairSigner();
      const addr = signer.address;
      await forkSvm.airdrop(addr, 10n ** 9n);

      const tx = await curried.createTx([], addr);

      assert(tx);
      assert.strictEqual(tx.feePayer.address, addr);
    });

    it("should create transaction with KeyPairSigner", async () => {
      const signer = await generateKeyPairSigner();
      await forkSvm.airdrop(signer.address, 10n ** 9n);

      const tx = await curried.createTx([], signer);

      assert(tx);
      assert.strictEqual(tx.feePayer.address, signer.address);
    });

    it("should send transaction and return metadata", async () => {
      const signer = await generateKeyPairSigner();
      await forkSvm.airdrop(signer.address, 10n ** 9n);

      const tx = await curried.createTx([], signer);
      const metadata = await curried.sendTx(tx, signer);

      assert(metadata);
      assert(typeof metadata.signature === "function");
    });
  });

  describe("getMint and getTokenAccount", () => {
    it("should get mint account", async () => {
      const { address: owner } = await generateKeyPairSigner();
      forkSvm.setAccount(mint, createMintAccount(owner, 1_000_000n));

      const mintData = await curried.getMint()(mint);

      assert(mintData);
      assert.strictEqual(mintData.mintAuthority, owner);
      assert.strictEqual(mintData.supply, 1_000_000n as Lamports);
      assert.strictEqual(mintData.decimals, 9);
    });

    it("should get token account", async () => {
      const { address: owner } = await generateKeyPairSigner();
      forkSvm.setAccount(mint, createMintAccount(owner));

      const ata = curried.createAta(owner, mint, 500n);

      const tokenAccount = await curried.getTokenAccount()(ata);

      assert(tokenAccount);
      assert.strictEqual(tokenAccount.mint, mint);
      assert.strictEqual(tokenAccount.owner, owner);
      assert.strictEqual(tokenAccount.amount, 500n as Lamports);
    });
  });
});
