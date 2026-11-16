// bun scripts/fetch-orca.mjs [4h] — tylko pobranie danych, bez strojenia strategii.
import fs from 'node:fs';
import { fetchOrcaHistory, ORCA_POOL } from '../src/lib/orca.ts';

const interval = process.argv[2] ?? '4h';
const candles = await fetchOrcaHistory(interval, 6);
const file = new URL(`../data/ORCA_SOLUSDC_${interval}.json`, import.meta.url);
fs.writeFileSync(file, JSON.stringify(candles));
console.log(`Orca ${ORCA_POOL}: ${candles.length} świec → ${file.pathname}`);