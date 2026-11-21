// bun scripts/fetch-hyperliquid.mjs [4h] — fetch only, no tuning.
import fs from 'node:fs';
import { fetchHyperliquidHistory } from '../src/lib/hyperliquid.ts';
const interval=process.argv[2]??'4h';
const candles=await fetchHyperliquidHistory(interval,6);
const file=new URL(`../data/HL_SOL_${interval}.json`,import.meta.url);
fs.writeFileSync(file,JSON.stringify(candles));
console.log(`Hyperliquid SOL perpetual: ${candles.length} candles → ${file.pathname}`);
