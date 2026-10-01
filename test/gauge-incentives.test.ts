import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  encodeAbiParameters,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  MAX_GAUGE_ALLOCATIONS_PER_POSITION,
  MAX_GAUGE_CATCHUP_PERIODS,
  MAX_WEEKLY_GAUGE_RELEASE_BPS,
  buildActivateGaugeScheduleCall,
  buildClaimGaugeAllocatorRewardsCall,
  buildCheckpointGaugePoolCall,
  buildCheckpointGaugeScheduleCall,
  buildCurrentGaugePeriodCall,
  buildFundGaugeReserveCall,
  buildForfeitGaugeAllocatorRewardCall,
  buildGaugeAllocationCooldownCall,
  buildGaugeAllocatorRewardCall,
  buildGaugePeriodAtCall,
  buildGaugePoolWeightCall,
  buildGaugePositionAllocationsCall,
  buildGaugeReserveCall,
  buildMaxGaugeAllocationsPerPositionCall,
  buildMaxGaugeCatchupPeriodsCall,
  buildMaxWeeklyGaugeReleaseBpsCall,
  buildPreviewGaugeAllocatorRewardsCall,
  buildPreviewGaugePoolRewardCall,
  buildScheduleGaugeReleaseBpsCall,
  buildSetGaugeAllocationCooldownCall,
  buildSetGaugeAllocationsCall,
  decodeGaugeAllocatorRewardResult,
  decodeGaugeAllocatorRewardsPreviewResult,
  decodeGaugePoolRewardResult,
  decodeGaugePoolWeightResult,
  decodeGaugePositionAllocationsResult,
  decodeGaugeReserveResult,
  staticsAbi,
  staticsGaugeIncentivesAbi,
} from "../src/index.js";

const poolId = `0x${"11".repeat(32)}` as Hex;
const secondPoolId = `0x${"22".repeat(32)}` as Hex;
const version = `0x${"33".repeat(32)}` as Hex;
const funder = "0x0000000000000000000000000000000000000011" as Address;

const functionNames = [
  "fundGaugeReserve",
  "activateGaugeSchedule",
  "setGaugeAllocations",
  "checkpointGaugeSchedule",
  "checkpointGaugePool",
  "scheduleGaugeReleaseBps",
  "setGaugeAllocationCooldown",
  "syncGaugeAllocationsAfterStakeLoss",
  "claimGaugeAllocatorRewards",
  "forfeitGaugeAllocatorReward",
  "currentGaugePeriod",
  "gaugePeriodAt",
  "gaugeReserve",
  "gaugePoolWeight",
  "gaugePositionAllocations",
  "previewGaugePoolReward",
  "maxGaugeAllocationsPerPosition",
  "maxWeeklyGaugeReleaseBps",
  "maxGaugeCatchupPeriods",
  "gaugeAllocationCooldown",
  "gaugeAllocatorReward",
  "previewGaugeAllocatorRewards",
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

  it("decodes timestamped reserve funding and release-bound errors", () => {
    const topics = encodeEventTopics({
      abi: staticsGaugeIncentivesAbi,
      eventName: "GaugeReserveFunded",
      args: { funder, maturityAt: 604_800 },
    });
    const data = encodeFunctionResult({
      abi: [{ type: "function", name: "encode", stateMutability: "pure", inputs: [], outputs: [{ type: "uint256" }] }],
      functionName: "encode",
      result: 1_000n,
    });
    expect(
      decodeEventLog({ abi: staticsGaugeIncentivesAbi, eventName: "GaugeReserveFunded", topics, data }).args,
    ).toMatchObject({ funder, amount: 1_000n, maturityAt: 604_800 });

    const cooldownTopics = encodeEventTopics({
      abi: staticsGaugeIncentivesAbi,
      eventName: "PositionGaugeAllocationCooldownExtended",
      args: { positionId: 7n, nextAllocationAt: 1_014_400 },
    });
    expect(
      decodeEventLog({
        abi: staticsGaugeIncentivesAbi,
        eventName: "PositionGaugeAllocationCooldownExtended",
        topics: cooldownTopics,
        data: "0x",
      }).args,
    ).toMatchObject({ positionId: 7n, nextAllocationAt: 1_014_400 });

    const encodedError = encodeErrorResult({
      abi: staticsGaugeIncentivesAbi,
      errorName: "InvalidGaugeReleaseBps",
      args: [1_001n],
    });
    expect(decodeErrorResult({ abi: staticsGaugeIncentivesAbi, data: encodedError })).toMatchObject({
      errorName: "InvalidGaugeReleaseBps",
      args: [1_001n],
    });

    const forfeitTopics = encodeEventTopics({
      abi: staticsGaugeIncentivesAbi,
      eventName: "GaugeAllocatorRewardForfeited",
      args: { positionId: 7n, poolId, slot: 2 },
    });
    const forfeitData = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [funder, 25n],
    );
    expect(
      decodeEventLog({
        abi: staticsGaugeIncentivesAbi,
        eventName: "GaugeAllocatorRewardForfeited",
        topics: forfeitTopics,
        data: forfeitData,
      }).args,
    ).toMatchObject({ positionId: 7n, poolId, slot: 2, asset: funder, amount: 25n });
  });
});

describe("gauge incentive calldata", () => {
  it("builds reserve, schedule, and cooldown calls", () => {
    expect(decodedName(buildFundGaugeReserveCall(1_000n))).toBe("fundGaugeReserve");
    expect(() => buildFundGaugeReserveCall(0n)).toThrow(/greater than zero/);
    expect(decodedName(buildActivateGaugeScheduleCall())).toBe("activateGaugeSchedule");
    expect(decodedName(buildCheckpointGaugeScheduleCall(3))).toBe("checkpointGaugeSchedule");
    expect(() => buildCheckpointGaugeScheduleCall(0)).toThrow(/out of range/);
    expect(() => buildCheckpointGaugeScheduleCall(MAX_GAUGE_CATCHUP_PERIODS + 1)).toThrow(/out of range/);
    expect(decodedName(buildCheckpointGaugePoolCall(poolId))).toBe("checkpointGaugePool");
    expect(decodedName(buildScheduleGaugeReleaseBpsCall(400))).toBe("scheduleGaugeReleaseBps");
    expect(() => buildScheduleGaugeReleaseBpsCall(MAX_WEEKLY_GAUGE_RELEASE_BPS + 1)).toThrow(/out of range/);
    expect(decodedName(buildSetGaugeAllocationCooldownCall(4n * 60n * 60n))).toBe(
      "setGaugeAllocationCooldown",
    );
    expect(() => buildSetGaugeAllocationCooldownCall(1n << 40n)).toThrow(/out of range/);
  });

  it("builds continuous allocator claims", () => {
    const claim = buildClaimGaugeAllocatorRewardsCall(7n, poolId, [1, 4], [10n, 20n], funder);
    expect(decodeFunctionData({ abi: staticsGaugeIncentivesAbi, data: claim })).toMatchObject({
      functionName: "claimGaugeAllocatorRewards",
      args: [7n, poolId, [1, 4], [10n, 20n], funder],
    });
    expect(() => buildClaimGaugeAllocatorRewardsCall(7n, poolId, [1], [], funder)).toThrow(/length mismatch/);
    expect(() => buildClaimGaugeAllocatorRewardsCall(7n, poolId, [1, 1], [0n, 0n], funder)).toThrow(
      /duplicate/,
    );
    const forfeit = buildForfeitGaugeAllocatorRewardCall(7n, poolId, 4);
    expect(decodeFunctionData({ abi: staticsGaugeIncentivesAbi, data: forfeit })).toMatchObject({
      functionName: "forfeitGaugeAllocatorReward",
      args: [7n, poolId, 4],
    });
    expect(() => buildForfeitGaugeAllocatorRewardCall(7n, poolId, 0)).toThrow(/between 1 and 4/);
  });

  it("builds bounded, unique persistent allocations", () => {
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
    expect(decodedName(buildCurrentGaugePeriodCall())).toBe("currentGaugePeriod");
    expect(decodedName(buildGaugePeriodAtCall(1_000n))).toBe("gaugePeriodAt");
    expect(decodedName(buildGaugeReserveCall())).toBe("gaugeReserve");
    expect(decodedName(buildGaugePoolWeightCall(poolId))).toBe("gaugePoolWeight");
    expect(decodedName(buildGaugePositionAllocationsCall(7n))).toBe("gaugePositionAllocations");
    expect(decodedName(buildPreviewGaugePoolRewardCall(poolId))).toBe("previewGaugePoolReward");
    expect(decodedName(buildMaxGaugeAllocationsPerPositionCall())).toBe("maxGaugeAllocationsPerPosition");
    expect(decodedName(buildMaxWeeklyGaugeReleaseBpsCall())).toBe("maxWeeklyGaugeReleaseBps");
    expect(decodedName(buildMaxGaugeCatchupPeriodsCall())).toBe("maxGaugeCatchupPeriods");
    expect(decodedName(buildGaugeAllocationCooldownCall())).toBe("gaugeAllocationCooldown");
    expect(decodedName(buildGaugeAllocatorRewardCall(poolId, 2))).toBe("gaugeAllocatorReward");
    expect(decodedName(buildPreviewGaugeAllocatorRewardsCall(7n, poolId, [2]))).toBe(
      "previewGaugeAllocatorRewards",
    );
  });
});

describe("gauge incentive views", () => {
  it("decodes reserve, weight, and position allocation state", () => {
    const reserve = {
      activated: true,
      releaseBps: 400,
      pendingReleaseBps: 500,
      pendingReleaseAt: 1_604_800,
      deferredMaturityAt: 1_604_800,
      scheduleStart: 1_000_000,
      lastCheckpoint: 1_100_000,
      periodStart: 1_000_000,
      periodFinish: 1_604_800,
      currentPeriod: 0n,
      allocationCooldown: 14_400,
      available: 900n,
      deferred: 100n,
      committed: 50n,
      periodBudget: 40n,
      periodAccounted: 10n,
      totalAllocatedWeight: 100n,
      globalIndexX160: 20n,
      unsettledRoutingLiability: 10n,
    } as const;
    const reserveResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugeReserve",
      result: reserve,
    });
    expect(decodeGaugeReserveResult(reserveResult)).toEqual(reserve);

    const weight = {
      weight: 100n,
      storedVersion: version,
      currentVersion: version,
      restrictionSequence: 7n,
      indexCursorX160: 15n,
      pendingReward: 5n,
      stale: false,
    } as const;
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
      result: [1_014_400, 100n, [allocation], 100n],
    });
    expect(decodeGaugePositionAllocationsResult(positionResult)).toEqual({
      nextAllocationAt: 1_014_400,
      totalAllocated: 100n,
      active: [allocation],
      lockedStake: 100n,
    });
  });

  it("decodes protocol and allocator reward state", () => {
    const poolRewardResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "previewGaugePoolReward",
      result: [90n, true],
    });
    expect(decodeGaugePoolRewardResult(poolRewardResult)).toEqual({ amount: 90n, eligible: true });

    const reward = {
      asset: funder,
      eligibilityVersion: version,
      fundingRestrictionSequence: 7n,
      periodStart: 1_000,
      periodFinish: 2_000,
      lastUpdate: 1_500,
      periodBudget: 100n,
      periodEmitted: 50n,
      globalIndexX160: 20n,
      indexedLiability: 30n,
      claimLiability: 20n,
      terminated: false,
    } as const;
    const rewardResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "gaugeAllocatorReward",
      result: reward,
    });
    expect(decodeGaugeAllocatorRewardResult(rewardResult)).toEqual(reward);

    const preview = [{ slot: 2, asset: funder, allocation: 50n, amount: 9n }] as const;
    const previewResult = encodeFunctionResult({
      abi: staticsGaugeIncentivesAbi,
      functionName: "previewGaugeAllocatorRewards",
      result: preview,
    });
    expect(decodeGaugeAllocatorRewardsPreviewResult(previewResult)).toEqual(preview);
  });
});
