import type { Candle } from "./candles";
import { sma } from "./indicators";

export type Trade = {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  pnlPct: number;
};

export type BacktestResult = {
  trades: Trade[];
  totalPct: number;
  winRate: number;
  maxDrawdownPct: number;
  equity: { time: number; value: number }[];
};

/** Long-only moving-average crossover strategy (fast SMA over slow SMA). */
export function smaCrossBacktest(candles: Candle[], fast: number, slow: number): BacktestResult {
  const f = new Map(sma(candles, fast).map((p) => [p.time, p.value]));
  const s = new Map(sma(candles, slow).map((p) => [p.time, p.value]));

  const trades: Trade[] = [];
  const equity: { time: number; value: number }[] = [];
  let capital = 100;
  let peak = 100;
  let maxDd = 0;
  let entry: { time: number; price: number } | null = null;
  let prevDiff: number | undefined;

  for (const c of candles) {
    const fv = f.get(c.time);
    const sv = s.get(c.time);
    if (fv === undefined || sv === undefined) continue;
    const diff = fv - sv;

    if (prevDiff !== undefined) {
      if (prevDiff <= 0 && diff > 0 && !entry) {
        entry = { time: c.time, price: c.close };
      } else if (prevDiff >= 0 && diff < 0 && entry) {
        const pnlPct = ((c.close - entry.price) / entry.price) * 100;
        capital *= 1 + pnlPct / 100;
        trades.push({
          entryTime: entry.time,
          entryPrice: entry.price,
          exitTime: c.time,
          exitPrice: c.close,
          pnlPct,
        });
        entry = null;
      }
    }
    prevDiff = diff;

    const open = entry ? capital * (1 + (c.close - entry.price) / entry.price) : capital;
    peak = Math.max(peak, open);
    maxDd = Math.max(maxDd, ((peak - open) / peak) * 100);
    equity.push({ time: c.time, value: open });
  }

  const wins = trades.filter((t) => t.pnlPct > 0).length;
  return {
    trades,
    totalPct: capital - 100,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    maxDrawdownPct: maxDd,
    equity,
  };
}
