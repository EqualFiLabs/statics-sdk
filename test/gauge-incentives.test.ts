import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  MAX_GAUGE_ALLOCATIONS_PER_POSITION,
  MAX_WEEKLY_GAUGE_RELEASE_BPS,
  buildClaimGaugeAllocatorRewardsCall,
  buildCheckpointGaugeEpochCall,
  buildCurrentGaugeEpochCall,
  buildFundGaugeReserveCall,
  buildFinalizeGaugeAllocatorRewardCall,
  buildExpireGaugeAllocatorRewardCall,
  buildGaugeAllocatorClaimWindowCall,
  buildGaugeAllocatorRewardCall,
  buildGaugeEpochAtCall,
  buildGaugeEpochCall,
  buildGaugePoolWeightCall,
  buildGaugePositionAllocationsCall,
  buildGaugePositionAllocationAtCall,
  buildGaugeReserveCall,
  buildMaxGaugeAllocationsPerPositionCall,
  buildMaxWeeklyGaugeReleaseBpsCall,
  buildPreviewGaugeTopTenCall,
  buildPreviewGaugeAllocatorRewardsCall,
  buildRefreshGaugePoolWeightCall,
  buildScheduleGaugeReleaseBpsCall,
  buildSetGaugeAllocationsCall,
  decodeGaugeEpochResult,
  decodeGaugeAllocatorRewardResult,
  decodeGaugeAllocatorRewardsPreviewResult,
  decodeGaugePositionAllocationAtResult,
  decodeGaugePoolWeightResult,
  decodeGaugePositionAllocationsResult,
  decodeGaugeReserveResult,
  decodeGaugeTopTenPreviewResult,
  staticsAbi,
  staticsGaugeIncentivesAbi,
} from "../src/index.js";

const poolId = `0x${"11".repeat(32)}` as Hex;
const secondPoolId = `0x${"22".repeat(32)}` as Hex;
const zeroPoolId = `0x${"00".repeat(32)}` as Hex;
const version = `0x${"33".repeat(32)}` as Hex;
const funder = "0x0000000000000000000000000000000000000011" as Address;

const functionNames = [
  "fundGaugeReserve",
  "setGaugeAllocations",
  "checkpointGaugeEpoch",
  "refreshGaugePoolWeight",
  "scheduleGaugeReleaseBps",
  "syncGaugeAllocationsAfterStakeLoss",
  "finalizeGaugeAllocatorReward",
  "claimGaugeAllocatorRewards",
  "expireGaugeAllocatorReward",
  "currentGaugeEpoch",
  "gaugeEpochAt",
  "gaugeReserve",
  "gaugePoolWeight",
  "gaugePositionAllocations",
  "gaugeEpoch",
  "previewGaugeTopTen",
  "maxGaugeAllocationsPerPosition",
  "maxWeeklyGaugeReleaseBps",
  "gaugeAllocatorReward",
  "gaugePositionAllocationAt",
  "previewGaugeAllocatorRewards",
  "gaugeAllocatorClaimWindow",
] as const;

function decodedName(data: Hex): string {
  return decodeFunctionData({ abi: staticsGaugeIncentivesAbi, data }).functionName;
}

describe("gauge incentives ABI", () => {
  it("exports the complete Diamond surface exactly once", () => {
    const functions = staticsGaugeIncentivesAbi.filter((item) => item.type === "function");
    expect(functions.map((item) => item.name)).toEqual(functionNames);

    for (const functionName of functionNames) {
      expect(
        staticsAbi.filter((item) => item.type === "function" && item.name === functionName),
        functionName,
      ).toHaveLength(1);
    }
  });

  it("decodes reserve funding events and release-bound errors", () => {
    const topics = encodeEventTopics({
      abi: staticsGaugeIncentivesAbi,
      eventName: "GaugeReserveFunded",
      args: { funder, maturityEpoch: 12n },
    });
    const data = encodeFunctionResult({
      abi: [{ type: "function", name: "encode", stateMutability: "pure", inputs: [], outputs: [{ type: "uint256" }] }],
      functionName: "encode",
      result: 1_000n,
    });
    expect(
      decodeEventLog({ abi: staticsGaugeIncentivesAbi, eventName: "GaugeReserveFunded", topics, data }).args,
    ).toMatchObject({ funder, amount: 1_000n, maturityEpoch: 12n });

    const encodedError = encodeErrorResult({
      abi: staticsGaugeIncentivesAbi,
      errorName: "InvalidGaugeReleaseBps",
      args: [1_001n],
    });
    expect(decodeErrorResult({ abi: staticsGaugeIncentivesAbi, data: encodedError })).toMatchObject({
      errorName: "InvalidGaugeReleaseBps",
      args: [1_001n],
    });
  });
});

describe("gauge incentive calldata", () => {
  it("builds reserve and epoch calls", () => {
    expect(decodedName(buildFundGaugeReserveCall(1_000n))).toBe("fundGaugeReserve");
    expect(() => buildFundGaugeReserveCall(0n)).toThrow(/greater than zero/);
    expect(decodedName(buildCheckpointGaugeEpochCall())).toBe("checkpointGaugeEpoch");
    expect(decodedName(buildRefreshGaugePoolWeightCall(poolId))).toBe("refreshGaugePoolWeight");
    expect(decodedName(buildScheduleGaugeReleaseBpsCall(400))).toBe("scheduleGaugeReleaseBps");
    expect(() => buildScheduleGaugeReleaseBpsCall(MAX_WEEKLY_GAUGE_RELEASE_BPS + 1)).toThrow(/out of range/);
    expect(decodedName(buildFinalizeGaugeAllocatorRewardCall(poolId, 2, 12n))).toBe(
      "finalizeGaugeAllocatorReward",
    );
    expect(decodedName(buildExpireGaugeAllocatorRewardCall(poolId, 2, 12n))).toBe(
      "expireGaugeAllocatorReward",
    );
    expect(() => buildFinalizeGaugeAllocatorRewardCall(poolId, 0, 12n)).toThrow(/allocator slot/);
  });

  it("builds bounded allocator claims", () => {
    const claim = buildClaimGaugeAllocatorRewardsCall(7n, poolId, 12n, [1, 4], [10n, 20n], funder);
    expect(decodeFunctionData({ abi: staticsGaugeIncentivesAbi, data: claim })).toMatchObject({
      functionName: "claimGaugeAllocatorRewards",
      args: [7n, poolId, 12n, [1, 4], [10n, 20n], funder],
    });
    expect(() => buildClaimGaugeAllocatorRewardsCall(7n, poolId, 12n, [1], [], funder)).toThrow(
      /length mismatch/,
    );
    expect(() => buildClaimGaugeAllocatorRewardsCall(7n, poolId, 12n, [1, 1], [0n, 0n], funder)).toThrow(
      /duplicate/,
    );
  });

  it("builds bounded, unique position allocations", () => {
    const data = buildSetGaugeAllocationsCall(7n, [poolId, secondPoolId], [60n, 40n]);
    expect(decodeFunctionData({ abi: staticsGaugeIncentivesAbi, data })).toMatchObject({
      functionName: "setGaugeAllocations",
      args: [7n, [poolId, secondPoolId], [60n, 40n]],
    });
    expect(decodedName(buildSetGaugeAllocationsCall(7n, [], []))).toBe("setGaugeAllocations");
    expect(() => buildSetGaugeAllocationsCall(7n, [poolId], [])).toThrow(/length mismatch/);
    expect(() => buildSetGaugeAllocationsCall(7n, [poolId], [0n])).toThrow(/greater than zero/);
    expect(() => buildSetGaugeAllocationsCall(7n, [poolId, poolId], [1n, 1n])).toThrow(/duplicate/);
    expect(() =>
      buildSetGaugeAllocationsCall(
        7n,
        Array.from({ length: MAX_GAUGE_ALLOCATIONS_PER_POSITION + 1 }, (_, index) =>
          `0x${index.toString(16).padStart(64, "0")}` as Hex,
        ),
        Array.from({ length: MAX_GAUGE_ALLOCATIONS_PER_POSITION + 1 }, () => 1n),
      ),
    ).toThrow(/too many/);
  });

  it("builds the complete read surface", () => {
    expect(decodedName(buildCurrentGaugeEpochCall())).toBe("currentGaugeEpoch");
    expect(decodedName(buildGaugeEpochAtCall(1_000n))).toBe("gaugeEpochAt");
    expect(decodedName(buildGaugeReserveCall())).toBe("gaugeReserve");
    expect(decodedName(buildGaugePoolWeightCall(poolId))).toBe("gaugePoolWeight");
    expect(decodedName(buildGaugePositionAllocationsCall(7n))).toBe("gaugePositionAllocations");
    expect(decodedName(buildGaugeEpochCall(12n))).toBe("gaugeEpoch");
    expect(decodedName(buildPreviewGaugeTopTenCall())).toBe("previewGaugeTopTen");
    expect(decodedName(buildMaxGaugeAllocationsPerPositionCall())).toBe("maxGaugeAllocationsPerPosition");
    expect(decodedName(buildMaxWeeklyGaugeReleaseBpsCall())).toBe("maxWeeklyGaugeReleaseBps");
    expect(decodedName(buildGaugeAllocatorRewardCall(poolId, 2, 12n))).toBe("gaugeAllocatorReward");
    expect(decodedName(buildGaugePositionAllocationAtCall(7n, poolId, 12n))).toBe(
      "gaugePositionAllocationAt",
    );
    expect(decodedName(buildPreviewGaugeAllocatorRewardsCall(7n, poolId, 12n, [2]))).toBe(
      "previewGaugeAllocatorRewards",
    );
    expect(decodedName(buildGaugeAllocatorClaimWindowCall())).toBe("gaugeAllocatorClaimWindow");
  });
});

describe("gauge incentive views", () => {
  it("decodes reserve, weight, and position allocation state", () => {
    const reserve = {
      releaseBps: 400,
      pendingReleaseBps: 500,
      pendingReleaseEpoch: 13n,
      deferredMaturityEpoch: 12n,
      available: 900n,
      deferred: 100n,
      committed: 50n,
    } as const;
    const reserveResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugeReserve",
      result: reserve,
    });
    expect(decodeGaugeReserveResult(reserveResult)).toEqual(reserve);

    const weight = { scheduledWeight: 100n, storedVersion: version, currentVersion: version, stale: false } as const;
    const weightResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugePoolWeight",
      result: weight,
    });
    expect(decodeGaugePoolWeightResult(weightResult)).toEqual(weight);

    const allocation = { poolId, amount: 100n, eligibilityVersion: version } as const;
    const positionResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugePositionAllocations",
      result: [11n, [allocation], 12n, [allocation], 100n],
    });
    expect(decodeGaugePositionAllocationsResult(positionResult)).toEqual({
      activeEpoch: 11n,
      active: [allocation],
      pendingEpoch: 12n,
      pending: [allocation],
      lockedStake: 100n,
    });
  });

  it("decodes committed epoch and top-ten preview state", () => {
    const emptyPools = Array.from({ length: 10 }, () => zeroPoolId) as unknown as readonly [
      Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex,
    ];
    const emptyAmounts = Array.from({ length: 10 }, () => 0n) as unknown as readonly [
      bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
    ];
    const epoch = {
      finalized: true,
      releaseBps: 400,
      winnerCount: 1,
      activatedAt: 1_000,
      finish: 2_000,
      nominalBudget: 100n,
      committedBudget: 90n,
      totalWeight: 50n,
      pools: [poolId, ...emptyPools.slice(1)] as typeof emptyPools,
      weights: [50n, ...emptyAmounts.slice(1)] as typeof emptyAmounts,
      budgets: [90n, ...emptyAmounts.slice(1)] as typeof emptyAmounts,
    } as const;
    const epochResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugeEpoch",
      result: epoch,
    });
    expect(decodeGaugeEpochResult(epochResult)).toEqual(epoch);

    const previewResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "previewGaugeTopTen",
      result: [[poolId], [50n], false, zeroPoolId],
    });
    expect(decodeGaugeTopTenPreviewResult(previewResult)).toEqual({
      pools: [poolId],
      weights: [50n],
      stale: false,
      stalePool: zeroPoolId,
    });
  });

  it("decodes allocator reward and historical allocation state", () => {
    const reward = {
      asset: funder,
      eligibilityVersion: version,
      finalized: true,
      expired: false,
      fundedAt: 1_000,
      expiresAt: 2_000,
      funded: 100n,
      totalWeight: 50n,
      distributable: 90n,
      remainingLiability: 40n,
    } as const;
    const rewardResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugeAllocatorReward",
      result: reward,
    });
    expect(decodeGaugeAllocatorRewardResult(rewardResult)).toEqual(reward);

    const allocationResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugePositionAllocationAt",
      result: [50n, version],
    });
    expect(decodeGaugePositionAllocationAtResult(allocationResult)).toEqual({
      amount: 50n,
      eligibilityVersion: version,
    });

    const preview = [{ slot: 2, asset: funder, allocation: 50n, amount: 90n, finalized: true, claimed: false, expired: false }];
    const previewResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "previewGaugeAllocatorRewards",
      result: preview,
    });
    expect(decodeGaugeAllocatorRewardsPreviewResult(previewResult)).toEqual(preview);
  });
});
