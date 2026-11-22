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
    // The tuner only searches in tune mode; the shipped config stays on evaluate.
    cfg.mode = 'tune';
    cfg.tune.maxTests = 5;
    cfg.tune.randomTests = 20;
    cfg.tune.parameters = [
      { name: 'haL1L', min: 20, max: 80, step: 5 },
      { name: 'haL2L', min: 5, max: 30, step: 5 },
      { name: 'kL', min: 0.5, max: 3, step: 0.25 },
      { name: 'dwellL', min: 16, max: 64, step: 4 },
    ];
    writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
    execFileSync('bun', ['scripts/tune-sui.mjs', path.join(dir, 'config.json')]);
    const result = JSON.parse(readFileSync(path.join(dir, 'results.json'), 'utf8'));
    assert.equal(result.uniqueTests, 5);
    assert.equal(result.strategy.savedDefaults, false);
    const expected = new Date(result.data.testEnd);
    expected.setUTCMonth(expected.getUTCMonth() - 4);
    assert.equal(result.data.testStart, expected.toISOString());
    assert.equal(result.strategy.id, 'sol-ha4-ls');
    for (const key of ['exchLev', 'haL1L', 'haL2L', 'kL', 'dwellL']) assert.ok(key in result.best.params, key);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
