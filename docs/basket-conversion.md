# Basket conversion

Conversion markets use one shared hook, zap and router. Discover identities with
`discoverBasketConversionMarkets` over an explicit block range, or read a known
PoolId with `readBasketConversionMarket`. Read the Diamond's configuration before
constructing calls. A conversion market has no LP, gauge or POL; the ordinary
basket markets retain those features.

Use `quoteMint(snapshot, shares)` or `quoteRedeem(snapshot, shares)` for the existing
principal and fee amounts per constituent. These helpers apply the basket's actual
fee tiers and current supply. Quote each supplied V4 route separately with its
actual PoolKeys and hook data; the total route input (buy) or output (sell) is the
conversion quote amount. Do not add another conversion trading fee or assume a
fixed reward/treasury allocation. Gas is an additional wallet cost.

Paths always run quote→constituent. Buys traverse them backward with exact output;
sells traverse them backward with exact input. Each constituent accepts at most
four hops; a quote constituent uses a one-currency, zero-hop route. Each hop carries
its own hook data. Basket tokens, native currency, cycles and conversion hooks
cannot appear inside these routes. Use WETH when native exposure is required.

Encode requests with `encodeBasketConversionRequest`. Set fresh per-route limits,
an aggregate quote limit and deadline. Preset requests omit routes and still carry
fresh bounds. `buildBasketConversionZapCall` produces buy/sell calldata for explicit
PoolId, shares and receiver. Buying means exact basket output; selling means exact
basket input. Exact quote-input buying is unsupported.

Zap buys need quote-token allowance to the zap. Wallet zap sells need basket-token
allowance to the zap and explicit zap approval in the Diamond's distributor
registry. Router wallet sells use basket allowance to the Diamond and explicit
prefunding; quote inputs use allowance to the router. Ordinary allowances always
apply. Router outputs return to its caller. Net-profit cycles may use zero wallet
input and zero quote allowance, with a positive `minQuoteOut`.

`buildBasketConversionRouterCall` accepts one conversion PoolId and one to four
same-pair typed steps, including conversion. A mint→AMM sale or AMM purchase→redeem
cycle fits in one unlock. There is no arbitrary external-call facility.

Run `simulateBasketConversionZap` or `simulateBasketConversionRouter` from the real
payer immediately before submission. Simulation checks current approval, depth,
fee rounding, impairment, pause and quarantine state. Marked baskets reject
conversion; their explicit healthy-asset forfeiture exits remain separate actions.

Registration and calldata helpers do not imply Uniswap UI or aggregator support.
