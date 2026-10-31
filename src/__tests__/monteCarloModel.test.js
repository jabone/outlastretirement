// Changelog 247 -- the Monte Carlo's return model.
//
// Four claims, each with a mutation that was watched to go red:
//   1. Runs are reproducible for a seed, and the seed matters.
//      (remove the seed -> 'identical twice' fails; ignore it -> 'differs' fails)
//   2. The lognormal draw's MEDIAN is the stated compound return and its
//      arithmetic standard deviation is the stated volatility.
//      (normal-with-mean formula -> the median test fails by ~25%)
//   3. Inflation uncertainty is off by default and inert when off; on, a
//      year sampled at the planned rate is bit-identical to no override.
//      (drop the delta -> the 'planned rate is identity' test fails)
//   4. Plans still on the old 8% retired default are migrated; a chosen
//      value is not.
//
// Input-key traps (DEVELOPMENT.md): every key below is verified against
// DEFAULT_INPUTS by the vacuity guard at the bottom.
import { describe, it, expect } from 'vitest';
import {
  runMonteCarlo, runProjection, migrateInputs, sanitizeInputs,
  mulberry32, lognormalReturnParams, derivedVolatility,
} from '../calculator';
// The reference household (the pre-467 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';
import { probAliveAt, probAnyAlive } from '../utils/mortality';

const USED_KEYS = [
  'monteCarloSeed', 'volatilityPre', 'volatilityPost', 'mcInflationEnabled',
  'mcInflationVolatility', 'mcInflationReturnCorrelation', 'stockAllocationPost',
  'preTaxInit', 'taxableInit', 'rothInit', 'hsaInit', 'salary1', 'ss1',
  'lifestyleExpense', 'preRetireReturn', 'postRetireReturn', 'inflationRate',
  'housingInflationRate', 'planYear', 'birthYear1', 'retireAge1',
  'lifeExpectancy1', 'spouse2Enabled', 'mcLongevityEnabled', 'sex1', 'sex2', 'birthYear2', 'lifeExpectancy2',
];

describe('vacuity guard', () => {
  it('every input key this file sets exists in DEFAULT_INPUTS', () => {
    const missing = USED_KEYS.filter((k) => !(k in DEFAULT_INPUTS));
    expect(missing).toEqual([]);
  });
});

describe('mulberry32', () => {
  it('is deterministic for a seed and different across seeds', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    const seqC = Array.from({ length: 5 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const u of seqA) { expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThan(1); }
  });
});

describe('lognormalReturnParams', () => {
  it('median is the stated compound rate; sd is the stated volatility', () => {
    const g = 0.07, sigma = 0.15;
    const { m, s, mean } = lognormalReturnParams(g, sigma);
    expect(m).toBeCloseTo(1.07, 12);
    // Analytic variance of m*exp(s*z) must equal sigma^2.
    const variance = m * m * Math.exp(s * s) * (Math.exp(s * s) - 1);
    expect(Math.sqrt(variance)).toBeCloseTo(sigma, 10);
    // Arithmetic mean sits above the compound rate by ~sigma^2/2.
    expect(mean).toBeGreaterThan(g);
    expect(mean).toBeCloseTo(g + (sigma * sigma) / 2, 2);
  });

  it('zero volatility collapses to the deterministic rate', () => {
    const { s, mean } = lognormalReturnParams(0.05, 0);
    expect(s).toBe(0);
    expect(mean).toBeCloseTo(0.05, 12);
  });

  it('a stated rate at or below -100% has no positive median', () => {
    expect(lognormalReturnParams(-1, 0.15).m).toBe(0);
  });

  it('sampled median matches the stated rate (20,000 seeded draws)', () => {
    const g = 0.07, sigma = 0.15;
    const { m, s } = lognormalReturnParams(g, sigma);
    const rng = mulberry32(7);
    const draws = [];
    for (let i = 0; i < 20000; i++) {
      let u = 0, v = 0;
      while (u === 0) u = rng();
      while (v === 0) v = rng();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      draws.push(m * Math.exp(s * z) - 1);
    }
    draws.sort((a, b) => a - b);
    expect(draws[10000]).toBeCloseTo(g, 2);
    expect(Math.min(...draws)).toBeGreaterThan(-1);
  });
});

describe('runMonteCarlo is reproducible for its seed', () => {
  const plan = { ...DEFAULT_INPUTS, monteCarloSeed: 12345 };

  it('the same plan and seed give identical results twice', () => {
    const a = runMonteCarlo(plan);
    const b = runMonteCarlo(plan);
    expect(a.successProbability).toBe(b.successProbability);
    expect(a.endingP50).toBe(b.endingP50);
    expect(a.growthCurves).toEqual(b.growthCurves);
    expect(a.seed).toBe(12345);
    expect(a.returnModel).toBe('lognormal');
    expect(a.trials).toBe(1000);
  }, 60000); // full Monte Carlo runs: well over vitest's 5 s default on a loaded CI runner

  it('a different seed gives different trials', () => {
    const a = runMonteCarlo(plan);
    const b = runMonteCarlo({ ...plan, monteCarloSeed: 54321 });
    expect(a.endingP50).not.toBe(b.endingP50);
  });

  it('a missing or zero seed is treated as 1, not as 0', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, monteCarloSeed: undefined }).monteCarloSeed).toBe(1);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, monteCarloSeed: 0 }).monteCarloSeed).toBe(1);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, monteCarloSeed: 9.7 }).monteCarloSeed).toBe(9);
  });
});

describe('the median trial compounds at the stated return', () => {
  // A pure-growth fixture: one person, a Roth only, no income and no
  // spending, so the ending balance is rothInit times the product of the
  // sampled gross returns. The median of a product of lognormals is the
  // product of their medians, i.e. the deterministic plan. The old
  // normal-with-mean draw put the median near (1 + g - sigma^2/2)^N, about
  // 25% below (1 + g)^N over these 30 years -- well outside the tolerance.
  const fixture = {
    ...DEFAULT_INPUTS,
    spouse2Enabled: false,
    planYear: 2026, birthYear1: 1966, retireAge1: 60, lifeExpectancy1: 89,
    preTaxInit: 0, taxableInit: 0, hsaInit: 0, rothInit: 1000000,
    salary1: 0, ss1: 0, lifestyleExpense: 0,
    preRetireReturn: 7, postRetireReturn: 7,
    volatilityPre: 15, volatilityPost: 15,
    monteCarloSeed: 2026,
  };

  it('endingP50 lands within 10% of the deterministic ending balance', () => {
    const det = runProjection(fixture).endingBalance;
    expect(det).toBeGreaterThan(1000000); // the fixture really is pure growth
    const mc = runMonteCarlo(fixture);
    expect(Math.abs(mc.endingP50 / det - 1)).toBeLessThan(0.10);
    // And the distribution is genuinely wide -- this is not a zero-vol run.
    expect(mc.endingP90 / mc.endingP10).toBeGreaterThan(2);
  });

  it('zero volatility repeats the deterministic plan in every trial', () => {
    const flat = { ...fixture, volatilityPre: 0, volatilityPost: 0 };
    const det = runProjection(flat).endingBalance;
    const mc = runMonteCarlo(flat);
    expect(mc.endingP10).toBeCloseTo(det, 2);
    expect(mc.endingP90).toBeCloseTo(det, 2);
  });
});

describe('inflation uncertainty', () => {
  it('is off by default', () => {
    expect(DEFAULT_INPUTS.mcInflationEnabled).toBe(false);
  });

  it('when off, the inflation settings are inert', () => {
    const a = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 5, mcInflationVolatility: 1.5 });
    const b = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 5, mcInflationVolatility: 9 });
    expect(a.growthCurves).toEqual(b.growthCurves);
    expect(a.inflationSampled).toBe(false);
  });

  it('when on, the sampled figures move the result and the run says so', () => {
    // Both runs are ON, so both consume the same draw sequence (the
    // inflation draw is taken even at zero volatility -- see runMonteCarlo).
    // Only the applied inflation differs, so this goes red if the sampled
    // figure is computed but never reaches runProjection. Comparing ON
    // against OFF would not: OFF skips a draw per year and re-sequences the
    // returns, so the results would move even with inflation ignored.
    const quiet = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 5, mcInflationEnabled: true, mcInflationVolatility: 0 });
    const noisy = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 5, mcInflationEnabled: true, mcInflationVolatility: 3 });
    expect(noisy.inflationSampled).toBe(true);
    expect(quiet.endingP50).not.toBe(noisy.endingP50);
  });

  it('an override at exactly the planned rate is bit-identical to no override', () => {
    // Housing runs at its own rate here, so the old 'replace the rate'
    // behavior (the stress-test path) would have moved Housing to 2.5%
    // and changed the numbers; the delta design must not.
    const plan = { ...DEFAULT_INPUTS, housingInflationRate: 4 };
    const years = {};
    const returns = {};
    for (let y = plan.planYear; y <= plan.planYear + 60; y++) { years[y] = plan.inflationRate; returns[y] = 6; }
    const a = runProjection(plan, returns);
    const b = runProjection(plan, returns, years);
    expect(b.endingBalance).toBe(a.endingBalance);
    expect(b.years.map((r) => r.totalExpenses)).toEqual(a.years.map((r) => r.totalExpenses));
  });

  it('a higher sampled rate raises lifestyle spending, and only from the next year', () => {
    const plan = { ...DEFAULT_INPUTS, housingInflationRate: 4 };
    const returns = {}, hot = {};
    for (let y = plan.planYear; y <= plan.planYear + 60; y++) { returns[y] = 6; hot[y] = plan.inflationRate + 5; }
    const base = runProjection(plan, returns);
    const inflated = runProjection(plan, returns, hot);
    let higher = 0;
    for (let i = 1; i < base.years.length; i++) {
      if (inflated.years[i].lifestyleMultiplier > base.years[i].lifestyleMultiplier) higher++;
    }
    expect(higher).toBe(base.years.length - 1);
    expect(inflated.years[0].lifestyleMultiplier).toBe(base.years[0].lifestyleMultiplier);
  });

  it('clamps the correlation to [-1, 1]', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, mcInflationReturnCorrelation: -3 }).mcInflationReturnCorrelation).toBe(-1);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, mcInflationReturnCorrelation: 2 }).mcInflationReturnCorrelation).toBe(1);
  });
});

describe('retired-volatility migration', () => {
  it('derives 11.6 at 60/40 and scales with the mix', () => {
    expect(derivedVolatility(60)).toBe(11.6);
    expect(derivedVolatility(100)).toBe(16);
    expect(derivedVolatility(0)).toBe(5);
    expect(derivedVolatility(undefined)).toBe(11.6);
  });

  it('lifts a pre-247 plan still on the old 8% default', () => {
    const migrated = migrateInputs({ ...DEFAULT_INPUTS, volatilityPost: 8, monteCarloSeed: undefined });
    expect(migrated.volatilityPost).toBe(11.6);
  });

  it('uses the plan\'s own retired mix', () => {
    const migrated = migrateInputs({ ...DEFAULT_INPUTS, volatilityPost: 8, stockAllocationPost: 80, monteCarloSeed: undefined });
    expect(migrated.volatilityPost).toBe(13.8);
  });

  it('leaves a chosen value alone, and a plan saved after 247', () => {
    expect(migrateInputs({ ...DEFAULT_INPUTS, volatilityPost: 9, monteCarloSeed: undefined }).volatilityPost).toBe(9);
    expect(migrateInputs({ ...DEFAULT_INPUTS, volatilityPost: 8, monteCarloSeed: 1 }).volatilityPost).toBe(8);
  });

  it('the shipped default is the derived figure', () => {
    expect(DEFAULT_INPUTS.volatilityPost).toBe(derivedVolatility(DEFAULT_INPUTS.stockAllocationPost));
  });
});

describe('longevity uncertainty (changelog 248)', () => {
  it('is off by default, and off reports no trials beyond the horizon', () => {
    expect(DEFAULT_INPUTS.mcLongevityEnabled).toBe(false);
    const off = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 9 });
    expect(off.longevitySampled).toBe(false);
    expect(off.beyondHorizonPct).toBe(0);
  });

  it('on, the sampled lifespans reach the projection', () => {
    // Trial t's market path is identical on and off (own generator per
    // trial, life draws on a separate stream), so any difference here is
    // the deaths themselves. Goes red if the sampled ages are drawn but the
    // trial still runs to the planned Life Expectancy.
    const off = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 9 });
    const on = runMonteCarlo({ ...DEFAULT_INPUTS, monteCarloSeed: 9, mcLongevityEnabled: true });
    expect(on.longevitySampled).toBe(true);
    expect(on.endingP50).not.toBe(off.endingP50);
    expect(on.growthCurves).toHaveLength(off.growthCurves.length);
  });

  it('the share of trials past the horizon matches the life table', () => {
    const plan = { ...DEFAULT_INPUTS, monteCarloSeed: 9, mcLongevityEnabled: true, sex1: 'male', sex2: 'female' };
    const age1 = plan.planYear - plan.birthYear1;
    const age2 = plan.planYear - plan.birthYear2;
    // Beyond the horizon = someone alive at their Life Expectancy + 1.
    const p1 = probAliveAt('male', age1, plan.lifeExpectancy1 + 1);
    const p2 = plan.spouse2Enabled ? probAliveAt('female', age2, plan.lifeExpectancy2 + 1) : 0;
    const expected = probAnyAlive(p1, p2) * 100;
    expect(expected).toBeGreaterThan(5); // the fixture really does have a tail
    const mc = runMonteCarlo(plan);
    expect(Math.abs(mc.beyondHorizonPct - expected)).toBeLessThan(5);
  });

  it('sex is sanitized to one of three values', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, sex1: 'M' }).sex1).toBe('unstated');
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, sex1: 'female' }).sex1).toBe('female');
    expect(sanitizeInputs({ ...DEFAULT_INPUTS }).sex2).toBe('unstated');
  });
});
