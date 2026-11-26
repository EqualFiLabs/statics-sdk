import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { buildBasketConversionZapCall, encodeBasketConversionRequest, buildBasketConversionRouterCall,
  simulateBasketConversionZap, simulateBasketConversionRouter, staticsBasketConversionZapAbi,
  quoteReviewedBasketConversion, staticsBasketDistributorAbi, staticsBasketConversionRouterAbi, type BasketConversionRequest } from "../src/basket-conversion.js";

const a = "0x0000000000000000000000000000000000000011" as Address;
const b = "0x0000000000000000000000000000000000000022" as Address;
const poolId = `0x${"ab".repeat(32)}` as Hex;
const base: BasketConversionRequest = {
  deadline: 100n, limit: 10n, routeLimits: [10n], preset: false,
  routes: [{ currencies: [a, b], pools: [{ currency0: a, currency1: b, fee: 3000, tickSpacing: 60, hooks: a }], hookData: ["0x1234"] }],
};

describe("basket conversion", () => {
  it("encodes the hook request and zap call with identical typed data", () => {
    const encoded = encodeBasketConversionRequest(base);
    expect(encoded).toContain("1234");
    const call = buildBasketConversionZapCall("buy", poolId, 1n, a, base);
    const decoded = decodeFunctionData({ abi: staticsBasketConversionZapAbi, data: call });
    expect(decoded.functionName).toBe("buy");
    expect(decoded.args?.[3]).toEqual(base);
  });
  it("supports a zero-hop constituent and caller bounds on presets", () => {
    expect(encodeBasketConversionRequest({ ...base, routes: [{ currencies: [a], pools: [], hookData: [] }] })).toMatch(/^0x/);
    expect(encodeBasketConversionRequest({ ...base, preset: true, routes: [], routeLimits: [7n] })).toMatch(/^0x/);
    expect(() => encodeBasketConversionRequest({ ...base, preset: true })).toThrow("route count");
  });
  it("rejects mismatched hook data, cycles and negative bounds", () => {
    expect(() => encodeBasketConversionRequest({ ...base, routes: [{ ...base.routes[0], hookData: [] }] })).toThrow("shape");
    expect(() => encodeBasketConversionRequest({ ...base, routes: [{ ...base.routes[0], currencies: [a, a] }] })).toThrow("cyclic");
    expect(() => encodeBasketConversionRequest({ ...base, limit: -1n })).toThrow("bound");
  });
  it("bounds outer steps and basket shares", () => {
    expect(() => buildBasketConversionZapCall("sell", poolId, 0n, a, base)).toThrow("shares");
    expect(() => buildBasketConversionRouterCall(poolId, [], 0n, { maxQuoteIn: 0n, minQuoteOut: 1n, minBasketOut: 0n, deadline: 1n })).toThrow("step count");
  });
  it("simulates zap modes and router steps from the payer with their original bounds", async () => {
    const result = { result: 7n };
    const simulateContract = vi.fn().mockResolvedValue(result);
    const client = { simulateContract } as unknown as PublicClient;
    for (const mode of ["buy", "sell"] as const) {
      expect(await simulateBasketConversionZap(client, a, b, mode, poolId, 3n, b, base)).toBe(result);
      expect(simulateContract).toHaveBeenLastCalledWith({ address: a, account: b,
        abi: staticsBasketConversionZapAbi, functionName: mode, args: [poolId, 3n, b, base] });
    }
    const steps = [{ key: base.routes[0].pools[0], params: { zeroForOne: true, amountSpecified: 3n, sqrtPriceLimitX96: 1n }, data: "0x" as Hex }];
    const bounds = { maxQuoteIn: 10n, minQuoteOut: 0n, minBasketOut: 3n, deadline: 100n };
    expect(await simulateBasketConversionRouter(client, a, b, poolId, steps, 0n, bounds)).toBe(result);
    expect(simulateContract).toHaveBeenLastCalledWith({ address: a, account: b,
      abi: staticsBasketConversionRouterAbi, functionName: "execute", args: [poolId, steps, 0n, bounds] });
  });
  it("rejects invalid simulation inputs before making an RPC request", async () => {
    const simulateContract = vi.fn();
    const client = { simulateContract } as unknown as PublicClient;
    await expect(simulateBasketConversionZap(client, a, b, "buy", poolId, 0n, b, base)).rejects.toThrow("shares");
    await expect(simulateBasketConversionZap(client, a, b, "sell", poolId, 1n, b,
      { ...base, preset: true })).rejects.toThrow("route count");
    const bounds = { maxQuoteIn: 0n, minQuoteOut: 1n, minBasketOut: 0n, deadline: 100n };
    await expect(simulateBasketConversionRouter(client, a, b, poolId, [], 0n, bounds)).rejects.toThrow("step count");
    const steps = [{ key: base.routes[0].pools[0], params: { zeroForOne: true, amountSpecified: 1n, sqrtPriceLimitX96: 1n }, data: "0x" as Hex }];
    await expect(simulateBasketConversionRouter(client, a, b, poolId, steps, -1n, bounds)).rejects.toThrow("prefund");
    await expect(simulateBasketConversionRouter(client, a, b, poolId, steps, 0n,
      { ...bounds, minQuoteOut: -1n })).rejects.toThrow("minQuoteOut");
    expect(simulateContract).not.toHaveBeenCalled();
  });
});

const conversionHook = "0x0000000000000000000000000000000000000033" as Address;
const zap = "0x0000000000000000000000000000000000000044" as Address;
const reviewed = {
  chainId: 4663, poolId, basketId: 7n, quote: a, assets: [a, b],
  pools: [null, base.routes[0].pools[0]],
};
const pinnedBlock = { number: 500n, timestamp: 10n };
const market = {
  active: true, basketId: reviewed.basketId, quote: a, basketToken: b, key: { hooks: conversionHook },
};

function quoteFixture(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    basketConversionMarket: market,
    basketConversionConfiguration: { hook: conversionHook, zap },
    basket: { assets: [a, b], token: b, status: 0 },
    protocolPoolSwapsBlocked: false,
    isBasketDistributor: true,
    quoteMint: [100n, 20n],
    quoteRedeem: [100n, 20n],
    ...overrides,
  };
  const readContract = vi.fn(({ functionName }) => responses[functionName]);
  const simulateContract = vi.fn().mockResolvedValue({ result: [200n, 10n] });
  const client = {
    getChainId: async () => reviewed.chainId,
    getBlock: async () => pinnedBlock,
    readContract,
    simulateContract,
  } as unknown as PublicClient;
  return { client, readContract, simulateContract };
}

describe("reviewed conversion quotes", () => {
  it("prices exact-output buys and exact-input sells at one block and preserves the zero-hop leg", async () => {
    const { client, simulateContract, readContract } = quoteFixture();
    const buy = await quoteReviewedBasketConversion(client, a, b, reviewed, "buy", 1n, 100n);
    expect(buy.total).toBe(300n);
    expect(buy.request.routeLimits).toEqual([101n, 202n]);
    expect(buy.request.limit).toBe(303n);
    expect(buy.request.deadline).toBe(130n);
    expect(buy.request.routes[0]).toEqual({ currencies: [a], pools: [], hookData: [] });
    expect(simulateContract).toHaveBeenLastCalledWith(expect.objectContaining({
      functionName: "quoteExactOutputSingle", blockNumber: pinnedBlock.number,
      args: [expect.objectContaining({ zeroForOne: true, exactAmount: 20n })],
    }));

    const sell = await quoteReviewedBasketConversion(client, a, b, reviewed, "sell", 1n, 100n);
    expect(sell.request.limit).toBe(297n);
    expect(sell.request.routeLimits).toEqual([99n, 198n]);
    expect(simulateContract).toHaveBeenLastCalledWith(expect.objectContaining({
      functionName: "quoteExactInputSingle", blockNumber: pinnedBlock.number,
      args: [expect.objectContaining({ zeroForOne: false, exactAmount: 20n })],
    }));
    expect(readContract.mock.calls.every(([call]) => call.blockNumber === pinnedBlock.number)).toBe(true);
  });

  it("rejects a wrong chain and a missing route before pricing any legs", async () => {
    const { client, readContract, simulateContract } = quoteFixture();
    await expect(quoteReviewedBasketConversion(client, a, b, { ...reviewed, chainId: 46630 },
      "sell", 1n, 100n)).rejects.toThrow("wrong conversion chain");
    expect(readContract).not.toHaveBeenCalled();
    await expect(quoteReviewedBasketConversion(client, a, b, { ...reviewed, pools: [null, null] },
      "buy", 1n, 100n)).rejects.toThrow("missing reviewed constituent route");
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it.each([
    { basketConversionMarket: { ...market, active: false } },
    { protocolPoolSwapsBlocked: true },
  ])("rejects retired or blocked markets using onchain reads", async (state) => {
    const { client, simulateContract } = quoteFixture(state);
    await expect(quoteReviewedBasketConversion(client, a, b, reviewed, "buy", 1n, 100n))
      .rejects.toThrow("conversion market unavailable");
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("requires authorization for this basket and zap when pricing a sale", async () => {
    const { client, simulateContract, readContract } = quoteFixture({ isBasketDistributor: false });
    await expect(quoteReviewedBasketConversion(client, a, b, reviewed, "sell", 1n, 100n))
      .rejects.toThrow("conversion sell unavailable");
    expect(readContract).toHaveBeenCalledWith({
      address: a,
      abi: staticsBasketDistributorAbi,
      functionName: "isBasketDistributor",
      args: [reviewed.basketId, zap],
      blockNumber: pinnedBlock.number,
    });
    expect(simulateContract).not.toHaveBeenCalled();
  });

  it("rejects a constituent with no executable quote", async () => {
    const { client, simulateContract } = quoteFixture();
    simulateContract.mockResolvedValueOnce({ result: [0n, 0n] });
    await expect(quoteReviewedBasketConversion(client, a, b, reviewed, "sell", 1n, 100n))
      .rejects.toThrow("constituent route returned no quote");
  });

  it("propagates backing and underlying-liquidity errors instead of returning a partial quote", async () => {
    const { client, readContract, simulateContract } = quoteFixture();
    const backingFailure = new Error("InsufficientVaultBalance");
    const normalRead = readContract.getMockImplementation()!;
    readContract.mockImplementation((call) => call.functionName === "quoteRedeem"
      ? Promise.reject(backingFailure)
      : normalRead(call));
    await expect(quoteReviewedBasketConversion(client, a, b, reviewed, "sell", 1n, 100n))
      .rejects.toBe(backingFailure);
    expect(simulateContract).not.toHaveBeenCalled();

    const liquidityFailure = new Error("Underlying pool has insufficient liquidity");
    simulateContract.mockRejectedValueOnce(liquidityFailure);
    await expect(quoteReviewedBasketConversion(client, a, b, reviewed, "buy", 1n, 100n))
      .rejects.toBe(liquidityFailure);
  });

  it.each(["quote expired", "insufficient allowance"])("propagates a payer simulation failure: %s", async (reason) => {
    const failure = new Error(reason);
    const simulateContract = vi.fn().mockRejectedValue(failure);
    const client = { simulateContract } as unknown as PublicClient;
    await expect(simulateBasketConversionZap(client, zap, a, "buy", poolId, 1n, a, base))
      .rejects.toBe(failure);
    expect(simulateContract).toHaveBeenCalledWith(expect.objectContaining({ address: zap, account: a }));
  });
});
