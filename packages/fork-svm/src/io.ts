import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import type { Address } from "@solana/kit";
import { base64, stringifyWithBigints, parseWithBigints } from "@xlabs-xyz/utils";
import type { SvmAccountInfo, RoSvmAccountInfo } from "./details.js";
import type { Snapshot } from "./forkSvm.js";

const parseJsonAccInfo = (json: string): SvmAccountInfo | null => {
  const base64AccOrNull: any = parseWithBigints(json);
  if (base64AccOrNull?.data)
    base64AccOrNull.data = base64.decode(base64AccOrNull.data);
  return base64AccOrNull;
};

const stringifyJsonAccInfo = (acc: RoSvmAccountInfo | null): string =>
  stringifyWithBigints(acc ? { ...acc, data: base64.encode(acc.data) } : null);

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
    settings: snapshot.settings,
    clock: {
      timestamp:           snapshot.clock.timestamp.toISOString(),
      slot:                snapshot.clock.slot,
      epoch:               snapshot.clock.epoch,
      epochStartTimestamp: snapshot.clock.epochStartTimestamp,
      leaderScheduleEpoch: snapshot.clock.leaderScheduleEpoch,
    },
  } as const;

  await Promise.all([
    mkdir(accountsPath, { recursive: true }),
    writeFile(metaFilename, stringifyWithBigints(meta), utf8),
  ]);

  await Promise.all(Object.entries(snapshot.accounts).map(([addr, acc]) =>
    writeFile(accountsPath + addr + ".json", stringifyJsonAccInfo(acc), utf8)
  ));
}

export async function readFromDisc(filepath: string): Promise<Snapshot> {
  const { accountsPath, metaFilename } = toPaths(filepath);

  const [parsedMeta, accountFilenames] = await Promise.all([
    readFile(metaFilename, utf8).then(parseWithBigints) as Promise<any>,
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
    settings: parsedMeta.settings,
    accounts: Object.fromEntries(accountEntries),
    clock: {
      timestamp:           new Date(parsedMeta.clock.timestamp),
      slot:                parsedMeta.clock.slot                as bigint,
      epoch:               parsedMeta.clock.epoch               as bigint,
      epochStartTimestamp: parsedMeta.clock.epochStartTimestamp as bigint,
      leaderScheduleEpoch: parsedMeta.clock.leaderScheduleEpoch as bigint,
    },
  };
}
