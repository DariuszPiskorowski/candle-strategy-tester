// Pobiera świece spot z Binance (bez kluczy) do folderu data/.
// Użycie: node scripts/fetch-binance.mjs SUIUSDC 4h 6
//   para (SUIUSDC/SOLUSDC/BNBUSDC), interwał (1h/4h/1d...), ile miesięcy wstecz
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [symbol = 'SUIUSDC', interval = '4h', monthsArg = '6'] = process.argv.slice(2);
const months = Number(monthsArg);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const start = new Date();
start.setUTCMonth(start.getUTCMonth() - months);

const rows = [];
let from = start.getTime();
while (true) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${from}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  const batch = await res.json();
  if (!batch.length) break;
  rows.push(...batch);
  from = batch[batch.length - 1][0] + 1;
  if (batch.length < 1000) break;
}
const file = path.join(root, 'data', `${symbol}_${interval}.json`);
fs.writeFileSync(file, JSON.stringify(rows));
console.log(`Zapisano ${rows.length} świec → data/${symbol}_${interval}.json`);
