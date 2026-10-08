# Delayed local-low stop

Upload `jarvis_spot_swing_sl.pine`. The previous percentage-trailing example
is retained for comparison. Entry and SELL conditions are unchanged.

Defaults exposed in the tester Parameters panel:
- Initial SL lookback bars: 5, including the closed entry/signal candle.
- SL buffer %: 0.25, rounded down to the price tick.
- Local low search window bars: 15, offsets 0 through 14 from current closed bar.
- Closed bars after local low: 5 (must be smaller than the window).
- SL: newest local low (off = lowest): checkbox, default off.

A strict local low has a lower low than both immediately adjacent candles.
Only pivots at least `delay` bars old and later than the current stop's anchor
are considered. Lowest mode selects the lowest eligible pivot; newest mode
selects the most recent eligible pivot. Ties prefer the newest. Younger pivots
do not block older eligible pivots. No eligible pivot means no change.
The initial anchor is the bar containing the initial lookback minimum.
Stops can only rise and a proposed level must remain below the current close.
An update at bar close does not retroactively protect that bar at the new level.
The previous stop remains effective throughout the forming candle.

Run `node --test tests/swing-sl.test.mjs` for timing, selection, monotonicity,
rising-price/no-pivot and full-source runtime checks, plus adapter regressions.
TradingView compilation has NOT been verified; the reported TV error text is
still unavailable. These tests use PineTS 0.11.0.

On the supplied 896 SUIUSDC 4H candles, default settings in both modes yield
357.3649478 ending equity from 300, 11 closed trades, 9 stop exits, 2 SELL exits,
14.5117922 commission and no open trade. This sample does not differentiate the
modes; a synthetic two-pivot test does. This is a historical runtime regression,
not a recommendation or proof of future performance.
