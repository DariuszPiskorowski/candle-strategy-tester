import assert from 'node:assert/strict';
import test from 'node:test';
import { saveStrategyParams, restoreStrategyParams } from '../src/lib/strategy/saved-params.ts';

const defaults = [
  { name: 'period', title: 'Period', kind: 'int', value: 5 },
  { name: 'onlyBuy', title: 'Tylko BUY', kind: 'bool', value: false },
];
const storage = () => {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};

test('saved numeric and checkbox parameters survive a fresh restore', () => {
  const store = storage();
  saveStrategyParams(store, 'jarvis', defaults.map((p) => ({ ...p, value: p.name === 'period' ? 12 : true })));
  assert.deepEqual(restoreStrategyParams(store, 'jarvis', defaults).map((p) => p.value), [12, true]);
  assert.deepEqual(defaults.map((p) => p.value), [5, false]);
});

test('settings are separate for each strategy and unsaved changes do not replace them', () => {
  const store = storage();
  saveStrategyParams(store, 'jarvis', defaults);
  const edited = defaults.map((p) => ({ ...p, value: p.name === 'period' ? 20 : true }));
  assert.equal(edited[0].value, 20);
  assert.equal(restoreStrategyParams(store, 'jarvis', defaults)[0].value, 5);
  assert.deepEqual(restoreStrategyParams(store, 'other', defaults), defaults);
});

test('invalid saved values are ignored and new parameters retain their defaults', () => {
  const store = storage();
  store.setItem('candlelab-strategy-params:jarvis', '{"period":"wrong","onlyBuy":true,"removed":7}');
  const next = [...defaults, { name: 'onlySell', title: 'Tylko SELL', kind: 'bool', value: false }];
  assert.deepEqual(restoreStrategyParams(store, 'jarvis', next).map((p) => p.value), [5, true, false]);
  store.setItem('candlelab-strategy-params:jarvis', 'broken');
  assert.deepEqual(restoreStrategyParams(store, 'jarvis', defaults), defaults);
});