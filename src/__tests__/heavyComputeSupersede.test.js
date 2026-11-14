// Review 2026-09-30 (H11b): the heavy worker ran all ten analyses for every
// debounced edit even when a newer edit had already arrived. It now checks
// between analyses and stops a superseded job.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INPUTS } from '../calculator';
import { runHeavyAnalyses, FIRST_WAVE_STEPS } from '../heavyComputeWorker';

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

describe('two waves (performance audit 2026-11-13)', () => {
  it('sends the Dashboard and Tax analyses first, then everything', async () => {
    const partials = [];
    const r = await runHeavyAnalyses({ requestId: 3, inputs: DEFAULT_INPUTS, useRealDollars: false }, { pause: noPause, onPartial: (p) => partials.push(p) });
    expect(FIRST_WAVE_STEPS).toBe(10);
    expect(partials).toHaveLength(1);
    const p = partials[0];
    expect(p).toMatchObject({ requestId: 3, success: true, partial: true });
    for (const k of ['stressComparisonData', 'ssClaimingHeatmapData', 'rothBracketHeatmapData', 'optimizerResults', 'ageFinderResults',
      'sensitivityResults', 'rothLadderScheduleHeatmapData', 'guardrailsComparisonData', 'dieWithZeroLongevityData', 'minimumRequiredReturn']) {
      expect(p[k], k).toBeDefined();
      expect(p[k]).toEqual(r[k]);
    }
    expect(p.historicalStartsData).toBeUndefined();
    expect(p.feeComparisonData).toBeUndefined();
    expect(r.partial).toBeUndefined();
  }, 60000);

  it('works out the Premium-only history tables only when asked', async () => {
    const free = await runHeavyAnalyses({ requestId: 4, inputs: DEFAULT_INPUTS, useRealDollars: false, premiumTables: false }, { pause: noPause });
    expect(free.historicalStartsData).toBeTruthy();
    expect(free.historicalStartsData.byStockShare).toBeUndefined();
    expect(free.historicalStartsData.byRiskTarget).toBeUndefined();
    expect(free.historicalStartsData.safeMax).toBeDefined();
    const paid = await runHeavyAnalyses({ requestId: 5, inputs: DEFAULT_INPUTS, useRealDollars: false, premiumTables: true }, { pause: noPause });
    expect(paid.historicalStartsData.byStockShare).toBeDefined();
    expect(paid.historicalStartsData.byRiskTarget).toBeDefined();
  }, 120000);

  it('App merges the first wave into the last results and asks for the tables only with Premium or demo', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
    expect(app).toMatch(/if \(data\.success && data\.partial\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*setHeavyResults\(\(prev\) => \(\{\s*\.\.\.\(prev \|\| \{\}\)/);
    expect(app).toMatch(/const premiumTables = premiumJwtStatus\.valid \|\| demoActive;/);
    expect(app).toMatch(/worker\.postMessage\(\{ job: 'heavy', data: \{ requestId, inputs: debouncedInputs, useRealDollars, premiumTables \} \}\)/);
  });
});

describe('App.jsx heavy-compute wiring', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
  const effect = app.slice(app.indexOf('const runFallbackSync = () => {'), app.indexOf('}, [debouncedInputs, useRealDollars, premiumTables]);'));
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
  it('the two single-tab searches stay off the main thread while nothing shows them', () => {
    // The minimum required return comes from the heavy worker's first wave.
    expect(app).toMatch(/const minimumRequiredReturn = heavyResults\.minimumRequiredReturn \|\| null;/);
    expect(app).not.toMatch(/useIdleMemo\(\(\) => getMinimumRequiredReturn/);
    // Spend-to-zero is an idle memo keyed on the debounced inputs, skipped
    // unless Readiness or its chart is open.
    expect(app).toMatch(/const dieWithZeroResults = useIdleMemo\(\(\) => \{\s*const res = findDieWithZeroSpending\(debouncedInputs\)/);
    expect(app).toMatch(/skip: activeTab !== 'readiness' && maximizedComponent !== 'dieWithZero',/);
  });
});
