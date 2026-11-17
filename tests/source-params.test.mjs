import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parsePineInputs } from '../src/lib/strategy/jarvis.ts';
import { strategyWithParams } from '../src/lib/strategy/source-params.ts';

const code = readFileSync(new URL('../src/strategies/jarvis/strategy.txt', import.meta.url), 'utf8');

test('source defaults match all parameter values supplied in the screenshot', () => {
  assert.deepEqual(Object.fromEntries(parsePineInputs(code).map(p => [p.name, p.value])), {
    onlyBuy: false, onlySell: false, period: 24, res: 'D', price: 'close',
    swingLookback: 12, swingBuffer: 2.5, useSidewaysFilter: false,
    sidewaysLookback: 40, sidewaysMaxRangePct: 2, sidewaysMaxAvgBodyPct: 3,
    conversionPeriod: 2, basePeriod: 39, laggingSpanPeriod: 51, displacement: 4,
    macdLength: 32, macdFastLength: 37, macdSlowLength: 38,
  });
});

test('exported source restores numeric, boolean and timeframe values without browser storage', () => {
  const params = parsePineInputs(code).map(p => ({ ...p, value: p.name === 'period' ? 12 : p.name === 'onlySell' ? true : p.name === 'res' ? '240' : p.value }));
  const exported = strategyWithParams(code, params);
  assert.deepEqual(parsePineInputs(exported), params);
  assert.equal(exported.slice(exported.indexOf('rangeHigh =')), code.slice(code.indexOf('rangeHigh =')));
  assert.equal(strategyWithParams(exported, params), exported);
});