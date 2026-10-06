# Full-capital spot backtest

The Jarvis implementation in `src/lib/strategy/jarvis.ts` uses the whole available
cash balance for each long entry. The BUY notional is `cash / (1 + commissionRate)`;
the remainder covers the BUY fee. On exit the engine adds sale proceeds minus
the SELL fee. Stop distance and old risk/reserve inputs do not affect quantity.
Old imported scripts may still display their risk inputs; these are ignored by
this full-capital spot engine. This is an implementation of this strategy family,
not a Pine interpreter.

The date controls select the trading/equity period. Earlier uploaded candles
remain available to initialize the indicators and cannot open positions. Candles
after the selected end are excluded from calculations. The chart shows only the
selected period.

The existing close-based drawdown is retained. `maxIntrabarDrawdownPct` is a
conservative upper bound based on assuming the high occurs before the low in an
OHLC candle; it is not a reconstruction of intrabar price movement. An armed
stop limits the adverse mark to its modeled fill, including a gap below the stop.

## Validation

With Node.js 24 or another version supporting TypeScript type stripping:

```sh
node --test tests/spot-sizing.test.mjs
```

The tests verify whole-balance allocation including fees, reinvestment and
equity, independence from old risk inputs, warmup isolation, and no use of
candles after the test end.

## Reproduce the SUI parameter study

```sh
node scripts/tune-sui.mjs /absolute/path/to/uploaded-files /absolute/path/to/results
node scripts/tune-sui.mjs /absolute/path/to/uploaded-files /absolute/path/to/baseline-results baseline
```

The script uses the supplied filenames, 4H candles, the June–September 2026
trading window, and the defaults read from the supplied Pine file. It performs
coordinate searches from the uploaded and documented settings. Float thresholds
receive a local 0.1 percentage-point check. All candidates and changes are logged.
The objectives are lexicographic: stay below a 30% conservative drawdown bound,
then maximize estimated liquidated equity, then reduce drawdown and consider PF,
expectancy, payoff and win rate. There is no weighted score or Cartesian grid.
Daily confirmation, close as source, and the BUY-only sideways filter remain
fixed. Displacement only changes plotting and is not optimized.

## Execution assumptions retained in this study

- Entry and signal exit fill at the candle close; commission is 0.25% each way.
- The engine still does not implement Pine's one-tick slippage or Binance lot
  rounding. The study therefore reports the engine's model, not exact exchange
  execution or proven TradingView parity.
- The initial stop is fixed. Its existing delayed arming behavior is unchanged:
  the first candle after entry has no armed stop. Changing that behavior or adding
  trailing stops requires a new baseline and parameter study.
- An open final position is marked to the last close. The tuning objective also
  deducts its hypothetical exit fee without creating a fictitious SELL trade.
- Recorded trade times identify candle opening timestamps even when the modeled
  fill occurs at their close. Intrabar stop fill time is unknown.
- The last supplied candle is used as supplied; the files cannot establish
  whether it was complete when downloaded. Historical optimization and monthly
  checks on the same data do not validate future profitability.

This is a manually invoked research script, not an autonomous Jarvis supervisor.
