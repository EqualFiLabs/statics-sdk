import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionResult } from "viem";
import {
  buildNonSwapStakerShareBpsCall,
  buildSetNonSwapStakerShareBpsCall,
  decodeNonSwapStakerShareBpsResult,
  staticsAbi,
} from "../src/index.js";

describe("non-swap fee configuration", () => {
  it.each([0, 1, 3333, 9000, 10000])("encodes the exact %i basis-point share", (share) => {
    expect(decodeFunctionData({ abi: staticsAbi, data: buildSetNonSwapStakerShareBpsCall(share) })).toEqual({
      functionName: "setNonSwapStakerShareBps", args: [share],
    });
  });

  it.each([-1, 10001, 0.5, NaN, Infinity])("rejects invalid share %s", (share) => {
    expect(() => buildSetNonSwapStakerShareBpsCall(share)).toThrow();
  });

  it("encodes the getter and decodes an explicit zero", () => {
    expect(decodeFunctionData({ abi: staticsAbi, data: buildNonSwapStakerShareBpsCall() }).functionName)
      .toBe("nonSwapStakerShareBps");
    const data = encodeFunctionResult({ abi: staticsAbi, functionName: "nonSwapStakerShareBps", result: 0 });
    expect(decodeNonSwapStakerShareBpsResult(data)).toBe(0);
  });
});
