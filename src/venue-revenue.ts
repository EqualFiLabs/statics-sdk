import { encodeFunctionData, isAddress, parseAbi, zeroAddress, type Address, type Hex } from "viem";

export const ponsRevenueAdapterAbi = parseAbi([
  "function bindCampaign(address destination,uint256 index)",
  "function sourceFactory() view returns (address)",
  "function escrow() view returns (address)",
  "function sourceToken() view returns (address)",
  "function curve() view returns (address)",
  "function nativeQuote() view returns (bool)",
  "function handedOff() view returns (bool)",
  "function totalDelivered() view returns (uint256)",
  "function collect(uint256 maximum) returns (uint256 amount)",
  "function handoff()",
  "event CreatorRevenueHandedOff(address indexed token,address indexed beneficiary)",
]);

export const moshTeamRevenueAdapterAbi = parseAbi([
  "function bindCampaign(address destination,uint256 index)",
  "function bindSource(address source)",
  "function swarm() view returns (address)",
  "function sourceToken() view returns (address)",
  "function sourceTeamRecipient() view returns (address)",
  "function expectedTeamShareBps() view returns (uint256)",
  "function teamClaims() view returns (uint256)",
  "function rightsBound() view returns (bool)",
  "function nativeReserved() view returns (uint256)",
  "function totalMeasured() view returns (uint256)",
  "function totalDelivered() view returns (uint256)",
  "function acceptTeamHandoff(uint256 offerId,uint256 amount) payable",
  "function sync() returns (uint256 amount)",
  "function flushTeamRevenue() returns (uint256 amount)",
  "event TeamSourceBound(address indexed swarm,address indexed originalRecipient,uint256 teamShareBps)",
  "event TeamRightsBound(address indexed seller,uint256 indexed offerId,uint256 claims)",
  "event TeamRevenueMeasured(uint256 amount)",
]);

export const staticsBootstrapSettlementAbi = parseAbi([
  "function installBootstrapFactory(address factory,bytes32 runtimeHash,bytes32 creationCodeHash)",
  "function bootstrapFactoryApproved(address factory) view returns (bool)",
  "function registerBootstrapCampaign(address campaign)",
  "function settleBootstrapToken(address token,address sender,address receiver,uint256 amount)",
]);

function positiveUint(value: bigint): void {
  if (value <= 0n || value >= 1n << 256n) throw new Error("invalid revenue amount");
}

export function encodePonsRevenueCollect(maximum: bigint): Hex {
  positiveUint(maximum);
  return encodeFunctionData({abi: ponsRevenueAdapterAbi, functionName: "collect", args: [maximum]});
}
export function encodePonsRevenueHandoff(): Hex {
  return encodeFunctionData({abi: ponsRevenueAdapterAbi, functionName: "handoff"});
}
export function encodeMoshTeamBindSource(source: Address): Hex {
  if (!isAddress(source) || source === zeroAddress) throw new Error("invalid team source");
  return encodeFunctionData({abi: moshTeamRevenueAdapterAbi, functionName: "bindSource", args: [source]});
}
export function buildMoshTeamHandoffCall(offerId: bigint, amount: bigint): {data: Hex; value: bigint} {
  positiveUint(amount);
  if (offerId < 0n || offerId >= 1n << 256n) throw new Error("invalid offer id");
  return {data: encodeFunctionData({abi: moshTeamRevenueAdapterAbi, functionName: "acceptTeamHandoff", args: [offerId, amount]}), value: 1n};
}
export function encodeMoshTeamSync(): Hex {
  return encodeFunctionData({abi: moshTeamRevenueAdapterAbi, functionName: "sync"});
}
export function encodeMoshTeamFlush(): Hex {
  return encodeFunctionData({abi: moshTeamRevenueAdapterAbi, functionName: "flushTeamRevenue"});
}
