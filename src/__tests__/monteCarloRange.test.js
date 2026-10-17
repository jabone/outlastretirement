// utils/monteCarloRange.js (changelog 254): the KPI banner's range.
import { describe, it, expect } from 'vitest';
import { monteCarloRange } from '../utils/monteCarloRange';

const mc = { endingP10: 100, endingP50: 200, endingP90: 400, successProbability: 87.4, trials: 1000, seed: 7, longevitySampled: false };
const raw = { years: [{ inflFactor: 1 }, { inflFactor: 2 }] };

describe('monteCarloRange', () => {
  it('is none without a result, stale when the plan key changed, fresh when the keys match (changelog 268)', () => {
    expect(monteCarloRange(null, null, 'k1', raw, false).status).toBe('none');
    expect(monteCarloRange(mc, 'k0', 'k1', raw, false).status).toBe('stale');
    expect(monteCarloRange(mc, 'k1', 'k1', raw, false).status).toBe('fresh');
    // Keys are strings: two equal-valued plans share one, a new object does not matter.
    expect(monteCarloRange(mc, String('k1'), 'k' + '1', raw, false).status).toBe('fresh');
  });

  // The final balance is an end-of-year figure, so it is converted by the
  // price level at the END of the last year: 2 x one more year at 100% = 4.
  it('deflates by the end-of-final-year factor under Today’s Dollars, and not otherwise', () => {
    const nominal = monteCarloRange(mc, 'k', 'k', raw, false);
    const real = monteCarloRange(mc, 'k', 'k', raw, true);
    expect([nominal.p10, nominal.p50, nominal.p90]).toEqual([100, 200, 400]);
    expect([real.p10, real.p50, real.p90]).toEqual([25, 50, 100]);
    expect(real.successProbability).toBe(87.4);
    expect(real.trials).toBe(1000);
  });

  it('survives a projection with no years', () => {
    expect(monteCarloRange(mc, 'k', 'k', { years: [] }, true).p90).toBe(400);
  });
});
