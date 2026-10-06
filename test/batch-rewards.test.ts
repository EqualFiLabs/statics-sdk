import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  type Address,
  type Hex,
} from "viem";
import {
  buildBatchClaimRewardsCall,
  decodeBatchClaimRewardsResult,
  buildBatchClaimLimitsCall,
  decodeBatchClaimLimitsResult,
  staticsBatchRewardsAbi,
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
    new URL("./fixtures/batch-rewards-solidity.json", import.meta.url),
    "utf8",
  ),
) as Record<string, Hex>;
describe("batch rewards ABI", () => {
  it("matches Solidity-generated calldata exactly", () => {
    const data = buildBatchClaimRewardsCall(input);
    expect(data).toBe(fixture.calldata);
    const decoded = decodeFunctionData({ abi: staticsAbi, data });
    expect(decoded.functionName).toBe("batchClaimRewards");
    expect(decoded.args).toEqual([
      input.globalClaims,
      input.lpClaims,
      input.allocatorClaims,
      input.receiver,
    ]);
  });
  it("decodes Solidity-generated results in original order", () => {
    expect(decodeBatchClaimRewardsResult(fixture.result)).toEqual({
      globalReceived: [[123n, 456n]],
      lpReceived: [[789n, 987n]],
      allocatorReceived: [[654n, 321n]],
    });
  });
  it("matches limit encoding and decoding", () => {
    expect(buildBatchClaimLimitsCall()).toBe(fixture.limitsCalldata);
    expect(decodeBatchClaimLimitsResult(fixture.limitsResult)).toEqual({
      maxClaims: 16n,
      maxRewardEntries: 64n,
    });
  });
  it("supports empty result categories and rejects malformed result bytes", () => {
    const data = encodeFunctionResult({
      abi: staticsBatchRewardsAbi,
      functionName: "batchClaimRewards",
      result: [[], [[1n]], []],
    });
    expect(decodeBatchClaimRewardsResult(data)).toEqual({
      globalReceived: [],
      lpReceived: [[1n]],
      allocatorReceived: [],
    });
    expect(() => decodeBatchClaimRewardsResult("0x1234")).toThrow();
  });
  it("contains both methods exactly once in the combined ABI", () => {
    for (const name of ["batchClaimRewards", "batchClaimLimits"])
      expect(
        staticsAbi.filter((a) => a.type === "function" && a.name === name),
      ).toHaveLength(1);
  });
});
