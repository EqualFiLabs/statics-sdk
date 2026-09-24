import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type ContractEventArgs,
  type Hex,
} from "viem";

export const MAX_GAUGE_ALLOCATIONS_PER_POSITION = 16;
export const MAX_WEEKLY_GAUGE_RELEASE_BPS = 1_000;

export type GaugeAllocation = {
  poolId: Hex;
  amount: bigint;
  eligibilityVersion: Hex;
};

export type GaugeReserve = {
  releaseBps: number;
  pendingReleaseBps: number;
  pendingReleaseEpoch: bigint;
  deferredMaturityEpoch: bigint;
  available: bigint;
  deferred: bigint;
  committed: bigint;
};

export type GaugePoolWeight = {
  scheduledWeight: bigint;
  storedVersion: Hex;
  currentVersion: Hex;
  stale: boolean;
};

export type GaugeEpoch = {
  finalized: boolean;
  releaseBps: number;
  winnerCount: number;
  activatedAt: number;
  finish: number;
  nominalBudget: bigint;
  committedBudget: bigint;
  totalWeight: bigint;
  pools: readonly [Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex, Hex];
  weights: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
  budgets: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
};

export type GaugePositionAllocations = {
  activeEpoch: bigint;
  active: readonly GaugeAllocation[];
  pendingEpoch: bigint;
  pending: readonly GaugeAllocation[];
  lockedStake: bigint;
};

export type GaugeTopTenPreview = {
  pools: readonly Hex[];
  weights: readonly bigint[];
  stale: boolean;
  stalePool: Hex;
};

export const staticsGaugeIncentivesAbi = parseAbi([
  "function fundGaugeReserve(uint256 amount) returns (uint256 received)",
  "function setGaugeAllocations(uint256 positionId,bytes32[] poolIds,uint256[] amounts)",
  "function checkpointGaugeEpoch() returns (uint64 epoch,uint256 committedBudget,bool finalized)",
  "function refreshGaugePoolWeight(bytes32 poolId) returns (uint256 removedWeight)",
  "function scheduleGaugeReleaseBps(uint16 releaseBps)",
  "function syncGaugeAllocationsAfterStakeLoss(uint256 positionId,uint256 remainingStake)",
  "function currentGaugeEpoch() view returns (uint64 epoch)",
  "function gaugeEpochAt(uint256 timestamp) pure returns (uint64 epoch)",
  "function gaugeReserve() view returns ((uint16 releaseBps,uint16 pendingReleaseBps,uint64 pendingReleaseEpoch,uint64 deferredMaturityEpoch,uint256 available,uint256 deferred,uint256 committed) state)",
  "function gaugePoolWeight(bytes32 poolId) view returns ((uint256 scheduledWeight,bytes32 storedVersion,bytes32 currentVersion,bool stale) state)",
  "function gaugePositionAllocations(uint256 positionId) view returns (uint64 activeEpoch,(bytes32 poolId,uint256 amount,bytes32 eligibilityVersion)[] active,uint64 pendingEpoch,(bytes32 poolId,uint256 amount,bytes32 eligibilityVersion)[] pending,uint256 lockedStake)",
  "function gaugeEpoch(uint64 epoch) view returns ((bool finalized,uint16 releaseBps,uint8 winnerCount,uint40 activatedAt,uint40 finish,uint256 nominalBudget,uint256 committedBudget,uint256 totalWeight,bytes32[10] pools,uint256[10] weights,uint256[10] budgets) state)",
  "function previewGaugeTopTen() view returns (bytes32[] pools,uint256[] weights,bool stale,bytes32 stalePool)",
  "function maxGaugeAllocationsPerPosition() pure returns (uint256)",
  "function maxWeeklyGaugeReleaseBps() pure returns (uint16)",
  "event GaugeReserveFunded(address indexed funder,uint256 amount,uint64 indexed maturityEpoch)",
  "event GaugeReleaseBpsScheduled(uint16 releaseBps,uint64 indexed effectiveEpoch)",
  "event PositionGaugeAllocationsScheduled(uint256 indexed positionId,uint64 indexed effectiveEpoch,uint256 totalAllocated)",
  "event PositionGaugeAllocationsClearedByStakeLoss(uint256 indexed positionId,uint256 remainingStake)",
  "event GaugePoolWeightRefreshed(bytes32 indexed poolId,bytes32 previousVersion,bytes32 currentVersion,uint256 removedWeight)",
  "event GaugeEpochFinalized(uint64 indexed epoch,uint40 activatedAt,uint40 finish,uint16 releaseBps,uint256 nominalBudget,uint256 committedBudget,uint256 totalWeight,uint8 winnerCount)",
  "event ProtocolGaugeRewardCommitted(uint64 indexed epoch,bytes32 indexed poolId,uint256 weight,uint256 budget)",
  "error InvalidGaugeFundingAmount()",
  "error IncompatibleGaugeTokenTransfer(uint256 requested,uint256 received)",
  "error GaugeAllocationLengthMismatch()",
  "error GaugeAllocationLimitExceeded(uint256 count,uint256 maximum)",
  "error InvalidGaugeAllocation(bytes32 poolId,uint256 amount)",
  "error DuplicateGaugeAllocation(bytes32 poolId)",
  "error GaugeAllocationExceedsStake(uint256 allocated,uint256 staked)",
  "error GaugeEpochNotFinalized(uint64 epoch)",
  "error StaleGaugePoolWeight(bytes32 poolId,bytes32 storedVersion,bytes32 currentVersion)",
  "error GaugePoolWeightCurrent(bytes32 poolId)",
  "error GaugeSelfCallOnly(address caller)",
  "error GaugeReserveAlreadyInitialized()",
  "error InvalidGaugeReleaseBps(uint256 releaseBps)",
  "error GaugeReserveUnderflow(uint256 requested,uint256 available)",
  "error GaugeCommitmentUnderflow(uint256 requested,uint256 committed)",
  "error DeferredEpochMismatch(uint64 storedEpoch,uint64 requestedEpoch)",
]);

export type GaugeIncentiveEventName =
  | "GaugeReserveFunded"
  | "GaugeReleaseBpsScheduled"
  | "PositionGaugeAllocationsScheduled"
  | "PositionGaugeAllocationsClearedByStakeLoss"
  | "GaugePoolWeightRefreshed"
  | "GaugeEpochFinalized"
  | "ProtocolGaugeRewardCommitted";

export type GaugeIncentiveEventArgs<Name extends GaugeIncentiveEventName> =
  ContractEventArgs<typeof staticsGaugeIncentivesAbi, Name>;

export function buildFundGaugeReserveCall(amount: bigint): Hex {
  if (amount <= 0n) throw new Error("amount must be greater than zero");
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "fundGaugeReserve", args: [amount] });
}

export function buildSetGaugeAllocationsCall(
  positionId: bigint,
  poolIds: readonly Hex[],
  amounts: readonly bigint[],
): Hex {
  if (poolIds.length !== amounts.length) throw new Error("poolIds and amounts length mismatch");
  if (poolIds.length > MAX_GAUGE_ALLOCATIONS_PER_POSITION) throw new Error("too many gauge allocations");
  const seen = new Set<string>();
  for (let index = 0; index < poolIds.length; index += 1) {
    const poolId = poolIds[index];
    if (seen.has(poolId)) throw new Error("duplicate gauge allocation");
    seen.add(poolId);
    if (amounts[index] === 0n) throw new Error("allocation amount must be greater than zero");
  }
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "setGaugeAllocations",
    args: [positionId, poolIds, amounts],
  });
}

export function buildCheckpointGaugeEpochCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "checkpointGaugeEpoch" });
}

export function buildRefreshGaugePoolWeightCall(poolId: Hex): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "refreshGaugePoolWeight", args: [poolId] });
}

export function buildScheduleGaugeReleaseBpsCall(releaseBps: number): Hex {
  if (!Number.isInteger(releaseBps) || releaseBps < 0 || releaseBps > MAX_WEEKLY_GAUGE_RELEASE_BPS) {
    throw new Error("releaseBps is out of range");
  }
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "scheduleGaugeReleaseBps",
    args: [releaseBps],
  });
}

export function buildCurrentGaugeEpochCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "currentGaugeEpoch" });
}

export function buildGaugeEpochAtCall(timestamp: bigint): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeEpochAt", args: [timestamp] });
}

export function buildGaugeReserveCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeReserve" });
}

export function buildGaugePoolWeightCall(poolId: Hex): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "gaugePoolWeight", args: [poolId] });
}

export function buildGaugePositionAllocationsCall(positionId: bigint): Hex {
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "gaugePositionAllocations",
    args: [positionId],
  });
}

export function buildGaugeEpochCall(epoch: bigint): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeEpoch", args: [epoch] });
}

export function buildPreviewGaugeTopTenCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "previewGaugeTopTen" });
}

export function buildMaxGaugeAllocationsPerPositionCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "maxGaugeAllocationsPerPosition" });
}

export function buildMaxWeeklyGaugeReleaseBpsCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "maxWeeklyGaugeReleaseBps" });
}

export function decodeGaugeReserveResult(data: Hex): GaugeReserve {
  return decodeFunctionResult({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeReserve", data });
}

export function decodeGaugePoolWeightResult(data: Hex): GaugePoolWeight {
  return decodeFunctionResult({ abi: staticsGaugeIncentivesAbi, functionName: "gaugePoolWeight", data });
}

export function decodeGaugePositionAllocationsResult(data: Hex): GaugePositionAllocations {
  const [activeEpoch, active, pendingEpoch, pending, lockedStake] = decodeFunctionResult({
    abi: staticsGaugeIncentivesAbi,
    functionName: "gaugePositionAllocations",
    data,
  });
  return { activeEpoch, active, pendingEpoch, pending, lockedStake };
}

export function decodeGaugeEpochResult(data: Hex): GaugeEpoch {
  return decodeFunctionResult({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeEpoch", data });
}

export function decodeGaugeTopTenPreviewResult(data: Hex): GaugeTopTenPreview {
  const [pools, weights, stale, stalePool] = decodeFunctionResult({
    abi: staticsGaugeIncentivesAbi,
    functionName: "previewGaugeTopTen",
    data,
  });
  return { pools, weights, stale, stalePool };
}
