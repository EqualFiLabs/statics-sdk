import {
  decodeEventLog,
  decodeFunctionData,
  encodeEventTopics,
  encodeFunctionResult,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKET_OBSERVATION_CADENCE,
  MARKET_FLAG_EXACT_OUTPUT,
  MARKET_FLAG_INTERNAL,
  MARKET_FLAG_PERMISSIONED,
  MARKET_FLAG_ZERO_FOR_ONE,
  MARKET_SAT_EXTERNAL_VOLUME0,
  MARKET_SAT_STATICS_FEES1,
  MAX_MARKET_OBSERVATION_CARDINALITY,
  MAX_MARKET_OBSERVE_QUERIES,
  buildCanonicalMarketStateCall,
  buildMarketObservationCall,
  buildMarketObservationConfigCall,
  buildObserveMarketCall,
  buildSetMarketObservationConfigCall,
  decodeCanonicalMarketStateResult,
  decodeMarketObservationConfigResult,
  decodeMarketObservationResult,
  decodeObserveMarketResult,
  hasMarketFlag,
  hasMarketSaturation,
  staticsAbi,
  staticsMarketTapeAbi,
  staticsSwapCallbackAbi,
  type CanonicalMarketState,
  type MarketObservation,
  type MarketObservationConfig,
} from "../src/index.js";

const poolId = `0x${"11".repeat(32)}` as Hex;

const marketTapeFunctionNames = [
  "canonicalMarketState",
  "setMarketObservationConfig",
  "recordMarketObservation",
  "marketObservationConfig",
  "marketObservation",
  "observeMarket",
] as const;

const canonical: CanonicalMarketState = {
  externalVolume0: 100n,
  externalVolume1: 200n,
  internalVolume0: 30n,
  internalVolume1: 40n,
  staticsFees0: 5n,
  staticsFees1: 6n,
  externalSwapCount: 7n,
  internalSwapCount: 8n,
  sequence: 15n,
  tickCumulative: -1_200n,
  lastTimestamp: 1_000,
  lastTick: -120,
  lastNativeLpFee: 3_000,
  lastFlags: MARKET_FLAG_ZERO_FOR_ONE,
  saturatedFields: 0,
};

const observation: MarketObservation = {
  timestamp: canonical.lastTimestamp,
  tick: canonical.lastTick,
  nativeLpFee: canonical.lastNativeLpFee,
  flags: canonical.lastFlags,
  sequence: canonical.sequence,
  tickCumulative: canonical.tickCumulative,
  externalVolume0: canonical.externalVolume0,
  externalVolume1: canonical.externalVolume1,
  internalVolume0: canonical.internalVolume0,
  internalVolume1: canonical.internalVolume1,
  staticsFees0: canonical.staticsFees0,
  staticsFees1: canonical.staticsFees1,
  externalSwapCount: canonical.externalSwapCount,
  internalSwapCount: canonical.internalSwapCount,
};

function decodedName(data: Hex): string {
  return decodeFunctionData({ abi: staticsMarketTapeAbi, data }).functionName;
}

describe("market tape ABI", () => {
  it("exports the Diamond telemetry surface exactly once", () => {
    const functions = staticsMarketTapeAbi.filter((item) => item.type === "function");
    expect(functions.map((item) => item.name)).toEqual(marketTapeFunctionNames);

    for (const functionName of marketTapeFunctionNames) {
      expect(
        staticsAbi.filter((item) => item.type === "function" && item.name === functionName),
        functionName,
      ).toHaveLength(1);
    }

    expect(staticsSwapCallbackAbi.filter((item) => item.type === "function").map((item) => item.name)).toEqual([
      "afterStaticsPoolSwap",
    ]);
    expect(
      staticsAbi.filter((item) => item.type === "function" && item.name === "afterStaticsPoolSwap"),
    ).toHaveLength(1);
  });

  it("decodes observation events", () => {
    const topics = encodeEventTopics({
      abi: staticsMarketTapeAbi,
      eventName: "MarketObservationCommitted",
      args: { poolId, observationId: 9n },
    });
    const data = encodeFunctionResult({
      abi: [{
        type: "function",
        name: "encode",
        stateMutability: "pure",
        inputs: [],
        outputs: [{ type: "uint256" }],
      }],
      functionName: "encode",
      result: 15n,
    });
    expect(
      decodeEventLog({ abi: staticsMarketTapeAbi, eventName: "MarketObservationCommitted", topics, data }).args,
    ).toEqual({ poolId, observationId: 9n, sequence: 15n });
  });
});

describe("market tape calldata", () => {
  it("builds canonical and observation reads", () => {
    expect(decodedName(buildCanonicalMarketStateCall(poolId))).toBe("canonicalMarketState");
    expect(decodedName(buildMarketObservationConfigCall(poolId))).toBe("marketObservationConfig");
    expect(decodedName(buildMarketObservationCall(poolId, 1n))).toBe("marketObservation");
    expect(decodedName(buildObserveMarketCall(poolId, [0, 900]))).toBe("observeMarket");
    expect(() => buildMarketObservationCall(poolId, 0n)).toThrow(/observationId/);
    expect(() => buildMarketObservationCall(poolId, 1n << 64n)).toThrow(/observationId/);
    expect(() => buildObserveMarketCall(poolId, [-1])).toThrow(/secondsAgo/);
    expect(() => buildObserveMarketCall(poolId, Array(MAX_MARKET_OBSERVE_QUERIES + 1).fill(0))).toThrow(
      /too many/,
    );
  });

  it("builds bounded owner configuration", () => {
    const configured = buildSetMarketObservationConfigCall(
      poolId,
      true,
      DEFAULT_MARKET_OBSERVATION_CADENCE,
      MAX_MARKET_OBSERVATION_CARDINALITY,
    );
    expect(decodeFunctionData({ abi: staticsMarketTapeAbi, data: configured })).toMatchObject({
      functionName: "setMarketObservationConfig",
      args: [poolId, true, DEFAULT_MARKET_OBSERVATION_CADENCE, MAX_MARKET_OBSERVATION_CARDINALITY],
    });
    expect(decodedName(buildSetMarketObservationConfigCall(poolId, false, 0, 0))).toBe(
      "setMarketObservationConfig",
    );
    expect(() => buildSetMarketObservationConfigCall(poolId, true, 59, 1)).toThrow(/cadence/);
    expect(() => buildSetMarketObservationConfigCall(poolId, true, 60, 0)).toThrow(/cardinalityNext/);
    expect(() =>
      buildSetMarketObservationConfigCall(poolId, true, 60, MAX_MARKET_OBSERVATION_CARDINALITY + 1),
    ).toThrow(/cardinalityNext/);
  });
});

describe("market tape views", () => {
  it("decodes canonical counters and saturation metadata", () => {
    const result = encodeFunctionResult({
      abi: staticsMarketTapeAbi,
      functionName: "canonicalMarketState",
      result: canonical,
    });
    expect(decodeCanonicalMarketStateResult(result)).toEqual(canonical);

    const flags = MARKET_FLAG_PERMISSIONED | MARKET_FLAG_INTERNAL | MARKET_FLAG_EXACT_OUTPUT;
    expect(hasMarketFlag(flags, MARKET_FLAG_INTERNAL)).toBe(true);
    expect(hasMarketFlag(flags, MARKET_FLAG_ZERO_FOR_ONE)).toBe(false);
    const saturation = MARKET_SAT_EXTERNAL_VOLUME0 | MARKET_SAT_STATICS_FEES1;
    expect(hasMarketSaturation(saturation, MARKET_SAT_STATICS_FEES1)).toBe(true);
    expect(hasMarketSaturation(saturation, MARKET_SAT_EXTERNAL_VOLUME0)).toBe(true);
  });

  it("decodes observation configuration and snapshots", () => {
    const config: MarketObservationConfig = {
      initialized: true,
      enabled: true,
      cadence: 900,
      cardinality: 12,
      cardinalityNext: 96,
      stored: 12n,
      latestId: 20n,
      lastObservationTimestamp: 1_000,
      failedWriteCount: 2n,
      lastFailedSequence: 14n,
    };
    const configResult = encodeFunctionResult({
      abi: staticsMarketTapeAbi,
      functionName: "marketObservationConfig",
      result: config,
    });
    expect(decodeMarketObservationConfigResult(configResult)).toEqual(config);

    const observationResult = encodeFunctionResult({
      abi: staticsMarketTapeAbi,
      functionName: "marketObservation",
      result: observation,
    });
    expect(decodeMarketObservationResult(observationResult)).toEqual(observation);

    const observationsResult = encodeFunctionResult({
      abi: staticsMarketTapeAbi,
      functionName: "observeMarket",
      result: [observation, { ...observation, sequence: 16n }],
    });
    expect(decodeObserveMarketResult(observationsResult)).toEqual([
      observation,
      { ...observation, sequence: 16n },
    ]);
  });
});
