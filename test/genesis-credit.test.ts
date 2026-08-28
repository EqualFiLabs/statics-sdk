import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  GENESIS_CREDIT_RECOVERY_GRACE,
  GENESIS_CREDIT_TERM,
  GENESIS_MAX_CREDIT_PRINCIPAL,
  GENESIS_RECOVERY_RESIDUAL,
  buildDrawGenesisCreditTransaction,
  buildExtendGenesisCreditTransaction,
  buildOpenGenesisCreditTransaction,
  buildRecoverGenesisCreditCall,
  buildRepayGenesisCreditCall,
  staticsGenesisCreditAbi,
} from "../src/genesis-credit.js";

describe("Genesis secured credit bindings", () => {
  it("pins the reviewed credit constants", () => {
    expect(GENESIS_MAX_CREDIT_PRINCIPAL).toBe(171_000n * 10n ** 18n);
    expect(GENESIS_RECOVERY_RESIDUAL).toBe(9_000n * 10n ** 18n);
    expect(GENESIS_CREDIT_TERM).toBe(30n * 24n * 60n * 60n);
    expect(GENESIS_CREDIT_RECOVERY_GRACE).toBe(60n * 60n);
  });

  it("builds an origination transaction with the quoted native fee", () => {
    const transaction = buildOpenGenesisCreditTransaction(42n, 150_000n * 10n ** 18n, 3n);
    expect(transaction.value).toBe(3n);
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: transaction.data })).toEqual({
      functionName: "openGenesisCredit",
      args: [42n, 150_000n * 10n ** 18n],
    });
  });

  it("builds draw, extension, repayment, and recovery calldata", () => {
    const draw = buildDrawGenesisCreditTransaction(7n, 20n, 3n);
    expect(draw.value).toBe(3n);
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: draw.data })).toEqual({
      functionName: "drawGenesisCredit",
      args: [7n, 20n],
    });

    const extension = buildExtendGenesisCreditTransaction(7n, 9n);
    expect(extension.value).toBe(9n);
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: extension.data })).toEqual({
      functionName: "extendGenesisCredit",
      args: [7n],
    });
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: buildRepayGenesisCreditCall(7n, 20n) })).toEqual({
      functionName: "repayGenesisCredit",
      args: [7n, 20n],
    });
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: buildRecoverGenesisCreditCall(7n) })).toEqual({
      functionName: "recoverGenesisCredit",
      args: [7n],
    });
  });

  it("exposes only the redraw and time-only extension ABI", () => {
    const functions = staticsGenesisCreditAbi.filter((item) => item.type === "function");
    const removedAdjustmentQuote = ["quoteGenesisCredit", "Adjustment"].join("");
    const removedAdjustmentEvent = ["GenesisCreditPrincipal", "Adjusted"].join("");
    const removedPauseGetter = ["credit", "OriginationsPaused"].join("");
    const removedPauseSetter = ["setCredit", "OriginationsPaused"].join("");

    const events = staticsGenesisCreditAbi.filter((item) => item.type === "event");

    expect(functions.find((item) => item.name === "drawGenesisCredit")?.inputs.map((input) => input.type)).toEqual([
      "uint256",
      "uint256",
    ]);
    expect(functions.find((item) => item.name === "extendGenesisCredit")?.inputs.map((input) => input.type)).toEqual([
      "uint256",
    ]);
    expect(functions.some((item) => item.name === removedAdjustmentQuote)).toBe(false);
    expect(events.some((item) => item.name === removedAdjustmentEvent)).toBe(false);
    expect(events.some((item) => item.name === "GenesisCreditDrawn")).toBe(true);
    expect(functions.some((item) => item.name === "creditIncreasesPaused")).toBe(true);
    expect(functions.some((item) => item.name === "setCreditIncreasesPaused")).toBe(true);
    expect(functions.some((item) => item.name === removedPauseGetter)).toBe(false);
    expect(functions.some((item) => item.name === removedPauseSetter)).toBe(false);
  });
});
