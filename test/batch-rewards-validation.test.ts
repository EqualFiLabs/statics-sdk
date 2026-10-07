import { describe, it, expect } from "vitest";
import { decodeFunctionData, type Address, type Hex } from "viem";
import {
  buildBatchClaimRewardsCall,
  buildBatchClaimRewardsAggregatedCall,
  staticsAggregatedBatchRewardsAbi,
  splitBatchRewardClaims,
  staticsBatchRewardsAbi,
  BATCH_REWARD_MAX_CLAIMS,
  BATCH_REWARD_MAX_ENTRIES,
  type BatchRewardClaims,
} from "../src/index.js";

const address = (n: number) =>
  `0x${n.toString(16).padStart(40, "0")}` as Address;
const pool = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const global = (id: number, size = 1) => ({
  positionId: BigInt(id),
  assets: Array.from({ length: size }, (_, i) => address(i + 1)),
  minimumAmounts: Array.from({ length: size }, (_, i) => BigInt(i)),
});
const lp = (id: number, size = 1) => ({
  positionId: BigInt(id),
  poolId: pool(1),
  slots: Array.from({ length: size }, (_, i) => i),
  minimumAmounts: Array.from({ length: size }, () => 0n),
});
const input = (): BatchRewardClaims => ({
  globalClaims: [global(1)],
  lpClaims: [],
  allocatorClaims: [],
  receiver: address(999),
});

describe.each([
  ["legacy", buildBatchClaimRewardsCall],
  ["aggregated", buildBatchClaimRewardsAggregatedCall],
] as const)("%s batch reward validation", (_name, build) => {
  it("rejects empty input, bad receiver, and known diamond receiver", () => {
    expect(() =>
      build({ ...input(), globalClaims: [] }),
    ).toThrow("empty reward batch");
    for (const receiver of [address(0), "0x1234" as Address])
      expect(() =>
        build({ ...input(), receiver }),
      ).toThrow("receiver");
    expect(() => build(input(), address(999))).toThrow(
      "receiver",
    );
    expect(() => splitBatchRewardClaims(input(), address(999))).toThrow(
      "receiver",
    );
  });
  it("validates uint256 bounds and reward arrays", () => {
    for (const positionId of [-1n, 1n << 256n, 1 as unknown as bigint])
      expect(() =>
        build({
          ...input(),
          globalClaims: [{ ...global(1), positionId }],
        }),
      ).toThrow("uint256");
    for (const minimum of [-1n, 1n << 256n])
      expect(() =>
        build({
          ...input(),
          globalClaims: [{ ...global(1), minimumAmounts: [minimum] }],
        }),
      ).toThrow("uint256");
    expect(() =>
      build({ ...input(), globalClaims: [global(1, 0)] }),
    ).toThrow("empty reward claim");
    expect(() =>
      build({
        ...input(),
        globalClaims: [{ ...global(1), minimumAmounts: [] }],
      }),
    ).toThrow("length");
    expect(() =>
      build({
        ...input(),
        globalClaims: [{ ...global(1), assets: ["0x12" as Address] }],
      }),
    ).toThrow("asset");
    expect(
      build({
        ...input(),
        globalClaims: [
          {
            ...global(1),
            positionId: (1n << 256n) - 1n,
            minimumAmounts: [(1n << 256n) - 1n],
          },
        ],
      }),
    ).toMatch(/^0x/);
  });
  it("rejects duplicate groups and case-insensitive assets/pools", () => {
    expect(() =>
      build({
        ...input(),
        globalClaims: [global(1), global(1)],
      }),
    ).toThrow("duplicate global");
    const mixed = address(0xabcdef);
    expect(() =>
      build({
        ...input(),
        globalClaims: [
          {
            positionId: 1n,
            assets: [mixed, mixed.toUpperCase().replace("0X", "0x") as Address],
            minimumAmounts: [0n, 0n],
          },
        ],
      }),
    ).toThrow("duplicate reward asset");
    for (const category of ["lpClaims", "allocatorClaims"] as const) {
      const claim = { ...lp(1), poolId: pool(0xabcdef), slots: [1] };
      expect(() =>
        splitBatchRewardClaims({
          ...input(),
          [category]: [
            claim,
            {
              ...claim,
              poolId: claim.poolId.toUpperCase().replace("0X", "0x") as Hex,
            },
          ],
        }),
      ).toThrow("duplicate pool");
    }
    expect(
      build({
        ...input(),
        lpClaims: [lp(1)],
        allocatorClaims: [{ ...lp(1), slots: [1] }],
      }),
    ).toMatch(/^0x/);
  });
  it("validates pool IDs, slots, and minimum pairing in each category", () => {
    for (const category of ["lpClaims", "allocatorClaims"] as const) {
      for (const slots of [[], [1, 1], [5], [-1], [1.5]])
        expect(() =>
          build({
            ...input(),
            [category]: [
              { ...lp(1), slots, minimumAmounts: slots.map(() => 0n) },
            ],
          }),
        ).toThrow();
      expect(() =>
        build({
          ...input(),
          [category]: [{ ...lp(1), slots: [1], minimumAmounts: [] }],
        }),
      ).toThrow("length");
      expect(() =>
        build({
          ...input(),
          [category]: [{ ...lp(1), poolId: "0x1234", slots: [1] }],
        }),
      ).toThrow("bytes32");
      expect(() =>
        build({
          ...input(),
          [category]: [{ ...lp(1), slots: [1], minimumAmounts: [-1n] }],
        }),
      ).toThrow("uint256");
    }
    expect(() =>
      build({ ...input(), allocatorClaims: [lp(1)] }),
    ).toThrow("slot");
    expect(
      build({ ...input(), lpClaims: [lp(1, 5)] }),
    ).toMatch(/^0x/);
  });
  it("enforces both independent transaction limits", () => {
    expect(() =>
      build({
        ...input(),
        globalClaims: Array.from({ length: 17 }, (_, i) => global(i)),
      }),
    ).toThrow("claim limit");
    expect(() =>
      build({ ...input(), globalClaims: [global(1, 65)] }),
    ).toThrow("entry limit");
    expect(
      build({
        ...input(),
        globalClaims: Array.from({ length: 16 }, (_, i) => global(i, 4)),
      }),
    ).toMatch(/^0x/);
  });
});

describe("batch reward splitting", () => {
  it("splits oversized global groups without dropping or changing minimum pairing", () => {
    const original = {
      ...input(),
      globalClaims: [global(1, 130), global(2, 3)],
    };
    const batches = splitBatchRewardClaims(original);
    expect(
      batches.map((b) => b.globalClaims.map((c) => c.assets.length)),
    ).toEqual([[64], [64], [2, 3]]);
    expect(
      batches.flatMap((b) =>
        b.globalClaims
          .filter((c) => c.positionId === 1n)
          .flatMap((c) => c.assets),
      ),
    ).toEqual(original.globalClaims[0].assets);
    expect(
      batches.flatMap((b) =>
        b.globalClaims
          .filter((c) => c.positionId === 1n)
          .flatMap((c) => c.minimumAmounts),
      ),
    ).toEqual(original.globalClaims[0].minimumAmounts);
    for (const b of batches)
      expect(buildBatchClaimRewardsCall(b)).toMatch(/^0x/);
  });
  it("packs at group and entry boundaries while preserving all category order", () => {
    const original = {
      ...input(),
      globalClaims: Array.from({ length: 18 }, (_, i) => global(i, 4)),
      lpClaims: Array.from({ length: 18 }, (_, i) => lp(i, 5)),
      allocatorClaims: Array.from({ length: 18 }, (_, i) => ({
        ...lp(i, 4),
        slots: [1, 2, 3, 4],
      })),
    };
    const batches = splitBatchRewardClaims(original);
    expect(batches[0].globalClaims).toHaveLength(16);
    for (const b of batches) {
      expect(b.receiver).toBe(original.receiver);
      expect(
        b.globalClaims.length + b.lpClaims.length + b.allocatorClaims.length,
      ).toBeLessThanOrEqual(BATCH_REWARD_MAX_CLAIMS);
      expect(
        b.globalClaims.reduce((n, c) => n + c.assets.length, 0) +
          b.lpClaims.reduce((n, c) => n + c.slots.length, 0) +
          b.allocatorClaims.reduce((n, c) => n + c.slots.length, 0),
      ).toBeLessThanOrEqual(BATCH_REWARD_MAX_ENTRIES);
      const decoded = decodeFunctionData({
        abi: staticsBatchRewardsAbi,
        data: buildBatchClaimRewardsCall(b),
      });
      expect(decoded.functionName).toBe("batchClaimRewards");
      const aggregated = decodeFunctionData({
        abi: staticsAggregatedBatchRewardsAbi,
        data: buildBatchClaimRewardsAggregatedCall(b),
      });
      expect(aggregated.functionName).toBe("batchClaimRewardsAggregated");
      expect(aggregated.args).toEqual(decoded.args);
    }
    for (const category of [
      "globalClaims",
      "lpClaims",
      "allocatorClaims",
    ] as const)
      expect(batches.flatMap((b) => b[category])).toEqual(original[category]);
    expect(splitBatchRewardClaims(original)).toEqual(batches);
  });
  it("does not mutate input arrays, including frozen input", () => {
    const original = { ...input(), lpClaims: [lp(1)] };
    for (const claim of original.globalClaims) {
      Object.freeze(claim.assets);
      Object.freeze(claim.minimumAmounts);
      Object.freeze(claim);
    }
    for (const claim of original.lpClaims) {
      Object.freeze(claim.slots);
      Object.freeze(claim.minimumAmounts);
      Object.freeze(claim);
    }
    Object.freeze(original.globalClaims);
    Object.freeze(original.lpClaims);
    Object.freeze(original.allocatorClaims);
    Object.freeze(original);
    const batches = splitBatchRewardClaims(original);
    expect(batches).toEqual([original]);
    expect(batches[0]).not.toBe(original);
    expect(batches[0].globalClaims[0].assets).not.toBe(
      original.globalClaims[0].assets,
    );
    expect(batches[0].lpClaims[0].slots).not.toBe(original.lpClaims[0].slots);
  });
});
