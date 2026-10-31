import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parsePineInputs } from '../src/lib/strategy/jarvis.ts';
import { applyParamsFile, formatParamsFile } from '../src/lib/strategy/params-file.ts';

const code = readFileSync(new URL('../src/strategies/jarvis/strategy.txt', import.meta.url), 'utf8');

test('params.txt overrides strategy defaults', () => {
  const out = applyParamsFile(code, 'period = 7\nonlyBuy = true\nres = 240\n');
  const v = Object.fromEntries(parsePineInputs(out).map(p => [p.name, p.value]));
  assert.equal(v.period, 7); assert.equal(v.onlyBuy, true); assert.equal(v.res, '240');
});

test('saved params.txt round-trips', () => {
  const params = parsePineInputs(code).map(p => p.name === 'swingBuffer' ? { ...p, value: -1.25 } : p);
  assert.deepEqual(parsePineInputs(applyParamsFile(code, formatParamsFile(params))), params);
});
