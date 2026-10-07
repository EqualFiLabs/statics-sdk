import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Address,
  type Hex,
} from "viem";
import {
  buildBatchClaimRewardsAggregatedCall,
  decodeBatchClaimRewardsAggregatedResult,
  staticsAggregatedBatchRewardsAbi,
  staticsAbi,
  type BatchRewardClaims,
} from "../src/index.js";
const address = (n: number) =>
  `0x${n.toString(16).padStart(40, "0")}` as Address;
const pool = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const input: BatchRewardClaims = {
  globalClaims: [
    {
      positionId: 30n,
      assets: [address(0x111), address(0x222)],
      minimumAmounts: [10n, 20n],
    },
  ],
  lpClaims: [
    {
      positionId: 30n,
      poolId: pool(1),
      slots: [0, 1],
      minimumAmounts: [10n, 20n],
    },
  ],
  allocatorClaims: [
    {
      positionId: 31n,
      poolId: pool(2),
      slots: [1, 4],
      minimumAmounts: [10n, 20n],
    },
  ],
  receiver: address(0x333),
};
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/aggregated-rewards-solidity.json", import.meta.url),
    "utf8",
  ),
) as Record<string, Hex>;
describe("aggregated batch rewards ABI", () => {
  it("matches every function, event and error in the Solidity interface artifact", () => {
    const abi = JSON.parse(
      readFileSync(
        new URL("./fixtures/aggregated-rewards-interface-abi.json", import.meta.url),
        "utf8",
      ),
    );
    // Solidity includes internalType annotations; compare the external ABI recursively.
    const external = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(external);
      if (item && typeof item === "object")
        return Object.fromEntries(
          Object.entries(item)
            .filter(([key, value]) => key !== "internalType" && !(value === false && (key === "anonymous" || key === "indexed")))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => [key, external(value)]),
        );
      return item;
    };
    const sort = (items: readonly unknown[]) =>
      [...items]
        .map(external)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(sort(staticsAggregatedBatchRewardsAbi)).toEqual(sort(abi));
  });
  it("matches Solidity-generated calldata exactly", () => {
    const data = buildBatchClaimRewardsAggregatedCall(input);
    expect(data).toBe(fixture.calldata);
    const decoded = decodeFunctionData({ abi: staticsAbi, data });
    expect(decoded.functionName).toBe("batchClaimRewardsAggregated");
    expect(decoded.args).toEqual([
      input.globalClaims,
      input.lpClaims,
      input.allocatorClaims,
      input.receiver,
    ]);
  });
  it("decodes Solidity-generated results in original order", () => {
    expect(decodeBatchClaimRewardsAggregatedResult(fixture.result)).toEqual({
      globalReceived: [[123n, 456n]],
      lpReceived: [[789n, 987n]],
      allocatorReceived: [[654n, 321n]],
    });
  });
  it("supports empty result categories and rejects malformed result bytes", () => {
    const data = encodeFunctionResult({
      abi: staticsAggregatedBatchRewardsAbi,
      functionName: "batchClaimRewardsAggregated",
      result: [[], [[1n]], []],
    });
    expect(decodeBatchClaimRewardsAggregatedResult(data)).toEqual({
      globalReceived: [],
      lpReceived: [[1n]],
      allocatorReceived: [],
    });
    expect(() => decodeBatchClaimRewardsAggregatedResult("0x1234")).toThrow();
  });
  it("contains both methods exactly once in the combined ABI", () => {
    for (const name of ["batchClaimRewardsAggregated", "batchClaimRewards", "batchClaimLimits"])
      expect(
        staticsAbi.filter((a) => a.type === "function" && a.name === name),
      ).toHaveLength(1);
  });
});

describe("aggregated builder compatibility", () => {
  it("does not mutate input and reuses existing validation", () => {
    const original = structuredClone(input);
    buildBatchClaimRewardsAggregatedCall(input);
    expect(input).toEqual(original);
    expect(() => buildBatchClaimRewardsAggregatedCall({...input,receiver: address(0)})).toThrow();
    expect(() => buildBatchClaimRewardsAggregatedCall({...input,allocatorClaims:[{...input.allocatorClaims[0]!,slots:[0],minimumAmounts:[0n]}]})).toThrow();
    expect(() => buildBatchClaimRewardsAggregatedCall({...input,lpClaims:[input.lpClaims[0]!,input.lpClaims[0]!]})).toThrow();
    expect(() => buildBatchClaimRewardsAggregatedCall(input,input.receiver)).toThrow();
  });
});
