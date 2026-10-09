import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeEventLog, type Hex } from "viem";
import { staticsAbi, buildNonSwapStakerShareBpsCall, buildSetNonSwapStakerShareBpsCall } from "../src/index.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/position-statement-solidity.json", import.meta.url), "utf8"));
const solidityAbi = JSON.parse(readFileSync(new URL("./fixtures/position-statement-abi.json", import.meta.url), "utf8"));
const payer = "0x0000000000000000000000000000000000000111";
const receiver = "0x0000000000000000000000000000000000000222";
const poolId = `0x${"0".repeat(63)}2`;
const movement = { liquidityBefore: 11n, liquidityAfter: 22n, payer, receiver, paid0: 33n, received0: 44n, paid1: 55n, received1: 66n };
const settlement = { withdrawn0: 77n, withdrawn1: 88n, mintSpent0: 99n, mintReceived0: 111n, mintSpent1: 222n, mintReceived1: 333n };
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object" && value) return Object.fromEntries(Object.entries(value).filter(([k,v]) => k !== "internalType" && !(v === false && (k === "indexed" || k === "anonymous"))).map(([k,v]) => [k,normalize(v)]));
  return value;
}

describe("Solidity statement log parity", () => {
  for (const event of solidityAbi) {
    it(`matches the ${event.name} ABI and decodes Solidity topics/data`, () => {
      const sdkEvent = staticsAbi.find((item) => item.type === "event" && item.name === event.name);
      expect(normalize(sdkEvent)).toEqual(normalize(event));
      const log = fixture[event.name] as { data: Hex; topics: [Hex, ...Hex[]] };
      const decoded = decodeEventLog({ abi: staticsAbi, ...log, strict: true });
      expect(decoded.eventName).toBe(event.name);
      if (event.name === "NonSwapStakerShareBpsSet") expect(decoded.args).toEqual({ previousShareBps: 9000, newShareBps: 6000 });
      else expect(decoded.args).toMatchObject({ positionId: 1n });
      if (event.name.startsWith("ManagedLiquidity")) expect(decoded.args).toMatchObject({ poolId });
      if (["ManagedLiquidityProvided", "ManagedLiquidityChanged", "ManagedLiquidityRebalanced", "ManagedLiquidityExited"].includes(event.name)) expect(decoded.args).toMatchObject({ movement });
      if (event.name === "ManagedLiquidityRebalanced") expect(decoded.args).toMatchObject({ oldPosmTokenId: 3n, newPosmTokenId: 4n, settlement, tickLower: -10, tickUpper: 20 });
      if (event.name === "PositionGaugeAllocationsSet") expect(decoded.args).toMatchObject({ nextAllocationAt: 123, totalAllocated: 12n, poolIds: [poolId, `0x${"0".repeat(63)}3`], amounts: [5n,7n] });
      if (event.name === "RewardClaimed") expect(decoded.args).toMatchObject({ receiver, debited: 100n, received: 90n });
      if (event.name === "ManagedLiquidityFeesCollected") expect(decoded.args).toMatchObject({ posmTokenId: 3n, receiver, amount0: 5n, amount1: 6n });
    });
  }
  it("preserves Solidity configuration calldata", () => {
    expect(buildSetNonSwapStakerShareBpsCall(6000)).toBe(fixture.shareSetCalldata);
    expect(buildNonSwapStakerShareBpsCall()).toBe(fixture.shareGetCalldata);
  });
});
