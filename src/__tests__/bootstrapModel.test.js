// Historical bootstrap for the Monte Carlo (changelog 267).
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runMonteCarlo } from '../calculator';
import { HISTORICAL_RETURNS, HISTORY_FIRST_YEAR, HISTORY_LAST_YEAR } from '../config/historicalReturns';
import { historicalPortfolioReturn, historicalGeometricMean, historicalMeanInflation, bootstrapPath, recenterReturn } from '../utils/bootstrap';

describe('the history table', () => {
  it('runs 1928 to the last full year, one row per year, with the pinned corner values', () => {
    expect(HISTORY_FIRST_YEAR).toBe(1928);
    expect(HISTORY_LAST_YEAR).toBe(2025);
    expect(HISTORICAL_RETURNS.length).toBe(HISTORY_LAST_YEAR - HISTORY_FIRST_YEAR + 1);
    HISTORICAL_RETURNS.forEach((r, i) => expect(r[0]).toBe(HISTORY_FIRST_YEAR + i));
    expect(HISTORICAL_RETURNS[0]).toEqual([1928, 43.81, 0.84, -1.2]);
    expect(HISTORICAL_RETURNS.find((r) => r[0] === 1974)).toEqual([1974, -25.9, 1.99, 11.1]);
    expect(HISTORICAL_RETURNS.find((r) => r[0] === 2008)).toEqual([2008, -36.55, 20.1, 3.8]);
    expect(HISTORICAL_RETURNS[HISTORICAL_RETURNS.length - 1]).toEqual([2025, 17.78, 7.8, 2.6]);
  });

  it('a 60/40 mix compounds at roughly 8-9% and inflation averages about 3%', () => {
    expect(historicalPortfolioReturn([1974, -25.9, 1.99, 11.1], 60)).toBeCloseTo(0.6 * -25.9 + 0.4 * 1.99, 9);
    const g = historicalGeometricMean(60);
    expect(g).toBeGreaterThan(7.5);
    expect(g).toBeLessThan(9.5);
    expect(historicalGeometricMean(100)).toBeGreaterThan(historicalGeometricMean(0));
    const cpi = historicalMeanInflation();
    expect(cpi).toBeGreaterThan(2.5);
    expect(cpi).toBeLessThan(3.5);
  });
});

describe('bootstrapPath and recentering', () => {
  it('copies consecutive rows in blocks, wrapping at the end, one draw per block', () => {
    const draws = [0.5, 0.999, 0];
    let k = 0;
    const path = bootstrapPath(9, 4, () => draws[k++]);
    const n = HISTORICAL_RETURNS.length;
    const s1 = Math.floor(0.5 * n);
    expect(path.slice(0, 4)).toEqual([s1, s1 + 1, s1 + 2, s1 + 3]);
    expect(path.slice(4, 8)).toEqual([n - 1, 0, 1, 2]); // wraps
    expect(path[8]).toBe(0);
    expect(k).toBe(3);
  });

  it('recentering moves the compound mean to the plan’s rate and keeps the shape', () => {
    const g = historicalGeometricMean(60);
    // The whole history recentered from g to 7% compounds at exactly 7%.
    let logSum = 0;
    for (const row of HISTORICAL_RETURNS) logSum += Math.log(1 + recenterReturn(historicalPortfolioReturn(row, 60), g, 7) / 100);
    expect((Math.exp(logSum / HISTORICAL_RETURNS.length) - 1) * 100).toBeCloseTo(7, 9);
    // A wipeout stays a wipeout-shaped year: ordering is preserved.
    expect(recenterReturn(-37, g, 7)).toBeLessThan(recenterReturn(-10, g, 7));
    expect(recenterReturn(-100, g, 7)).toBe(-100);
  });
});

describe('runMonteCarlo under the bootstrap', () => {
  const plan = { ...DEFAULT_INPUTS, spouse2Enabled: false, monteCarloSeed: 5 };
  it('is off by default, reports the model, always samples inflation, and is reproducible', { timeout: 90000 }, () => {
    expect(DEFAULT_INPUTS.mcReturnModel).toBe('lognormal');
    const a = runMonteCarlo({ ...plan, mcReturnModel: 'bootstrap' });
    const b = runMonteCarlo({ ...plan, mcReturnModel: 'bootstrap' });
    expect(a.returnModel).toBe('bootstrap');
    expect(a.bootstrapBlockYears).toBe(5);
    expect(a.bootstrapCenter).toBe('plan');
    expect(a.historyRange).toBe('1928–2025');
    expect(a.inflationSampled).toBe(true);
    expect(a.successProbability).toBe(b.successProbability);
    expect(a.endingP50).toBe(b.endingP50);
    const ln = runMonteCarlo(plan);
    expect(ln.returnModel).toBe('lognormal');
    expect(ln.bootstrapBlockYears).toBeNull();
    // A different model gives a different answer.
    expect(a.endingP50).not.toBe(ln.endingP50);
  });

  it('re-centered on the plan lands near the lognormal median; as-history compounds where history did', { timeout: 90000 }, () => {
    // A plan too big to deplete, so the ending-balance distribution is the
    // return distribution and not a depletion floor.
    const rich = { ...plan, preTaxInit: 3000000, taxableInit: 2000000 };
    const ln = runMonteCarlo(rich);
    const centered = runMonteCarlo({ ...rich, mcReturnModel: 'bootstrap' });
    const raw = runMonteCarlo({ ...rich, mcReturnModel: 'bootstrap', mcBootstrapCenter: 'history' });
    // Same level, different shape: the medians agree within 20%.
    expect(centered.endingP50).toBeGreaterThan(ln.endingP50 * 0.8);
    expect(centered.endingP50).toBeLessThan(ln.endingP50 * 1.2);
    // History's 60/40 compounded well above the plan's 5% retired rate.
    expect(historicalGeometricMean(60)).toBeGreaterThan(DEFAULT_INPUTS.postRetireReturn);
    expect(raw.endingP50).toBeGreaterThan(centered.endingP50 * 1.5);
    expect(raw.bootstrapCenter).toBe('history');
  });

  it('block length changes the path; block 1 is an i.i.d. draw from history', { timeout: 90000 }, () => {
    const rich = { ...plan, preTaxInit: 3000000, taxableInit: 2000000 };
    const b5 = runMonteCarlo({ ...rich, mcReturnModel: 'bootstrap', mcBootstrapBlockYears: 5 });
    const b1 = runMonteCarlo({ ...rich, mcReturnModel: 'bootstrap', mcBootstrapBlockYears: 1 });
    expect(b1.bootstrapBlockYears).toBe(1);
    expect(b1.endingP10).not.toBe(b5.endingP10);
  });
});
