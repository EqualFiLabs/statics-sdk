import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeFunctionData, zeroAddress } from "viem";
import * as revenue from "../src/venue-revenue.js";

const source = "0x1111111111111111111111111111111111111111";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/venue-revenue.json", import.meta.url), "utf8"));

describe("fixed venue revenue", () => {
  it("matches shared Solidity calldata fixtures", () => {
    expect(revenue.encodePonsRevenueCollect(42n)).toBe(fixture.ponsCollect);
    expect(revenue.encodePonsRevenueHandoff()).toBe(fixture.ponsHandoff);
    expect(revenue.encodeMoshTeamBindSource(source)).toBe(fixture.teamBind);
    expect(revenue.buildMoshTeamHandoffCall(42n, 7n).data).toBe(fixture.teamHandoff);
    expect(revenue.encodeMoshTeamSync()).toBe(fixture.teamSync);
    expect(revenue.encodeMoshTeamFlush()).toBe(fixture.teamFlush);
  });
  it("encodes independently retryable PONS collection and handoff", () => {
    expect(decodeFunctionData({abi: revenue.ponsRevenueAdapterAbi, data: revenue.encodePonsRevenueCollect(42n)}))
      .toEqual({functionName: "collect", args: [42n]});
    expect(decodeFunctionData({abi: revenue.ponsRevenueAdapterAbi, data: revenue.encodePonsRevenueHandoff()}).functionName)
      .toBe("handoff");
  });
  it("binds an explicit team source and separates offer value from calldata", () => {
    expect(decodeFunctionData({abi: revenue.moshTeamRevenueAdapterAbi, data: revenue.encodeMoshTeamBindSource(source)}).args)
      .toEqual([source]);
    const call = revenue.buildMoshTeamHandoffCall(42n, 7n);
    expect(call.value).toBe(1n);
    expect(decodeFunctionData({abi: revenue.moshTeamRevenueAdapterAbi, data: call.data}).args).toEqual([42n, 7n]);
    expect(decodeFunctionData({abi: revenue.moshTeamRevenueAdapterAbi, data: revenue.encodeMoshTeamSync()}).functionName).toBe("sync");
    expect(decodeFunctionData({abi: revenue.moshTeamRevenueAdapterAbi, data: revenue.encodeMoshTeamFlush()}).functionName).toBe("flushTeamRevenue");
  });
  it("rejects empty or overflowing amounts and unbound sources", () => {
    for (const amount of [0n, -1n, 1n << 256n]) {
      expect(() => revenue.encodePonsRevenueCollect(amount)).toThrow();
      expect(() => revenue.buildMoshTeamHandoffCall(42n, amount)).toThrow();
    }
    expect(() => revenue.encodeMoshTeamBindSource(zeroAddress)).toThrow();
    expect(() => revenue.buildMoshTeamHandoffCall(-1n, 1n)).toThrow();
  });
  it("exports venue encoders from the root", async () => {
    expect((await import("../src/index.js")).encodeMoshTeamSync()).toBe(revenue.encodeMoshTeamSync());
  });
});
