import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Address,
  type ContractEventArgs,
  type Hex,
} from "viem";

export const MAX_POSITION_MARKET_PAGE_SIZE = 100n;
export const MAX_POSITION_ROYALTY_BPS = 1_000;

export type PositionStake = {
  stakedBalance: bigint;
  rewardMultiplierBps: number;
  claimAssetCount: bigint;
  optedInAssetCount: bigint;
};

export type PositionRewardSelection = {
  selected: boolean;
  eligibleStake: bigint;
  eligibleWeight: bigint;
  pendingStake: bigint;
  pendingWeight: bigint;
  eligibleAt: number;
};

export type PositionRewardSelectionWithTiming = {
  selection: PositionRewardSelection;
  /** Weighted effective start; zero when no stake is effectively pending. */
  pendingStartTime: number;
};

export type PositionAddressPage = {
  assets: readonly Address[];
  nextCursor: bigint;
};

export type PositionRoyalty = {
  receiver: Address;
  royaltyBps: number;
};

const rewardSelectionWithTimingSignature =
  "function rewardSelectionWithTiming(uint256 positionId,address asset) view returns ((bool selected,uint256 eligibleStake,uint256 eligibleWeight,uint256 pendingStake,uint256 pendingWeight,uint40 eligibleAt) selection,uint40 pendingStartTime)";

export const STATICS_REWARD_SELECTION_TIMING_INTERFACE_ID = "0x13cfa782" as const;
export const staticsRewardSelectionTimingAbi = parseAbi([rewardSelectionWithTimingSignature]);

export const staticsPositionMarketAbi = parseAbi([
  "function royaltyInfo(uint256 tokenId,uint256 salePrice) view returns (address receiver,uint256 royaltyAmount)",
  "function positionRoyalty() view returns (address receiver,uint16 royaltyBps)",
  "function setPositionRoyalty(address receiver,uint16 royaltyBps)",
  "function pendingRewards(uint256 positionId,address[] assets) view returns (uint256[] amounts)",
  "function stakePosition(uint256 positionId) view returns ((uint256 stakedBalance,uint16 rewardMultiplierBps,uint256 claimAssetCount,uint256 optedInAssetCount) position)",
  "function positionRewardAssets(uint256 positionId) view returns (address[] assets)",
  "function isRewardAssetOptedIn(uint256 positionId,address asset) view returns (bool)",
  "function rewardSelection(uint256 positionId,address asset) view returns ((bool selected,uint256 eligibleStake,uint256 eligibleWeight,uint256 pendingStake,uint256 pendingWeight,uint40 eligibleAt) selection)",
  rewardSelectionWithTimingSignature,
  "function globalRewardAssetsOfPosition(uint256 positionId,uint256 cursor,uint256 limit) view returns (address[] assets,uint256 nextCursor)",
  "event PositionRoyaltyUpdated(address indexed receiver,uint16 royaltyBps)",
  "error PositionRoyaltyAlreadyInitialized()",
  "error PositionRoyaltyNotInitialized()",
  "error InvalidPositionRoyaltyReceiver(address receiver)",
  "error PositionRoyaltyExceedsMaximum(uint256 royaltyBps,uint256 maximumRoyaltyBps)",
  "error InvalidRewardAssetPageSize(uint256 requested,uint256 maximum)",
]);

export const staticsPositionRoyaltyAbi = parseAbi([
  "function royaltyInfo(uint256 tokenId,uint256 salePrice) view returns (address receiver,uint256 royaltyAmount)",
  "function positionRoyalty() view returns (address receiver,uint16 royaltyBps)",
  "function setPositionRoyalty(address receiver,uint16 royaltyBps)",
  "event PositionRoyaltyUpdated(address indexed receiver,uint16 royaltyBps)",
]);

export type PositionMarketEventName = "PositionRoyaltyUpdated";

export type PositionMarketEventArgs<Name extends PositionMarketEventName> =
  ContractEventArgs<typeof staticsPositionMarketAbi, Name>;

function validatePage(limit: bigint): void {
  if (limit < 1n || limit > MAX_POSITION_MARKET_PAGE_SIZE) {
    throw new Error("limit is out of range");
  }
}

export function buildSetPositionRoyaltyCall(receiver: Address, royaltyBps: number): Hex {
  if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > MAX_POSITION_ROYALTY_BPS) {
    throw new Error("royaltyBps is out of range");
  }
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "setPositionRoyalty",
    args: [receiver, royaltyBps],
  });
}

export function buildPositionRoyaltyCall(): Hex {
  return encodeFunctionData({ abi: staticsPositionMarketAbi, functionName: "positionRoyalty" });
}

export function buildPositionRoyaltyInfoCall(tokenId: bigint, salePrice: bigint): Hex {
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "royaltyInfo",
    args: [tokenId, salePrice],
  });
}

export function buildPositionPendingRewardsCall(positionId: bigint, assets: readonly Address[]): Hex {
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "pendingRewards",
    args: [positionId, assets],
  });
}

export function buildPositionStakeCall(positionId: bigint): Hex {
  return encodeFunctionData({ abi: staticsPositionMarketAbi, functionName: "stakePosition", args: [positionId] });
}

export function buildPositionRewardAssetsCall(positionId: bigint): Hex {
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "positionRewardAssets",
    args: [positionId],
  });
}

export function buildPositionRewardOptInStatusCall(positionId: bigint, asset: Address): Hex {
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "isRewardAssetOptedIn",
    args: [positionId, asset],
  });
}

export function buildPositionRewardSelectionCall(positionId: bigint, asset: Address): Hex {
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "rewardSelection",
    args: [positionId, asset],
  });
}

/** Requires IStaticsRewardSelectionTiming support on the selected diamond. */
export function buildPositionRewardSelectionWithTimingCall(positionId: bigint, asset: Address): Hex {
  return encodeFunctionData({
    abi: staticsRewardSelectionTimingAbi,
    functionName: "rewardSelectionWithTiming",
    args: [positionId, asset],
  });
}

export function buildGlobalRewardAssetsOfPositionCall(positionId: bigint, cursor: bigint, limit: bigint): Hex {
  validatePage(limit);
  return encodeFunctionData({
    abi: staticsPositionMarketAbi,
    functionName: "globalRewardAssetsOfPosition",
    args: [positionId, cursor, limit],
  });
}

export function decodePositionRoyaltyResult(data: Hex): PositionRoyalty {
  const [receiver, royaltyBps] = decodeFunctionResult({
    abi: staticsPositionMarketAbi,
    functionName: "positionRoyalty",
    data,
  });
  return { receiver, royaltyBps };
}

export function decodePositionStakeResult(data: Hex): PositionStake {
  return decodeFunctionResult({ abi: staticsPositionMarketAbi, functionName: "stakePosition", data });
}

export function decodePositionRewardSelectionResult(data: Hex): PositionRewardSelection {
  return decodeFunctionResult({ abi: staticsPositionMarketAbi, functionName: "rewardSelection", data });
}

export function decodePositionRewardSelectionWithTimingResult(data: Hex): PositionRewardSelectionWithTiming {
  const [selection, pendingStartTime] = decodeFunctionResult({
    abi: staticsRewardSelectionTimingAbi,
    functionName: "rewardSelectionWithTiming",
    data,
  });
  return { selection, pendingStartTime };
}

export function decodeGlobalRewardAssetsOfPositionResult(data: Hex): PositionAddressPage {
  const [assets, nextCursor] = decodeFunctionResult({
    abi: staticsPositionMarketAbi,
    functionName: "globalRewardAssetsOfPosition",
    data,
  });
  return { assets, nextCursor };
}
