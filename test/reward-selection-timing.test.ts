import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeFunctionData,
  encodeFunctionResult,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import {
  STATICS_REWARD_SELECTION_TIMING_INTERFACE_ID,
  buildPositionRewardSelectionWithTimingCall,
  buildPositionRewardSelectionCall,
  decodePositionRewardSelectionWithTimingResult,
  decodePositionRewardSelectionResult,
  staticsRewardSelectionTimingAbi,
  staticsPositionMarketAbi,
  staticsAbi,
  type PositionRewardSelection,
  type PositionRewardSelectionWithTiming,
} from "../src/index.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/reward-selection-timing-solidity.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { calldata: Hex; result: Hex };
const asset = "0x0000000000000000000000000000000000000022" as Address;
const selection: PositionRewardSelection = {
  selected: true,
  eligibleStake: 50n * 10n ** 18n,
  eligibleWeight: 50n * 10n ** 18n,
  pendingStake: 100n * 10n ** 18n,
  pendingWeight: 100n * 10n ** 18n,
  eligibleAt: 123456,
};

const externalAbi = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(externalAbi);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "internalType")
        .map(([key, child]) => [key, externalAbi(child)]),
    );
  return value;
};

describe("reward selection timing", () => {
  it("matches the compiled Solidity interface and keeps one combined ABI entry", () => {
    const abi = JSON.parse(
      readFileSync(
        new URL(
          "./fixtures/reward-selection-timing-interface-abi.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(externalAbi(staticsRewardSelectionTimingAbi)).toEqual(
      externalAbi(abi),
    );
    expect(toFunctionSelector(staticsRewardSelectionTimingAbi[0])).toBe(
      STATICS_REWARD_SELECTION_TIMING_INTERFACE_ID,
    );
    expect(
      staticsAbi.filter(
        (item) =>
          item.type === "function" && item.name === "rewardSelectionWithTiming",
      ),
    ).toHaveLength(1);
  });

  it("matches Solidity calldata and decodes the complete Solidity result", () => {
    expect(buildPositionRewardSelectionWithTimingCall(7n, asset)).toBe(
      fixture.calldata,
    );
    expect(
      decodeFunctionData({ abi: staticsAbi, data: fixture.calldata }),
    ).toEqual({ functionName: "rewardSelectionWithTiming", args: [7n, asset] });
    const result: PositionRewardSelectionWithTiming =
      decodePositionRewardSelectionWithTimingResult(fixture.result);
    expect(result).toEqual({ selection, pendingStartTime: 23456 });
  });

  it("preserves the legacy call and six-field result independently", () => {
    const legacy = buildPositionRewardSelectionCall(7n, asset);
    expect(
      decodeFunctionData({ abi: staticsPositionMarketAbi, data: legacy }),
    ).toEqual({ functionName: "rewardSelection", args: [7n, asset] });
    expect(legacy.slice(0, 10)).not.toBe(fixture.calldata.slice(0, 10));
    const legacyResult = `0x${fixture.result.slice(2, 2 + 6 * 64)}` as Hex;
    expect(decodePositionRewardSelectionResult(legacyResult)).toEqual(
      selection,
    );
    expect(() =>
      decodePositionRewardSelectionWithTimingResult(legacyResult),
    ).toThrow();
  });

  it.each([false, true])(
    "decodes zero effective pending timing with selected=%s",
    (selected) => {
      const empty = {
        selected,
        eligibleStake: selected ? 50n : 0n,
        eligibleWeight: selected ? 50n : 0n,
        pendingStake: 0n,
        pendingWeight: 0n,
        eligibleAt: 0,
      };
      const data = encodeFunctionResult({
        abi: staticsRewardSelectionTimingAbi,
        functionName: "rewardSelectionWithTiming",
        result: [empty, 0],
      });
      expect(decodePositionRewardSelectionWithTimingResult(data)).toEqual({
        selection: empty,
        pendingStartTime: 0,
      });
    },
  );

  it("decodes uint40 timestamps exactly and rejects malformed calldata inputs", () => {
    const timestamp = 2 ** 40 - 1;
    const data = encodeFunctionResult({
      abi: staticsRewardSelectionTimingAbi,
      functionName: "rewardSelectionWithTiming",
      result: [{ ...selection, eligibleAt: timestamp }, timestamp],
    });
    expect(decodePositionRewardSelectionWithTimingResult(data)).toEqual({
      selection: { ...selection, eligibleAt: timestamp },
      pendingStartTime: timestamp,
    });
    expect(() =>
      buildPositionRewardSelectionWithTimingCall(-1n, asset),
    ).toThrow();
    expect(() =>
      buildPositionRewardSelectionWithTimingCall(2n ** 256n, asset),
    ).toThrow();
    expect(() =>
      buildPositionRewardSelectionWithTimingCall(7n, "0x123" as Address),
    ).toThrow();
  });
});
