// Runtime-independent v4 math, shared by the public SDK and bootstrap previews.
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;
const MAX_UINT256 = (1n << 256n) - 1n;
const Q96 = 1n << 96n;
function mulDivUp(value: bigint, multiplier: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("division by zero");
  const product = value * multiplier;
  return product === 0n ? 0n : (product - 1n) / denominator + 1n;
}

export function getSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new Error("invalid tick");
  const absTick = Math.abs(tick);
  let price = (absTick & 0x1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;
  const factors: readonly [number, bigint][] = [
    [0x2, 0xfff97272373d413259a46990580e213an],
    [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
    [0x10, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
    [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
    [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
    [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
    [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
    [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
    [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000, 0x5d6af8dedb81196699c329225ee604n],
    [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [mask, factor] of factors) {
    if ((absTick & mask) !== 0) price = (price * factor) >> 128n;
  }
  if (tick > 0) price = MAX_UINT256 / price;
  return (price + ((1n << 32n) - 1n)) >> 32n;
}

function amount0Delta(sqrtPriceA: bigint, sqrtPriceB: bigint, liquidity: bigint): bigint {
  const [lower, upper] = sqrtPriceA <= sqrtPriceB
    ? [sqrtPriceA, sqrtPriceB]
    : [sqrtPriceB, sqrtPriceA];
  if (lower === 0n) throw new Error("invalid sqrt price");
  return mulDivUp(mulDivUp(liquidity << 96n, upper - lower, upper), 1n, lower);
}

function amount1Delta(sqrtPriceA: bigint, sqrtPriceB: bigint, liquidity: bigint): bigint {
  const difference = sqrtPriceA <= sqrtPriceB
    ? sqrtPriceB - sqrtPriceA
    : sqrtPriceA - sqrtPriceB;
  return mulDivUp(liquidity, difference, Q96);
}

export function quoteRangeAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  if (tickLower >= tickUpper || liquidity <= 0n || liquidity > ((1n << 128n) - 1n)) {
    throw new Error("invalid liquidity range");
  }
  const sqrtLower = getSqrtPriceAtTick(tickLower);
  const sqrtUpper = getSqrtPriceAtTick(tickUpper);
  if (sqrtPriceX96 <= sqrtLower) return { amount0: amount0Delta(sqrtLower, sqrtUpper, liquidity), amount1: 0n };
  if (sqrtPriceX96 < sqrtUpper) {
    return {
      amount0: amount0Delta(sqrtPriceX96, sqrtUpper, liquidity),
      amount1: amount1Delta(sqrtLower, sqrtPriceX96, liquidity),
    };
  }
  return { amount0: 0n, amount1: amount1Delta(sqrtLower, sqrtUpper, liquidity) };
}
