# Mint a basket

This walks through the first integrator path: install the SDK, preview a mint with `quoteMint`, and build the `mint` calldata with `buildMintCall`. The SDK does not choose a venue or submit the transaction. The wallet sends the calls.

Production contract addresses are not in this package. Take the `StaticsDiamond` address from your deployment manifest.

## Install

`viem` is a peer dependency.

```bash
npm install @statics-protocol/sdk viem
```

## Quote, then build the call

`quoteMint` reproduces the on-chain backing and static fee split from a basket snapshot. It returns one leg per constituent: `baseAmount`, `feeAmount`, and `amountIn`.

Pass the Diamond's own `quoteMint` result into `buildMintCall` as `maxAmountsIn`. Re-read that quote immediately before you build the transaction, because a snapshot taken earlier can be stale after supply changes. The local `quoteMint` uses the same static backing and fee tier as the chain. Neither one adds a historical fee-pot buy-in; basket fees accrue in-kind against the staking balance.

`allowsExposureIncrease` is the SDK's mint gate, and it is true only for basket status `Active`. The Diamond exposes `BasketNotActive` when a basket is not active. Each constituent is an ordinary ERC-20. Approve the Diamond for at least the quoted amount before the mint. If the token delivers less than required, the Diamond reverts with `InsufficientTransferReceived`. The `mint` function is not payable.

```ts
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  allowsExposureIncrease,
  basketTokenAbi,
  buildMintCall,
  quoteMint,
  staticsAbi,
  type BasketSnapshot,
  type BasketStatus,
} from "@statics-protocol/sdk";

// Placeholders. Take the Diamond from the deployment manifest. The Diamond
// exposes InvalidReceiver, so the receiver must be the wallet that should
// receive the basket tokens.
const diamond = "0x0000000000000000000000000000000000000000" as Address;
const basketId = 1n;
const shares = 10n * 10n ** 18n;
const receiver = "0x0000000000000000000000000000000000000000" as Address;

const client = createPublicClient({ transport: http(process.env.RPC_URL) });

const configuration = await client.readContract({
  address: diamond,
  abi: staticsAbi,
  functionName: "basket",
  args: [basketId],
});

const status = configuration.status as BasketStatus;
if (!allowsExposureIncrease(status)) {
  throw new Error("basket is not Active");
}

const totalSupply = await client.readContract({
  address: configuration.token,
  abi: basketTokenAbi,
  functionName: "totalSupply",
});

const constituents = await Promise.all(
  configuration.assets.map(async (asset, index) => ({
    asset,
    bundleAmount: configuration.bundleAmounts[index]!,
    vaultBalance: await client.readContract({
      address: diamond,
      abi: staticsAbi,
      functionName: "vaultBalance",
      args: [basketId, asset],
    }),
  })),
);

const snapshot: BasketSnapshot = {
  basketId,
  basketToken: configuration.token,
  status,
  totalSupply,
  mintFeeTiers: configuration.mintFeeTiers,
  redemptionFeeTiers: configuration.redemptionFeeTiers,
  originationFeeBps: BigInt(configuration.originationFeeBps),
  extensionFeeBps: BigInt(configuration.extensionFeeBps),
  ltvBps: BigInt(configuration.ltvBps),
  recoveryPenaltyBps: BigInt(configuration.recoveryPenaltyBps),
  constituents,
};

// Local preview: backing plus the selected static mint fee, per constituent.
const preview = quoteMint(snapshot, shares);

// Authoritative caps for the transaction. Read again immediately before signing.
const maxAmountsIn = await client.readContract({
  address: diamond,
  abi: staticsAbi,
  functionName: "quoteMint",
  args: [basketId, shares],
});

const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const approvals: { to: Address; data: Hex }[] = configuration.assets.map((asset, index) => ({
  to: asset,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [diamond, maxAmountsIn[index]!],
  }),
}));

const mint = {
  to: diamond,
  data: buildMintCall(basketId, shares, receiver, maxAmountsIn),
  value: 0n,
};
```

Send `approvals`, then `mint`, from the wallet. `preview[i]` is the base and fee split for `configuration.assets[i]`: `amountIn` is `baseAmount + feeAmount`. `maxAmountsIn[i]` is the cap the Diamond enforces for that same asset. Keep both arrays in constituent order.
