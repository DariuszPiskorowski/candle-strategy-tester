import type { Candle } from "./candles";

export const ORCA_POOL = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
export const ORCA_MARKET = {
  pool: ORCA_POOL,
  base: "SOL",
  quote: "USDC",
  baseMint: "So11111111111111111111111111111111111111112",
  quoteMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;
export const ORCA_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "12h", "1d"] as const;

export function orcaOhlcvUrl(interval: string, before?: number, limit = 1000) {
  const frame = /^([0-9]+)(m|h|d)$/.exec(interval);
  if (!frame || !ORCA_INTERVALS.some((value) => value === interval)) throw new Error("Nieobsługiwany interwał Orca.");
  const unit = frame[2] === "m" ? "minute" : frame[2] === "h" ? "hour" : "day";
  const query = new URLSearchParams({ aggregate: frame[1], limit: String(limit), currency: "token", token: "base" });
  if (before !== undefined) query.set("before_timestamp", String(before));
  return `https://api.geckoterminal.com/api/v2/networks/solana/pools/${ORCA_POOL}/ohlcv/${unit}?${query}`;
}

export function parseOrcaCandles(payload: unknown): Candle[] {
  const rows = (payload as { data?: { attributes?: { ohlcv_list?: unknown } } })?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error("Brak danych świec puli Orca.");
  const candles = new Map<number, Candle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6 || !row.every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    const [time, open, high, low, close, volume] = row as number[];
    if (time <= 0 || Math.min(open, high, low, close) <= 0 || low > high || high < Math.max(open, close) || low > Math.min(open, close)) continue;
    candles.set(time, { time, open, high, low, close, volume });
  }
  return [...candles.values()].sort((a, b) => a.time - b.time);
}

async function batch(interval: string, before?: number, limit = 1000) {
  const response = await fetch(orcaOhlcvUrl(interval, before, limit), { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Dane Orca (GeckoTerminal): błąd ${response.status}.`);
  return parseOrcaCandles(await response.json());
}

export async function fetchOrcaHistory(interval: string, months = 6): Promise<Candle[]> {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - months);
  const startTime = Math.floor(start.getTime() / 1000);
  const merged = new Map<number, Candle>();
  let before: number | undefined;
  for (;;) {
    const candles = await batch(interval, before);
    if (!candles.length) break;
    for (const candle of candles) merged.set(candle.time, candle);
    const oldest = candles[0].time;
    if (oldest <= startTime) break;
    if (before !== undefined && oldest >= before) throw new Error("Historia Orca nie przesuwa się wstecz.");
    before = oldest;
    // Publiczny dostawca ogranicza liczbę zapytań na minutę.
    await new Promise((resolve) => setTimeout(resolve, 2100));
  }
  const all = [...merged.values()].sort((a, b) => a.time - b.time);
  if (!all.length || all[0].time > startTime + 86400) throw new Error("Dostawca nie udostępnił pełnych sześciu miesięcy historii Orca. Nie zastępuję ich danymi Binance.");
  return all.filter((candle) => candle.time >= startTime);
}

export async function fetchOrcaLatest(interval: string, fromMs?: number): Promise<Candle[]> {
  const merged = new Map<number, Candle>();
  let before: number | undefined;
  for (;;) {
    const candles = await batch(interval, before, fromMs ? 1000 : 3);
    if (!candles.length) break;
    for (const candle of candles) merged.set(candle.time, candle);
    const oldest = candles[0].time;
    if (!fromMs || oldest <= fromMs / 1000 || candles.length < 1000) break;
    if (before !== undefined && oldest >= before) break;
    before = oldest;
    await new Promise((resolve) => setTimeout(resolve, 2100));
  }
  return [...merged.values()].sort((a, b) => a.time - b.time);
}