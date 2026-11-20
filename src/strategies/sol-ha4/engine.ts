import type { Candle } from "../../lib/candles.ts";
import { detectInterval } from "../../lib/candles.ts";
import type { BacktestOptions, PineHeader, StrategyColor, StrategyResult, Trade } from "../../lib/strategy/jarvis.ts";
import type { StrategyEngine } from "../types.ts";
import { dailyHa, rangeDetector, rma, smoothedHa, trueRanges } from "./indicators.ts";
import { spotStats } from "./simulation.ts";

export function runSolHa4(candles: Candle[], p: Record<string, number | string | boolean>, header: PineHeader, colors: StrategyColor[] = [], options: BacktestOptions = {}): StrategyResult {
  const now = options.endTime ?? Math.floor(Date.now() / 1000);
  candles = candles.filter(c => c.time <= now);
  const interval = candles.length >= 3 ? detectInterval(candles) : 14400;
  const num = (key: string, fallback: number) => typeof p[key] === "number" ? Number(p[key]) : fallback;
  const len = (key: string, fallback: number) => Math.max(1, Math.round(num(key, fallback)));
  const bool = (key: string, fallback: boolean) => typeof p[key] === "boolean" ? Boolean(p[key]) : fallback;
  const startDate = new Date(now * 1000); startDate.setUTCMonth(startDate.getUTCMonth() - 4);
  const start = options.startTime ?? Math.floor(startDate.getTime() / 1000);
  const ha = smoothedHa(candles, len("haL1", 45), len("haL2", 15));
  const daily = dailyHa(candles, interval, len("dL1", 8), len("dL2", 8));
  const range = rangeDetector(candles, p), atr = rma(trueRanges(candles), len("slAtrLen", 14));
  const trades: Trade[] = [], equity: StrategyResult["equity"] = [], stopData: { time: number; value: number }[] = [];
  let cash = header.initialCapital, waitFresh = false, peak = cash, intrabarDD = 0;
  let pos: { idx: number; price: number; qty: number; notional: number; fee: number; stop: number } | null = null;
  let pending: { kind: "buy"; stop: number } | { kind: "sell" } | null = null;
  const feeRate = header.commissionPct / 100;
  const mark = (value: number) => { peak = Math.max(peak, value); if (peak > 0) intrabarDD = Math.max(intrabarDD, (peak - value) / peak * 100); };
  const exit = (i: number, price: number, reason: Trade["exitReason"]) => {
    if (!pos) return;
    const fee = pos.qty * price * feeRate, pnl = pos.qty * (price - pos.price) - pos.fee - fee;
    cash += pos.qty * price - fee;
    trades.push({ side: "BUY", entryTime: candles[pos.idx].time, entryPrice: pos.price, exitTime: candles[i].time, exitPrice: price, qty: pos.qty, notional: pos.notional, stop: pos.stop, exitReason: reason, pnl, pnlPct: pnl / pos.notional * 100, commission: pos.fee + fee, bars: i - pos.idx });
    pos = null;
  };
  let lastConfirmed = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i], confirmed = c.time + interval <= now;
    if (confirmed) lastConfirmed = i;
    if (c.time < start) continue;
    let activeStop = pos?.stop ?? NaN;
    // Market orders issued on the previous close execute at this open, before intrabar stops.
    if (pending?.kind === "sell" && pos) exit(i, c.open, "Strategy SELL");
    if (pending?.kind === "buy" && !pos) {
      const notional = Math.max(0, cash) / (1 + feeRate), fee = notional * feeRate;
      if (notional > 0) { pos = { idx: i, price: c.open, qty: notional / c.open, notional, fee, stop: pending.stop }; cash = 0; activeStop = pos.stop; }
    }
    pending = null;
    if (pos) {
      // OHLC is a conservative bound, not reconstructed ticks. A gap stop executes at the open.
      if (Number.isFinite(pos.stop) && c.open <= pos.stop) { exit(i, c.open, "STOP_LOSS"); waitFresh = true; }
      else {
        mark(cash + pos.qty * c.high);
        mark(cash + pos.qty * (Number.isFinite(pos.stop) && c.low <= pos.stop ? pos.stop : c.low));
        if (Number.isFinite(pos.stop) && c.low <= pos.stop) { exit(i, pos.stop, "STOP_LOSS"); waitFresh = true; }
      }
    }
    // The unfinished candle can fill an existing order/stop, but never generate a new signal.
    if (confirmed) {
      if (waitFresh && !ha.green[i]) waitFresh = false;
      const blocked = bool("useRange", true) && range.inRange[i];
      if (pos && (!ha.green[i] || blocked)) pending = { kind: "sell" };
      else if (!pos && ha.green[i] && (!bool("useDaily", true) || daily[i] === true) && !blocked && !waitFresh) {
        pending = { kind: "buy", stop: bool("useSL", true) ? c.close - num("slMult", 1.5) * atr[i] : NaN };
      }
    }
    // Whitespace separates actual stop intervals, including the exit candle only.
    stopData.push(Number.isFinite(activeStop) ? { time: c.time, value: activeStop } : { time: c.time, value: NaN });
    const value = cash + (pos ? pos.qty * c.close : 0); mark(value); equity.push({ time: c.time, value });
  }
  const last = candles.at(-1);
  if (pos && last) {
    const pnl = pos.qty * (last.close - pos.price) - pos.fee;
    trades.push({ side: "BUY", entryTime: candles[pos.idx].time, entryPrice: pos.price, exitTime: last.time, exitPrice: last.close, qty: pos.qty, notional: pos.notional, stop: pos.stop, exitReason: "Otwarta", pnl, pnlPct: pnl / pos.notional * 100, commission: pos.fee, bars: candles.length - 1 - pos.idx });
  }
  const stopColor = colors.find(c => c.key === "stop")?.value ?? "#f23645";
  const plots: StrategyResult["plots"] = [];
  if (bool("showStop", true) && bool("useSL", true)) plots.push({ title: "Stop loss (BUY)", stopSide: "BUY", color: stopColor, width: 1, data: stopData });
  if (bool("showBounds", false)) for (const [title, values] of [["Boczniak — góra", range.upper], ["Boczniak — dół", range.lower]] as const) {
    plots.push({ title, color: "#e0bd32", width: 1, data: candles.map((c, i) => ({ time: c.time, value: range.inRange[i] ? values[i] : NaN })) });
  }
  const j = lastConfirmed;
  return {
    trades, equity, plots,
    latestSignals: bool("showTable", true) ? [
      { name: "HA 4H", signal: j < 0 ? "BRAK DANYCH" : ha.green[j] ? "BUY" : "SELL" },
      ...(bool("useDaily", true) ? [{ name: "HA dzienny (wczoraj)", signal: j < 0 || daily[j] === undefined ? "BRAK DANYCH" as const : daily[j] ? "BUY" as const : "SELL" as const }] : []),
    ] : [],
    status: bool("showTable", true) ? pos ? "Trzymaj SOL" : waitFresh ? "USDC — czekam na nowy sygnał (po SL)" : "Poza rynkiem (USDC)" : undefined,
    candleColors: bool("showHaBars", false) ? candles.map((c, i) => ({ time: c.time, color: ha.green[i] ? "#26a69a" : "#800000" })) : undefined,
    backgrounds: bool("showBg", true) ? candles.map((c, i) => ({ time: c.time, color: trades.some(t => c.time >= t.entryTime && (t.exitReason === "Otwarta" || c.time < t.exitTime)) ? "rgba(8,153,129,0.12)" : range.inRange[i] ? "rgba(224,189,50,0.10)" : "transparent" })) : undefined,
    stats: spotStats(candles, trades, equity, header, cash, pos?.qty ?? 0, intrabarDD),
  };
}

const engine: StrategyEngine = {
  id: "sol-ha4", name: "SOL HA-4H (Kup / Trzymaj / Sprzedaj SOL)",
  detect: code => /smoothedHaGreen\s*\(/.test(code) && /waitFresh/.test(code) && /ta\.dmi/.test(code),
  parseColors: () => [{ key: "stop", title: "Stop loss", value: "#f23645" }],
  run: runSolHa4,
};
export default engine;