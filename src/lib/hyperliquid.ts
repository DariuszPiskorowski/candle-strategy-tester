import type { Candle } from './candles.ts';

export const HYPERLIQUID_MARKET = 'HL_SOL';
// A six-month history must fit within the exchange's 5,000 most recent candles.
export const HYPERLIQUID_INTERVALS = ['1h', '2h', '4h', '8h', '12h', '1d'] as const;
export const HYPERLIQUID_INFO = 'https://api.hyperliquid.xyz/info';
export function parseHyperliquidCandles(data: unknown): Candle[] {
  if (!Array.isArray(data)) throw new Error('Hyperliquid: nieprawidłowa odpowiedź.');
  const rows = new Map<number, Candle>();
  for (const row of data) {
    const c = { time: Number(row?.t) / 1000, open: Number(row?.o), high: Number(row?.h), low: Number(row?.l), close: Number(row?.c), volume: Number(row?.v) };
    if (!Object.values(c).every(Number.isFinite) || c.open <= 0 || c.close <= 0 || c.low <= 0 || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.volume < 0) throw new Error('Hyperliquid: błędna świeca.');
    rows.set(c.time, c);
  }
  return [...rows.values()].sort((a,b) => a.time-b.time);
}
export async function fetchHyperliquidLatest(interval: string, fromMs: number, endMs = Date.now()): Promise<Candle[]> {
  const res = await fetch(HYPERLIQUID_INFO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'candleSnapshot', req: { coin: 'SOL', interval, startTime: fromMs, endTime: endMs } }) });
  if (!res.ok) throw new Error(`Hyperliquid: błąd ${res.status}`);
  return parseHyperliquidCandles(await res.json());
}
export async function fetchHyperliquidHistory(interval: string, months = 6): Promise<Candle[]> {
  const end = Date.now(), start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  const rows = await fetchHyperliquidLatest(interval, start.getTime(), end);
  const seconds = Number.parseInt(interval) * (interval.endsWith('d') ? 86400 : 3600);
  if (!rows.length || rows[0].time * 1000 > start.getTime() + seconds * 1000) throw new Error('Hyperliquid nie udostępnia pełnych sześciu miesięcy dla tego interwału. Wybierz 1H lub większy.');
  for (let i = 1; i < rows.length; i++) if (rows[i].time - rows[i-1].time !== seconds) throw new Error('Hyperliquid: luka w historii świec.');
  return rows;
}
