import type { Candle } from "../lib/candles.ts";
import type { BacktestOptions, PineHeader, StrategyColor, StrategyResult } from "../lib/strategy/jarvis.ts";

/** Contract every strategy engine in src/strategies/<id>/engine.ts must satisfy. */
export type StrategyEngine = {
  id: string;
  name: string;
  /** Recognises an uploaded strategy file belonging to this engine. */
  detect: (code: string) => boolean;
  parseColors: (code: string) => StrategyColor[];
  run: (
    candles: Candle[],
    params: Record<string, number | string | boolean>,
    header: PineHeader,
    colors?: StrategyColor[],
    options?: BacktestOptions,
  ) => StrategyResult;
};
