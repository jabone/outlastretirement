// Long-term care as a risk in the Monte Carlo (changelog 266).
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runMonteCarlo, mulberry32 } from '../calculator';
import { sampleLtcEpisode, LTC_NEED_PROBABILITY, LTC_MEAN_YEARS, LTC_MAX_YEARS } from '../utils/ltcRisk';


describe('sampleLtcEpisode', () => {
  it('no episode when the need draw is above the probability; an episode otherwise', () => {
    expect(sampleLtcEpisode('female', 88, 0.9, 0.5, 0.5)).toBeNull();
    expect(sampleLtcEpisode('female', 88, 0.5, 0.5, 0.5)).not.toBeNull();
    expect(sampleLtcEpisode('male', 88, 0.5, 0.5, 0.5)).toBeNull(); // 0.5 > 0.48
    expect(sampleLtcEpisode('unstated', 88, 0.55, 0.5, 0.5)).not.toBeNull();
  });

  it('places the onset in the last eight years of life and cuts the episode off at death', () => {
    const e = sampleLtcEpisode('female', 88, 0, 0.99, 0);
    expect(e.startAge).toBe(81);
    expect(e.years).toBe(8); // capped by death, not the 10-year cap
    const late = sampleLtcEpisode('female', 88, 0, 0.99, 0.999);
    expect(late.startAge).toBe(88);
    expect(late.years).toBe(1);
    // A short life still starts no earlier than 65.
    expect(sampleLtcEpisode('male', 66, 0, 0.5, 0).startAge).toBe(65);
  });

  it('durations are exponential with the stated means and about one in five run past five years', () => {
    const rng = mulberry32(7);
    const N = 20000;
    let sum = 0; let over5 = 0;
    for (let i = 0; i < N; i++) {
      const e = sampleLtcEpisode('unstated', 200, 0, rng(), 0); // death far off: no truncation
      sum += e.years; if (e.years > 5) over5++;
    }
    expect(sum / N).toBeCloseTo(LTC_MEAN_YEARS.unstated, 0);
    expect(over5 / N).toBeGreaterThan(0.15);
    expect(over5 / N).toBeLessThan(0.25);
    expect(Math.max(...Array.from({ length: 2000 }, () => sampleLtcEpisode('female', 200, 0, rng(), 0).years))).toBeLessThanOrEqual(LTC_MAX_YEARS);
    expect(LTC_NEED_PROBABILITY.female).toBeGreaterThan(LTC_NEED_PROBABILITY.male);
  });
});

describe('runMonteCarlo with LTC sampling', () => {
  const plan = { ...DEFAULT_INPUTS, spouse2Enabled: false, sex1: 'female', preTaxInit: 1200000, ltcCost1: 90000, ltcActive1: false, monteCarloSeed: 11 };
  it('is off by default, reports the share of trials with an episode when on, and only lowers the odds', { timeout: 60000 }, () => {
    expect(DEFAULT_INPUTS.mcLtcEnabled).toBe(false);
    const off = runMonteCarlo(plan);
    const on = runMonteCarlo({ ...plan, mcLtcEnabled: true });
    expect(off.ltcSampled).toBe(false);
    expect(on.ltcSampled).toBe(true);
    expect(on.ltcTrialsPct).toBeGreaterThan(45);
    expect(on.ltcTrialsPct).toBeLessThan(80);
    expect(on.averageEndingBalance).toBeLessThan(off.averageEndingBalance);
    expect(on.successProbability).toBeLessThanOrEqual(off.successProbability);
  });

  it('the market path and the life draws are untouched by the switch', { timeout: 60000 }, () => {
    // Same seed; with need probability effectively forcing "no episode" we
    // can't reach in from outside, so compare instead the p90 path, which
    // the LTC draws can only pull down, and the number of trials, which
    // must be identical.
    const off = runMonteCarlo(plan);
    const on = runMonteCarlo({ ...plan, mcLtcEnabled: true });
    expect(on.trials).toBe(off.trials);
    expect(on.endingP90).toBeLessThanOrEqual(off.endingP90);
    expect(on.beyondHorizonPct).toBe(off.beyondHorizonPct);
  });
});
