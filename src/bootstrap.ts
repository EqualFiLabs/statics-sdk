import { encodeFunctionData, hashTypedData, parseAbi, type Address, type Hex } from "viem";
import type { CreateBasketParams, PoolLaunchParams } from "./index.js";
import { getSqrtPriceAtTick, quoteRangeAmounts } from "./v4-math.js";
import { basketTuple, poolTuple, type ArbitragePoolKey } from "./restricted-markets.js";

export type BasketCreationAuthorization = {
  creator: Address; payer: Address; preparationId: Hex; configurationHash: Hex;
  nonce: bigint; deadline: bigint; maxNativeFee: bigint;
};
const authTuple = "(address creator,address payer,bytes32 preparationId,bytes32 configurationHash,uint256 nonce,uint256 deadline,uint256 maxNativeFee)";
const requirementTuple = "(uint256 basketShares,uint256[] backing,uint256[] mintFees,uint256[] pairedAmounts,uint256[] totalAmounts,uint256 nativeCreationFee)";
export const staticsBootstrapAbi = parseAbi([
  `function creationAuthorizationDigest(${authTuple} authorization) view returns (bytes32)`,
  "function creationNonceUsed(address creator,uint256 nonce) view returns (bool)",
  "function invalidateCreationNonces(uint256 word,uint256 mask)",
  `function prepareBasketCreationFor(${basketTuple} params,${poolTuple}[] pools,uint256[] maximums,uint256 tokenNonce,uint256[] hookNonces,${authTuple} authorization,bytes signature) returns (bytes32 id,address token)`,
  `function createBasketFor(${basketTuple} params,${poolTuple}[] pools,uint256[] maximums,${authTuple} authorization,bytes signature) payable returns (uint256 basketId,address token)`,
  `function previewBasketLaunch(bytes32 preparationId,${basketTuple} params,${poolTuple}[] pools,uint256[] maximums,uint256 deadline) view returns (address token,${requirementTuple} requirements)`,
]);
export function basketCreationTypedData(chainId: bigint, diamond: Address, authorization: BasketCreationAuthorization) {
  return {
    domain: { name: "Statics Basket Creation", version: "1", chainId, verifyingContract: diamond },
    primaryType: "BasketCreation" as const,
    types: { BasketCreation: [
      { name: "creator", type: "address" }, { name: "payer", type: "address" },
      { name: "preparationId", type: "bytes32" }, { name: "configurationHash", type: "bytes32" },
      { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "maxNativeFee", type: "uint256" },
    ] },
    message: authorization,
  };
}
export function basketCreationAuthorizationDigest(chainId: bigint, diamond: Address, authorization: BasketCreationAuthorization): Hex {
  return hashTypedData(basketCreationTypedData(chainId, diamond, authorization));
}
export function encodeCreateBasketFor(params: CreateBasketParams, pools: readonly PoolLaunchParams[], maximums: readonly bigint[],
  authorization: BasketCreationAuthorization, signature: Hex): Hex {
  return encodeFunctionData({abi: staticsBootstrapAbi, functionName: "createBasketFor", args: [params, pools, maximums, authorization, signature]});
}
export function encodePrepareBasketCreationFor(params: CreateBasketParams, pools: readonly PoolLaunchParams[], maximums: readonly bigint[],
  tokenNonce: bigint, hookNonces: readonly bigint[], authorization: BasketCreationAuthorization, signature: Hex): Hex {
  return encodeFunctionData({abi: staticsBootstrapAbi, functionName: "prepareBasketCreationFor", args: [params, pools, maximums, tokenNonce, hookNonces, authorization, signature]});
}
export function encodePreviewBasketLaunch(id: Hex, params: CreateBasketParams, pools: readonly PoolLaunchParams[], maximums: readonly bigint[], deadline: bigint): Hex {
  return encodeFunctionData({abi: staticsBootstrapAbi, functionName: "previewBasketLaunch", args: [id, params, pools, maximums, deadline]});
}
export function encodeInvalidateCreationNonces(word: bigint, mask: bigint): Hex {
  return encodeFunctionData({abi: staticsBootstrapAbi, functionName: "invalidateCreationNonces", args: [word, mask]});
}

export type BasketLaunchRequirements = {
  basketShares: bigint; backing: bigint[]; mintFees: bigint[]; pairedAmounts: bigint[]; totalAmounts: bigint[]; nativeCreationFee: bigint;
};
const q96 = 1n << 96n;
const scale = 10n ** 18n;
function ceilDiv(n: bigint, d: bigint): bigint { return (n + d - 1n) / d; }
/** Pure preview for prepared identity. The onchain preview remains configuration authority. */
export function previewBasketLaunch(token: Address, params: CreateBasketParams, pools: readonly PoolLaunchParams[], nativeCreationFee: bigint): BasketLaunchRequirements {
  const length = params.assets.length;
  if (length === 0 || length > 16 || pools.length !== length || params.bundleAmounts.length !== length || nativeCreationFee < 0n) throw new Error("invalid launch shape");
  const result: BasketLaunchRequirements = {basketShares: 0n, backing: [], mintFees: [], pairedAmounts: [], totalAmounts: [], nativeCreationFee};
  for (let i = 0; i < length; i++) {
    const pool = pools[i];
    if (!Number.isInteger(pool.tickSpacing) || pool.tickSpacing < 1 || pool.tickSpacing > 32767 || pool.pairedAssetAmount <= 0n || !Number.isInteger(pool.lpFee) || pool.lpFee < 0 || pool.lpFee > 999_999) throw new Error("invalid launch pool");
    const lowerTick = Math.ceil(-887272 / pool.tickSpacing) * pool.tickSpacing;
    const upperTick = Math.floor(887272 / pool.tickSpacing) * pool.tickSpacing;
    const lower = getSqrtPriceAtTick(lowerTick), upper = getSqrtPriceAtTick(upperTick);
    const semantic = pool.sqrtPriceAssetPerBasketX96;
    if (semantic < 4295128739n || semantic >= 1461446703485210103287273052203988822378723970342n) throw new Error("invalid launch price");
    const assetIs0 = BigInt(params.assets[i]) < BigInt(token);
    const price = assetIs0 ? q96*q96/semantic : semantic;
    if (price <= lower || price >= upper) throw new Error("launch price outside full range");
    const liquidity = assetIs0 ? pool.pairedAssetAmount * (price*upper/q96) / (upper-price) : pool.pairedAssetAmount*q96/(price-lower);
    if (liquidity <= 0n || liquidity >= 1n << 128n) throw new Error("invalid launch liquidity");
    const amounts = quoteRangeAmounts(price, lowerTick, upperTick, liquidity);
    if (amounts.amount0 === 0n || amounts.amount1 === 0n) throw new Error("invalid launch liquidity");
    result.pairedAmounts.push(assetIs0 ? amounts.amount0 : amounts.amount1);
    result.basketShares += assetIs0 ? amounts.amount1 : amounts.amount0;
  }
  let feeShares = 0n, threshold = 0n, found = false;
  for (const tier of params.mintFeeTiers) if (tier.minActionShares <= result.basketShares && (!found || tier.minActionShares >= threshold)) {
    feeShares = tier.feeShares; threshold = tier.minActionShares; found = true;
  }
  for (let i = 0; i < length; i++) {
    if (params.bundleAmounts[i] <= 0n) throw new Error("invalid bundle amount");
    result.backing.push(ceilDiv(params.bundleAmounts[i]*result.basketShares, scale));
    result.mintFees.push(ceilDiv(params.bundleAmounts[i]*feeShares, scale));
    result.totalAmounts.push(result.backing[i]+result.mintFees[i]+result.pairedAmounts[i]);
  }
  return result;
}

export type CampaignAuctionTerms = {targetCap: bigint; startRate: bigint; capRate: bigint; startsAt: bigint; endsAt: bigint; minimumFill: bigint};
const auctionTuple = "(uint256 targetCap,uint256 startRate,uint256 capRate,uint256 startsAt,uint256 endsAt,uint256 minimumFill)";
const auctionStateTuple = "(bool activated,uint256 remaining,uint256 reservedPayment,uint256 acquired,uint256 paid)";
export type CampaignTerms = {creator: Address; beneficiary: Address; projectToken: Address; deadline: bigint; basket: CreateBasketParams;
  pools: readonly PoolLaunchParams[]; maximums: readonly bigint[]; auctions: readonly CampaignAuctionTerms[]; adapters: readonly Address[]};
const campaignTuple = `(address creator,address beneficiary,address projectToken,uint256 deadline,${basketTuple} basket,${poolTuple}[] pools,uint256[] maximums,${auctionTuple}[] auctions,address[] adapters)`;
export const basketBootstrapFactoryAbi = parseAbi([
  `function predict(${campaignTuple} terms,bytes32 salt) view returns (address)`,
  `function create(${campaignTuple} terms,bytes32 salt) returns (address campaign)`,
  "function isCampaign(address campaign) view returns (bool)", "function diamond() view returns (address)",
]);
export const basketBootstrapCampaignAbi = parseAbi([
  "function factory() view returns (address)", "function custodyAsset(uint256 index) view returns (address)",
  "function state() view returns (uint8)", "function ready() view returns (bool)",
  `function configuration() view returns (${basketTuple},${poolTuple}[],uint256[])`,
  "function termsHash() view returns (bytes32)", "function preparedToken() view returns (address)",
  "function assetCount() view returns (uint256)", "function nativeRequired() view returns (uint256)",
  "function freePayment() view returns (uint256)", "function reservedPayment() view returns (uint256)",
  "function inventory(uint256 index) view returns (address asset,uint256 target,uint256 held,uint256 missing)",
  `function auction(uint256 index) view returns (${auctionTuple},${auctionStateTuple})`,
  `function prepare(uint256 tokenNonce,uint256[] hookNonces,${authTuple} intent,bytes signature)`,
  "function fund(uint256 index,uint256 amount)", "function deliverRevenue(uint256 index,uint256 amount)",
  "function fundPayment(uint256 amount)", "function fundNative() payable", "function activateAuction(uint256 index)",
  "function quoteFill(uint256 index,uint256 amount) view returns (uint256 payment)",
  "function capLiability(uint256 index,uint256 quantity) view returns (uint256)",
  "function fill(uint256 index,uint256 amount,uint256 minimumPayment,address recipient,uint256 fillDeadline) returns (uint256 payment)",
  "function finalize() returns (uint256 createdId,address token)", "function claimTerminalInventory()",
]);
export function quoteProcurementLiability(terms: CampaignAuctionTerms, quantity: bigint): bigint {
  if (quantity < 0n || terms.minimumFill <= 0n || terms.capRate < terms.startRate || terms.startRate <= 0n) throw new Error("invalid auction");
  return quantity === 0n ? 0n : ceilDiv(quantity*terms.capRate, scale)+ceilDiv(quantity, terms.minimumFill);
}
export function quoteProcurementPayment(terms: CampaignAuctionTerms, quantity: bigint, timestamp: bigint): bigint {
  if (quantity <= 0n || terms.endsAt <= terms.startsAt || timestamp < terms.startsAt || timestamp >= terms.endsAt) throw new Error("invalid fill time");
  const rate = terms.startRate + (terms.capRate-terms.startRate)*(timestamp-terms.startsAt)/(terms.endsAt-terms.startsAt);
  return ceilDiv(quantity*rate, scale);
}
export function encodeCreateCampaign(terms: CampaignTerms, salt: Hex): Hex {
  return encodeFunctionData({abi: basketBootstrapFactoryAbi, functionName: "create", args: [terms, salt]});
}
export function encodePrepareCampaign(tokenNonce: bigint, hookNonces: readonly bigint[], auth: BasketCreationAuthorization, signature: Hex): Hex {
  return encodeFunctionData({abi: basketBootstrapCampaignAbi, functionName: "prepare", args: [tokenNonce, hookNonces, auth, signature]});
}
export function encodeCampaignFunding(kind: "launch" | "payment" | "revenue", index: bigint, amount: bigint): Hex {
  return kind === "payment" ? encodeFunctionData({abi: basketBootstrapCampaignAbi, functionName: "fundPayment", args: [amount]}) :
    encodeFunctionData({abi: basketBootstrapCampaignAbi, functionName: kind === "launch" ? "fund" : "deliverRevenue", args: [index, amount]});
}
export function encodeCampaignAction(action: "finalize" | "claimTerminalInventory" | "fundNative"): Hex {
  return encodeFunctionData({abi: basketBootstrapCampaignAbi, functionName: action});
}
export function encodeActivateProcurement(index: bigint): Hex {
  return encodeFunctionData({abi: basketBootstrapCampaignAbi, functionName: "activateAuction", args: [index]});
}
export function encodeFillProcurement(index: bigint, amount: bigint, minimumPayment: bigint, recipient: Address, deadline: bigint): Hex {
  return encodeFunctionData({abi: basketBootstrapCampaignAbi, functionName: "fill", args: [index, amount, minimumPayment, recipient, deadline]});
}
export type ZapInput = {token: Address; maximum: bigint; receiver: Address; deadline: bigint};
export type ZapRoute = {currencies: readonly Address[]; pools: readonly ArbitragePoolKey[]; maximumInput: bigint};
export type CampaignPurchase = {auctionIndex: bigint; amount: bigint; minimumPayment: bigint};
const zapInput = "(address token,uint256 maximum,address receiver,uint256 deadline)";
const routeTuple = "(address[] currencies,(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)[] pools,uint256 maximumInput)";
export const staticsAssetZapAbi = parseAbi([
  `function mintBasket(${zapInput} input,uint256 basketId,uint256 shares,uint256[] maximumAssetAmounts,${routeTuple}[] routes) payable returns (uint256 inputSpent)`,
  `function purchaseCampaign(${zapInput} input,address campaignAddress,(uint256 auctionIndex,uint256 amount,uint256 minimumPayment)[] purchases,uint256 minimumTotalPayment,${routeTuple}[] routes) payable returns (uint256 inputSpent,uint256 payment)`,
]);
export const measuredCampaignRevenueAbi = parseAbi([
  "function bindCampaign(address destination,uint256 index)",
  "function recipient() view returns (address)",
  "function deliverRealized(uint256 amount)",
  "function totalDelivered() view returns (uint256)",
]);
export function encodeBindRevenueCampaign(campaign: Address, index: bigint): Hex {
  return encodeFunctionData({abi: measuredCampaignRevenueAbi, functionName: "bindCampaign", args: [campaign,index]});
}
export function encodeDeliverRealizedRevenue(amount: bigint): Hex {
  return encodeFunctionData({abi: measuredCampaignRevenueAbi, functionName: "deliverRealized", args: [amount]});
}
export const nativeCampaignRevenueAbi = parseAbi([
  "function bindCampaign(address destination,uint256 index)",
  "function recipient() view returns (address)",
  "function deliverRealized(uint256 amount)",
  "function deliverNative() payable",
  "function totalDelivered() view returns (uint256)",
  "function wethRuntimeHash() view returns (bytes32)",
]);
/** Native value is explicit and never inferred from adapter balances. */
export function buildDeliverNativeRevenueCall(amount: bigint): {data: Hex; value: bigint} {
  if (amount <= 0n || amount >= 1n << 256n) throw new Error("invalid native revenue amount");
  return {data: encodeFunctionData({abi: nativeCampaignRevenueAbi, functionName: "deliverNative"}), value: amount};
}
export function encodeZapBasketMint(input: ZapInput, basketId: bigint, shares: bigint, maximums: readonly bigint[], routes: readonly ZapRoute[]): Hex {
  return encodeFunctionData({abi: staticsAssetZapAbi, functionName: "mintBasket", args: [input, basketId, shares, maximums, routes]});
}
export function encodeZapCampaignPurchase(input: ZapInput, campaign: Address, purchases: readonly CampaignPurchase[], minimumTotalPayment: bigint, routes: readonly ZapRoute[]): Hex {
  return encodeFunctionData({abi: staticsAssetZapAbi, functionName: "purchaseCampaign", args: [input, campaign, purchases, minimumTotalPayment, routes]});
}
