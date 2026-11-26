import { decodeFunctionResult, encodeFunctionData, parseAbi, type Address, type ContractEventArgs, type Hex } from "viem";

export type PoolCreatorConfiguration = {
  creator: Address;
  pendingCreator: Address;
  revenueRecipient: Address;
};

export const staticsPoolCreatorAbi = parseAbi([
  "function proposePoolCreator(bytes32 poolId,address newCreator)",
  "function acceptPoolCreator(bytes32 poolId)",
  "function setCreatorRevenueRecipient(bytes32 poolId,address recipient)",
  "function poolCreatorConfiguration(bytes32 poolId) view returns (address creator,address pendingCreator,address revenueRecipient)",
  "event PoolCreatorProposed(bytes32 indexed poolId,address indexed creator,address indexed proposedCreator)",
  "event PoolCreatorProposalCancelled(bytes32 indexed poolId,address indexed creator,address indexed proposedCreator)",
  "event PoolCreatorTransferred(bytes32 indexed poolId,address indexed previousCreator,address indexed creator)",
  "event CreatorRevenueRecipientSet(bytes32 indexed poolId,address indexed creator,address indexed recipient)",
  "error UnsupportedCreatorPool(bytes32 poolId)",
  "error InvalidPoolCreator(address creator)",
  "error OnlyPendingPoolCreator(address caller,address pendingCreator)",
  "error UnexpectedRevenueRecipient(address receiver,address expected)",
]);

export type PoolCreatorEventName = "PoolCreatorProposed" | "PoolCreatorProposalCancelled" | "PoolCreatorTransferred" | "CreatorRevenueRecipientSet";
export type PoolCreatorEventArgs<Name extends PoolCreatorEventName> = ContractEventArgs<typeof staticsPoolCreatorAbi, Name>;

function validatePoolId(poolId: Hex): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(poolId)) throw new Error("poolId must be bytes32");
}

/** Zero newCreator cancels the current proposal. Acceptance must be sent by the proposed account. */
export function buildProposePoolCreatorCall(poolId: Hex, newCreator: Address): Hex {
  validatePoolId(poolId);
  return encodeFunctionData({ abi: staticsPoolCreatorAbi, functionName: "proposePoolCreator", args: [poolId, newCreator] });
}

export function buildAcceptPoolCreatorCall(poolId: Hex): Hex {
  validatePoolId(poolId);
  return encodeFunctionData({ abi: staticsPoolCreatorAbi, functionName: "acceptPoolCreator", args: [poolId] });
}

/** Zero recipient restores the current creator. Every general-pool claim pays the effective recipient. */
export function buildSetCreatorRevenueRecipientCall(poolId: Hex, recipient: Address): Hex {
  validatePoolId(poolId);
  return encodeFunctionData({ abi: staticsPoolCreatorAbi, functionName: "setCreatorRevenueRecipient", args: [poolId, recipient] });
}

export function buildPoolCreatorConfigurationCall(poolId: Hex): Hex {
  validatePoolId(poolId);
  return encodeFunctionData({ abi: staticsPoolCreatorAbi, functionName: "poolCreatorConfiguration", args: [poolId] });
}

export function decodePoolCreatorConfigurationResult(data: Hex): PoolCreatorConfiguration {
  const [creator, pendingCreator, revenueRecipient] = decodeFunctionResult({ abi: staticsPoolCreatorAbi, functionName: "poolCreatorConfiguration", data });
  return { creator, pendingCreator, revenueRecipient };
}
