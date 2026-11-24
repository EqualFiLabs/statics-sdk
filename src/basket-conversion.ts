import {
  encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters,
  type Address, type Hex, type PublicClient,
} from "viem";
import type { V4PoolKey } from "./index.js";

const key = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
const route = `(address[] currencies,${key}[] pools,bytes[] hookData)`;
const request = `(uint256 deadline,uint256 limit,uint256[] routeLimits,bool preset,${route}[] routes)`;
const step = `(${key} key,(bool zeroForOne,int256 amountSpecified,uint160 sqrtPriceLimitX96) params,bytes data)`;
const bounds = "(uint256 maxQuoteIn,uint256 minQuoteOut,uint256 minBasketOut,uint256 deadline)";

export type BasketConversionRoute = Readonly<{
  currencies: readonly Address[];
  pools: readonly V4PoolKey[];
  hookData: readonly Hex[];
}>;
export type BasketConversionRequest = Readonly<{
  deadline: bigint;
  limit: bigint;
  routeLimits: readonly bigint[];
  preset: boolean;
  routes: readonly BasketConversionRoute[];
}>;
export type BasketConversionStep = Readonly<{
  key: V4PoolKey;
  params: Readonly<{ zeroForOne: boolean; amountSpecified: bigint; sqrtPriceLimitX96: bigint }>;
  data: Hex;
}>;
export type BasketConversionBounds = Readonly<{
  maxQuoteIn: bigint;
  minQuoteOut: bigint;
  minBasketOut: bigint;
  deadline: bigint;
}>;

export const staticsBasketConversionAbi = parseAbi([
  "function basketConversionConfiguration() view returns ((address hook,address zap,address router,address poolManager))",
  `function basketConversionMarket(bytes32 poolId) view returns ((${key} key,uint256 basketId,address basketToken,address quote,bool active))`,
  "function createBasketConversionMarket(uint256 basketId,address quote,uint256 maximumCreationFee,uint256 deadline) payable returns (bytes32)",
  "function decommissionBasketConversionMarket(bytes32 poolId)",
  "function mintBasketConversion(bytes32 poolId,uint256 shares,address receiver,uint256[] expected)",
  "function prefundBasketConversion(bytes32 poolId,address payer,uint256 amount)",
  "event BasketConversionMarketCreated(bytes32 indexed poolId,uint256 indexed basketId,address indexed quote)",
  "event BasketConversionMarketDecommissioned(bytes32 indexed poolId)",
]);
export const staticsBasketConversionZapAbi = parseAbi([
  `function buy(bytes32 poolId,uint256 shares,address receiver,${request} r) returns (uint256)`,
  `function sell(bytes32 poolId,uint256 shares,address receiver,${request} r) returns (uint256)`,
]);
export const staticsBasketConversionHookAbi = parseAbi([
  `function setPreset(bytes32 poolId,bool buying,${route}[] paths)`,
  `function preset(bytes32 poolId,bool buying) view returns (${route}[])`,
  "event BasketConversionPresetSet(bytes32 indexed poolId,bool indexed buying,bytes32 routesHash)",
]);
export const staticsBasketConversionRouterAbi = parseAbi([
  `function execute(bytes32 poolId,${step}[] steps,uint256 prefund,${bounds} bounds) returns (int256 quoteDelta)`,
]);
const requestParameters = parseAbiParameters(`${request} r`);

function uint(value: bigint, label: string): void {
  if (value < 0n || value >= 1n << 256n) throw new Error(`invalid ${label}`);
}

/** Bounds include existing basket charges and underlying swaps; no outer conversion fee is added. */
export function validateBasketConversionRequest(r: BasketConversionRequest): void {
  uint(r.deadline, "deadline");
  uint(r.limit, "aggregate bound");
  if (r.routeLimits.length < 1 || r.routeLimits.length > 16) throw new Error("invalid constituent count");
  r.routeLimits.forEach(v => uint(v, "route bound"));
  if (r.preset ? r.routes.length !== 0 : r.routes.length !== r.routeLimits.length) throw new Error("route count mismatch");
  for (const path of r.routes) {
    if (path.pools.length > 4 || path.currencies.length !== path.pools.length + 1 || path.hookData.length !== path.pools.length)
      throw new Error("invalid route shape");
    const currencies = path.currencies.map(a => a.toLowerCase());
    if (currencies.some(a => /^0x0{40}$/.test(a)) || new Set(currencies).size !== currencies.length) throw new Error("native or cyclic route");
    for (let i = 0; i < path.pools.length; i++) {
      const a = currencies[i];
      const b = currencies[i + 1];
      if (path.pools[i].currency0.toLowerCase() !== (a < b ? a : b) || path.pools[i].currency1.toLowerCase() !== (a < b ? b : a))
        throw new Error("pool currencies mismatch");
    }
  }
}

/** Hook modes are exact basket output when buying and exact basket input when selling. */
export function encodeBasketConversionRequest(r: BasketConversionRequest): Hex {
  validateBasketConversionRequest(r);
  return encodeAbiParameters(requestParameters, [r]);
}

function validateZap(shares: bigint, r: BasketConversionRequest): void {
  validateBasketConversionRequest(r);
  if (shares <= 0n || shares > (1n << 127n) - 1n) throw new Error("invalid shares");
}

export function buildBasketConversionZapCall(mode: "buy" | "sell", poolId: Hex, shares: bigint, receiver: Address, r: BasketConversionRequest): Hex {
  validateZap(shares, r);
  return encodeFunctionData({ abi: staticsBasketConversionZapAbi, functionName: mode, args: [poolId, shares, receiver, r] });
}

function validateRouter(steps: readonly BasketConversionStep[], prefund: bigint, b: BasketConversionBounds): void {
  if (steps.length < 1 || steps.length > 4) throw new Error("invalid step count");
  uint(prefund, "prefund");
  Object.entries(b).forEach(([name, value]) => uint(value, name));
}

export function buildBasketConversionRouterCall(poolId: Hex, steps: readonly BasketConversionStep[], prefund: bigint, b: BasketConversionBounds): Hex {
  validateRouter(steps, prefund, b);
  return encodeFunctionData({ abi: staticsBasketConversionRouterAbi, functionName: "execute", args: [poolId, steps, prefund, b] });
}

export function buildCreateBasketConversionMarketCall(basketId: bigint, quote: Address, maximumCreationFee: bigint, deadline: bigint): Hex {
  return encodeFunctionData({ abi: staticsBasketConversionAbi, functionName: "createBasketConversionMarket", args: [basketId, quote, maximumCreationFee, deadline] });
}

export async function readBasketConversionMarket(client: PublicClient, diamond: Address, poolId: Hex) {
  return client.readContract({ address: diamond, abi: staticsBasketConversionAbi, functionName: "basketConversionMarket", args: [poolId] });
}

/** Simulate from the real payer: approvals, lifecycle, route liquidity and fee rounding affect executability. */
export async function simulateBasketConversionZap(client: PublicClient, zap: Address, payer: Address, mode: "buy" | "sell", poolId: Hex, shares: bigint, receiver: Address, r: BasketConversionRequest) {
  validateZap(shares, r);
  return client.simulateContract({ address: zap, account: payer, abi: staticsBasketConversionZapAbi, functionName: mode, args: [poolId, shares, receiver, r] });
}

export async function simulateBasketConversionRouter(client: PublicClient, router: Address, payer: Address, poolId: Hex, steps: readonly BasketConversionStep[], prefund: bigint, b: BasketConversionBounds) {
  validateRouter(steps, prefund, b);
  return client.simulateContract({ address: router, account: payer, abi: staticsBasketConversionRouterAbi, functionName: "execute", args: [poolId, steps, prefund, b] });
}

/** Discover registered identities over an explicit block range; retired markets remain discoverable. */
export async function discoverBasketConversionMarkets(client: PublicClient, diamond: Address, fromBlock: bigint, toBlock: bigint, basketId?: bigint) {
  const events = await client.getContractEvents({ address: diamond, abi: staticsBasketConversionAbi,
    eventName: "BasketConversionMarketCreated", args: basketId === undefined ? {} : { basketId }, fromBlock, toBlock });
  return Promise.all(events.map(event => readBasketConversionMarket(client, diamond, event.args.poolId!)));
}
