export type Candle = {
  time: number; // seconds (UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const num = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v)));

/** Parse a .customization / .txt / .json file containing candle data. */
export function parseCandles(raw: string): Candle[] {
  const text = raw.trim();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // fallback: CSV-ish  time,open,high,low,close[,volume]
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.split(/[;,\t]/).map((c) => c.trim()))
      .filter((r) => r.length >= 5 && !Number.isNaN(Number(r[1])));
    data = rows;
  }
  if (!Array.isArray(data)) throw new Error("Plik nie zawiera tablicy świec.");

  const out: Candle[] = [];
  for (const row of data as unknown[]) {
    let time: number, o: number, h: number, l: number, c: number, v = 0;
    if (Array.isArray(row)) {
      // Binance kline: [openTime, open, high, low, close, volume, ...]
      time = num(row[0]);
      o = num(row[1]);
      h = num(row[2]);
      l = num(row[3]);
      c = num(row[4]);
      v = row.length > 5 ? num(row[5]) : 0;
    } else if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      time = num(r.time ?? r.t ?? r.timestamp ?? r.date ?? r.openTime);
      o = num(r.open ?? r.o ?? r.O);
      h = num(r.high ?? r.h ?? r.H);
      l = num(r.low ?? r.l ?? r.L);
      c = num(r.close ?? r.c ?? r.C);
      v = num(r.volume ?? r.v ?? r.V ?? 0) || 0;
    } else {
      continue;
    }
    if ([time, o, h, l, c].some((n) => !Number.isFinite(n))) continue;
    // normalize ms -> s
    if (time > 1e11) time = Math.floor(time / 1000);
    out.push({ time, open: o, high: h, low: l, close: c, volume: Number.isFinite(v) ? v : 0 });
  }
  out.sort((a, b) => a.time - b.time);
  // de-duplicate identical timestamps
  return out.filter((c, i) => i === 0 || c.time !== out[i - 1].time);
}

export const TIMEFRAMES = [
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "15m", sec: 900 },
  { label: "30m", sec: 1800 },
  { label: "1H", sec: 3600 },
  { label: "4H", sec: 14400 },
  { label: "1D", sec: 86400 },
  { label: "1W", sec: 604800 },
] as const;

/** Detect the base interval of the dataset in seconds. */
export function detectInterval(candles: Candle[]): number {
  if (candles.length < 3) return 60;
  const diffs = new Map<number, number>();
  for (let i = 1; i < Math.min(candles.length, 200); i++) {
    const d = candles[i].time - candles[i - 1].time;
    diffs.set(d, (diffs.get(d) ?? 0) + 1);
  }
  return [...diffs.entries()].sort((a, b) => b[1] - a[1])[0][0] || 60;
}

/** Aggregate candles up to a larger timeframe. */
export function aggregate(candles: Candle[], targetSec: number): Candle[] {
  if (!candles.length) return [];
  const out: Candle[] = [];
  for (const k of candles) {
    const bucket = Math.floor(k.time / targetSec) * targetSec;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, k.high);
      last.low = Math.min(last.low, k.low);
      last.close = k.close;
      last.volume += k.volume;
    } else {
      out.push({ ...k, time: bucket });
    }
  }
  return out;
}
