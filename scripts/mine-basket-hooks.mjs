#!/usr/bin/env node
import { mineBasketHookSalts } from "../dist/restricted-markets.js";

const [factory, chain, start = "0", count = "1", attempts = "1000000", preparedJSON] = process.argv.slice(2);
if (!/^0x[0-9a-fA-F]{40}$/.test(factory ?? "") || !chain) {
  console.error("Usage: statics-mine-hooks <factory> <chainId> [start] [count] [attempts] [preparedJSON]");
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  try {
    const prepared = preparedJSON ? JSON.parse(preparedJSON) : undefined;
    if (prepared) {
      prepared.intent.deadline = BigInt(prepared.intent.deadline);
      prepared.intent.version = BigInt(prepared.intent.version);
    }
    const results = await mineBasketHookSalts({ factory, chainId: BigInt(chain), start: BigInt(start), count: Number(count), attempts: BigInt(attempts), prepared, signal: controller.signal });
    console.log(JSON.stringify(results, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
    console.error("Offline candidates: verify onchain saltAvailable before reserving or enqueuing.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
