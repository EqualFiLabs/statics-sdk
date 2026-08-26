import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  GENESIS_CREDIT_RECOVERY_GRACE,
  GENESIS_CREDIT_TERM,
  GENESIS_MAX_CREDIT_PRINCIPAL,
  GENESIS_RECOVERY_RESIDUAL,
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

  it("builds extension, repayment, and recovery calldata", () => {
    const extension = buildExtendGenesisCreditTransaction(7n, 9n);
    expect(extension.value).toBe(9n);
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: extension.data })).toEqual({
      functionName: "extendGenesisCredit",
      args: [7n],
    });
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: buildRepayGenesisCreditCall(7n) })).toEqual({
      functionName: "repayGenesisCredit",
      args: [7n],
    });
    expect(decodeFunctionData({ abi: staticsGenesisCreditAbi, data: buildRecoverGenesisCreditCall(7n) })).toEqual({
      functionName: "recoverGenesisCredit",
      args: [7n],
    });
  });
});
