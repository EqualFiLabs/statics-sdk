import {
  concatHex, encodeAbiParameters, encodeFunctionData, getAddress, getCreate2Address,
  getContractAddress, keccak256, parseAbi, parseAbiParameters, toHex,
  type Address, type Hex,
} from "viem";
import type { CreateBasketParams, PoolLaunchParams } from "./index.js";

export const CREATE_X = "0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed" as Address;
export const CREATE_X_CODE_HASH = "0xbd8a7ea8cfca7b4e5f5041d7d4b17bc317c5ce42cfbc42066a00cf26b43eb53f" as Hex;
export const CREATE3_PROXY_HASH = "0x21c35dbe1b344a2488cf3321d6ce542f8e9f305544ff09e4993a62319a497c1f" as Hex;
export const BASKET_HOOK_PERMISSION_MASK = 0x1fecn;
export const BASKET_FACTORY_VERSION = 1n;
const MAX_ENTROPY = (1n << 88n) - 1n;
const PREPARED_SALT_BIT = 1n << 87n;
const MAX_QUEUE_ENTROPY = PREPARED_SALT_BIT - 1n;
const basketTuple = "(string name,string symbol,address[] assets,uint256[] bundleAmounts,(uint256 minActionShares,uint256 feeShares)[] mintFeeTiers,(uint256 minActionShares,uint256 feeShares)[] redemptionFeeTiers,uint16 flashFeeBps,uint16 originationFeeBps,uint16 extensionFeeBps,uint16 ltvBps,uint16 recoveryPenaltyBps,uint40 loanDuration)";
const poolTuple = "(uint24 lpFee,int24 tickSpacing,uint160 sqrtPriceAssetPerBasketX96,uint256 pairedAssetAmount)";
const intentTuple = "(address payer,address creator,bytes32 configurationHash,uint256 deadline,uint256 version)";
const marketTuple = "(address tokenA,address tokenB,uint24 lpFee,int24 tickSpacing,uint160 sqrtPriceBPerAX96,uint256 maximumCreationFee,uint256 deadline)";

export type BasketDeploymentIntent = {
  payer: Address; creator: Address; configurationHash: Hex; deadline: bigint; version: bigint;
};
export type BasketMarketParams = {
  tokenA: Address; tokenB: Address; lpFee: number; tickSpacing: number;
  sqrtPriceBPerAX96: bigint; maximumCreationFee: bigint; deadline: bigint;
};
export const staticsBasketFactoryAbi = parseAbi([
  "function predict(bytes32 rawSalt) view returns (address deployed,address proxy)",
  "function saltFor(uint88 entropy) view returns (bytes32)",
  `function preparedSaltFor(${intentTuple} intent,uint256 nonce) view returns (bytes32)`,
  "function effectiveSalt(bytes32 rawSalt) view returns (bytes32)",
  "function saltAvailable(bytes32 rawSalt) view returns (bool)",
  "function saltState(bytes32 rawSalt) view returns (uint8)",
  "function queueAvailability() view returns (uint256 tokens,uint256 hooks)",
  "function queuedSalt(bool hook,uint256 offset) view returns (bytes32)",
  "function enqueueSalts(bytes32[] salts,bool hook)",
  "function HOOK_PERMISSION_MASK() view returns (uint160)",
  `function preparationId(${intentTuple} intent,bytes32 tokenSalt,bytes32[] hookSalts) view returns (bytes32)`,
  `function preparation(bytes32 id) view returns ((${intentTuple} intent,bytes32 tokenSalt,bytes32[] hookSalts,bool tokenDeployed,uint256 hookCursor))`,
]);
export const staticsRestrictedMarketsAbi = parseAbi([
  "function basketFactory() view returns (address)",
  "function isRestrictedBasketToken(address token) view returns (bool)",
  `function basketCreationConfigurationHash(${basketTuple} params,${poolTuple}[] pools,uint256[] maxAmountsIn,uint256 deadline) view returns (bytes32)`,
  `function prepareBasketCreation(${basketTuple} params,${poolTuple}[] pools,uint256[] maxAmountsIn,uint256 deadline,uint256 tokenNonce,uint256[] hookNonces) returns (bytes32 id,address token)`,
  `function createBasketPrepared(${basketTuple} params,${poolTuple}[] pools,uint256[] maxAmountsIn,uint256 deadline,bytes32 preparationId) payable returns (uint256 basketId,address token)`,
  `function basketMarketConfigurationHash(${marketTuple} params) view returns (bytes32)`,
  `function prepareBasketMarket(${marketTuple} params,uint256 hookNonce) returns (bytes32 preparationId,address hook)`,
  `function createBasketMarket(${marketTuple} params,bytes32 preparationId) payable returns (bytes32 poolId)`,
  "function unwindBasketMarket(bytes32 poolId)",
  "function deployBasketArbitrageReceiver() returns (address receiver)",
  "function beginBasketArbitrage(uint256 basketId,uint256 shares,address executor)",
  "function settleBasketArbitrageInput(address token,address executor,uint256 amount)",
  "function settleBasketArbitrageOutput(address token,address executor,uint256 amount)",
  "function endBasketArbitrage()",
]);
const v4PoolTuple = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const staticsFlashArbitrageAbi = parseAbi([
  `function executeMintAndSell(uint256 basketId,uint256 shares,${v4PoolTuple}[] pools,uint256[] basketAmountsIn,uint256[] minimumProfits,uint256 deadline) returns (address[] assets,uint256[] profits)`,
  `function executeBuyAndRedeem(uint256 basketId,uint256 shares,${v4PoolTuple}[] pools,uint256[] constituentAmountsIn,uint256[] minimumProfits,uint256 deadline) returns (address[] assets,uint256[] profits)`,
]);
export type ArbitragePoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

export function encodeDeployBasketArbitrageReceiver(): Hex {
  return encodeFunctionData({abi: staticsRestrictedMarketsAbi, functionName: "deployBasketArbitrageReceiver"});
}
export function encodeUnwindBasketMarket(poolId: Hex): Hex {
  return encodeFunctionData({abi: staticsRestrictedMarketsAbi, functionName: "unwindBasketMarket", args: [poolId]});
}
export function encodeBasketArbitrage(direction: "mint-and-sell" | "buy-and-redeem", basketId: bigint, shares: bigint,
  pools: readonly ArbitragePoolKey[], amounts: readonly bigint[], minimumProfits: readonly bigint[], deadline: bigint): Hex {
  if (pools.length !== amounts.length || pools.length !== minimumProfits.length || pools.length === 0 || pools.length > 16) throw new Error("invalid arbitrage shape");
  return encodeFunctionData({abi: staticsFlashArbitrageAbi, functionName: direction === "mint-and-sell" ? "executeMintAndSell" : "executeBuyAndRedeem",
    args: [basketId, shares, pools, amounts, minimumProfits, deadline]});
}

/** Factory-bound, cross-chain protected raw CreateX salt. Constructor code is not part of prediction. */
export function basketDeploymentSalt(factory: Address, entropy: bigint): Hex {
  if (entropy < 0n || entropy > MAX_ENTROPY) throw new RangeError("entropy must fit uint88");
  return concatHex([getAddress(factory), "0x01", toHex(entropy, { size: 11 })]);
}
/** Prepared salts bind the complete intent and cannot be acquired through the public queue. */
export function preparedBasketDeploymentSalt(factory: Address, chainId: bigint, diamond: Address, intent: BasketDeploymentIntent, nonce: bigint): Hex {
  if (nonce < 0n || nonce >= 1n << 256n) throw new RangeError("nonce must fit uint256");
  const hash = keccak256(encodeAbiParameters(parseAbiParameters(`uint256,address,address,${intentTuple},uint256`), [chainId, factory, diamond, intent, nonce]));
  return basketDeploymentSalt(factory, (BigInt(hash) & MAX_ENTROPY) | PREPARED_SALT_BIT);
}
export function effectiveBasketSalt(factory: Address, chainId: bigint, salt: Hex): Hex {
  if (salt.length !== 66 || salt.slice(2, 42).toLowerCase() !== factory.slice(2).toLowerCase() || salt.slice(42, 44) !== "01") {
    throw new Error("salt must bind this factory with CreateX cross-chain protection");
  }
  return keccak256(encodeAbiParameters(parseAbiParameters("address,uint256,bytes32"), [factory, chainId, salt]));
}
export function predictBasketDeployment(factory: Address, chainId: bigint, salt: Hex): { deployed: Address; proxy: Address } {
  const proxy = getCreate2Address({ from: CREATE_X, salt: effectiveBasketSalt(factory, chainId, salt), bytecodeHash: CREATE3_PROXY_HASH });
  return { proxy, deployed: getContractAddress({ from: proxy, nonce: 1n }) };
}
export function hasBasketHookPermissions(address: Address): boolean {
  return (BigInt(address) & 0x3fffn) === BASKET_HOOK_PERMISSION_MASK;
}
export function basketPreparationId(chainId: bigint, factory: Address, diamond: Address, intent: BasketDeploymentIntent, tokenSalt: Hex, hookSalts: readonly Hex[]): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters(`uint256,address,address,${intentTuple},bytes32,bytes32[]`), [chainId, factory, diamond, intent, tokenSalt, hookSalts]));
}
/** Use the onchain configuration-hash view for authority; this helper accepts its exact environment commitment. */
export function basketCreationConfigurationHash(params: CreateBasketParams, pools: readonly PoolLaunchParams[], maximums: readonly bigint[], deadline: bigint, environmentHash: Hex): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters(`${basketTuple},${poolTuple}[],uint256[],uint256,bytes32`), [params, pools, maximums, deadline, environmentHash]));
}
export function encodePrepareBasketCreation(params: CreateBasketParams, pools: readonly PoolLaunchParams[], maximums: readonly bigint[], deadline: bigint, tokenNonce: bigint, hookNonces: readonly bigint[]): Hex {
  return encodeFunctionData({ abi: staticsRestrictedMarketsAbi, functionName: "prepareBasketCreation", args: [params, pools, maximums, deadline, tokenNonce, hookNonces] });
}
export function encodeCreateBasketPrepared(params: CreateBasketParams, pools: readonly PoolLaunchParams[], maximums: readonly bigint[], deadline: bigint, id: Hex): Hex {
  return encodeFunctionData({ abi: staticsRestrictedMarketsAbi, functionName: "createBasketPrepared", args: [params, pools, maximums, deadline, id] });
}
export function encodePrepareBasketMarket(params: BasketMarketParams, nonce: bigint): Hex {
  return encodeFunctionData({ abi: staticsRestrictedMarketsAbi, functionName: "prepareBasketMarket", args: [params, nonce] });
}
export function encodeCreateBasketMarket(params: BasketMarketParams, id: Hex): Hex {
  return encodeFunctionData({ abi: staticsRestrictedMarketsAbi, functionName: "createBasketMarket", args: [params, id] });
}
export function encodeEnqueueBasketSalts(salts: readonly Hex[], hook: boolean): Hex {
  if (salts.length === 0 || salts.length > 128 || new Set(salts.map(s => s.toLowerCase())).size !== salts.length) throw new Error("queue requires 1..128 distinct salts");
  if (salts.some(s => (BigInt(s) & PREPARED_SALT_BIT) !== 0n)) throw new Error("prepared salts cannot enter the public queue");
  return encodeFunctionData({ abi: staticsBasketFactoryAbi, functionName: "enqueueSalts", args: [salts, hook] });
}

export type HookMiningOptions = {
  factory: Address; chainId: bigint; start?: bigint; attempts?: bigint; count?: number;
  prepared?: { diamond: Address; intent: BasketDeploymentIntent };
  signal?: AbortSignal; chunkSize?: number;
  onProgress?: (nextEntropy: bigint, found: number) => void;
};
export type MinedHookSalt = { salt: Hex; address: Address; entropy: bigint; nonce?: bigint };
/** Offline candidates only: check saltAvailable onchain before preparing or enqueuing. */
export async function mineBasketHookSalts(options: HookMiningOptions): Promise<MinedHookSalt[]> {
  const start = options.start ?? 0n;
  const attempts = options.attempts ?? 1_000_000n;
  const count = options.count ?? 1;
  const chunkSize = options.chunkSize ?? 256;
  const maximum = options.prepared ? (1n << 256n) - 1n : MAX_QUEUE_ENTROPY;
  if (start < 0n || attempts < 1n || start + attempts - 1n > maximum || !Number.isSafeInteger(count) || count < 1 || count > 128 || !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 16_384) throw new RangeError("invalid mining bounds");
  const found: MinedHookSalt[] = [];
  for (let entropy = start; entropy < start + attempts; entropy++) {
    if (options.signal?.aborted) throw new Error("mining cancelled");
    const salt = options.prepared
      ? preparedBasketDeploymentSalt(options.factory, options.chainId, options.prepared.diamond, options.prepared.intent, entropy)
      : basketDeploymentSalt(options.factory, entropy);
    const { deployed } = predictBasketDeployment(options.factory, options.chainId, salt);
    if (hasBasketHookPermissions(deployed)) found.push(options.prepared
      ? { salt, address: deployed, entropy: BigInt(salt) & MAX_ENTROPY, nonce: entropy }
      : { salt, address: deployed, entropy });
    if (found.length === count) return found;
    if ((entropy - start + 1n) % BigInt(chunkSize) === 0n) {
      options.onProgress?.(entropy + 1n, found.length);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
  throw new Error("mining search exhausted");
}
