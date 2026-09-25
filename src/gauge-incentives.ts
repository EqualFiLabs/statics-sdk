import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Address,
  type ContractEventArgs,
  type Hex,
} from "viem";

export const MAX_GAUGE_ALLOCATIONS_PER_POSITION = 16;
export const MAX_WEEKLY_GAUGE_RELEASE_BPS = 1_000;
export const GAUGE_ALLOCATOR_CLAIM_WINDOW_EPOCHS = 26n;

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
  closed: boolean;
  releaseBps: number;
  activatedAt: number;
  finish: number;
  activationDeadline: number;
  nominalBudget: bigint;
  committedBudget: bigint;
  unactivatedBudget: bigint;
  totalWeight: bigint;
};

export type GaugePositionAllocations = {
  activeEpoch: bigint;
  active: readonly GaugeAllocation[];
  pendingEpoch: bigint;
  pending: readonly GaugeAllocation[];
  lockedStake: bigint;
};

export type GaugePoolReward = {
  weight: bigint;
  eligibilityVersion: Hex;
  restrictionSequence: bigint;
  budget: bigint;
  resolved: boolean;
  streamStarted: boolean;
};

export type GaugeAllocatorReward = {
  asset: Address;
  eligibilityVersion: Hex;
  finalized: boolean;
  expired: boolean;
  fundedAt: number;
  expiresAt: number;
  funded: bigint;
  totalWeight: bigint;
  distributable: bigint;
  remainingLiability: bigint;
};

export type GaugeAllocatorClaimPreview = {
  slot: number;
  asset: Address;
  allocation: bigint;
  amount: bigint;
  finalized: boolean;
  claimed: boolean;
  expired: boolean;
};

export const staticsGaugeIncentivesAbi = parseAbi([
  "function fundGaugeReserve(uint256 amount) returns (uint256 received)",
  "function setGaugeAllocations(uint256 positionId,bytes32[] poolIds,uint256[] amounts)",
  "function checkpointGaugeEpoch() returns (uint64 epoch,uint256 committedBudget,bool finalized)",
  "function checkpointGaugePool(bytes32 poolId) returns (uint256 committed,uint256 recycled)",
  "function closeGaugeEpoch(uint64 epoch) returns (uint256 recycled)",
  "function scheduleGaugeReleaseBps(uint16 releaseBps)",
  "function syncGaugeAllocationsAfterStakeLoss(uint256 positionId,uint256 remainingStake)",
  "function finalizeGaugeAllocatorReward(bytes32 poolId,uint8 slot,uint64 epoch) returns (uint256 distributable)",
  "function claimGaugeAllocatorRewards(uint256 positionId,bytes32 poolId,uint64 epoch,uint8[] slots,uint256[] minimumAmounts,address receiver) returns (uint256[] received)",
  "function expireGaugeAllocatorReward(bytes32 poolId,uint8 slot,uint64 epoch) returns (uint256 amount)",
  "function currentGaugeEpoch() view returns (uint64 epoch)",
  "function gaugeEpochAt(uint256 timestamp) pure returns (uint64 epoch)",
  "function gaugeReserve() view returns ((uint16 releaseBps,uint16 pendingReleaseBps,uint64 pendingReleaseEpoch,uint64 deferredMaturityEpoch,uint256 available,uint256 deferred,uint256 committed) state)",
  "function gaugePoolWeight(bytes32 poolId) view returns ((uint256 scheduledWeight,bytes32 storedVersion,bytes32 currentVersion,bool stale) state)",
  "function gaugePositionAllocations(uint256 positionId) view returns (uint64 activeEpoch,(bytes32 poolId,uint256 amount,bytes32 eligibilityVersion)[] active,uint64 pendingEpoch,(bytes32 poolId,uint256 amount,bytes32 eligibilityVersion)[] pending,uint256 lockedStake)",
  "function gaugeEpoch(uint64 epoch) view returns ((bool finalized,bool closed,uint16 releaseBps,uint40 activatedAt,uint40 finish,uint40 activationDeadline,uint256 nominalBudget,uint256 committedBudget,uint256 unactivatedBudget,uint256 totalWeight) state)",
  "function previewGaugePoolReward(bytes32 poolId,uint64 epoch) view returns ((uint256 weight,bytes32 eligibilityVersion,uint64 restrictionSequence,uint256 budget,bool resolved,bool streamStarted) state)",
  "function maxGaugeAllocationsPerPosition() pure returns (uint256)",
  "function maxWeeklyGaugeReleaseBps() pure returns (uint16)",
  "function gaugeAllocatorReward(bytes32 poolId,uint8 slot,uint64 epoch) view returns ((address asset,bytes32 eligibilityVersion,bool finalized,bool expired,uint40 fundedAt,uint40 expiresAt,uint256 funded,uint256 totalWeight,uint256 distributable,uint256 remainingLiability) state)",
  "function gaugePositionAllocationAt(uint256 positionId,bytes32 poolId,uint64 epoch) view returns (uint256 amount,bytes32 eligibilityVersion)",
  "function previewGaugeAllocatorRewards(uint256 positionId,bytes32 poolId,uint64 epoch,uint8[] slots) view returns ((uint8 slot,address asset,uint256 allocation,uint256 amount,bool finalized,bool claimed,bool expired)[] rewards)",
  "function gaugeAllocatorClaimWindow() pure returns (uint64 epochs)",
  "event GaugeReserveFunded(address indexed funder,uint256 amount,uint64 indexed maturityEpoch)",
  "event GaugeReleaseBpsScheduled(uint16 releaseBps,uint64 indexed effectiveEpoch)",
  "event PositionGaugeAllocationsScheduled(uint256 indexed positionId,uint64 indexed effectiveEpoch,uint256 totalAllocated)",
  "event PositionGaugeAllocationsClearedByStakeLoss(uint256 indexed positionId,uint256 remainingStake)",
  "event GaugeEpochFinalized(uint64 indexed epoch,uint40 activatedAt,uint40 finish,uint16 releaseBps,uint256 nominalBudget,uint256 committedBudget,uint256 totalWeight)",
  "event ProtocolGaugeRewardCommitted(uint64 indexed epoch,bytes32 indexed poolId,uint256 weight,uint256 budget)",
  "event ProtocolGaugeRewardRecycled(uint64 indexed epoch,bytes32 indexed poolId,uint256 weight,uint256 budget)",
  "event GaugeEpochClosed(uint64 indexed epoch,uint256 recycled)",
  "event GaugeAllocatorRewardFinalized(bytes32 indexed poolId,uint8 indexed slot,uint64 indexed epoch,address asset,uint256 distributable,uint256 totalWeight,uint40 expiresAt)",
  "event GaugeAllocatorRewardClaimed(uint256 indexed positionId,bytes32 indexed poolId,uint64 indexed epoch,uint8 slot,address asset,address receiver,uint256 debited,uint256 received)",
  "event GaugeAllocatorRewardExpired(bytes32 indexed poolId,uint8 indexed slot,uint64 indexed epoch,address asset,uint256 amount)",
  "error InvalidGaugeFundingAmount()",
  "error IncompatibleGaugeTokenTransfer(uint256 requested,uint256 received)",
  "error GaugeAllocationLengthMismatch()",
  "error GaugeAllocationLimitExceeded(uint256 count,uint256 maximum)",
  "error InvalidGaugeAllocation(bytes32 poolId,uint256 amount)",
  "error DuplicateGaugeAllocation(bytes32 poolId)",
  "error GaugeAllocationExceedsStake(uint256 allocated,uint256 staked)",
  "error GaugeEpochNotFinalized(uint64 epoch)",
  "error GaugeEpochActivationClosed(uint64 epoch,uint40 deadline,uint40 currentTime)",
  "error GaugeEpochActivationActive(uint64 epoch,uint40 deadline,uint40 currentTime)",
  "error GaugeEpochBudgetUnderflow(uint64 epoch,uint256 requested,uint256 available)",
  "error GaugeSelfCallOnly(address caller)",
  "error InvalidGaugeAllocatorSlot(bytes32 poolId,uint8 slot)",
  "error GaugeAllocatorRewardNotFound(bytes32 poolId,uint8 slot,uint64 epoch)",
  "error GaugeAllocatorEpochActive(uint64 epoch,uint40 finish,uint40 currentTime)",
  "error GaugeAllocatorRewardNotFinalized(bytes32 poolId,uint8 slot,uint64 epoch)",
  "error GaugeAllocatorRewardAlreadyClaimed(uint256 positionId,bytes32 poolId,uint8 slot,uint64 epoch)",
  "error GaugeAllocatorClaimExpired(bytes32 poolId,uint8 slot,uint64 epoch,uint40 expiresAt)",
  "error GaugeAllocatorClaimWindowActive(bytes32 poolId,uint8 slot,uint64 epoch,uint40 expiresAt,uint40 currentTime)",
  "error GaugeAllocatorLiabilityUnderflow(bytes32 poolId,uint8 slot,uint64 epoch,uint256 liability,uint256 amount)",
  "error GaugeAllocatorClaimLengthMismatch()",
  "error DuplicateGaugeAllocatorSlot(uint8 slot)",
  "error InvalidGaugeAllocatorReceiver(address receiver)",
  "error GaugeAllocatorAmountBelowMinimum(address asset,uint256 received,uint256 minimum)",
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
  | "GaugeEpochFinalized"
  | "ProtocolGaugeRewardCommitted"
  | "ProtocolGaugeRewardRecycled"
  | "GaugeEpochClosed"
  | "GaugeAllocatorRewardFinalized"
  | "GaugeAllocatorRewardClaimed"
  | "GaugeAllocatorRewardExpired";

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

export function buildCheckpointGaugePoolCall(poolId: Hex): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "checkpointGaugePool", args: [poolId] });
}

export function buildCloseGaugeEpochCall(epoch: bigint): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "closeGaugeEpoch", args: [epoch] });
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

function validateAllocatorSlot(slot: number): number {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new Error("allocator slot must be between 1 and 4");
  return slot;
}

export function buildFinalizeGaugeAllocatorRewardCall(poolId: Hex, slot: number, epoch: bigint): Hex {
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "finalizeGaugeAllocatorReward",
    args: [poolId, validateAllocatorSlot(slot), epoch],
  });
}

export function buildClaimGaugeAllocatorRewardsCall(
  positionId: bigint,
  poolId: Hex,
  epoch: bigint,
  slots: readonly number[],
  minimumAmounts: readonly bigint[],
  receiver: Address,
): Hex {
  if (slots.length !== minimumAmounts.length) throw new Error("slots and minimumAmounts length mismatch");
  const validatedSlots = slots.map(validateAllocatorSlot);
  if (new Set(validatedSlots).size !== validatedSlots.length) throw new Error("duplicate allocator slot");
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "claimGaugeAllocatorRewards",
    args: [positionId, poolId, epoch, validatedSlots, minimumAmounts, receiver],
  });
}

export function buildExpireGaugeAllocatorRewardCall(poolId: Hex, slot: number, epoch: bigint): Hex {
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "expireGaugeAllocatorReward",
    args: [poolId, validateAllocatorSlot(slot), epoch],
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

export function buildPreviewGaugePoolRewardCall(poolId: Hex, epoch: bigint): Hex {
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "previewGaugePoolReward",
    args: [poolId, epoch],
  });
}

export function buildMaxGaugeAllocationsPerPositionCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "maxGaugeAllocationsPerPosition" });
}

export function buildMaxWeeklyGaugeReleaseBpsCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "maxWeeklyGaugeReleaseBps" });
}

export function buildGaugeAllocatorRewardCall(poolId: Hex, slot: number, epoch: bigint): Hex {
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "gaugeAllocatorReward",
    args: [poolId, validateAllocatorSlot(slot), epoch],
  });
}

export function buildGaugePositionAllocationAtCall(positionId: bigint, poolId: Hex, epoch: bigint): Hex {
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "gaugePositionAllocationAt",
    args: [positionId, poolId, epoch],
  });
}

export function buildPreviewGaugeAllocatorRewardsCall(
  positionId: bigint,
  poolId: Hex,
  epoch: bigint,
  slots: readonly number[],
): Hex {
  const validatedSlots = slots.map(validateAllocatorSlot);
  return encodeFunctionData({
    abi: staticsGaugeIncentivesAbi,
    functionName: "previewGaugeAllocatorRewards",
    args: [positionId, poolId, epoch, validatedSlots],
  });
}

export function buildGaugeAllocatorClaimWindowCall(): Hex {
  return encodeFunctionData({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeAllocatorClaimWindow" });
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

export function decodeGaugePoolRewardResult(data: Hex): GaugePoolReward {
  return decodeFunctionResult({
    abi: staticsGaugeIncentivesAbi,
    functionName: "previewGaugePoolReward",
    data,
  });
}

export function decodeGaugeAllocatorRewardResult(data: Hex): GaugeAllocatorReward {
  return decodeFunctionResult({ abi: staticsGaugeIncentivesAbi, functionName: "gaugeAllocatorReward", data });
}

export function decodeGaugePositionAllocationAtResult(data: Hex): {
  amount: bigint;
  eligibilityVersion: Hex;
} {
  const [amount, eligibilityVersion] = decodeFunctionResult({
    abi: staticsGaugeIncentivesAbi,
    functionName: "gaugePositionAllocationAt",
    data,
  });
  return { amount, eligibilityVersion };
}

export function decodeGaugeAllocatorRewardsPreviewResult(data: Hex): readonly GaugeAllocatorClaimPreview[] {
  return decodeFunctionResult({
    abi: staticsGaugeIncentivesAbi,
    functionName: "previewGaugeAllocatorRewards",
    data,
  });
}
