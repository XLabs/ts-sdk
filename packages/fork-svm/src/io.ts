import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import type { Address } from "@solana/kit";
import { stringifyJsonWithBigInts, parseJsonWithBigInts } from "@solana/rpc-spec-types";
import type { MaybeSvmAccInfo } from "./details.js";
import { base64 } from "./details.js";
import type { Snapshot } from "./forkSvm.js";

const parseJsonAccInfo = (json: string): MaybeSvmAccInfo => {
  const base64AccOrNull: any = parseJsonWithBigInts(json);
  if (base64AccOrNull?.data)
    base64AccOrNull.data = base64.encode(base64AccOrNull.data) as Uint8Array;
  return base64AccOrNull as MaybeSvmAccInfo;
};

const stringifyJsonAccInfo = (acc: MaybeSvmAccInfo): string =>
  stringifyJsonWithBigInts(acc ? { ...acc, data: base64.decode(acc.data) } : null);

const toPaths = (filepath: string) => {
  const basepath = filepath + (filepath.endsWith("/") ? "" : "/");
  return {
    accountsPath: basepath + "accounts/",
    metaFilename: basepath + "meta.json",
  };
};

const utf8 = { encoding: "utf8" } as const;

export async function writeToDisc(filepath: string, snapshot: Snapshot): Promise<void> {
  const { accountsPath, metaFilename } = toPaths(filepath);

  const meta = {
    settings:  snapshot.settings,
    timestamp: snapshot.timestamp.toISOString(),
    slot:      snapshot.slot,
  } as const;

  await Promise.all([
    mkdir(accountsPath, { recursive: true }),
    writeFile(metaFilename, stringifyJsonWithBigInts(meta), utf8),
  ]);

  await Promise.all(Object.entries(snapshot.accounts).map(([addr, acc]) =>
    writeFile(accountsPath + addr + ".json", stringifyJsonAccInfo(acc), utf8)
  ));
}

export async function readFromDisc(filepath: string): Promise<Snapshot> {
  const { accountsPath, metaFilename } = toPaths(filepath);

  const [parsedMeta, accountFilenames] = await Promise.all([
    readFile(metaFilename, utf8).then(parseJsonWithBigInts) as Promise<any>,
    readdir(accountsPath)
      .then(filenames => filenames.filter(name => name.endsWith(".json")))
      .catch(e => {
        if (e?.code !== "ENOENT")
          throw e;
        return [];
      })
  ]);

  const accountEntries = await Promise.all(accountFilenames.map(async filename =>
    readFile(accountsPath + filename, utf8)
      .then(parseJsonAccInfo)
      .then(acc => [filename.slice(0, -".json".length) as Address, acc] as const),
  ));

  return {
    settings:  parsedMeta.settings,
    accounts:  Object.fromEntries(accountEntries),
    timestamp: new Date(parsedMeta.timestamp),
    slot:      parsedMeta.slot as bigint,
  };
}
