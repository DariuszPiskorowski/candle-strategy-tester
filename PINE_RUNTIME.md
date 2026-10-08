# Uploaded Pine execution

The UI now sends the complete uploaded Pine v5/v6 source to PineTS 0.11.0
in a Web Worker. The previous `runJarvis` implementation is not called by the
UI. Loading a different script, changing data/dates, and removing a script
invalidate old results. Runtime failures produce an error, never a fallback.
The worker is terminated after 30 seconds and when inputs change.

## Supported integration

- Long strategies with percentage commissions; entries/exits are from source.
- Code-defined inputs (int/float/bool/timeframe) appear in Parameters.
- Other input types retain their source defaults; edit them in the source file.
- Constant declaration values for fee/slippage are unboxed at the runtime
  boundary to correct a reproduced PineTS 0.11.0 numeric configuration defect.
- Uploaded continuous OHLCV, chart timeframe and complete higher day/minute
  candles aggregated from those same data. No external data fetches.
- Date range in UTC. Earlier candles calculate indicators; entry/order calls
  are suppressed during warm-up. End date excludes candles closing after it.
- Account curve reconstructed from actual fills and checked against runtime
  ending equity (one-cent tolerance); nonfinite results are rejected.
- Manual symbol, price tick and quantity step. Defaults are SUIUSDC values
  verified by the owner on 2026-10-08. They are NOT inferred from filenames.

## Explicit limitations

This is not the proprietary TradingView runtime or a full-compatibility claim.
Short positions, nonpercentage commissions, tick/fill recalculation and Bar
Magnifier are rejected. Missing symbols, lower timeframes and higher weekly
aggregation are rejected. Source runtime errors are displayed verbatim.
Only numeric plots are rendered as lines; fills/drawings and exact plot style
reproduction are not implemented. No synthetic stop value is invented for the
trade table (shown as a dash); stop plots come from the script itself.
The intrabar drawdown bound is unavailable (dash).

Binance minimum notional / average-price filters and historical changes to
exchange rules are not simulated by this integration. Commission is a backtest
assumption from the script, not a live Binance fee. There is no live trading.

PineTS reruns full source in request.security's secondary context. A strict
`res <= chart timeframe` runtime guard can therefore reject otherwise valid
requests. We do not silently rewrite user source to bypass it. The example
explicitly permits equal confirmation timeframes (`res < chart timeframe` is
rejected), and uses a quantity-step input compatible with Pine v5 instead of
`syminfo.mincontract`. This is a documented source change, not built-in logic.

## Verification

`node --test tests/pine-runtime.test.mjs`
`npx tsc --noEmit`
`npm run build`

On the owner's 896 SUIUSDC 4H candles (2026-05-01 16:00 UTC through
2026-09-28 00:00 UTC), examples/jarvis_spot_trailing.pine with tick 0.0001,
quantity step 0.1 and 0.25% commission produced ending equity 446.5914323,
10 closed trades and one open trade; last plotted stop 1.0356.
This is a regression reference for this runtime, not independent proof of
TradingView parity or future performance.

PineTS is an external dependency licensed AGPL-3.0; see its distributed LICENSE.
