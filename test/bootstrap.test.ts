import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeFunctionData, keccak256, zeroAddress, type Address } from "viem";
import * as bootstrap from "../src/bootstrap.js";
import { staticsAbi } from "../src/index.js";

const identity = JSON.parse(readFileSync(new URL("./fixtures/basket-create3.json", import.meta.url), "utf8"));
const fixture = JSON.parse(readFileSync(new URL("./fixtures/basket-bootstrap.json", import.meta.url), "utf8"));
const payer = identity.payer as Address, creator = identity.creator as Address;
const params = {name: "Parity", symbol: "sP", assets: [payer, creator], bundleAmounts: [10n**18n, 2n*10n**18n],
  mintFeeTiers: [{minActionShares: 0n, feeShares: 1n}], redemptionFeeTiers: [], flashFeeBps: 5,
  originationFeeBps: 100, extensionFeeBps: 25, ltvBps: 9500, recoveryPenaltyBps: 500, loanDuration: 2592000};
const pools = [{lpFee: 3000, tickSpacing: 10, sqrtPriceAssetPerBasketX96: 1n<<96n, pairedAssetAmount: 10n**18n},
  {lpFee: 500, tickSpacing: 20, sqrtPriceAssetPerBasketX96: 2n<<96n, pairedAssetAmount: 2n*10n**18n}];
const maximums = [10n*10n**18n,20n*10n**18n];
const authorization = {creator, payer, preparationId: identity.preparationId, configurationHash: identity.creationConfigurationHash,
  nonce: 513n, deadline: 2000000000n, maxNativeFee: 10n**16n};
const input = {token: payer, maximum: 9n*10n**18n, receiver: creator, deadline: authorization.deadline};
const routes = [{currencies: [payer, creator], pools: [{currency0: payer, currency1: creator, fee: 3000, tickSpacing: 60, hooks: zeroAddress}],
  maximumInput: 5n*10n**18n}];

describe("bootstrap parity", () => {
  it("loads both module entrypoints without a runtime initialization cycle", async () => {
    expect((await import("../src/bootstrap.js")).staticsBootstrapAbi.length).toBeGreaterThan(0);
    expect(staticsAbi.some(item => item.type === "function" && item.name === "createBasketFor")).toBe(true);
  });
  it("matches Solidity EIP-712 authorization and delegated calldata", () => {
    expect(bootstrap.basketCreationAuthorizationDigest(31337n, identity.diamond, authorization)).toBe(fixture.authorizationDigest);
    expect(keccak256(bootstrap.encodeCreateBasketFor(params,pools,maximums,authorization,"0x1234"))).toBe(fixture.createForHash);
    expect(keccak256(bootstrap.encodePrepareBasketCreationFor(params,pools,maximums,42n,[4739n,42n],authorization,"0x1234"))).toBe(fixture.prepareForHash);
    expect(keccak256(bootstrap.encodePreviewBasketLaunch(identity.preparationId,params,pools,maximums,authorization.deadline))).toBe(fixture.previewHash);
    for (const field of ["payer", "creator", "preparationId", "configurationHash", "nonce", "deadline", "maxNativeFee"] as const) {
      const changed = {...authorization, [field]: typeof authorization[field] === "bigint" ? (authorization[field] as bigint)+1n : zeroAddress};
      if (field === "preparationId" || field === "configurationHash") changed[field] = "0x"+"00".repeat(32);
      expect(bootstrap.basketCreationAuthorizationDigest(31337n,identity.diamond,changed)).not.toBe(fixture.authorizationDigest);
    }
    expect(bootstrap.basketCreationAuthorizationDigest(1n,identity.diamond,authorization)).not.toBe(fixture.authorizationDigest);
    expect(bootstrap.basketCreationAuthorizationDigest(31337n,creator,authorization)).not.toBe(fixture.authorizationDigest);
  });
  it("matches exact launch geometry, backing and fee rounding", () => {
    const actual = bootstrap.previewBasketLaunch(identity.preparedTokenAddress, params, pools, authorization.maxNativeFee);
    expect(JSON.parse(JSON.stringify(actual, (_,v) => typeof v === "bigint" ? v.toString() : v))).toEqual(fixture.requirements);
    for (const spacing of [1,60,200,32767]) {
      const changed = pools.map(pool => ({...pool,tickSpacing:spacing}));
      const quote = bootstrap.previewBasketLaunch(identity.preparedTokenAddress,params,changed,0n);
      expect(quote.basketShares).toBeGreaterThan(0n);
      quote.totalAmounts.forEach((amount,i) => expect(amount).toBe(quote.backing[i]+quote.mintFees[i]+quote.pairedAmounts[i]));
    }
    expect(() => bootstrap.previewBasketLaunch(identity.preparedTokenAddress,params,[{...pools[0],lpFee:1000000},pools[1]],0n)).toThrow();
    expect(() => bootstrap.previewBasketLaunch(identity.preparedTokenAddress,params,[{...pools[0],tickSpacing:0},pools[1]],0n)).toThrow();
  });
  it("matches both typed exact-output zap selectors and calldata hashes", () => {
    const mint = bootstrap.encodeZapBasketMint(input,7n,10n**18n,[2n*10n**18n],routes);
    const purchase = bootstrap.encodeZapCampaignPurchase(input,identity.diamond,[{auctionIndex:0n,amount:10n**18n,minimumPayment:3n*10n**18n}],3n*10n**18n,routes);
    expect(keccak256(mint)).toBe(fixture.zapMintHash);
    expect(keccak256(purchase)).toBe(fixture.zapPurchaseHash);
    expect(decodeFunctionData({abi:bootstrap.staticsAssetZapAbi,data:mint}).functionName).toBe("mintBasket");
    expect(decodeFunctionData({abi:bootstrap.staticsAssetZapAbi,data:purchase}).functionName).toBe("purchaseCampaign");
  });
  it("bounds cap reserves above fragmented rounded payments and rejects expiry", () => {
    const terms = {targetCap:101n,startRate:10n**18n/3n,capRate:10n**18n/3n+1n,startsAt:100n,endsAt:200n,minimumFill:10n};
    const liability = bootstrap.quoteProcurementLiability(terms,101n);
    const paid = 10n*bootstrap.quoteProcurementPayment(terms,10n,199n)+bootstrap.quoteProcurementPayment(terms,1n,199n);
    expect(paid).toBeLessThanOrEqual(liability);
    expect(() => bootstrap.quoteProcurementPayment(terms,1n,200n)).toThrow();
    expect(decodeFunctionData({abi:bootstrap.basketBootstrapCampaignAbi,data:bootstrap.encodeFillProcurement(0n,10n,3n,creator,199n)}).args).toEqual([0n,10n,3n,creator,199n]);
    for (const action of ["finalize","claimTerminalInventory","fundNative"] as const)
      expect(decodeFunctionData({abi:bootstrap.basketBootstrapCampaignAbi,data:bootstrap.encodeCampaignAction(action)}).functionName).toBe(action);
  });
  it("encodes fixed revenue binding and measured delivery", () => {
    expect(decodeFunctionData({abi:bootstrap.measuredCampaignRevenueAbi,data:bootstrap.encodeBindRevenueCampaign(identity.diamond,1n)}).args).toEqual([identity.diamond,1n]);
    expect(decodeFunctionData({abi:bootstrap.measuredCampaignRevenueAbi,data:bootstrap.encodeDeliverRealizedRevenue(7n)}).args).toEqual([7n]);
  });
  it("matches native revenue calldata and keeps transaction value explicit", () => {
    const call = bootstrap.buildDeliverNativeRevenueCall(7n);
    expect(call).toEqual({data: fixture.nativeRevenueCalldata, value: 7n});
    expect(decodeFunctionData({abi: bootstrap.nativeCampaignRevenueAbi, data: call.data}).functionName).toBe("deliverNative");
    for (const amount of [0n, -1n, 1n << 256n]) {
      expect(() => bootstrap.buildDeliverNativeRevenueCall(amount)).toThrow("invalid native revenue amount");
    }
  });
});
