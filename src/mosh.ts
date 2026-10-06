import { encodeFunctionData, isAddress, parseAbi, zeroAddress, type Address, type Hex } from "viem";

/** Integration subset for the tested native-counter generation, not an ERC-20 share ABI. */
export const moshNativeSwarmAbi = parseAbi([
  "function factory() view returns (address)",
  "function registry() view returns (address)",
  "function memecoin() view returns (address)",
  "function counterAsset() view returns (address)",
  "function counterIsNative() view returns (bool)",
  "function teamRecipient() view returns (address)",
  "function claim(address owner) view returns (uint256)",
  "function claimable(address owner) view returns (uint256)",
  "function syncFees() returns (uint256)",
  "function collectFees() returns (uint256)",
]);

/** Getter layout and market movement signatures are pinned-fork evidence, not verified Solidity source. */
export const moshClaimMarketAbi = parseAbi([
  "function offers(uint256 offerId) view returns (address swarm,address seller,address buyer,uint256 amount,uint256 price,uint64 deadline,uint16 feeBps)",
  "function feeBps() view returns (uint256)",
  "function list(address swarm,uint256 amount,uint256 price,address buyer,uint64 deadline) returns (uint256 offerId)",
  "function fill(uint256 offerId) payable",
  "function cancel(uint256 offerId)",
]);

function uint(value: bigint, bits: bigint, name: string): void {
  if (value < 0n || value >= 1n << bits) throw new Error(`invalid ${name}`);
}

/** The seller lists; only the specified buyer can fill. Listing does not move custody. */
export function encodeMoshNativeCustodyListing(swarm: Address, amount: bigint, buyer: Address, deadline: bigint): Hex {
  uint(amount, 256n, "claim amount");
  uint(deadline, 64n, "claim deadline");
  if (amount === 0n || deadline === 0n) throw new Error("empty custody listing");
  if (!isAddress(swarm) || !isAddress(buyer) || swarm === zeroAddress || buyer === zeroAddress) {
    throw new Error("invalid custody address");
  }
  return encodeFunctionData({abi: moshClaimMarketAbi, functionName: "list", args: [swarm, amount, 1n, buyer, deadline]});
}

/** For validated one-wei native-counter custody offers only; never a generic purchase quote. */
export function buildMoshNativeCustodyFillCall(offerId: bigint): {data: Hex; value: bigint} {
  uint(offerId, 256n, "offer id");
  return {data: encodeFunctionData({abi: moshClaimMarketAbi, functionName: "fill", args: [offerId]}), value: 1n};
}

export function encodeMoshClaimMarketCancel(offerId: bigint): Hex {
  uint(offerId, 256n, "offer id");
  return encodeFunctionData({abi: moshClaimMarketAbi, functionName: "cancel", args: [offerId]});
}

/** Synchronizes realized upstream fees; it cannot force privileged PONS conversion. */
export function encodeMoshSyncFees(): Hex {
  return encodeFunctionData({abi: moshNativeSwarmAbi, functionName: "syncFees"});
}
