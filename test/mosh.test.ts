import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeAbiParameters, decodeFunctionResult, zeroAddress } from "viem";
import * as mosh from "../src/mosh.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/mosh-native-custody.json", import.meta.url), "utf8"));

describe("native Mosh custody", () => {
  it("matches Solidity custody encodings and transaction value", () => {
    expect(mosh.encodeMoshNativeCustodyListing(fixture.swarm, BigInt(fixture.amount), fixture.buyer, BigInt(fixture.deadline)))
      .toBe(fixture.list);
    expect(mosh.buildMoshNativeCustodyFillCall(BigInt(fixture.offerId))).toEqual({data: fixture.fill, value: BigInt(fixture.fillValue)});
    expect(mosh.encodeMoshClaimMarketCancel(BigInt(fixture.offerId))).toBe(fixture.cancel);
    expect(mosh.encodeMoshSyncFees()).toBe(fixture.sync);
    expect(decodeFunctionData({abi: mosh.moshClaimMarketAbi, data: fixture.list}).args)
      .toEqual([fixture.swarm, BigInt(fixture.amount), 1n, fixture.buyer, BigInt(fixture.deadline)]);
  });
  it("decodes the fork-established offer layout", () => {
    const result = encodeAbiParameters([
      {type: "address"}, {type: "address"}, {type: "address"}, {type: "uint256"},
      {type: "uint256"}, {type: "uint64"}, {type: "uint16"},
    ], [fixture.swarm, fixture.buyer, fixture.buyer, 7n, 1n, 2000000000n, 1000]);
    expect(decodeFunctionResult({abi: mosh.moshClaimMarketAbi, functionName: "offers", data: result}))
      .toEqual([fixture.swarm, fixture.buyer, fixture.buyer, 7n, 1n, 2000000000n, 1000]);
  });
  it("rejects empty movements, unbound buyers and integer overflow", () => {
    for (const amount of [-1n, 0n, 1n << 256n]) {
      expect(() => mosh.encodeMoshNativeCustodyListing(fixture.swarm, amount, fixture.buyer, 1n)).toThrow();
    }
    for (const deadline of [-1n, 0n, 1n << 64n]) {
      expect(() => mosh.encodeMoshNativeCustodyListing(fixture.swarm, 1n, fixture.buyer, deadline)).toThrow();
    }
    expect(() => mosh.encodeMoshNativeCustodyListing(fixture.swarm, 1n, zeroAddress, 1n)).toThrow();
    expect(() => mosh.encodeMoshNativeCustodyListing(zeroAddress, 1n, fixture.buyer, 1n)).toThrow();
    for (const id of [-1n, 1n << 256n]) {
      expect(() => mosh.buildMoshNativeCustodyFillCall(id)).toThrow();
      expect(() => mosh.encodeMoshClaimMarketCancel(id)).toThrow();
    }
  });
  it("exports from the root without a runtime dependency cycle", async () => {
    expect((await import("../src/index.js")).encodeMoshSyncFees()).toBe(fixture.sync);
  });
  it("matches complete share adapter calldata against Solidity", () => {
    expect(mosh.buildMoshShareDepositCall(42n, BigInt(fixture.amount))).toEqual({data: fixture.shareDeposit, value: 1n});
    expect(mosh.encodeMoshShareWithdrawal(BigInt(fixture.amount), BigInt(fixture.deadline))).toBe(fixture.shareWithdraw);
    expect(mosh.encodeMoshShareCheckpoint(fixture.buyer)).toBe(fixture.shareCheckpoint);
    expect(mosh.encodeMoshShareCancel()).toBe(fixture.shareCancel);
    expect(mosh.encodeMoshShareSync()).toBe(fixture.shareSync);
    expect(mosh.encodeMoshShareFlush()).toBe(fixture.shareFlush);
    expect(mosh.encodeMoshShareClaimRewards()).toBe(fixture.shareClaim);
    expect(decodeFunctionData({abi: mosh.moshShareRevenueAdapterAbi, data: fixture.shareDeposit}).args)
      .toEqual([42n, BigInt(fixture.amount)]);
  });
  it("bounds share movements and rejects an unbound reconciliation owner", () => {
    for (const amount of [0n, -1n, 1n << 128n]) {
      expect(() => mosh.buildMoshShareDepositCall(42n, amount)).toThrow();
      expect(() => mosh.encodeMoshShareWithdrawal(amount, 1n)).toThrow();
    }
    for (const deadline of [0n, -1n, 1n << 64n]) {
      expect(() => mosh.encodeMoshShareWithdrawal(1n, deadline)).toThrow();
    }
    expect(() => mosh.encodeMoshShareCheckpoint(zeroAddress)).toThrow();
    expect(() => mosh.buildMoshShareDepositCall(-1n, 1n)).toThrow();
  });
});
