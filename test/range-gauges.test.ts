import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionResult,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  buildAppendPoolRewardAssetCall,
  buildAttachRangeLiquidityCall,
  buildClaimRangeLpRewardsCall,
  buildCollectRangeNativeFeesCall,
  buildDecreaseRangeLiquidityCall,
  buildExitRangeLiquidityCall,
  buildForfeitRangeLpRewardCall,
  buildFundPoolRewardCall,
  buildGaugeBoundaryCall,
  buildGaugePoolCall,
  buildGaugeRewardAssetAllowedCall,
  buildGaugeRewardDurationCall,
  buildIncreaseRangeLiquidityCall,
  buildInstallRangeGaugeLiquidityManagerCall,
  buildPositionGaugePoolsCall,
  buildPoolRewardConfigCall,
  buildPoolRewardCustodyAccountCall,
  buildPoolRewardStreamCall,
  buildPosmBindingCall,
  buildPreviewRangeLpRewardsCall,
  buildProvideRangeLiquidityCall,
  buildRangeGaugeLpLegCall,
  buildRangeGaugeLiquidityManagerCall,
  buildRebalanceRangeLiquidityCall,
  buildReconcilePoolRewardSurplusCall,
  buildRecoverUnboundPosmCall,
  buildRecordedLiquidityManagerCall,
  buildReplaceRangeGaugeLiquidityManagerCall,
  buildSetGaugeRewardAssetAllowedCall,
  buildSetGaugeRewardDurationCall,
  decodePositionGaugePoolsResult,
  decodePreviewRangeLpRewardsResult,
  decodeRangeGaugeLpLegResult,
  decodeRangeGaugeRewardStreamResult,
  isRangeGaugeClaimOnlyLeg,
  staticsAbi,
  staticsLiquidityManagerAbi,
  staticsRangeGaugeAbi,
  type RangeGaugeLpLeg,
} from "../src/index.js";

const poolId = `0x${"11".repeat(32)}` as Hex;
const secondPoolId = `0x${"22".repeat(32)}` as Hex;
const asset = "0x0000000000000000000000000000000000000011" as Address;
const manager = "0x0000000000000000000000000000000000000022" as Address;
const receiver = "0x0000000000000000000000000000000000000033" as Address;

const functionNames = [
  "setGaugeRewardAssetAllowed",
  "setGaugeRewardDuration",
  "appendPoolRewardAsset",
  "fundPoolReward",
  "installLiquidityManager",
  "replaceLiquidityManager",
  "provideLiquidity",
  "attachLiquidity",
  "increaseLiquidity",
  "decreaseLiquidity",
  "collectNativeFees",
  "rebalanceLiquidity",
  "exitLiquidity",
  "claimLpRewards",
  "forfeitLpReward",
  "recoverUnboundPosm",
  "reconcilePoolRewardSurplus",
  "gaugeRewardDuration",
  "gaugeRewardAssetAllowed",
  "poolRewardConfig",
  "gaugePool",
  "poolRewardStream",
  "poolRewardCustodyAccount",
  "gaugeBoundary",
  "lpLeg",
  "positionGaugePools",
  "posmBinding",
  "liquidityManager",
  "recordedLiquidityManager",
  "previewLpRewards",
] as const;

function decodedName(data: Hex): string {
  return decodeFunctionData({ abi: staticsRangeGaugeAbi, data }).functionName;
}

describe("range gauge ABI", () => {
  it("exports the frozen Diamond function surface exactly once", () => {
    const rangeFunctions = staticsRangeGaugeAbi.filter((item) => item.type === "function");
    expect(rangeFunctions.map((item) => item.name)).toEqual(functionNames);

    for (const functionName of functionNames) {
      expect(
        staticsAbi.filter((item) => item.type === "function" && item.name === functionName),
        functionName,
      ).toHaveLength(1);
    }
  });

  it("exports the managed public manager ABI separately from permissioned positions", () => {
    const managerFunctions = staticsLiquidityManagerAbi
      .filter((item) => item.type === "function")
      .map((item) => item.name);
    expect(managerFunctions).toEqual(
      expect.arrayContaining([
        "mintUserPosition",
        "mintManagedPosition",
        "attachManagedPosition",
        "inspectManagedPosition",
        "increaseManagedPosition",
        "decreaseManagedPosition",
        "collectManagedPositionFees",
        "burnManagedPosition",
        "exitManagedPosition",
        "recoverUnboundPosition",
      ]),
    );
  });

  it("decodes frozen events and errors", () => {
    const topics = encodeEventTopics({
      abi: staticsRangeGaugeAbi,
      eventName: "PoolRewardFunded",
      args: { poolId, asset, funder: receiver },
    });
    const data = encodeFunctionResult({
      abi: [{ type: "function", name: "encode", stateMutability: "pure", inputs: [], outputs: [
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint40" },
      ] }],
      functionName: "encode",
      result: [2, 100n, 99n, 604_800],
    });
    const event = decodeEventLog({ abi: staticsRangeGaugeAbi, eventName: "PoolRewardFunded", topics, data });
    expect(event.args).toMatchObject({ poolId, asset, funder: receiver, slot: 2, requested: 100n, received: 99n });

    const encodedError = encodeErrorResult({
      abi: staticsRangeGaugeAbi,
      errorName: "MinimumRemainingDurationNotMet",
      args: [3_600, 86_400],
    });
    expect(decodeErrorResult({ abi: staticsRangeGaugeAbi, data: encodedError })).toMatchObject({
      errorName: "MinimumRemainingDurationNotMet",
      args: [3_600, 86_400],
    });

    const capacityError = encodeErrorResult({
      abi: staticsRangeGaugeAbi,
      errorName: "RewardBudgetExceedsIndexCapacity",
      args: [100n, 1n, 100n],
    });
    expect(decodeErrorResult({ abi: staticsRangeGaugeAbi, data: capacityError })).toMatchObject({
      errorName: "RewardBudgetExceedsIndexCapacity",
      args: [100n, 1n, 100n],
    });
  });
});

describe("range gauge calldata", () => {
  it("builds configuration and protected funding calls", () => {
    expect(decodedName(buildSetGaugeRewardAssetAllowedCall(asset, true))).toBe("setGaugeRewardAssetAllowed");
    expect(decodedName(buildSetGaugeRewardDurationCall(604_800n))).toBe("setGaugeRewardDuration");
    expect(decodedName(buildAppendPoolRewardAssetCall(poolId, asset))).toBe("appendPoolRewardAsset");

    const funding = decodeFunctionData({
      abi: staticsRangeGaugeAbi,
      data: buildFundPoolRewardCall(poolId, 2, 1_000n, 86_400n),
    });
    expect(funding.functionName).toBe("fundPoolReward");
    expect(funding.args).toEqual([poolId, 2, 1_000n, 86_400]);
    expect(() => buildFundPoolRewardCall(poolId, 0, 1n, 1n)).toThrow(/slot/);
    expect(() => buildFundPoolRewardCall(poolId, 5, 1n, 1n)).toThrow(/slot/);
    expect(() => buildFundPoolRewardCall(poolId, 2, 1n, 1n << 40n)).toThrow(/minRemainingDuration/);
  });

  it("builds the complete managed position lifecycle", () => {
    const provide = {
      poolId,
      tickLower: -120,
      tickUpper: 120,
      liquidity: 100n,
      amount0Maximum: 1_000n,
      amount1Maximum: 2_000n,
      deadline: 9_999n,
    } as const;
    const increase = { liquidity: 10n, amount0Maximum: 100n, amount1Maximum: 200n, deadline: 9_999n };
    const decrease = { liquidity: 10n, amount0Minimum: 90n, amount1Minimum: 180n, deadline: 9_999n };
    const rebalance = {
      tickLower: -240,
      tickUpper: 240,
      liquidity: 75n,
      amount0Maximum: 1_000n,
      amount1Maximum: 2_000n,
      amount0Minimum: 90n,
      amount1Minimum: 180n,
      deadline: 9_999n,
    };

    expect(decodedName(buildInstallRangeGaugeLiquidityManagerCall(manager))).toBe("installLiquidityManager");
    expect(decodedName(buildReplaceRangeGaugeLiquidityManagerCall(manager))).toBe("replaceLiquidityManager");
    expect(decodedName(buildProvideRangeLiquidityCall(1n, provide))).toBe("provideLiquidity");
    expect(decodedName(buildAttachRangeLiquidityCall(1n, poolId, 7n))).toBe("attachLiquidity");
    expect(decodedName(buildIncreaseRangeLiquidityCall(1n, poolId, increase))).toBe("increaseLiquidity");
    expect(decodedName(buildDecreaseRangeLiquidityCall(1n, poolId, decrease))).toBe("decreaseLiquidity");
    expect(decodedName(buildCollectRangeNativeFeesCall(1n, poolId, 1n, 2n, 9_999n))).toBe("collectNativeFees");
    expect(decodedName(buildRebalanceRangeLiquidityCall(1n, poolId, rebalance))).toBe("rebalanceLiquidity");
    expect(decodedName(buildExitRangeLiquidityCall(1n, poolId, 1n, 2n, 9_999n))).toBe("exitLiquidity");
    expect(() => buildProvideRangeLiquidityCall(1n, { ...provide, tickUpper: -120 })).toThrow(/tickLower/);
    expect(() => buildProvideRangeLiquidityCall(1n, { ...provide, liquidity: 0n })).toThrow(/greater than zero/);
    expect(() => buildProvideRangeLiquidityCall(1n, { ...provide, liquidity: 1n << 127n })).toThrow(/out of range/);
    expect(() => buildIncreaseRangeLiquidityCall(1n, poolId, { ...increase, liquidity: 0n })).toThrow(
      /greater than zero/,
    );
    expect(() => buildDecreaseRangeLiquidityCall(1n, poolId, { ...decrease, liquidity: 1n << 127n })).toThrow(
      /out of range/,
    );
    expect(() => buildRebalanceRangeLiquidityCall(1n, poolId, { ...rebalance, liquidity: 0n })).toThrow(
      /greater than zero/,
    );
  });

  it("builds independent reward and recovery calls", () => {
    expect(decodedName(buildClaimRangeLpRewardsCall(1n, poolId, [2], [9n], receiver))).toBe("claimLpRewards");
    expect(() => buildClaimRangeLpRewardsCall(1n, poolId, [2], [], receiver)).toThrow(/length mismatch/);
    expect(decodedName(buildForfeitRangeLpRewardCall(1n, poolId, 2))).toBe("forfeitLpReward");
    expect(decodedName(buildRecoverUnboundPosmCall(manager, 7n, receiver))).toBe("recoverUnboundPosm");
    expect(decodedName(buildReconcilePoolRewardSurplusCall(poolId, 2))).toBe("reconcilePoolRewardSurplus");
  });
});

describe("range gauge discovery and previews", () => {
  const emptyFive = [0n, 0n, 0n, 0n, 0n] as const;
  const emptyLeg: RangeGaugeLpLeg = {
    manager: zeroAddress,
    posmTokenId: 0n,
    tickLower: 0,
    tickUpper: 0,
    liquidity: 0n,
    checkpointInsideRay: emptyFive,
    rewardRemainderRay: emptyFive,
    claimable: emptyFive,
  };

  it("builds and decodes paginated PNFT PoolId discovery", () => {
    expect(decodedName(buildPositionGaugePoolsCall(42n, 5n, 10n))).toBe("positionGaugePools");
    const result = encodeFunctionResult({
      abi: staticsRangeGaugeAbi,
      functionName: "positionGaugePools",
      result: [[poolId, secondPoolId], 7n],
    });
    expect(decodePositionGaugePoolsResult(result)).toEqual({ poolIds: [poolId, secondPoolId], nextCursor: 7n });
  });

  it("builds the complete read surface", () => {
    expect(decodedName(buildGaugeRewardDurationCall())).toBe("gaugeRewardDuration");
    expect(decodedName(buildGaugeRewardAssetAllowedCall(asset))).toBe("gaugeRewardAssetAllowed");
    expect(decodedName(buildPoolRewardConfigCall(poolId))).toBe("poolRewardConfig");
    expect(decodedName(buildGaugePoolCall(poolId))).toBe("gaugePool");
    expect(decodedName(buildPoolRewardStreamCall(poolId, 2))).toBe("poolRewardStream");
    expect(decodedName(buildPoolRewardCustodyAccountCall(poolId, 2))).toBe("poolRewardCustodyAccount");
    expect(decodedName(buildGaugeBoundaryCall(poolId, -120))).toBe("gaugeBoundary");
    expect(decodedName(buildPosmBindingCall(7n))).toBe("posmBinding");
    expect(decodedName(buildRangeGaugeLiquidityManagerCall())).toBe("liquidityManager");
    expect(decodedName(buildRecordedLiquidityManagerCall(42n, poolId))).toBe("recordedLiquidityManager");
  });

  it("decodes onchain reward previews", () => {
    expect(decodedName(buildPreviewRangeLpRewardsCall(42n, poolId))).toBe("previewLpRewards");
    const result = encodeFunctionResult({
      abi: staticsRangeGaugeAbi,
      functionName: "previewLpRewards",
      result: {
        slotCount: 1,
        assets: [asset, zeroAddress, zeroAddress, zeroAddress, zeroAddress],
        amounts: [9n, 0n, 0n, 0n, 0n],
      },
    });
    expect(decodePreviewRangeLpRewardsResult(result)).toEqual({
      slotCount: 1,
      assets: [asset, zeroAddress, zeroAddress, zeroAddress, zeroAddress],
      amounts: [9n, 0n, 0n, 0n, 0n],
    });
  });

  it("decodes lifetime reward index capacity", () => {
    const stream = {
      assigned: true,
      slot: 1,
      asset,
      protocolEpoch: 0n,
      periodStart: 1,
      periodFinish: 2,
      lastUpdate: 1,
      periodBudget: 11n,
      periodEmitted: 3n,
      periodRecycled: 0n,
      globalIndexRay: 30n,
      indexRemainder: 2n,
      indexedLiability: 3n,
      claimLiability: 0n,
      indexCapacityUsed: 3n,
    } as const;
    const result = encodeFunctionResult({
      abi: staticsRangeGaugeAbi,
      functionName: "poolRewardStream",
      result: stream,
    });
    expect(decodeRangeGaugeRewardStreamResult(result)).toEqual(stream);
  });

  it("exposes claim-only state for exited legs with residual accounting", () => {
    expect(isRangeGaugeClaimOnlyLeg(emptyLeg)).toBe(false);
    expect(isRangeGaugeClaimOnlyLeg({ ...emptyLeg, liquidity: 1n, claimable: [1n, 0n, 0n, 0n, 0n] })).toBe(false);
    expect(isRangeGaugeClaimOnlyLeg({ ...emptyLeg, claimable: [1n, 0n, 0n, 0n, 0n] })).toBe(true);
    expect(isRangeGaugeClaimOnlyLeg({ ...emptyLeg, rewardRemainderRay: [1n, 0n, 0n, 0n, 0n] })).toBe(true);

    expect(decodedName(buildRangeGaugeLpLegCall(42n, poolId))).toBe("lpLeg");
    const result = encodeFunctionResult({
      abi: staticsRangeGaugeAbi,
      functionName: "lpLeg",
      result: { ...emptyLeg, claimable: [1n, 0n, 0n, 0n, 0n] },
    });
    expect(decodeRangeGaugeLpLegResult(result)).toMatchObject({ liquidity: 0n, claimOnly: true });
  });
});
