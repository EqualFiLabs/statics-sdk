# Statics SDK

This package mirrors Statics static-basket rounding, builds calldata for the
single user-facing `StaticsDiamond`, and defines an adapter for sourcing or
selling basket constituents.

## Standalone Genesis launch

The SDK also exposes the standalone Genesis contracts that launch before the
full Diamond: the fixed 1 billion-supply Doppler ERC-20, the 5,555-token Genesis
collection and fixed-price vault, the permanent activation registry and fee
receiver, and the temporary launch reward distributor. The exported calldata
builders cover Genesis acquisition, redemption, activation, registration, and
both NFT-owned and crystallized previous-owner reward claims.

The stock Doppler Multicurve initializer assigns 5% of fees earned by its
launch positions to the Doppler/Airlock owner and 95% to the permanent Statics
fee receiver. The exported share constants and module bindings describe that
standard beneficiary path; no separate post-swap fee module is involved.
Receiver attribution is monotonic, allowing an NFT transfer to checkpoint fees
already harvested for the distributor without moving or calling either reward
token inside the ERC-721 transfer hook.

`DOPPLER_GENESIS_FIXTURE` is deliberately marked `productionApproved: false`.
Its four curves allocate 50%, 25%, 24%, and 1% of the 800 million-token public
inventory across 44 Multicurve positions. It exists for fork testing and launch
simulation; it is not an approved production price curve. The exported Doppler
module addresses are integration dependencies, not deployed Statics contract
addresses. Production Statics addresses must come from a finalized deployment
manifest.

The fixed accounting constants distinguish the 200 million-token treasury
allocation from the 800 million-token Doppler inventory. All 5,555 Genesis NFTs
start in the vault, each representing a fixed 180,000 STATICS redemption claim
plus, after the immutable Genesis Epoch, a 1/5,555 share of a permanent native
ETH reserve. The 5,555 * 180,000 = 999,900,000-STATICS full backing leaves the
remaining 100,000 STATICS as unpaired supply for the public Doppler market and
treasury, not a Genesis backing residual.

During the Genesis Epoch (`block.timestamp < genesisEpochEnd`) acquisition and
redemption move STATICS only: a buy costs exactly 180,000 STATICS with zero
native value and redemption returns exactly 180,000 STATICS. After the epoch a
buy additionally charges a reserve buy-in of `ceil(reserveETH / 5,554)` plus the
native acquisition fee — both permanently enter the reserve — while redemption
additionally pays `floor(reserveETH / 5,555)`. `buildBuyGenesisTransaction`'s
native `value` is a maximum: the vault refunds any excess on-chain, so read
`quoteGenesisPurchase().requiredNative` immediately before building.
`buildDonateGenesisReserveTransaction` performs a permissionless, irreversible
reserve capitalization; the reserve has no withdrawal path. The fee receiver
splits a configurable `reserveShareBps` (0..10,000) of harvested WETH into the
reserve — unwrapping and donating atomically — and attributes all STATICS and
the WETH remainder to the active distributor. Activation forwards its exact
STATICS cost to the treasury and never burns STATICS.

`splitSwapFee` mirrors the bilateral swap-fee split across protocol-owned
liquidity, activated protocol-pool LPs, deposited BasketToken positions, global
Statics stakers, the fixed 5% pool creator, and treasury. The five configurable
class shares always total 9,500 basis points and the creator share is a fixed
500. Treasury receives division dust. Unavailable LP and basket-staker
allocations redirect to protocol-owned liquidity; an unavailable Statics-staker
allocation redirects to treasury; the creator share never falls back.

`quoteMint` and `quoteRedeem` select the greatest qualifying static fee tier
and reproduce the aggregate-supply rounding used onchain. They do not model a
historical fee-pot buy-in: basket fees accrue in-kind against the single global
staking balance. Treat onchain `quoteMint` and `quoteRedeem` as authoritative
when building a transaction, particularly after supply changes.

`buildCreateBasketTransaction` returns both permissionless creation calldata
and the native `value` that must accompany it. Callers should read the current
`creationFee()` from the Diamond immediately before preparing the transaction.
The creation parameters include flat mint and redemption fee tiers, a basket
LTV no greater than the immutable 9,500-basis-point protocol maximum, and a
recovery penalty that fits inside the collateral remaining at that LTV.
Callers also provide a launch deadline; use a short quote lifetime so stale
initial prices cannot be executed later.

Position builders cover global staking, optional BasketToken collateral,
pull-based multi-asset reward claims, and position-owned borrowing. Borrowing
calldata always includes a `positionId`; transfer of that ERC-721 moves the
attached staking balance, claim checkpoints, collateral, and loan obligations
together.

Read `positionCreationFee()` immediately before any direct or atomic Position
creation and attach that exact native `value` to the transaction. The payable
builders encode calldata only; transaction value remains an explicit wallet
request field. Reusing an existing Position through `stake`,
`stakeRiskShares`, `depositBasketCollateral`, or `mintBasketCollateral` does
not pay the fee again. Zero means free Position creation.

`tokenURI(positionId)` returns minimal PositionNFT account metadata. Generated
SVG identity belongs to the separate 5,555-token Genesis collection, whose
`tokenURI` reflects its permanent token identity and current activation tier.

Global Statics stake is always withdrawable. A selected reward asset begins
with pending stake and becomes eligible at the next hourly boundary at least
24 hours later. Mature stake remains eligible when a position is increased;
only the new amount enters the pending tranche. Read `rewardSelection` for the
exact timestamp and pending/eligible split. The next fee or position
interaction rolls due buckets automatically, so integrations never submit a
separate activation transaction.

Statics Dollar builders cover the typed ETH/WETH deposit and ordinary
recombination gateway exposed by the same Diamond. Permit variants carry the
signed EIP-2612 allowance value independently from the operation amount, so
integrations can authorize an exact input or a reusable allowance in the same
transaction. Risk Shares still require ERC-1155 operator approval. The
builders do not expose the Core's managed pairing-only recombination selector.
Pegged USDG minting and USDstx redemption have the same atomic permit path via
`buildMintPeggedWithPermitCall` and `buildRedeemPeggedWithPermitCall`.
`buildErc20PermitTypedData` supplies the matching EIP-712 message; integrations
must read the token name and current owner nonce immediately before signing.

For an atomic pegged-collateral exit, decode
`quoteMintPeggedAndRecombine` as `PeggedMintAndRecombineQuote`, require an
eligible, available quote, and refresh it before submission. Use
`buildQuoteMintPeggedAndRecombineCall`, `buildMintPeggedAndRecombineCall`, or
`buildMintPeggedAndRecombineWithPermitCall`. The caller authorizes pegged
collateral and Risk Shares; temporary Statics Dollar is
minted directly to the Diamond and requires no user allowance. The route accepts
only an active series belonging to the selected volatile profile and uses
ordinary recombination, never recovery or arbitrary external execution. Bound
the call with `maximumPeggedCollateralIn` and
`minimumVolatileCollateralOut`; the permit builder authorizes only the pegged
ERC-20 and does not replace ERC-1155 operator approval. Execution returns
`(status, peggedCollateralIn, volatileCollateralOut)`. A non-available status
has zero amounts, consumes neither permit nor custody, and preserves the Core
health checkpoint; index `PeggedMintAndRecombineDeferred` for those attempts.

The routing interface intentionally supports only underlying tokens. It does
not require initial BasketToken liquidity. A caller can source constituents,
mint at the Diamond, and deliver the resulting BasketToken to any external
venue or counterparty. Redemption works in reverse: redeem first, then route
only the received constituents.

The SDK never selects a venue, hardcodes a router, or submits transactions.
Lifecycle helpers expose quarantine, release, and permanent decommissioning;
`allowsExposureIncrease` maps the basket status to user-facing action gating.

## Protocol liquidity

The package exports the Diamond liquidity and global-reward ABI plus hook,
manager, PositionManager, and StateView fragments.
`buildCreateBasketTransaction` requires one semantic
constituent-per-BasketToken square-root price, paired-asset amount, and measured
complete input cap per constituent, plus a launch deadline. Prices are ratios of
raw smallest token units, not decimal-normalized display units. Use
`encodeSqrtPriceAssetPerBasketX96(assetAmountRaw, basketAmountRaw)` to construct
them. The creation transaction registers, initializes, backs, and
permanently seeds every canonical pool. There is no standalone initialization
or manager-sync builder. Constituents must settle the exact Uniswap v4 transfer
amount; incompatible transfer-tax behavior reverts the complete launch.

Anyone can permissionlessly create an unrelated protocol pool between any two
compatible ERC-20s with `buildCreatePoolTransaction`. Assemble the `CreatePoolParams`
by sorting the pair with `sortPoolCurrencies` and encoding the raw
token-B-per-token-A price with `encodeSqrtPriceBPerAX96`; the SDK normalizes it
to the sorted-currency orientation with `normalizeSqrtPriceBPerAX96`. Simulate
`quoteProtocolPool` (or `buildQuotePoolCall`) before submission to recover the
canonical `poolId` and the normalized `sqrtPriceX96`. When creation requires an
authorized creator, `buildCreatePoolAuthorizationTypedData` produces the
EIP-712 `CreatePool` payload — domain `Statics Protocol Pools`, version `1`, the
chain id, and the Diamond as `verifyingContract`, over the normalized
`sqrtPriceX96` — and `computeCreatePoolAuthorizationDigest` reproduces the exact
digest the Diamond verifies. Read `quotePool(params).creationFee` immediately
before calling `buildCreatePoolTransaction(params, creationFee, creatorAuthorization)`;
the returned transaction includes that fee as `value`
(`buildSetPoolCreationFeeCall` administers it).
`buildInvalidatePoolCreationNonceCall` burns an unused creator nonce. General
pool creation requires no token approvals, no initial funding, and no mandatory
permanent-liquidity seed: a general pool initializes with zero liquidity and
grows protocol-owned liquidity from subsequent swap activity.

`protocolPool(poolId)` normalizes basket canonical and permissionlessly created
protocol pools, and `isProtocolPool`, `protocolPoolCreator`, `creatorRevenue`,
and `totalCreatorRevenue` cover discovery and revenue reads. Fee administration
uses `buildSetProtocolPoolFeeRateCall`, `buildSetBasketFeeAllocationCall`, and
`buildSetGeneralFeeAllocationCall`; the PoolId fee builders work for either
class. Pool creators claim their accrued 5% revenue share with
`buildClaimCreatorRevenueCall`, and `buildDecommissionGeneralPoolCall` performs
the irreversible treasury recovery of a non-basket pool without touching user
LP NFTs.

Canonical pools are usable immediately after atomic basket launch. Governance
uses the Diamond for fee configuration. Reward and treasury distribution,
retirement settlement, and post-`ExitOnly` unwind retain their permissionless
execution paths.

Canonical single-pool browser swaps use `buildQuoteV4ExactInputSingleCall`
against Robinhood's v4 Quoter and `buildV4ExactInputSingleSwap` against its
Universal Router. The swap builder emits the deployed Robinhood router's
exact-input-single encoding, including the per-hop minimum-price field, and
settles only the exact input while requiring the configured minimum output.
After the wallet grants the one-time ERC-20 allowance to Permit2,
`buildPermit2PermitTypedData` and the optional Permit2 command make each router
allowance and swap atomic. The signed token, amount, and router are required to
match the swap exactly.

`quoteHookFee` rounds either realized bilateral fee leg up exactly as the hook
does. `effectiveCanonicalFees` reports the zero native LP fee and the separate
input/output hook rates; the launch defaults are 25 basis points on each leg.
`splitSwapFee` carves the fixed 5% creator share first, then applies the active
class allocation profile's five configurable shares — protocol-owned liquidity,
canonical LP, basket-staker, global Statics-staker, and treasury — which always
total 9,500 basis points. Callers supply each reward destination's eligibility
independently: an unavailable LP or basket-staker share routes to protocol-owned
liquidity, an unavailable Statics-staker share routes to treasury, the creator
share never falls back, and treasury absorbs the rounding dust. Matched locked
liquidity is added as
hook-owned full-range liquidity during the swap.

Genesis builders activate tiers by paying the cumulative configured STATICS
cost — forwarded in full to the treasury, never burned — link one activated
Genesis NFT to one PositionNFT, and unlink it before
either NFT transfers. Activation resets on an ownership-changing Genesis
transfer. Reward reads distinguish actual stake from multiplier-adjusted
effective weight. Before a weight-changing action, clients should check each
selected asset with `rewardBookNeedsCheckpoint` and submit bounded
`checkpointRewardAssets` batches when required.

Creator swap revenue is pull based through `claimCreatorRevenue`. Partner
revenue is distributed permissionlessly through `distributePartnerRevenue`;
the caller receives the configured tip from the accrued partner amount.

`quoteRangeAmounts` mirrors Uniswap v4 `TickMath` and `SqrtPriceMath` input
rounding. `quoteBorrowAndProvideLiquidity` combines those range amounts with
the ordinary Statics loan and mint calculations, including the origination-fee
burn that occurs before mint quoting. Its returned pool caps can be passed to
`buildBorrowAndProvideLiquidityCall` or, for full-range PositionNFT custody and
next-block LP reward activation, `buildBorrowAndStakeLiquidityCall`. Re-read
the pool price, basket supply, and onchain quotes immediately before simulation
and submission.

`quoteBorrow` returns the debt and creator-configured recovery-penalty shares
as well as the collateral and principal vector. `quoteRecovery` mirrors the
supply-sensitive backing reduction, unlocks collateral above debt plus
penalty, and splits the realized penalty 20% to the caller and 80% to the
protocol route. Onchain quotes remain authoritative.

User-selected LP positions are ordinary PositionManager NFTs created by the
installed manager. The generic manager validates their exact PoolKey against
the Diamond's protocol-pool registry. Their position state can be read from
PositionManager and StateView; both pool classes currently have zero native LP
fee.
Qualifying full-range NFTs can be staked into the Diamond with the exported
builders, activated in the next block, increased in place, claimed, and
unstaked without a cooldown. `borrowAndProvideLiquidity` origin is not required.
`borrowAndStakeLiquidity` instead creates those full-range positions directly
in Diamond custody under the borrowing PositionNFT; borrowed collateral keeps
earning its separate basket rewards.
Hook-owned permanent liquidity is observed through `lockedLiquidity` and
`pendingPermanentLiquidity`; it has no protocol PositionManager token ID.
User v4 NFTs are discovered from PositionManager `Transfer` and manager
`UserPositionMinted` events. They belong to the selected LP recipient and
remain independent of PositionNFT transfers, repayment, extension, and
recovery.

`robinhoodChain` is generated from
`deployments/robinhood-chain-4663.json` before SDK builds and tests. It is the
only SDK address binding for Robinhood's PoolManager, PositionManager, StateView,
Quoter, Universal Router, Permit2, and WETH deployment.
