// Changelog 363: the verdict's every-retirement-since-1928 fallback, and
// the Monte Carlo range behind the Dashboard's savings chart.
import { describe, it, expect } from 'vitest';
import { planVerdict } from '../utils/planVerdict';
import { growthRange } from '../utils/growthRange';
import { growthSummary } from '../utils/chartSummaries';

const H = (lasted, count = 98) => ({ lasted, count, firstStart: 1928 });

describe('the verdict without a Monte Carlo result', () => {
  it('reads the real retirements since 1928 on the Monte Carlo bands', () => {
    expect(planVerdict({ isSuccessful: true, history: H(95) }).label).toBe('On track');   // 96.9%
    expect(planVerdict({ isSuccessful: true, history: H(84) }).label).toBe('Mostly on track'); // 85.7%
    const risk = planVerdict({ isSuccessful: true, history: H(60) });
    expect(risk.label).toBe('At risk');
    expect(risk.detail).toMatch(/through only 60 of 98 real retirements since 1928/);
  });

  it('a fresh Monte Carlo always decides, whatever history says', () => {
    const v = planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 70, trials: 1000 }, history: H(97) });
    expect(v.label).toBe('At risk');
    // ...while the history is still quoted as a second line (changelog 364).
    expect(v.detail).toMatch(/only 70% of 1,000 simulated markets last to the end of the plan\. It also lasted through 97 of 98 real retirements since 1928\./);
    expect(planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 95 } }).detail).not.toMatch(/1928/);
  });

  it('a stale Monte Carlo gives way to history', () => {
    expect(planVerdict({ isSuccessful: true, mc: { status: 'stale' }, history: H(97) }).label).toBe('On track');
  });

  it('says what history shows while the Monte Carlo runs', () => {
    const v = planVerdict({ isSuccessful: true, mcPending: true, history: H(90) });
    expect(v.tone).toBe('pending');
    expect(v.detail).toMatch(/90 of 98 real retirements since 1928/);
  });

  it('Runs short still wins, and names the history', () => {
    const v = planVerdict({ isSuccessful: false, years: [{ year: 2050, shortfall: 1000 }], history: H(20) });
    expect(v.label).toBe('Runs short');
    expect(v.detail).toMatch(/starting in 2050\. It lasted through 20 of 98/);
  });

  it('with neither, it is still Lasts on average', () => {
    expect(planVerdict({ isSuccessful: true }).label).toBe('Lasts on average');
    expect(planVerdict({ isSuccessful: true, history: { lasted: 0, count: 0 } }).label).toBe('Lasts on average');
  });
});

describe('the range on the savings chart', () => {
  const mc = { growthCurves: [{ year: 2030, p10: -5, p50: 10, p90: 20 }, { year: 2031, p10: 100, p50: 200, p90: 300 }] };
  it('is drawn only for a fresh Monte Carlo and no crash test', () => {
    expect(growthRange(mc, { status: 'fresh' }, { stressType: 'none' })).toEqual([{ year: 2030, p10: 0, p90: 20 }, { year: 2031, p10: 100, p90: 300 }]);
    expect(growthRange(mc, { status: 'stale' }, { stressType: 'none' })).toBeNull();
    expect(growthRange(mc, { status: 'fresh' }, { stressType: '2008' })).toBeNull();
    expect(growthRange(null, { status: 'fresh' }, {})).toBeNull();
  });

  it('the chart summary names it', () => {
    const years = [{ year: 2030, totalPortfolioEnding: 1000000 }, { year: 2031, totalPortfolioEnding: 1100000 }];
    expect(growthSummary(years)).not.toMatch(/simulated/);
    expect(growthSummary(years, [{ year: 2031, p10: 500000, p90: 2000000 }])).toMatch(/in 8 of 10 simulated markets savings in 2031 end between/);
  });
});
