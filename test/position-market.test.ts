import {
  decodeEventLog,
  decodeFunctionData,
  encodeEventTopics,
  encodeFunctionResult,
  zeroAddress,
  type Address,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  MAX_POSITION_MARKET_PAGE_SIZE,
  MAX_POSITION_ROYALTY_BPS,
  buildGlobalRewardAssetsOfPositionCall,
  buildPositionPendingRewardsCall,
  buildPositionRewardAssetsCall,
  buildPositionRewardOptInStatusCall,
  buildPositionRewardSelectionCall,
  buildPositionRoyaltyCall,
  buildPositionRoyaltyInfoCall,
  buildPositionStakeCall,
  buildSetPositionRoyaltyCall,
  decodeGlobalRewardAssetsOfPositionResult,
  decodePositionRewardSelectionResult,
  decodePositionRoyaltyResult,
  decodePositionStakeResult,
  staticsAbi,
  staticsPositionMarketAbi,
  staticsPositionRoyaltyAbi,
} from "../src/index.js";

const receiver = "0x0000000000000000000000000000000000000011" as Address;
const asset = "0x0000000000000000000000000000000000000022" as Address;

const functionNames = [
  "royaltyInfo",
  "positionRoyalty",
  "setPositionRoyalty",
  "pendingRewards",
  "stakePosition",
  "positionRewardAssets",
  "isRewardAssetOptedIn",
  "rewardSelection",
  "globalRewardAssetsOfPosition",
] as const;

describe("PositionNFT market ABI", () => {
  it("exports the facet surface exactly once in the Diamond ABI", () => {
    expect(
      staticsPositionMarketAbi.filter((item) => item.type === "function").map((item) => item.name),
    ).toEqual(functionNames);
    for (const functionName of functionNames) {
      expect(
        staticsAbi.filter((item) => item.type === "function" && item.name === functionName),
        functionName,
      ).toHaveLength(1);
    }
    expect(staticsPositionRoyaltyAbi.filter((item) => item.type === "function")).toHaveLength(3);
  });

  it("builds royalty and bounded valuation reads", () => {
    expect(
      decodeFunctionData({ abi: staticsPositionMarketAbi, data: buildPositionRoyaltyInfoCall(7n, 1_000n) }),
    ).toMatchObject({ functionName: "royaltyInfo", args: [7n, 1_000n] });
    expect(
      decodeFunctionData({ abi: staticsPositionMarketAbi, data: buildPositionRoyaltyCall() }).functionName,
    ).toBe("positionRoyalty");
    expect(
      decodeFunctionData({
        abi: staticsPositionMarketAbi,
        data: buildPositionPendingRewardsCall(7n, [asset]),
      }).functionName,
    ).toBe("pendingRewards");
    expect(decodeFunctionData({ abi: staticsPositionMarketAbi, data: buildPositionStakeCall(7n) }).functionName).toBe(
      "stakePosition",
    );
    expect(
      decodeFunctionData({ abi: staticsPositionMarketAbi, data: buildPositionRewardAssetsCall(7n) }).functionName,
    ).toBe("positionRewardAssets");
    expect(
      decodeFunctionData({
        abi: staticsPositionMarketAbi,
        data: buildPositionRewardOptInStatusCall(7n, asset),
      }).functionName,
    ).toBe("isRewardAssetOptedIn");
    expect(
      decodeFunctionData({
        abi: staticsPositionMarketAbi,
        data: buildPositionRewardSelectionCall(7n, asset),
      }).functionName,
    ).toBe("rewardSelection");
    expect(
      decodeFunctionData({
        abi: staticsPositionMarketAbi,
        data: buildGlobalRewardAssetsOfPositionCall(7n, 0n, MAX_POSITION_MARKET_PAGE_SIZE),
      }).functionName,
    ).toBe("globalRewardAssetsOfPosition");
    expect(() => buildGlobalRewardAssetsOfPositionCall(7n, 0n, 0n)).toThrow(/out of range/);
  });

  it("builds governed royalty configuration within the protocol cap", () => {
    expect(
      decodeFunctionData({
        abi: staticsPositionMarketAbi,
        data: buildSetPositionRoyaltyCall(receiver, MAX_POSITION_ROYALTY_BPS),
      }),
    ).toMatchObject({ functionName: "setPositionRoyalty", args: [receiver, MAX_POSITION_ROYALTY_BPS] });
    expect(() => buildSetPositionRoyaltyCall(receiver, MAX_POSITION_ROYALTY_BPS + 1)).toThrow(/out of range/);
    expect(
      decodeFunctionData({
        abi: staticsPositionMarketAbi,
        data: buildSetPositionRoyaltyCall(zeroAddress, 0),
      }).functionName,
    ).toBe("setPositionRoyalty");
  });

  it("decodes royalty, stake, reward, and page results", () => {
    const royalty = encodeFunctionResult({
      abi: staticsPositionMarketAbi,
      functionName: "positionRoyalty",
      result: [receiver, 500],
    });
    expect(decodePositionRoyaltyResult(royalty)).toEqual({ receiver, royaltyBps: 500 });

    const stake = encodeFunctionResult({
      abi: staticsPositionMarketAbi,
      functionName: "stakePosition",
      result: { stakedBalance: 100n, rewardMultiplierBps: 10_000, claimAssetCount: 1n, optedInAssetCount: 2n },
    });
    expect(decodePositionStakeResult(stake)).toMatchObject({ stakedBalance: 100n, optedInAssetCount: 2n });

    const selection = encodeFunctionResult({
      abi: staticsPositionMarketAbi,
      functionName: "rewardSelection",
      result: { selected: true, eligibleStake: 50n, eligibleWeight: 50n, pendingStake: 0n, pendingWeight: 0n, eligibleAt: 123 },
    });
    expect(decodePositionRewardSelectionResult(selection)).toMatchObject({ selected: true, eligibleAt: 123 });

    const page = encodeFunctionResult({
      abi: staticsPositionMarketAbi,
      functionName: "globalRewardAssetsOfPosition",
      result: [[asset], 1n],
    });
    expect(decodeGlobalRewardAssetsOfPositionResult(page)).toEqual({ assets: [asset], nextCursor: 1n });
  });

  it("decodes the royalty update event", () => {
    const topics = encodeEventTopics({
      abi: staticsPositionMarketAbi,
      eventName: "PositionRoyaltyUpdated",
      args: { receiver },
    });
    const data = encodeFunctionResult({
      abi: [{ type: "function", name: "encode", stateMutability: "pure", inputs: [], outputs: [{ type: "uint16" }] }],
      functionName: "encode",
      result: 500,
    });
    expect(
      decodeEventLog({ abi: staticsPositionMarketAbi, eventName: "PositionRoyaltyUpdated", topics, data }).args,
    ).toEqual({ receiver, royaltyBps: 500 });
  });
});
