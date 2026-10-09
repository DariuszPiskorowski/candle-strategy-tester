<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Charting
- Candle parsing/indicators/backtest live in src/lib (candles.ts, indicators.ts, backtest.ts); the chart renders client-only via dynamic `lightweight-charts` import in src/components/chart, because the library touches the DOM and cannot run during SSR.
- tsconfig: noUncheckedIndexedAccess and noPropertyAccessFromIndexSignature are off — the candle/indicator math uses a lot of array indexing and dynamic keys, and those checks only added noise.
- Strategy plot colors are parsed and stored separately from Pine calculation inputs, because visual changes must not alter backtest results.
- The interface theme is controlled at the document root and passed explicitly to the client-only chart, because its canvas colors do not inherit CSS tokens.

## Strategies
- Each strategy lives in src/strategies/<id>/ (strategy.txt + engine.ts implementing StrategyEngine) and is listed in src/strategies/registry.ts; active.json picks the default, because the app and the tuning script must share one engine contract.
- The tuning script writes the best found settings back into that strategy.txt as input defaults, because the app auto-loads it and should always show the latest best settings.
