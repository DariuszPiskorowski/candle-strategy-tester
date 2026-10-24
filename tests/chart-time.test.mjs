import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChartTime } from '../src/lib/chart-time.ts';

test('Dublin candle starting at midnight UTC on October 24 displays 01:00', () => {
  assert.equal(formatChartTime(Date.parse('2026-10-24T00:00:00Z') / 1000, 3), '01:00');
});

test('Dublin automatically returns to GMT after the winter time change', () => {
  assert.equal(formatChartTime(Date.parse('2026-10-26T00:00:00Z') / 1000, 3), '00:00');
});

test('formatting does not move the four-hour candle timestamps', () => {
  const start = Date.parse('2026-10-24T00:00:00Z') / 1000;
  const end = start + 4 * 3600;
  assert.equal(formatChartTime(end, 3), '05:00');
  assert.equal(end - start, 14400);
});