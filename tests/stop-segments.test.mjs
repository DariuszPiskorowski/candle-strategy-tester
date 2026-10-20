import assert from 'node:assert/strict';
import test from 'node:test';
import { stopSegments } from '../src/components/chart/stop-segments.ts';

test('inactive periods never connect two active stop intervals', () => {
  assert.deepEqual(stopSegments([
    {time: 1, value: 90}, {time: 2, value: 90}, {time: 3},
    {time: 4, value: 90}, {time: 5, value: 90},
  ]), [
    [{time: 1, value: 90}, {time: 2, value: 90}],
    [{time: 4, value: 90}, {time: 5, value: 90}],
  ]);
});

test('a changed stop level starts a separate horizontal interval', () => {
  assert.deepEqual(stopSegments([
    {time: 1, value: 90}, {time: 2, value: 90},
    {time: 3, value: 95}, {time: 4, value: 95},
  ]), [
    [{time: 1, value: 90}, {time: 2, value: 90}],
    [{time: 3, value: 95}, {time: 4, value: 95}],
  ]);
});

test('new positions do not connect even with an identical stop level', () => {
  assert.equal(stopSegments([
    {time: 1, value: 90}, {time: 2, value: 90},
    {time: 3, value: 90}, {time: 4, value: 90},
  ], [1, 3]).length, 2);
});