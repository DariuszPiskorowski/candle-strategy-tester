import type { Candle } from "../../lib/candles.ts";
import type { PineHeader, StrategyResult, Trade } from "../../lib/strategy/jarvis.ts";

export function spotStats(candles: Candle[], trades: Trade[], equity: StrategyResult["equity"], header: PineHeader, cash: number, qty: number, intrabarDD: number): StrategyResult["stats"] {
  const closed = trades.filter(t => t.exitReason !== "Otwarta"), wins = closed.filter(t => t.pnl > 0), losses = closed.filter(t => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0), grossLoss = -losses.reduce((a, t) => a + t.pnl, 0);
  const finalEquity = equity.at(-1)?.value ?? header.initialCapital, netProfit = finalEquity - header.initialCapital;
  let peak = header.initialCapital, dd = 0, ddPct = 0;
  for (const e of equity) { peak = Math.max(peak, e.value); dd = Math.max(dd, peak - e.value); ddPct = Math.max(ddPct, (peak - e.value) / peak * 100); }
  const first = candles.find(c => c.time === equity[0]?.time), last = candles.at(-1);
  return {
    initialCapital: header.initialCapital, finalEquity, netProfit, netProfitPct: netProfit / header.initialCapital * 100,
    grossProfit, grossLoss, profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    totalTrades: closed.length, winners: wins.length, losers: losses.length, winRate: closed.length ? wins.length / closed.length * 100 : 0,
    avgTrade: closed.length ? closed.reduce((a, t) => a + t.pnl, 0) / closed.length : 0,
    avgWin: wins.length ? grossProfit / wins.length : 0, avgLoss: losses.length ? -grossLoss / losses.length : 0,
    largestWin: wins.length ? Math.max(...wins.map(t => t.pnl)) : 0, largestLoss: losses.length ? Math.min(...losses.map(t => t.pnl)) : 0,
    maxDrawdown: dd, maxDrawdownPct: ddPct, maxIntrabarDrawdownPct: Math.max(ddPct, intrabarDD),
    commission: trades.reduce((a, t) => a + t.commission, 0), buyHoldPct: first && last ? (last.close / first.close - 1) * 100 : 0,
    avgBars: closed.length ? closed.reduce((a, t) => a + t.bars, 0) / closed.length : 0,
    stopExits: closed.filter(t => t.exitReason === "STOP_LOSS").length, signalExits: closed.filter(t => t.exitReason === "Strategy SELL").length,
    positionSide: qty > 0 ? "BUY" : null, usdcBalance: cash, suiBalance: qty, suiValueUsdc: qty * (last?.close ?? 0), totalUsdc: finalEquity,
  };
}