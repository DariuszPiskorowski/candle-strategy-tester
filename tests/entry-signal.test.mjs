import assert from 'node:assert/strict';
import test from 'node:test';
import { entrySignal } from '../src/strategies/sol-ha4-ls/entry-signal.ts';

const ready = { enabled:true, ha4h:true, dailyHa:true, range:false, afterStop:false, quantity:1 };
const context = { hasData:true, inWindow:true, accountBusy:false };
test('daily HA BUY blocks a new SELL even when SELL 4H HA is bearish', () => {
  const r = entrySignal({...ready, ha4h:false}, {...ready, dailyHa:false}, context);
  assert.equal(r.signal, 'CZEKAJ');
  assert.deepEqual(r.sell, ['dailyHa']);
});
test('daily HA SELL blocks BUY independently from SELL filters', () => {
  const r = entrySignal({...ready, dailyHa:false}, {...ready, range:true}, context);
  assert.equal(r.signal, 'CZEKAJ');
  assert.deepEqual(r.buy, ['dailyHa']);
  assert.deepEqual(r.sell, ['range']);
});
test('eligible SELL is shown only when all its entry conditions pass', () => {
  assert.equal(entrySignal({...ready, ha4h:false}, ready, context).signal, 'SELL');
});
test('eligible BUY has source priority over an eligible SELL', () => {
  assert.equal(entrySignal(ready, ready, context).signal, 'BUY');
});
test('an occupied account blocks new entries without presenting its position as a signal', () => {
  const r = entrySignal(ready, ready, {...context, accountBusy:true});
  assert.equal(r.signal, 'CZEKAJ');
  assert.deepEqual(r.common, ['accountBusy']);
});
for (const [key, value, blocker] of [
  ['enabled',false,'disabled'], ['range',true,'range'], ['afterStop',true,'afterStop'], ['quantity',0,'quantity'],
]) test(`${blocker} prevents a new SELL`, () => {
  const r = entrySignal({...ready, enabled:false}, {...ready, [key]:value}, context);
  assert.equal(r.signal, 'CZEKAJ');
  assert.deepEqual(r.sell, [blocker]);
});
for (const [key, blocker] of [['hasData','noData'], ['inWindow','outsideWindow']]) test(`${blocker} blocks both directions`, () => {
  const r = entrySignal(ready, ready, {...context, [key]:false});
  assert.equal(r.signal, 'CZEKAJ');
  assert.deepEqual(r.common, [blocker]);
});