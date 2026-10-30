import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parsePineInputs } from '../src/lib/strategy/jarvis.ts';
import { strategyWithParams } from '../src/lib/strategy/source-params.ts';

const code = readFileSync(new URL('../src/strategies/jarvis/strategy.txt', import.meta.url), 'utf8');

test('source defaults match all parameter values supplied in the screenshot', () => {
  assert.deepEqual(Object.fromEntries(parsePineInputs(code).map(p => [p.name, p.value])), {
    onlyBuy: false, onlySell: false, period: 5, res: 'D', price: 'close',
    swingLookback: 12, swingBuffer: -0.75, useSidewaysFilter: true,
    sidewaysLookback: 8, sidewaysMaxRangePct: 5, sidewaysMaxAvgBodyPct: 3,
    conversionPeriod: 8, basePeriod: 25, laggingSpanPeriod: 11, displacement: 9,
    macdLength: 9, macdFastLength: 13, macdSlowLength: 33,
  });
});

test('exported source restores numeric, boolean and timeframe values without browser storage', () => {
  const params = parsePineInputs(code).map(p => ({ ...p, value: p.name === 'period' ? 12 : p.name === 'onlySell' ? true : p.name === 'res' ? '240' : p.value }));
  const exported = strategyWithParams(code, params);
  assert.deepEqual(parsePineInputs(exported), params);
  assert.equal(exported.slice(exported.indexOf('rangeHigh =')), code.slice(code.indexOf('rangeHigh =')));
  assert.equal(strategyWithParams(exported, params), exported);
});