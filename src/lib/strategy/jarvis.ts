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

export type StrategyColor = {
  key: "hmaUp" | "hmaDown" | "conversion" | "base" | "lagging" | "lead1" | "lead2" | "stop";
  title: string;
  value: string;
};

const PINE_COLORS: Record<string, string> = {
  black: "#000000",
  blue: "#2196f3",
  green: "#089981",
  lime: "#00e676",
  orange: "#ff9800",
  red: "#f23645",
  white: "#ffffff",
};

const DEFAULT_STRATEGY_COLORS: StrategyColor[] = [
  { key: "hmaUp", title: "HMA — wzrost", value: "#089981" },
  { key: "hmaDown", title: "HMA — spadek", value: "#f23645" },
  { key: "conversion", title: "Conversion Line", value: "#0496ff" },
  { key: "base", title: "Base Line", value: "#991515" },
  { key: "lagging", title: "Lagging Span", value: "#000000" },
  { key: "lead1", title: "Lead 1", value: "#089981" },
  { key: "lead2", title: "Lead 2", value: "#f23645" },
  { key: "stop", title: "Jarvis Stop Loss", value: "#ff9800" },
];

function pineColor(value: string): string | null {
  const hex = /#([\da-f]{6}|[\da-f]{3})\b/i.exec(value)?.[0];
  if (hex) return hex.toLowerCase();
  const named = /color\.([a-z]+)/i.exec(value)?.[1]?.toLowerCase();
  return named ? PINE_COLORS[named] ?? null : null;
}

/** Reads visual plot colors without mixing them into strategy calculation inputs. */
export function parseStrategyColors(code: string): StrategyColor[] {
  const colors = DEFAULT_STRATEGY_COLORS.map((color) => ({ ...color }));
  const set = (key: StrategyColor["key"], value: string | null) => {
    const item = colors.find((color) => color.key === key);
    if (item && value) item.value = value;
  };
  const assignments = new Map<string, string>();
  for (const match of code.matchAll(/^\s*(\w+)\s*=\s*([^\n]+)$/gm)) assignments.set(match[1], match[2]);
  const plotColors = new Map<string, string>();
  for (const line of code.split("\n")) {
    if (!/\bplot\s*\(/.test(line)) continue;
    const title = /title\s*=\s*"([^"]+)"/.exec(line)?.[1];
    const expression = /color\s*=\s*([^,)]+)/.exec(line)?.[1]?.trim();
    if (title && expression) plotColors.set(title, expression);
  }
  const resolved = (expression?: string) => {
    if (!expression) return null;
    return pineColor(expression) ?? pineColor(assignments.get(expression) ?? "");
  };
  const hmaExpression = plotColors.get("HMA 1") ?? plotColors.get("HMA 2");
  const hmaAssignment = hmaExpression ? assignments.get(hmaExpression) ?? hmaExpression : "";
  const hmaVariants = [...hmaAssignment.matchAll(/(?:color\.[a-z]+|#[\da-f]{3,6})/gi)]
    .map((match) => pineColor(match[0]))
    .filter((color): color is string => Boolean(color));
  set("hmaUp", hmaVariants[0] ?? resolved(hmaExpression));
  set("hmaDown", hmaVariants[1] ?? resolved(hmaExpression));
  set("conversion", resolved(plotColors.get("Conversion Line")));
  set("base", resolved(plotColors.get("Base Line")));
  set("lagging", resolved(plotColors.get("Lagging Span")));
  set("lead1", resolved(plotColors.get("Lead 1")));
  set("lead2", resolved(plotColors.get("Lead 2")));
  set("stop", resolved(plotColors.get("Jarvis Stop Loss")));
  return colors;
}

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

export type LinePlot = { title: string; color: string; width: number; data: { time: number; value: number; color?: string }[] };

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
    // Conservative OHLC upper bound: high before low; actual intrabar order is unknown.
    maxIntrabarDrawdownPct: number;
    commission: number;
    buyHoldPct: number;
    avgBars: number;
    stopExits: number;
    signalExits: number;
  };
};

export type BacktestOptions = {
  // Earlier candles warm up indicators but cannot open positions.
  startTime?: number;
  endTime?: number;
};

export function runJarvis(
  candles: Candle[],
  p: Record<string, number | string | boolean>,
  header: PineHeader,
  colorSettings: StrategyColor[] = DEFAULT_STRATEGY_COLORS,
  options: BacktestOptions = {},
): StrategyResult {
  candles = candles.filter((c) => options.endTime === undefined || c.time <= options.endTime);
  const n = candles.length;
  const num = (k: string, d: number) => (typeof p[k] === "number" ? (p[k] as number) : d);
  const bool = (k: string, d: boolean) => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);
  const useSidewaysFilter = bool("useSidewaysFilter", false);
  const sLook = Math.max(2, Math.round(num("sidewaysLookback", 6)));
  const sMaxRange = num("sidewaysMaxRangePct", 3) / 100;
  const sMaxBody = num("sidewaysMaxAvgBodyPct", 1) / 100;
  const period = num("period", 5);
  const res = String(p.res ?? "D");
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
  const color = (key: StrategyColor["key"]) =>
    colorSettings.find((setting) => setting.key === key)?.value ??
    DEFAULT_STRATEGY_COLORS.find((setting) => setting.key === key)?.value ??
    "#ffffff";

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
  let intrabarPeak = header.initialCapital;
  let maxIntrabarDrawdownPct = 0;
  const markIntrabar = (value: number) => {
    intrabarPeak = Math.max(intrabarPeak, value);
    if (intrabarPeak > 0) maxIntrabarDrawdownPct = Math.max(maxIntrabarDrawdownPct, ((intrabarPeak - value) / intrabarPeak) * 100);
  };
  let stopArmed = false; // strategy.exit is placed at bar close and becomes active from the next bar

  const closePos = (i: number, px: number, reason: Trade["exitReason"]) => {
    if (!pos) return;
    const exitComm = pos.qty * px * comm;
    const pnl = pos.qty * (px - pos.entryPrice) - pos.comm - exitComm;
    cash += pos.qty * px - exitComm;
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
    if (options.startTime !== undefined && c.time < options.startTime) continue;
    const barStartStop: number | null = pos ? pos.stop : null;
    if (pos) {
      // Conservative bound, not a reconstruction of the true high/low sequence.
      markIntrabar(cash + pos.qty * c.high);
      const worstPrice = stopArmed && c.low <= pos.stop ? Math.min(c.open, pos.stop) : c.low;
      markIntrabar(cash + pos.qty * worstPrice);
    }
    // 1) intrabar stop from order placed on previous bar
    if (pos && stopArmed && c.low <= pos.stop) {
      closePos(i, Math.min(c.open, pos.stop), "STOP_LOSS");
    }

    // 2) script on bar close
    const ok = (...v: number[]) => v.every(Number.isFinite);
    const valid = ok(hma1[i], hma2[i], D1[i], D2[i], macd[i], aMacd[i], lead1[i], lead2[i]);
    // Sideways filter (from Pine): small total range AND small average body over lookback
    let sideways = false;
    if (useSidewaysFilter && i >= sLook - 1) {
      let hi = -Infinity, lo = Infinity, body = 0;
      for (let k = i - sLook + 1; k <= i; k++) {
        const ck = candles[k];
        hi = Math.max(hi, ck.high);
        lo = Math.min(lo, ck.low);
        body += ck.open > 0 ? Math.abs(ck.close - ck.open) / ck.open : 0;
      }
      const rangePct = c.close > 0 ? (hi - lo) / c.close : 0;
      sideways = rangePct < sMaxRange && body / sLook < sMaxBody;
    }
    const longC =
      valid && hma1[i] > hma2[i] && D1[i] > D2[i] && macd[i] > aMacd[i] && price[i] > hma2[i] && lead1[i] > lead2[i] &&
      (!useSidewaysFilter || !sideways);
    const sellC =
      valid && hma1[i] < hma2[i] && D1[i] < D2[i] && macd[i] < aMacd[i] && price[i] < hma2[i] && lead1[i] < lead2[i];

    if (pos) {
      if (sellC) closePos(i, close[i], "Strategy SELL");
      else stopArmed = true;
    } else if (longC) {
      const entry = close[i];
      const cs = candStop[i];
      // Use all available spot cash, including the BUY commission.
      // Stop distance affects the stop, never the quantity.
      const finalNotional = Math.max(cash, 0) / (1 + comm);
      const qty = entry > 0 ? finalNotional / entry : 0;
      if (cs > 0 && cs < entry && finalNotional > 0 && qty > 0) {
        const entryComm = finalNotional * comm;
        cash -= finalNotional + entryComm;
        if (Math.abs(cash) < 1e-10) cash = 0;
        pos = { qty, entryPrice: entry, entryIdx: i, stop: cs, notional: finalNotional, comm: entryComm };
        stopArmed = false;
      }
    }

    // Linia SL dobija do świecy zamknięcia pozycji (SL lub SELL)
    const plotStop = pos ? pos.stop : barStartStop;
    stopPlot.push(plotStop !== null ? { time: time[i], value: plotStop } : ({ time: time[i] } as { time: number; value: number }));
    const accountEquity = cash + (pos ? pos.qty * close[i] : 0);
    markIntrabar(accountEquity);
    equity.push({ time: time[i], value: accountEquity });
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
  const toLine = (s: Series, off = 0, colorAt?: (i: number) => string) => {
    const out: { time: number; value: number; color?: string }[] = [];
    for (let i = 0; i < n; i++) {
      const j = i + off;
      if (j < 0 || j >= n || !Number.isFinite(s[i])) continue;
      out.push({ time: time[j], value: s[i], ...(colorAt ? { color: colorAt(i) } : {}) });
    }
    return out;
  };
  const hmaColor = (i: number) => (hma1[i] > hma2[i] ? color("hmaUp") : color("hmaDown"));
  const plots: LinePlot[] = [
    { title: "HMA 1", color: color("hmaUp"), width: 2, data: toLine(hma1, 0, hmaColor) },
    { title: "HMA 2", color: color("hmaUp"), width: 2, data: toLine(hma2, 0, hmaColor) },
    { title: "Conversion Line", color: color("conversion"), width: 1, data: toLine(conversion) },
    { title: "Base Line", color: color("base"), width: 1, data: toLine(base) },
    { title: "Lagging Span", color: color("lagging"), width: 1, data: toLine(price, -disp) },
    { title: "Lead 1", color: color("lead1"), width: 1, data: toLine(lead1, disp) },
    { title: "Lead 2", color: color("lead2"), width: 1, data: toLine(lead2, disp) },
    { title: "Jarvis Stop Loss", color: color("stop"), width: 2, data: stopPlot },
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
  const firstTradingCandle = candles.find((c) => options.startTime === undefined || c.time >= options.startTime);
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
      maxIntrabarDrawdownPct,
      commission: trades.reduce((a, t) => a + t.commission, 0),
      buyHoldPct: firstTradingCandle && n > 1 ? ((close[n - 1] - firstTradingCandle.close) / firstTradingCandle.close) * 100 : 0,
      avgBars: closed.length ? closed.reduce((a, t) => a + t.bars, 0) / closed.length : 0,
      stopExits: closed.filter((t) => t.exitReason === "STOP_LOSS").length,
      signalExits: closed.filter((t) => t.exitReason === "Strategy SELL").length,
    },
  };
}

