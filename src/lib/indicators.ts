import type { Candle } from "./candles";

export type Point = { time: number; value: number };

export function sma(candles: Candle[], length: number): Point[] {
  const out: Point[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= length) sum -= candles[i - length].close;
    if (i >= length - 1) out.push({ time: candles[i].time, value: sum / length });
  }
  return out;
}

export function emaValues(values: number[], length: number): (number | undefined)[] {
  const k = 2 / (length + 1);
  const out: (number | undefined)[] = [];
  let prev: number | undefined;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) {
      sum += values[i];
      out.push(undefined);
      continue;
    }
    if (prev === undefined) {
      sum += values[i];
      prev = sum / length;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function ema(candles: Candle[], length: number): Point[] {
  const vals = emaValues(
    candles.map((c) => c.close),
    length,
  );
  return candles
    .map((c, i) => ({ time: c.time, value: vals[i] }))
    .filter((p): p is Point => p.value !== undefined);
}

export function bollinger(candles: Candle[], length = 20, mult = 2) {
  const upper: Point[] = [];
  const middle: Point[] = [];
  const lower: Point[] = [];
  for (let i = length - 1; i < candles.length; i++) {
    const slice = candles.slice(i - length + 1, i + 1).map((c) => c.close);
    const mean = slice.reduce((a, b) => a + b, 0) / length;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / length);
    const t = candles[i].time;
    middle.push({ time: t, value: mean });
    upper.push({ time: t, value: mean + mult * sd });
    lower.push({ time: t, value: mean - mult * sd });
  }
  return { upper, middle, lower };
}

export function rsi(candles: Candle[], length = 14): Point[] {
  const out: Point[] = [];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (i <= length) {
      avgGain += gain / length;
      avgLoss += loss / length;
      if (i === length) {
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
      }
      continue;
    }
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
  }
  return out;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const closes = candles.map((c) => c.close);
  const f = emaValues(closes, fast);
  const s = emaValues(closes, slow);
  const macdLine: Point[] = [];
  const rawMacd: number[] = [];
  const times: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (f[i] === undefined || s[i] === undefined) continue;
    const v = (f[i] as number) - (s[i] as number);
    rawMacd.push(v);
    times.push(candles[i].time);
    macdLine.push({ time: candles[i].time, value: v });
  }
  const sig = emaValues(rawMacd, signal);
  const signalLine: Point[] = [];
  const histogram: { time: number; value: number; color: string }[] = [];
  for (let i = 0; i < rawMacd.length; i++) {
    if (sig[i] === undefined) continue;
    signalLine.push({ time: times[i]!, value: sig[i] as number });
    const h = rawMacd[i]! - (sig[i] as number);
    histogram.push({
      time: times[i]!,
      value: h,
      color: h >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)",
    });
  }
  return { macdLine, signalLine, histogram };
}
