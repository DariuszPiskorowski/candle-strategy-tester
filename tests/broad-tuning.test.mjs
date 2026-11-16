import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('broad tuning respects the unique-test budget and four calendar months', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orca-tuning-'));
  try {
    const cfg = JSON.parse(readFileSync('ai-gateway/config.json', 'utf8'));
    cfg.dataDir = path.resolve('data');
    cfg.saveBest = false;
    cfg.tune.maxTests = 5;
    cfg.tune.randomTests = 20;
    writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
    execFileSync('bun', ['scripts/tune-sui.mjs', path.join(dir, 'config.json')]);
    const result = JSON.parse(readFileSync(path.join(dir, 'results.json'), 'utf8'));
    assert.equal(result.uniqueTests, 5);
    assert.equal(result.strategy.savedDefaults, false);
    const expected = new Date(result.data.testEnd);
    expected.setUTCMonth(expected.getUTCMonth() - 4);
    assert.equal(result.data.testStart, expected.toISOString());
    assert.equal(result.best.params.onlyBuy, false);
    assert.equal(result.best.params.onlySell, false);
    assert.equal(result.best.params.res, 'D');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});