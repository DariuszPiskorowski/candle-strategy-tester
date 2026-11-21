import type { Candle } from "../../lib/candles.ts";

// Source-compatible EMA starts at the first available sample; RMA uses an SMA seed.
export function emaSeries(values: number[], length: number): number[] {
  let previous = NaN;
  const alpha = 2 / (length + 1);
  return values.map(value => {
    if (!Number.isFinite(value)) return previous;
    previous = Number.isFinite(previous) ? alpha * value + (1 - alpha) * previous : value;
    return previous;
  });
}

export function rma(values: number[], length: number): number[] {
  let previous = NaN;
  const seed: number[] = [];
  return values.map(value => {
    if (!Number.isFinite(value)) return previous;
    if (!Number.isFinite(previous)) {
      seed.push(value);
      if (seed.length < length) return NaN;
      previous = seed.reduce((a, b) => a + b, 0) / length;
    } else previous = (previous * (length - 1) + value) / length;
    return previous;
  });
}

export function trueRanges(candles: Candle[]): number[] {
  return candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
}

export function smoothedHa(candles: Candle[], before: number, after: number) {
  const o = emaSeries(candles.map(c => c.open), before);
  const h = emaSeries(candles.map(c => c.high), before);
  const l = emaSeries(candles.map(c => c.low), before);
  const c = emaSeries(candles.map(c => c.close), before);
  const hc = c.map((_, i) => (o[i] + h[i] + l[i] + c[i]) / 4);
  const ho: number[] = [];
  for (let i = 0; i < candles.length; i++) ho.push(i === 0 ? (o[i] + c[i]) / 2 : (ho[i - 1] + hc[i - 1]) / 2);
  const open = emaSeries(ho, after), close = emaSeries(hc, after);
  return { open, close, green: close.map((v, i) => v > open[i]) };
}

/** Only full UTC days may contribute to yesterday's HA; never invent a partial first day. */
export function dailyHa(candles: Candle[], interval: number, before: number, after: number): (boolean | undefined)[] {
  const days: Candle[] = [];
  const coverage = new Map<number, number>();
  for (const c of candles) {
    const day = Math.floor(c.time / 86400) * 86400;
    const last = days[days.length - 1];
    if (last?.time === day) {
      last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low);
      last.close = c.close; last.volume += c.volume;
    } else days.push({ ...c, time: day });
    coverage.set(day, (coverage.get(day) ?? 0) + interval);
  }
  const full = days.filter(d => coverage.get(d.time) === 86400 && candles.some(c => c.time === d.time));
  const ha = smoothedHa(full, before, after);
  const states = new Map(full.map((d, i) => [d.time, ha.green[i]]));
  return candles.map(c => states.get(Math.floor(c.time / 86400) * 86400 - 86400));
}

export function rangeDetector(candles: Candle[], p: Record<string, number | string | boolean>) {
  const num = (key: string, fallback: number) => typeof p[key] === "number" ? Number(p[key]) : fallback;
  const len = (key: string, fallback: number) => Math.max(1, Math.round(num(key, fallback)));
  const tr = trueRanges(candles), atr = rma(tr, len("atrLen", 10));
  const adxLen = len("adxLen", 10);
  const plus = candles.map((c, i) => {
    if (!i) return NaN;
    const up = c.high - candles[i - 1].high, down = candles[i - 1].low - c.low;
    return up > down && up > 0 ? up : 0;
  });
  const minus = candles.map((c, i) => {
    if (!i) return NaN;
    const up = c.high - candles[i - 1].high, down = candles[i - 1].low - c.low;
    return down > up && down > 0 ? down : 0;
  });
  const dmPlus = rma(plus, adxLen), dmMinus = rma(minus, adxLen);
  const adx = rma(dmPlus.map((v, i) => {
    const sum = v + dmMinus[i];
    return Number.isFinite(sum) ? 100 * Math.abs(v - dmMinus[i]) / (sum || 1) : NaN;
  }), adxLen);
  const close = candles.map(c => c.close), slopeEma = emaSeries(close, len("slopeEmaLen", 38));
  const bbw: number[] = [], raw: number[] = [], score: number[] = [];
  const inRange: boolean[] = [], lower: number[] = [], upper: number[] = [];
  let range = false, streak = 0, dwell = 0, lo = NaN, hi = NaN;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const chopLen = len("chopLen", 10), erLen = len("erLen", 15), bbLen = len("bbLen", 15);
    const slice = candles.slice(Math.max(0, i - chopLen + 1), i + 1);
    const spread = Math.max(...slice.map(v => v.high)) - Math.min(...slice.map(v => v.low));
    const chop = spread > 0 && i >= chopLen - 1 ? 100 * Math.log10(tr.slice(i - chopLen + 1, i + 1).reduce((a, b) => a + b, 0) / spread) / Math.log10(chopLen) : NaN;
    let path = 0;
    if (i >= erLen) for (let j = i - erLen + 1; j <= i; j++) path += Math.abs(close[j] - close[j - 1]);
    const er = path > 0 ? Math.abs(c.close - close[i - erLen]) / path : NaN;
    const window = close.slice(Math.max(0, i - bbLen + 1), i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / bbLen;
    bbw.push(i >= bbLen - 1 && mean !== 0 ? 2 * num("bbMult", 2) * Math.sqrt(window.reduce((a, v) => a + (v - mean) ** 2, 0) / bbLen) / mean : NaN);
    const rankLen = len("bbwLookback", 540), rankWindow = bbw.slice(Math.max(0, i - rankLen + 1), i + 1);
    const rank = rankWindow.length === rankLen && rankWindow.every(Number.isFinite) ? rankWindow.filter(v => v <= bbw[i]).length / rankLen : NaN;
    const slopeLen = len("slopeLen", 8);
    const slope = i >= slopeLen && atr[i] > 0 ? (slopeEma[i] - slopeEma[i - slopeLen]) / (slopeLen * atr[i]) : NaN;
    const valid = [adx[i], chop, er, slope].every(Number.isFinite);
    const bbwOk = p["useBbw"] !== false && Number.isFinite(rank);
    const votes = Number(adx[i] < num("adxMax", 20)) + Number(chop > num("chopMin", 55)) + Number(er < num("erMax", 0.3)) + Number(Math.abs(slope) < num("slopeMax", 0.15)) + Number(bbwOk && rank < num("bbwPctMax", 0.4));
    raw.push(valid ? votes / (bbwOk ? 5 : 4) : NaN);
    const smooth = len("smoothLen", 3), recent = raw.slice(Math.max(0, i - smooth + 1), i + 1);
    const s = recent.length === smooth && recent.every(Number.isFinite) ? recent.reduce((a, b) => a + b, 0) / smooth : NaN;
    score.push(s);
    if (Number.isFinite(s)) {
      dwell++;
      if (range) {
        const breakout = Number.isFinite(atr[i]) && (c.close > hi + num("breakoutAtr", 1) * atr[i] || c.close < lo - num("breakoutAtr", 1) * atr[i]);
        streak = s <= num("exitRange", 0.4) ? streak + 1 : 0;
        if (breakout || (streak >= len("confirmBars", 4) && dwell >= len("minDwell", 32))) {
          range = false; streak = 0; dwell = 0;
        } else { lo = Math.min(lo, c.low); hi = Math.max(hi, c.high); }
      } else {
        streak = s >= num("enterRange", 0.6) ? streak + 1 : 0;
        if (streak >= len("confirmBars", 4) && dwell >= len("minDwell", 32) && i > 0) {
          const prior = candles.slice(Math.max(0, i - len("rangeLen", 22)), i);
          lo = Math.min(...prior.map(v => v.low)); hi = Math.max(...prior.map(v => v.high));
          range = true; streak = 0; dwell = 0;
        }
      }
    }
    inRange.push(range); lower.push(lo); upper.push(hi);
  }
  return { inRange, lower, upper, score };
}