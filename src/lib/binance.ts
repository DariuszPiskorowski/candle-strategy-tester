import { parseCandles, type Candle } from "./candles";

export const BINANCE_PAIRS = ["SUIUSDC", "SOLUSDC", "BNBUSDC"] as const;
export const BINANCE_INTERVALS = ["15m", "1h", "4h", "1d"] as const;

async function klines(symbol: string, interval: string, startTime?: number, limit = 1000) {
  const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (startTime !== undefined) q.set("startTime", String(startTime));
  const res = await fetch(`https://api.binance.com/api/v3/klines?${q}`);
  if (!res.ok) throw new Error(`Binance: błąd ${res.status}`);
  return (await res.json()) as unknown[][];
}

/** Historia świec z ostatnich `months` miesięcy. */
export async function fetchHistory(symbol: string, interval: string, months = 6): Promise<Candle[]> {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  let from = d.getTime();
  const rows: unknown[][] = [];
  for (;;) {
    const batch = await klines(symbol, interval, from);
    if (!batch.length) break;
    rows.push(...batch);
    from = Number(batch[batch.length - 1][0]) + 1;
    if (batch.length < 1000) break;
  }
  return parseCandles(JSON.stringify(rows));
}

/** Kilka najnowszych świec (ostatnia może być jeszcze otwarta). */
export async function fetchLatest(symbol: string, interval: string): Promise<Candle[]> {
  return parseCandles(JSON.stringify(await klines(symbol, interval, undefined, 3)));
}
