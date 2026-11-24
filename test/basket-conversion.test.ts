import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, type Address, type Hex, type PublicClient } from "viem";
import { buildBasketConversionZapCall, encodeBasketConversionRequest, buildBasketConversionRouterCall,
  simulateBasketConversionZap, simulateBasketConversionRouter, staticsBasketConversionZapAbi,
  staticsBasketConversionRouterAbi, type BasketConversionRequest } from "../src/basket-conversion.js";

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
