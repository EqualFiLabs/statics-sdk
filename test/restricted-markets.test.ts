import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeFunctionData, keccak256, type Address } from "viem";
import {
  basketDeploymentSalt, basketPreparationId, effectiveBasketSalt, predictBasketDeployment,
  hasBasketHookPermissions, mineBasketHookSalts, encodeEnqueueBasketSalts,
  encodeCreateBasketMarket, staticsBasketFactoryAbi, staticsRestrictedMarketsAbi,
  basketCreationConfigurationHash, encodePrepareBasketCreation, encodeCreateBasketPrepared,
  preparedBasketDeploymentSalt,
} from "../src/restricted-markets.js";
import { installBasketMiningWorker, type HookMiningWorkerPort } from "../src/restricted-markets-worker.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/basket-create3.json", import.meta.url), "utf8"));
const factory = fixture.factory as Address;
const chainId = BigInt(fixture.chainId);

describe("restricted basket identities", () => {
  it("matches Solidity's guarded CREATE3 address and intent fixtures", () => {
    const salt = basketDeploymentSalt(factory, BigInt(fixture.tokenEntropy));
    expect(salt).toBe(fixture.tokenSalt);
    expect(effectiveBasketSalt(factory, chainId, salt)).toBe(fixture.effectiveSalt);
    expect(predictBasketDeployment(factory, chainId, salt)).toEqual({ proxy: fixture.tokenProxy, deployed: fixture.tokenAddress });
    expect(basketPreparationId(chainId, factory, fixture.diamond, {
      payer: fixture.payer, creator: fixture.creator, configurationHash: fixture.configurationHash,
      deadline: BigInt(fixture.deadline), version: 1n,
    }, salt, [fixture.hookSalt])).toBe(fixture.preparationId);
    expect(hasBasketHookPermissions(fixture.hookAddress)).toBe(true);
    expect(predictBasketDeployment(factory, 1n, salt).deployed).not.toBe(fixture.tokenAddress);
  });
  it("binds raw salt authority and validates entropy", () => {
    expect(() => basketDeploymentSalt(factory, -1n)).toThrow();
    expect(() => basketDeploymentSalt(factory, 1n << 88n)).toThrow();
    expect(() => effectiveBasketSalt(fixture.diamond, chainId, fixture.tokenSalt)).toThrow();
    expect(() => effectiveBasketSalt(factory, chainId, fixture.tokenSalt.replace("9001", "9000"))).toThrow();
  });
  it("binds prepared identities to the entire intent and isolates them from the queue", async () => {
    const intent = { payer: fixture.payer, creator: fixture.creator, configurationHash: fixture.configurationHash,
      deadline: BigInt(fixture.deadline), version: 1n };
    const salt = preparedBasketDeploymentSalt(factory, chainId, fixture.diamond, intent, 42n);
    expect(salt).toBe(fixture.preparedTokenSalt);
    expect(predictBasketDeployment(factory, chainId, salt).deployed).toBe(fixture.preparedTokenAddress);
    expect(() => encodeEnqueueBasketSalts([salt], false)).toThrow("prepared salts");
    expect(preparedBasketDeploymentSalt(factory, chainId, fixture.diamond, { ...intent, payer: fixture.creator }, 42n)).not.toBe(salt);
    const [hook] = await mineBasketHookSalts({ factory, chainId, start: BigInt(fixture.preparedHookNonce), attempts: 1n,
      prepared: { diamond: fixture.diamond, intent } });
    expect(hook.salt).toBe(fixture.preparedHookSalt);
    expect(hook.address).toBe(fixture.preparedHookAddress);
    expect(hook.nonce).toBe(BigInt(fixture.preparedHookNonce));
    await expect(mineBasketHookSalts({factory, chainId, start: 1n << 87n, attempts: 1n})).rejects.toThrow("bounds");
  });
  it("mines the actual effective salt and finds a deterministic fixture", async () => {
    const results = await mineBasketHookSalts({ factory, chainId, start: 4738n, attempts: 2n });
    expect(results).toEqual([{ entropy: 4739n, salt: fixture.hookSalt, address: fixture.hookAddress }]);
    await expect(mineBasketHookSalts({ factory, chainId, start: 4738n, attempts: 1n })).rejects.toThrow("exhausted");
  });
  it("encodes typed replenishment and independent market creation", () => {
    const data = encodeEnqueueBasketSalts([fixture.hookSalt], true);
    expect(decodeFunctionData({ abi: staticsBasketFactoryAbi, data })).toEqual({ functionName: "enqueueSalts", args: [[fixture.hookSalt], true] });
    expect(() => encodeEnqueueBasketSalts([fixture.hookSalt, fixture.hookSalt], true)).toThrow();
    const market = { tokenA: fixture.payer as Address, tokenB: fixture.creator as Address, lpFee: 3000, tickSpacing: 10, sqrtPriceBPerAX96: 1n << 96n, maximumCreationFee: 1n, deadline: 2_000_000_000n };
    expect(keccak256(encodeCreateBasketMarket(market, fixture.preparationId))).toBe(fixture.marketCalldataHash);
  });
  it("matches configuration and typed creation calldata hashes", () => {
    const params = { name: "Parity", symbol: "sP", assets: [fixture.payer as Address, fixture.creator as Address], bundleAmounts: [10n ** 18n, 2n * 10n ** 18n], mintFeeTiers: [{ minActionShares: 0n, feeShares: 1n }], redemptionFeeTiers: [], flashFeeBps: 5, originationFeeBps: 100, extensionFeeBps: 25, ltvBps: 9500, recoveryPenaltyBps: 500, loanDuration: 2592000 };
    const pools = [{ lpFee: 3000, tickSpacing: 10, sqrtPriceAssetPerBasketX96: 1n << 96n, pairedAssetAmount: 10n ** 18n }, { lpFee: 500, tickSpacing: 20, sqrtPriceAssetPerBasketX96: 2n << 96n, pairedAssetAmount: 2n * 10n ** 18n }];
    const maxima = [10n * 10n ** 18n, 20n * 10n ** 18n];
    const deadline = 2000000000n;
    expect(basketCreationConfigurationHash(params, pools, maxima, deadline, fixture.environmentHash)).toBe(fixture.creationConfigurationHash);
    expect(keccak256(encodePrepareBasketCreation(params, pools, maxima, deadline, 42n, [4739n, 42n]))).toBe(fixture.prepareCalldataHash);
    expect(keccak256(encodeCreateBasketPrepared(params, pools, maxima, deadline, fixture.preparationId))).toBe(fixture.createCalldataHash);
  });
  it("cancels a mining worker between bounded chunks", async () => {
    const messages: unknown[] = [];
    let resolveError!: (message: unknown) => void;
    const terminal = new Promise(resolve => { resolveError = resolve; });
    const port: HookMiningWorkerPort = {
      onmessage: null,
      postMessage(message) {
        messages.push(message);
        const typed = message as { type: string };
        if (typed.type === "progress") port.onmessage?.({ data: { type: "cancel", id: "cancelled" } });
        if (typed.type === "error") resolveError(message);
      },
    };
    const dispose = installBasketMiningWorker(port);
    port.onmessage?.({ data: { type: "mine", id: "cancelled", options: { factory, chainId, chunkSize: 1 } } });
    expect(await terminal).toEqual({ type: "error", id: "cancelled", error: "mining cancelled" });
    expect(messages.some(message => (message as { type: string }).type === "result")).toBe(false);
    dispose();
    expect(port.onmessage).toBe(null);
  });
  it("handles worker success with the same parity fixture", async () => {
    let resolve!: (message: unknown) => void;
    const terminal = new Promise(r => { resolve = r; });
    const port: HookMiningWorkerPort = { onmessage: null, postMessage: resolve };
    const dispose = installBasketMiningWorker(port);
    port.onmessage?.({ data: { type: "mine", id: "fixture", options: { factory, chainId, start: 4739n, attempts: 1n } } });
    expect(await terminal).toEqual({ type: "result", id: "fixture", results: [{ entropy: 4739n, salt: fixture.hookSalt, address: fixture.hookAddress }] });
    dispose();
  });
});
