import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parsePineInputs } from '../src/lib/strategy/jarvis.ts';
import { strategyWithParams } from '../src/lib/strategy/source-params.ts';
import { applyParamsFile } from '../src/lib/strategy/params-file.ts';

const code = readFileSync(new URL('../src/strategies/jarvis/strategy.txt', import.meta.url), 'utf8');

test('source and effective defaults match the November 17 screenshot', () => {
  const expected = {
    onlyBuy: false, onlySell: false, period: 5, res: 'D', price: 'close',
    swingLookback: 21, swingBuffer: 1.2, useSidewaysFilter: true,
    sidewaysLookback: 33, sidewaysMaxRangePct: 5, sidewaysMaxAvgBodyPct: 3,
    conversionPeriod: 25, basePeriod: 27, laggingSpanPeriod: 29, displacement: 5,
    macdLength: 8, macdFastLength: 12, macdSlowLength: 25,
  };
  const params = readFileSync(new URL('../src/strategies/jarvis/params.txt', import.meta.url), 'utf8');
  for (const source of [code, applyParamsFile(code, params)]) {
    assert.deepEqual(Object.fromEntries(parsePineInputs(source).map(p => [p.name, p.value])), expected);
  }
});

test('exported source restores numeric, boolean and timeframe values without browser storage', () => {
  const params = parsePineInputs(code).map(p => ({ ...p, value: p.name === 'period' ? 12 : p.name === 'onlySell' ? true : p.name === 'res' ? '240' : p.value }));
  const exported = strategyWithParams(code, params);
  assert.deepEqual(parsePineInputs(exported), params);
  assert.equal(exported.slice(exported.indexOf('rangeHigh =')), code.slice(code.indexOf('rangeHigh =')));
  assert.equal(strategyWithParams(exported, params), exported);
});