// Review 2026-09-30 (H11b): the heavy worker ran all ten analyses for every
// debounced edit even when a newer edit had already arrived. It now checks
// between analyses and stops a superseded job.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INPUTS } from '../calculator';
import { runHeavyAnalyses } from '../heavyComputeWorker';

const noPause = () => Promise.resolve();

describe('runHeavyAnalyses', () => {
  it('stops at the next analysis once a newer request is current, and returns nothing to post', async () => {
    let checks = 0;
    // Current for the first analysis only.
    const isCurrent = () => (checks++ === 0);
    const r = await runHeavyAnalyses({ requestId: 1, inputs: DEFAULT_INPUTS, useRealDollars: false }, { isCurrent, pause: noPause });
    expect(r).toEqual({ requestId: 1, superseded: true });
    expect(checks).toBe(2);
  });

  it('a request that stays current returns all ten results', async () => {
    const r = await runHeavyAnalyses({ requestId: 7, inputs: DEFAULT_INPUTS, useRealDollars: false }, { pause: noPause });
    expect(r.success).toBe(true);
    expect(r.requestId).toBe(7);
    for (const k of ['stressComparisonData', 'ssClaimingHeatmapData', 'rothBracketHeatmapData', 'optimizerResults', 'ageFinderResults',
      'sensitivityResults', 'rothLadderScheduleHeatmapData', 'guardrailsComparisonData', 'dieWithZeroLongevityData', 'historicalStartsData']) {
      expect(r[k], k).toBeDefined();
    }
  }, 60000);
});

describe('App.jsx heavy-compute wiring', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
  const effect = app.slice(app.indexOf('const runFallbackSync = () => {'), app.indexOf('}, [debouncedInputs, useRealDollars]);'));
  it('a crashed worker is retried, not replaced by main-thread work on every edit', () => {
    const onerror = effect.slice(effect.indexOf('worker.onerror'), effect.indexOf('worker.postMessage'));
    expect(onerror).toMatch(/post\(\)/);
    expect(onerror).not.toMatch(/runFallbackSync\(\)/);
  });
  it('the main-thread fallback only ever runs on idle', () => {
    const direct = [...effect.matchAll(/runFallbackSync\(\)/g)].length;
    expect(direct).toBe(0);
    expect(effect).toMatch(/runWhenIdle\(runFallbackSync/);
  });
  it('the two single-tab searches are idle memos keyed on the debounced inputs', () => {
    expect(app).toMatch(/const minimumRequiredReturn = useIdleMemo\(\(\) => getMinimumRequiredReturn\(debouncedInputs\), \[debouncedInputs\]\)/);
    expect(app).toMatch(/const dieWithZeroResults = useIdleMemo\(\(\) => \{\s*const res = findDieWithZeroSpending\(debouncedInputs\)/);
  });
});
