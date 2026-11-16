import assert from 'node:assert/strict';
import test from 'node:test';
import { ORCA_MARKET, orcaOhlcvUrl, parseOrcaCandles } from '../src/lib/orca.ts';

test('SOL/USDC uses the requested Orca pool, quoted in USDC rather than USD', () => {
  const url = new URL(orcaOhlcvUrl('4h', 1700000000));
  assert.equal(ORCA_MARKET.base, 'SOL');
  assert.equal(ORCA_MARKET.quote, 'USDC');
  assert.equal(url.pathname, '/api/v2/networks/solana/pools/Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE/ohlcv/hour');
  assert.equal(url.searchParams.get('currency'), 'token');
  assert.equal(url.searchParams.get('token'), 'base');
  assert.equal(url.searchParams.get('aggregate'), '4');
  assert.equal(url.searchParams.get('before_timestamp'), '1700000000');
});

test('Orca candles preserve exchange timestamps and SOL prices', () => {
  const candles = parseOrcaCandles({ data: { attributes: { ohlcv_list: [
    [1700014400, 101, 103, 100, 102, 500], [1700000000, 100, 102, 99, 101, 400],
  ] } } });
  assert.deepEqual(candles.map(c => c.time), [1700000000, 1700014400]);
  assert.equal(candles[0].close, 101);
  assert.equal(candles[1].close, 102);
  assert.throws(() => orcaOhlcvUrl('2h'));
});