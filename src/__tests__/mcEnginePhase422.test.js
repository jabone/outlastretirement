// Changelog 422: a Monte Carlo trial hands the engine its random draw and
// the engine prices it in the phase it is actually in, so the Survivor
// Stress Test, a fatal long-term-care episode and the glide path shape a
// trial exactly as they shape the plan. The trial loop used to work out
// the phase on its own and ignore the stress test.
import { describe, it, expect } from 'vitest';
import { runMonteCarlo, runProjection, DEFAULT_INPUTS } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
// A couple where the stress death changes the phase: Spouse 2 works to 70
// but the stress test has them die at 66, so the household is retired
// from Spouse 1's 65 instead of waiting for Spouse 2.
const couple = {
  ...DEFAULT_INPUTS, spouse2Enabled: true, filingStatus: 'MFJ',
  birthYear1: START - 62, birthYear2: START - 60, retireAge1: 65, retireAge2: 70,
  lifeExpectancy1: 90, lifeExpectancy2: 90, salary1: 120000, salary2: 120000,
  preTaxInit: 1500000, taxableInit: 400000, rothInit: 200000, lifestyleExpense: 110000,
  survivorStressEnabled: true, survivorStressSpouse: 2, survivorStressAge: 66,
  volatilityPre: 0, volatilityPost: 0, monteCarloSeed: 7,
  acaCreditSource: 'manual', itemizeDeductions: 'never', taxableQualifiedDividendFollowsAllocation: false,
};

describe('the engine owns the phase in a Monte Carlo trial', () => {
  it('at zero volatility the median trial sits on the deterministic line with the Survivor Stress Test on', () => {
    const plan = runProjection(couple);
    const mc = runMonteCarlo(couple);
    expect(mc.endingP50).toBeCloseTo(plan.endingBalance, -2);
  });

  it('at zero volatility every trial year matches the plan year', () => {
    const plan = runProjection(couple);
    const mc = runMonteCarlo(couple);
    const rows = mc.growthCurves;
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      const y = plan.years.find((p) => p.year === r.year);
      if (!y) continue;
      expect(r.p50).toBeCloseTo(y.totalPortfolioEnding, -3);
    }
  });

  it('a numeric override is still an absolute return', () => {
    const r = {}; r[START] = -30;
    const hit = runProjection(couple, r, null).years[0];
    expect(hit.growthRate).toBe(-30);
  });

  it('a draw of zero is the base return of the phase the engine is in', () => {
    const z = {}; for (let y = START; y <= START + 40; y += 1) z[y] = { z: 0 };
    const withVol = { ...couple, volatilityPre: 15, volatilityPost: 11 };
    const plan = runProjection(withVol);
    const trial = runProjection(withVol, z, null);
    for (let i = 0; i < plan.years.length; i += 1) {
      // A zero draw is the median of the lognormal, which is the stated
      // compound return: the same number the plan used.
      expect(trial.years[i].growthRate).toBeCloseTo(plan.years[i].growthRate, 6);
    }
  });
});
