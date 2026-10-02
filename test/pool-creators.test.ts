import { describe, expect, it } from "vitest";
import { decodeErrorResult, decodeEventLog, decodeFunctionData, encodeErrorResult, encodeEventTopics, encodeFunctionResult, zeroAddress, type Address, type Hex } from "viem";
import { buildAcceptPoolCreatorCall, buildClaimCreatorRevenueCall, buildPoolCreatorConfigurationCall, buildProposePoolCreatorCall, buildSetCreatorRevenueRecipientCall, decodePoolCreatorConfigurationResult, staticsAbi, staticsPoolCreatorAbi, staticsProtocolRevenueErrorAbi } from "../src/index.js";

const poolId = `0x${"12".repeat(32)}` as Hex;
const creator = "0x0000000000000000000000000000000000000011" as Address;
const successor = "0x0000000000000000000000000000000000000022" as Address;

describe("pool creator transfers and recipients", () => {
  it("includes every selector exactly once in the Diamond ABI", () => {
    for (const name of ["proposePoolCreator", "acceptPoolCreator", "setCreatorRevenueRecipient", "poolCreatorConfiguration", "claimCreatorRevenue"]) {
      expect(staticsAbi.filter((item) => item.type === "function" && item.name === name)).toHaveLength(1);
    }
  });

  it("builds proposals, cancellation, acceptance, recipient changes and reset", () => {
    const operations = [
      [buildProposePoolCreatorCall(poolId, successor), "proposePoolCreator", [poolId, successor]],
      [buildProposePoolCreatorCall(poolId, zeroAddress), "proposePoolCreator", [poolId, zeroAddress]],
      [buildAcceptPoolCreatorCall(poolId), "acceptPoolCreator", [poolId]],
      [buildSetCreatorRevenueRecipientCall(poolId, successor), "setCreatorRevenueRecipient", [poolId, successor]],
      [buildSetCreatorRevenueRecipientCall(poolId, zeroAddress), "setCreatorRevenueRecipient", [poolId, zeroAddress]],
      [buildPoolCreatorConfigurationCall(poolId), "poolCreatorConfiguration", [poolId]],
    ] as const;
    for (const [data, functionName, args] of operations) {
      expect(decodeFunctionData({ abi: staticsAbi, data })).toEqual({ functionName, args });
    }
  });

  it("decodes effective configuration before and after acceptance", () => {
    for (const values of [[creator, successor, successor], [successor, zeroAddress, successor]] as const) {
      const data = encodeFunctionResult({ abi: staticsPoolCreatorAbi, functionName: "poolCreatorConfiguration", result: values });
      expect(decodePoolCreatorConfigurationResult(data)).toEqual({ creator: values[0], pendingCreator: values[1], revenueRecipient: values[2] });
    }
  });

  it("preserves the claim ABI for fixed-recipient permissionless collection", () => {
    expect(decodeFunctionData({ abi: staticsAbi, data: buildClaimCreatorRevenueCall(poolId, creator, successor, 5n) })).toEqual({ functionName: "claimCreatorRevenue", args: [poolId, creator, successor, 5n] });
  });

  it("rejects malformed pool IDs and addresses", () => {
    expect(() => buildProposePoolCreatorCall("0x12", successor)).toThrow(/bytes32/);
    expect(() => buildAcceptPoolCreatorCall("0x12")).toThrow(/bytes32/);
    expect(() => buildSetCreatorRevenueRecipientCall("0x12", successor)).toThrow(/bytes32/);
    expect(() => buildPoolCreatorConfigurationCall("0x12")).toThrow(/bytes32/);
    expect(() => buildProposePoolCreatorCall(poolId, "0x12" as Address)).toThrow();
    expect(() => buildSetCreatorRevenueRecipientCall(poolId, "0x12" as Address)).toThrow();
  });

  it("decodes fully indexed creator and recipient events", () => {
    const topics = encodeEventTopics({ abi: staticsPoolCreatorAbi, eventName: "PoolCreatorTransferred", args: { poolId, previousCreator: creator, creator: successor } });
    expect(decodeEventLog({ abi: staticsAbi, topics, data: "0x" })).toMatchObject({ eventName: "PoolCreatorTransferred", args: { poolId, previousCreator: creator, creator: successor } });
    const recipientTopics = encodeEventTopics({ abi: staticsPoolCreatorAbi, eventName: "CreatorRevenueRecipientSet", args: { poolId, creator, recipient: successor } });
    expect(decodeEventLog({ abi: staticsAbi, topics: recipientTopics, data: "0x" })).toMatchObject({ eventName: "CreatorRevenueRecipientSet", args: { poolId, creator, recipient: successor } });
  });

  it("decodes fixed-recipient claim failures through the revenue error ABI", () => {
    const data = encodeErrorResult({ abi: staticsProtocolRevenueErrorAbi, errorName: "UnexpectedRevenueRecipient", args: [creator, successor] });
    expect(decodeErrorResult({ abi: staticsProtocolRevenueErrorAbi, data })).toMatchObject({ errorName: "UnexpectedRevenueRecipient", args: [creator, successor] });
  });
});
