import type { Candle } from "@/lib/candles";

/* ---------- Pine source helpers ---------- */

export type PineInput = {
  name: string;
  kind: "int" | "float" | "timeframe" | "source" | "bool";
  value: number | string | boolean;
  title: string;
  step?: number;
};

export type PineHeader = {
  title: string;
  initialCapital: number;
  commissionPct: number;
};

export function parsePineInputs(code: string): PineInput[] {
  const out: PineInput[] = [];
  const re = /^\s*(\w+)\s*=\s*input\.(int|float|timeframe|source|bool)\(([^\n]*)\)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const [, name, kind, args] = m;
    const first = args.split(",")[0].trim();
    const title = /title\s*=\s*"([^"]*)"/.exec(args)?.[1] ?? name;
    const step = /step\s*=\s*([\d.]+)/.exec(args)?.[1];
    let value: number | string | boolean = first.replace(/^"|"$/g, "");
    if (kind === "int" || kind === "float") value = Number(first);
    if (kind === "bool") value = first.trim() === "true";
    out.push({ name, kind: kind as PineInput["kind"], value, title, ...(step ? { step: Number(step) } : {}) });
  }
  return out;
}

export function parsePineHeader(code: string): PineHeader {
  const line = /strategy\(([^\n]*)\)/.exec(code)?.[1] ?? "";
  return {
    title: /^\s*"([^"]*)"/.exec(line)?.[1] ?? "Strategia",
    initialCapital: Number(/initial_capital\s*=\s*([\d.]+)/.exec(line)?.[1] ?? 1000),
    commissionPct: Number(/commission_value\s*=\s*([\d.]+)/.exec(line)?.[1] ?? 0),
  };
}

/** Recognises the Ichimoku + HullMA + Hull MACD + Jarvis RM strategy family. */
export function isJarvisStrategy(code: string): boolean {
  return /ta\.hma/.test(code) && /donchian/.test(code) && /strategy\.entry/.test(code);
}

/* ---------- math ---------- */

type Series = number[];
const NaNs = (n: number) => new Array<number>(n).fill(NaN);

function wma(src: Series, n: number): Series {
  const out = NaNs(src.length);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < src.length; i++) {
    let s = 0;
    let ok = true;
    for (let k = 0; k < n; k++) {
      const v = src[i - k];
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      s += v * (n - k);
    }
    if (ok) out[i] = s / denom;
  }
  return out;
}

export function hma(src: Series, n: number): Series {
  const half = wma(src, Math.max(1, Math.floor(n / 2)));
  const full = wma(src, n);
  const diff = half.map((v, i) => 2 * v - full[i]);
  return wma(diff, Math.max(1, Math.floor(Math.sqrt(n))));
}

const shift = (s: Series, k: number): Series => s.map((_, i) => (i - k >= 0 ? s[i - k] : NaN));

function lowest(s: Series, n: number): Series {
  return s.map((_, i) => (i < n - 1 ? NaN : Math.min(...s.slice(i - n + 1, i + 1))));
}
function highest(s: Series, n: number): Series {
  return s.map((_, i) => (i < n - 1 ? NaN : Math.max(...s.slice(i - n + 1, i + 1))));
}

const TF_SEC: Record<string, number> = { D: 86400, "1D": 86400, W: 604800, "1W": 604800, "240": 14400, "60": 3600 };
function tfToSec(tf: string): number {
  if (TF_SEC[tf]) return TF_SEC[tf];
  const n = Number(tf);
  return Number.isFinite(n) ? n * 60 : 86400;
}

/* ---------- backtest ---------- */

export type Trade = {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  qty: number;
  notional: number;
  stop: number;
  exitReason: "Strategy SELL" | "STOP_LOSS" | "Otwarta";
  pnl: number;
  pnlPct: number;
  commission: number;
  bars: number;
};

export type LinePlot = { title: string; color: string; width: number; data: { time: number; value: number }[] };

export type StrategyResult = {
  trades: Trade[];
  equity: { time: number; value: number }[];
  plots: LinePlot[];
  stats: {
    initialCapital: number;
    finalEquity: number;
    netProfit: number;
    netProfitPct: number;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number;
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    avgTrade: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    commission: number;
    buyHoldPct: number;
    avgBars: number;
    stopExits: number;
    signalExits: number;
  };
};

export function runJarvis(
  candles: Candle[],
  p: Record<string, number | string>,
  header: PineHeader,
): StrategyResult {
  const n = candles.length;
  const num = (k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : d);
  const period = num("period", 5);
  const res = String(p.res ?? "D");
  const riskPerTrade = num("riskPerTrade", 1) / 100;
  const maxSingle = num("maxSinglePosition", 30) / 100;
  const maxExposure = num("maxMarketExposure", 60) / 100;
  const minReserve = num("minimumReserve", 40) / 100;
  const swingLookback = num("swingLookback", 5);
  const swingBuffer = num("swingBuffer", 0.35) / 100;
  const convP = num("conversionPeriod", 8);
  const baseP = num("basePeriod", 25);
  const spanP = num("laggingSpanPeriod", 11);
  const disp = num("displacement", 9);
  const sigL = num("macdLength", 9);
  const fastL = num("macdFastLength", 13);
  const slowL = num("macdSlowLength", 27);
  const comm = header.commissionPct / 100;

  const time = candles.map((c) => c.time);
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const price = close;

  const hma1 = hma(price, period);
  const hma2 = hma(shift(price, 1), period);

  // Daily (or chosen HTF) confirmed closes: D1 = previous HTF bar close, D2 = the one before.
  const resSec = tfToSec(res);
  const D1 = NaNs(n);
  const D2 = NaNs(n);
  {
    const bucketCloses: number[] = [];
    let curBucket = NaN;
    let lastClose = NaN;
    for (let i = 0; i < n; i++) {
      const b = Math.floor(time[i] / resSec);
      if (b !== curBucket) {
        if (Number.isFinite(curBucket)) bucketCloses.push(lastClose);
        curBucket = b;
      }
      lastClose = close[i];
      const L = bucketCloses.length;
      D1[i] = L >= 1 ? bucketCloses[L - 1] : NaN;
      D2[i] = L >= 2 ? bucketCloses[L - 2] : NaN;
    }
  }

  const donchian = (len: number) => {
    const lo = lowest(low, len);
    const hi = highest(high, len);
    return lo.map((v, i) => (v + hi[i]) / 2);
  };
  const conversion = donchian(convP);
  const base = donchian(baseP);
  const lead1 = conversion.map((v, i) => (v + base[i]) / 2);
  const lead2 = donchian(spanP);

  const fastH = hma(price, fastL);
  const slowH = hma(price, slowL);
  const macd = fastH.map((v, i) => v - slowH[i]);
  const aMacd = hma(macd, sigL);

  const candStop = lowest(low, swingLookback).map((v) => v * (1 - swingBuffer));

  const trades: Trade[] = [];
  const equity: { time: number; value: number }[] = [];
  const stopPlot: { time: number; value: number }[] = [];
  let cash = header.initialCapital;
  let pos: { qty: number; entryPrice: number; entryIdx: number; stop: number; notional: number; comm: number } | null =
    null;
  let stopArmed = false; // strategy.exit is placed at bar close and becomes active from the next bar

  const closePos = (i: number, px: number, reason: Trade["exitReason"]) => {
    if (!pos) return;
    const exitComm = pos.qty * px * comm;
    const pnl = pos.qty * (px - pos.entryPrice) - pos.comm - exitComm;
    cash += pos.qty * (px - pos.entryPrice) - exitComm;
    trades.push({
      entryTime: time[pos.entryIdx],
      entryPrice: pos.entryPrice,
      exitTime: time[i],
      exitPrice: px,
      qty: pos.qty,
      notional: pos.notional,
      stop: pos.stop,
      exitReason: reason,
      pnl,
      pnlPct: (pnl / pos.notional) * 100,
      commission: pos.comm + exitComm,
      bars: i - pos.entryIdx,
    });
    pos = null;
    stopArmed = false;
  };

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    // 1) intrabar stop from order placed on previous bar
    if (pos && stopArmed && c.low <= pos.stop) {
      closePos(i, Math.min(c.open, pos.stop), "STOP_LOSS");
    }

    // 2) script on bar close
    const ok = (...v: number[]) => v.every(Number.isFinite);
    const valid = ok(hma1[i], hma2[i], D1[i], D2[i], macd[i], aMacd[i], lead1[i], lead2[i]);
    const longC =
      valid && hma1[i] > hma2[i] && D1[i] > D2[i] && macd[i] > aMacd[i] && price[i] > hma2[i] && lead1[i] > lead2[i];
    const sellC =
      valid && hma1[i] < hma2[i] && D1[i] < D2[i] && macd[i] < aMacd[i] && price[i] < hma2[i] && lead1[i] < lead2[i];

    if (pos) {
      if (sellC) closePos(i, close[i], "Strategy SELL");
      else stopArmed = true;
    } else if (longC) {
      const eq = cash;
      const entry = close[i];
      const cs = candStop[i];
      const dist = entry - cs;
      const frac = dist > 0 ? dist / entry : NaN;
      const riskNotional = Number.isFinite(frac) && frac > 0 ? (eq * riskPerTrade) / frac : 0;
      const finalNotional = Math.min(riskNotional, eq * maxSingle, eq * maxExposure, eq * (1 - minReserve));
      const qty = entry > 0 ? finalNotional / entry : 0;
      if (cs > 0 && cs < entry && finalNotional > 0 && qty > 0) {
        const entryComm = finalNotional * comm;
        cash -= entryComm;
        pos = { qty, entryPrice: entry, entryIdx: i, stop: cs, notional: finalNotional, comm: entryComm };
        stopArmed = false;
      }
    }

    stopPlot.push(pos ? { time: time[i], value: pos.stop } : ({ time: time[i] } as { time: number; value: number }));
    const openPnl = pos ? pos.qty * (close[i] - pos.entryPrice) : 0;
    equity.push({ time: time[i], value: cash + openPnl });
  }

  if (pos) {
    const p0 = pos;
    const px = close[n - 1];
    const pnl = p0.qty * (px - p0.entryPrice) - p0.comm;
    trades.push({
      entryTime: time[p0.entryIdx],
      entryPrice: p0.entryPrice,
      exitTime: time[n - 1],
      exitPrice: px,
      qty: p0.qty,
      notional: p0.notional,
      stop: p0.stop,
      exitReason: "Otwarta",
      pnl,
      pnlPct: (pnl / p0.notional) * 100,
      commission: p0.comm,
      bars: n - 1 - p0.entryIdx,
    });
  }

  /* plots */
  const toLine = (s: Series, off = 0) => {
    const out: { time: number; value: number }[] = [];
    for (let i = 0; i < n; i++) {
      const j = i + off;
      if (j < 0 || j >= n || !Number.isFinite(s[i])) continue;
      out.push({ time: time[j], value: s[i] });
    }
    return out;
  };
  const plots: LinePlot[] = [
    { title: "HMA 1", color: "#00e676", width: 2, data: toLine(hma1) },
    { title: "HMA 2", color: "#ff5252", width: 2, data: toLine(hma2) },
    { title: "Conversion Line", color: "#0496ff", width: 1, data: toLine(conversion) },
    { title: "Base Line", color: "#c62828", width: 1, data: toLine(base) },
    { title: "Lagging Span", color: "#9e9e9e", width: 1, data: toLine(price, -disp) },
    { title: "Lead 1", color: "rgba(76,175,80,0.8)", width: 1, data: toLine(lead1, disp) },
    { title: "Lead 2", color: "rgba(244,67,54,0.8)", width: 1, data: toLine(lead2, disp) },
    { title: "Jarvis Stop Loss", color: "#ff9800", width: 2, data: stopPlot },
  ];

  /* stats */
  const closed = trades.filter((t) => t.exitReason !== "Otwarta");
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = -losses.reduce((a, t) => a + t.pnl, 0);
  let peak = header.initialCapital;
  let mdd = 0;
  let mddPct = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.value);
    const dd = peak - e.value;
    if (dd > mdd) mdd = dd;
    if (peak > 0) mddPct = Math.max(mddPct, (dd / peak) * 100);
  }
  const finalEquity = equity.length ? equity[equity.length - 1].value : header.initialCapital;
  const netProfit = finalEquity - header.initialCapital;

  return {
    trades,
    equity,
    plots,
    stats: {
      initialCapital: header.initialCapital,
      finalEquity,
      netProfit,
      netProfitPct: (netProfit / header.initialCapital) * 100,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      totalTrades: closed.length,
      winners: wins.length,
      losers: losses.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgTrade: closed.length ? closed.reduce((a, t) => a + t.pnl, 0) / closed.length : 0,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? -grossLoss / losses.length : 0,
      largestWin: wins.length ? Math.max(...wins.map((t) => t.pnl)) : 0,
      largestLoss: losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
      maxDrawdown: mdd,
      maxDrawdownPct: mddPct,
      commission: trades.reduce((a, t) => a + t.commission, 0),
      buyHoldPct: n > 1 ? ((close[n - 1] - close[0]) / close[0]) * 100 : 0,
      avgBars: closed.length ? closed.reduce((a, t) => a + t.bars, 0) / closed.length : 0,
      stopExits: closed.filter((t) => t.exitReason === "STOP_LOSS").length,
      signalExits: closed.filter((t) => t.exitReason === "Strategy SELL").length,
    },
  };
}
