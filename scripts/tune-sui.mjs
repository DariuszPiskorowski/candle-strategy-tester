// Uruchomienie: node --experimental-strip-types scripts/tune-sui.mjs [ai-gateway/config.json]
// Wszystkie ustawienia czytane sa z pliku konfiguracyjnego; wyniki trafiaja do resultsFile obok niego.
import fs from 'node:fs';
import path from 'node:path';
import { parseCandles } from '../src/lib/candles.ts';
import { parsePineInputs, parsePineHeader, runJarvis } from '../src/lib/strategy/jarvis.ts';

const configPath = path.resolve(process.argv[2] ?? 'ai-gateway/config.json');
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const base = path.dirname(configPath);
const dataDir = path.resolve(base, cfg.dataDir ?? '.');
const day = (s, endOfDay) => Date.parse(`${s}T${endOfDay ? '23:59:59' : '00:00:00'}Z`) / 1000;

const source = fs.readFileSync(path.join(dataDir, cfg.strategyFile), 'utf8');
const header = parsePineHeader(source);
const fileParams = Object.fromEntries(parsePineInputs(source).map(p => [p.name, p.value]));
const unknown = Object.keys(cfg.params ?? {}).filter(k => !(k in fileParams));
if (unknown.length) throw new Error('Nieznane parametry w config.params: ' + unknown.join(', '));
const startParams = { ...fileParams, ...(cfg.params ?? {}) };

// Merge files: later file overwrites the same timestamp (e.g. an unfinished last candle).
const merged = new Map();
let duplicates = 0;
for (const f of cfg.candleFiles) for (const c of parseCandles(fs.readFileSync(path.join(dataDir, f), 'utf8'))) {
  if (merged.has(c.time)) duplicates++;
  merged.set(c.time, c);
}
const candles = [...merged.values()].sort((a, b) => a.time - b.time);
const interval = candles[1].time - candles[0].time;
const gaps = [];
for (let i = 1; i < candles.length; i++) if (candles[i].time - candles[i - 1].time !== interval) gaps.push(candles[i].time);

const testStart = day(cfg.testStart), testEnd = cfg.testEnd ? day(cfg.testEnd, true) : Math.floor(Date.now() / 1000);
const valStart = cfg.validationStart ? day(cfg.validationStart) : null;
const fitWindow = { startTime: testStart, endTime: valStart ? valStart - 1 : testEnd };
const valWindow = valStart ? { startTime: valStart, endTime: testEnd } : null;
const warmupCandles = candles.filter(c => c.time < testStart).length;
const maxDD = cfg.objective?.maxDrawdownPct ?? 30;

function summarize(r) {
  const open = r.trades.find(t => t.exitReason === 'Otwarta');
  const exitFee = open ? open.qty * open.exitPrice * header.commissionPct / 100 : 0;
  const liq = r.stats.finalEquity - exitFee;
  const closed = r.trades.filter(t => t.exitReason !== 'Otwarta');
  return { ...r.stats, liquidationEquity: liq, liquidationProfitPct: (liq / header.initialCapital - 1) * 100,
    conservativeDDPct: Math.max(r.stats.maxDrawdownPct, r.stats.maxIntrabarDrawdownPct),
    expectancyPct: closed.reduce((a, t) => a + t.pnlPct, 0) / (closed.length || 1),
    payoffRatio: r.stats.avgLoss < 0 ? r.stats.avgWin / -r.stats.avgLoss : null, openPosition: open ?? null };
}
const run = (p, w) => runJarvis(candles, p, header, undefined, w);
const cache = new Map();
const trials = [];
function evaluate(p, meta = {}) {
  const key = JSON.stringify(p);
  if (!cache.has(key)) cache.set(key, { params: { ...p }, stats: summarize(run(p, fitWindow)) });
  const r = cache.get(key);
  trials.push({ trial: trials.length + 1, ...meta, params: r.params, liquidationProfitPct: r.stats.liquidationProfitPct, conservativeDDPct: r.stats.conservativeDDPct, totalTrades: r.stats.totalTrades });
  return r;
}
function compare(a, b) {
  const x = a.stats, y = b.stats, ok = s => s.conservativeDDPct <= maxDD + 1e-9 && s.totalTrades > 0;
  if (ok(x) !== ok(y)) return ok(x) ? 1 : -1;
  if (!ok(x) && Math.abs(x.conservativeDDPct - y.conservativeDDPct) > 1e-9) return y.conservativeDDPct - x.conservativeDDPct;
  for (const [k, s] of [['liquidationProfitPct', 1], ['conservativeDDPct', -1], ['profitFactor', 1], ['expectancyPct', 1], ['payoffRatio', 1], ['winRate', 1]]) {
    const d = (x[k] ?? 0) - (y[k] ?? 0);
    if (Math.abs(d) > 1e-9) return s * d;
  }
  return 0;
}
const allowed = (p, k, v, min, max) => v >= min - 1e-9 && v <= max + 1e-9 &&
  !(('macdFastLength' in p) && { ...p, [k]: v }.macdFastLength >= { ...p, [k]: v }.macdSlowLength);

const start = evaluate(startParams, { stage: 'start' });
let best = start, converged = true;
const changes = [];
if (cfg.mode === 'tune') {
  const list = cfg.tune?.parameters ?? [];
  for (const t of list) if (!(t.name in fileParams)) throw new Error('Nieznany parametr do tuningu: ' + t.name);
  converged = false;
  for (let pass = 1; pass <= (cfg.tune.maxPasses ?? 12); pass++) {
    let changed = false;
    for (const { name, step, min, max, bool } of list) {
      const anchor = best; let top = anchor;
      if (bool) {
        for (const v of [true, false]) {
          if (v === anchor.params[name]) continue;
          const c = evaluate({ ...anchor.params, [name]: v }, { stage: 'tune', pass, parameter: name });
          if (compare(c, top) > 0) top = c;
        }
      } else {
        for (const dir of [1, -1]) {
          let prev = anchor, flats = 0;
          for (let d = 1; d <= 100; d++) {
            const v = Number((anchor.params[name] + dir * step * d).toFixed(8));
            if (!allowed(anchor.params, name, v, min, max)) break;
            const c = evaluate({ ...anchor.params, [name]: v }, { stage: 'tune', pass, parameter: name });
            if (compare(c, top) > 0) top = c;
            const vs = compare(c, prev);
            if (vs < 0) break;
            if (vs === 0) { if (++flats >= 3) break; } else flats = 0;
            prev = c;
          }
        }
      }
      if (compare(top, best) > 0) { changes.push({ pass, parameter: name, from: best.params[name], to: top.params[name] }); best = top; changed = true; }
    }
    console.log('PASS', pass, 'testy', cache.size, 'zysk%', best.stats.liquidationProfitPct.toFixed(2), 'DD%', best.stats.conservativeDDPct.toFixed(2));
    if (!changed) { converged = true; break; }
    if (cache.size >= (cfg.tune.maxTests ?? 600)) break;
  }
}

const months = [];
for (let t = testStart; t <= testEnd;) {
  const d = new Date(t * 1000), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  const s = summarize(run(best.params, { startTime: t, endTime: Math.min(next - 1, testEnd) }));
  months.push({ month: d.toISOString().slice(0, 7), profitPct: s.liquidationProfitPct, ddPct: s.conservativeDDPct, trades: s.totalTrades });
  t = next;
}
const final = run(best.params, fitWindow);
const out = {
  generatedAt: new Date().toISOString(), config: cfg, header,
  data: { candles: candles.length, interval, warmupCandles, duplicates, gaps, first: new Date(candles[0].time * 1000).toISOString(), last: new Date(candles.at(-1).time * 1000).toISOString() },
  start: start.stats, best: { params: best.params, stats: best.stats },
  changedParams: Object.fromEntries(Object.entries(best.params).filter(([k, v]) => fileParams[k] !== v)),
  validation: valWindow ? { start: summarize(run(startParams, valWindow)), best: summarize(run(best.params, valWindow)) } : null,
  months, converged, uniqueTests: cache.size, changes, trades: final.trades, trials,
};
const resultsPath = path.resolve(base, cfg.resultsFile ?? 'results.json');
fs.writeFileSync(resultsPath, JSON.stringify(out, null, 2));
if (warmupCandles < 100) console.warn('UWAGA: tylko', warmupCandles, 'swiec rozgrzewki przed testStart');
if (gaps.length) console.warn('UWAGA: luki w danych:', gaps.length);
console.log('Zapisano', resultsPath, '| zysk%', best.stats.liquidationProfitPct.toFixed(2), '| DD%', best.stats.conservativeDDPct.toFixed(2), '| transakcje', best.stats.totalTrades);
