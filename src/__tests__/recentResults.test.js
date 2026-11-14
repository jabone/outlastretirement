// Undo and scenario switches reuse the last few results (performance audit
// 2026-11-13) instead of running the heavy analyses and Monte Carlo again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { recentResults } from '../utils/recentResults';

describe('recent results', () => {
  it('keeps the newest few by key, dropping the least recently used', () => {
    const m = recentResults(2);
    m.set('a', 1);
    m.set('b', 2);
    expect(m.get('a')).toBe(1); // a is now the most recent
    m.set('c', 3);
    expect(m.get('b')).toBeUndefined();
    expect(m.get('a')).toBe(1);
    expect(m.get('c')).toBe(3);
    expect(m.size).toBe(2);
  });
  it('ignores missing keys and values', () => {
    const m = recentResults(2);
    m.set(null, 1);
    m.set('a', null);
    expect(m.size).toBe(0);
    expect(m.get(undefined)).toBeUndefined();
  });

  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.jsx'), 'utf8');
  it('the heavy analyses use a remembered result before posting to the worker', () => {
    const effect = app.slice(app.indexOf('const requestId = ++heavyRequestIdRef.current;'), app.indexOf("worker.postMessage({ job: 'heavy'"));
    expect(effect).toMatch(/const memoKey = `\$\{planKey\(debouncedInputs\)\}\|\$\{useRealDollars\}\|\$\{premiumTables\}`;/);
    expect(effect.indexOf('heavyMemoryRef.current.get(memoKey)')).toBeLessThan(effect.indexOf('setHeavyResultsLoading(true)'));
    expect(effect).toMatch(/heavyMemoryRef\.current\.set\(memoKey, full\)/);
    expect(effect).toMatch(/heavyMemoryRef\.current\.set\(memoKey, result\)/);
  });
  it('the Monte Carlo auto-run uses a remembered result instead of running', () => {
    expect(app).toMatch(/const remembered = mcMemoryRef\.current\.get\(currentPlanKey\);\s*if \(remembered\) \{\s*setMonteCarlo\(remembered\);\s*setMcKey\(currentPlanKey\);/);
    expect(app).toMatch(/mcMemoryRef\.current\.set\(runKey, e\.data\.results\)/);
  });
});
