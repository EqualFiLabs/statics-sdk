import { describe, expect, it } from "vitest";
import {
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  type Hex,
} from "viem";
import {
  buildBasketCreationConfigurationHashCall,
  buildBasketMintRedemptionStakerShareBpsCall,
  buildContinueBasketLaunchTransaction,
  buildCreatePreparedBasketTransaction,
  buildCreateStagedBasketTransaction,
  buildPrepareBasketTokenCall,
  buildSetBasketDistributorCall,
  buildSetBasketMintRedemptionStakerShareBpsCall,
  decodeBasketMintRedemptionStakerShareBpsResult,
  staticsAbi,
  type BasketLaunchTerms,
} from "../src/index.js";

const asset0 = "0x0000000000000000000000000000000000000011";
const asset1 = "0x0000000000000000000000000000000000000022";
const preparationId = `0x${"42".repeat(32)}` as Hex;
const basketId = 7n;
const terms: BasketLaunchTerms = {
  params: {
    name: "Two Asset Basket",
    symbol: "TAB",
    assets: [asset0, asset1],
    bundleAmounts: [2n, 3n],
    mintFeeTiers: [{ minActionShares: 0n, feeShares: 1n }],
    redemptionFeeTiers: [{ minActionShares: 0n, feeShares: 2n }],
    flashFeeBps: 5,
    originationFeeBps: 10,
    extensionFeeBps: 20,
    ltvBps: 8000,
    recoveryPenaltyBps: 100,
    loanDuration: 3600,
  },
  pools: [
    { lpFee: 500, tickSpacing: 10, sqrtPriceAssetPerBasketX96: 1n << 96n, pairedAssetAmount: 0n, activateManagedPol: false },
    { lpFee: 3000, tickSpacing: 60, sqrtPriceAssetPerBasketX96: 2n << 96n, pairedAssetAmount: 2n, activateManagedPol: true },
  ],
  maxAmountsIn: [0n, 5n],
  deadline: 120n,
};

// Selectors and event topics are derived from the Phase 2 Diamond facet ABIs.
function expectCalldata(data: Hex, selector: Hex, name: string, args: unknown[]) {
  expect(data.slice(0, 10)).toBe(selector);
  expect(decodeFunctionData({ abi: staticsAbi, data })).toEqual({ functionName: name, args });
}

describe("Phase 2 basket launch", () => {
  it("encodes the same preparation terms for hashing, preparing and finalizing", () => {
    const args = [terms.params, terms.pools, terms.maxAmountsIn, terms.deadline];
    expectCalldata(buildBasketCreationConfigurationHashCall(terms), "0x75c604f7", "basketCreationConfigurationHash", args);
    expectCalldata(buildPrepareBasketTokenCall(terms, 9n), "0x5a9200ab", "prepareBasketToken", [...args, 9n]);

    const prepared = buildCreatePreparedBasketTransaction(terms, preparationId, 7n, 11n);
    expectCalldata(prepared.data, "0x1ee65d26", "createBasketPrepared", [...args, preparationId]);
    expect(prepared.value).toBe(18n);

    const unseeded = { ...terms, pools: terms.pools.map(pool => ({ ...pool, activateManagedPol: false, pairedAssetAmount: 0n })), maxAmountsIn: [0n, 0n] };
    expect(buildCreatePreparedBasketTransaction(unseeded, preparationId, 0n, 11n).value).toBe(0n);
  });

  it("charges the basket fee once and the POL fee only for pools in the selected batch", () => {
    const staged = buildCreateStagedBasketTransaction(terms, preparationId, 1, 7n, 11n);
    expectCalldata(staged.data, "0xf676adba", "createBasketStaged",
      [terms.params, terms.pools, terms.maxAmountsIn, terms.deadline, preparationId, 1n]);
    expect(staged.value).toBe(7n);

    const continued = buildContinueBasketLaunchTransaction(terms, basketId, 1, 1, 11n);
    expectCalldata(continued.data, "0xa2f6da01", "continueBasketLaunch",
      [basketId, terms.pools, terms.maxAmountsIn, terms.deadline, 1n]);
    expect(continued.value).toBe(11n);

    expect(() => buildCreateStagedBasketTransaction(terms, preparationId, 0, 7n, 11n)).toThrow("invalid basket launch batch");
    expect(() => buildContinueBasketLaunchTransaction(terms, basketId, 1, 2, 11n)).toThrow("invalid basket launch batch");
    expect(() => buildContinueBasketLaunchTransaction(terms, basketId, -1, 1, 11n)).toThrow("invalid basket launch batch");
  });

  it("decodes launch progress and cancellation from the compiled event topics", () => {
    const indexedBasket = encodeAbiParameters([{ type: "uint256" }], [basketId]);
    const progressData = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1n, 2n]);
    expect(decodeEventLog({ abi: staticsAbi, data: progressData,
      topics: ["0xd640cc8b6d1e398835bc9af613f35f28444ba7dbbc839fe76aa59ccf778f12d3", indexedBasket] }))
      .toMatchObject({ eventName: "BasketLaunchProgress", args: { basketId, completedPools: 1n, totalPools: 2n } });
    expect(decodeEventLog({ abi: staticsAbi, data: "0x",
      topics: ["0x43e44a08a58dab2cd05d4175a2872085144733249185e7360ae99e28d51c837a", indexedBasket] }))
      .toMatchObject({ eventName: "BasketLaunchCancelled", args: { basketId } });
  });
});

describe("Phase 2 basket governance", () => {
  it.each([true, false])("encodes basket-scoped distributor approval %s", (allowed) => {
    expectCalldata(buildSetBasketDistributorCall(basketId, asset0, allowed), "0x6e2982d2",
      "setBasketDistributor", [basketId, asset0, allowed]);
  });

  it("reads and sets the mint and redemption share through the deployed selectors", () => {
    expectCalldata(buildBasketMintRedemptionStakerShareBpsCall(basketId), "0xec64e2b9",
      "basketMintRedemptionStakerShareBps", [basketId]);
    const result = encodeFunctionResult({ abi: staticsAbi, functionName: "basketMintRedemptionStakerShareBps", result: 7500 });
    expect(decodeBasketMintRedemptionStakerShareBpsResult(result)).toBe(7500);

    for (const share of [0, 7500, 10_000]) {
      expectCalldata(buildSetBasketMintRedemptionStakerShareBpsCall(basketId, share), "0x9593ea7c",
        "setBasketMintRedemptionStakerShareBps", [basketId, share]);
    }
    for (const share of [-1, 1.5, 10_001]) {
      expect(() => buildSetBasketMintRedemptionStakerShareBpsCall(basketId, share)).toThrow("basis points");
    }
  });

  it("decodes the fee split event and the onchain range error", () => {
    const indexedBasket = encodeAbiParameters([{ type: "uint256" }], [basketId]);
    const data = encodeAbiParameters([{ type: "uint16" }, { type: "uint16" }], [10_000, 7500]);
    expect(decodeEventLog({ abi: staticsAbi, data,
      topics: ["0xc3deea1b426cee7004bc99982a708b9accabd967db9502a94f4c5368b1584913", indexedBasket] }))
      .toMatchObject({ eventName: "BasketMintRedemptionStakerShareSet", args: { basketId, previousShareBps: 10_000, newShareBps: 7500 } });
    const args = encodeAbiParameters([{ type: "uint16" }], [10_001]);
    expect(decodeErrorResult({ abi: staticsAbi, data: `0x606dd637${args.slice(2)}` }))
      .toMatchObject({ errorName: "InvalidBasketMintRedemptionStakerShareBps", args: [10_001] });
  });
});
