// Changelog 513: two fixes to Auto-Max contributions.
// 1. 401(k) mode fills the elective-deferral limit and keeps the Roth amount
//    entered as Roth inside it; it used to add that Roth on top, past the
//    legal limit.
// 2. The SECURE 2.0 Roth catch-up test reads the prior year's wages, as the
//    law does (the plan's first year uses its own).
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, fillLimitKeepingRoth } from '../calculator';

const g = 1 + DEFAULT_INPUTS.inflationRate / 100;
const worker = (age2027, extra = {}) => ({
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: 2027 - age2027,
  retireAge1: 67,
  salary1: 90000,
  ...extra,
});
const rowFor = (proj, year) => proj.years.find((y) => y.year === year);

describe('fillLimitKeepingRoth', () => {
  it('keeps the Roth entered inside the limit and fills the rest Pre-Tax', () => {
    expect(fillLimitKeepingRoth({ preTax: 25500, roth: 0 }, 4000)).toEqual({ preTax: 21500, roth: 4000 });
    expect(fillLimitKeepingRoth({ preTax: 25500, roth: 0 }, 0)).toEqual({ preTax: 25500, roth: 0 });
    expect(fillLimitKeepingRoth({ preTax: 25500, roth: 0 }, 40000)).toEqual({ preTax: 0, roth: 25500 });
  });
  it('never puts less than a required Roth catch-up in Roth', () => {
    expect(fillLimitKeepingRoth({ preTax: 25500, roth: 8500 }, 4000)).toEqual({ preTax: 25500, roth: 8500 });
    expect(fillLimitKeepingRoth({ preTax: 25500, roth: 8500 }, 10000)).toEqual({ preTax: 24000, roth: 10000 });
  });
});

describe('Auto-Max 401(k) mode stays at the limit', () => {
  it('the sample plan’s $4,000 Roth is part of the limit, not on top of it', () => {
    const proj = runProjection(worker(45, { autoMaxContribution1: '401k', rothContribution1: 4000 }));
    for (const [year, limit] of [[2026, 24500], [2027, 25500], [2028, 25500 * g]]) {
      const r = rowFor(proj, year);
      expect(r.preTaxContribution1 + r.rothContribution1).toBeCloseTo(limit, 6);
      expect(r.rothContribution1).toBeCloseTo(4000, 6);
    }
  });
  it('a high earner 50 or over puts the catch-up in Roth, still within the limit', () => {
    const proj = runProjection(worker(55, { autoMaxContribution1: '401k', rothContribution1: 4000, salary1: 250000 }));
    const r = rowFor(proj, 2027);
    expect(r.preTaxContribution1 + r.rothContribution1).toBeCloseTo(34000, 6);
    expect(r.rothContribution1).toBeCloseTo(8500, 6);
  });
});

describe('the Roth catch-up test reads last year’s wages', () => {
  // 2027 wages just over $155,000, but 2026 wages under it: the law does not
  // require Roth in 2027.
  const wage2026 = 152000;
  it('2027 is tested on 2026 wages', () => {
    const plan = worker(55, { autoMaxContribution1: 'max', salary1: wage2026 });
    const proj = runProjection(plan);
    expect(wage2026 * g).toBeGreaterThan(155000);
    const r27 = rowFor(proj, 2027);
    expect(r27.rothContribution1).toBeCloseTo(0, 6);
    expect(r27.preTaxContribution1).toBeCloseTo(34000, 6);
  });
  it('the first year uses its own wages', () => {
    const proj = runProjection(worker(55, { autoMaxContribution1: 'max', salary1: wage2026 }));
    // 2026: $152,000 is over 2026's $150,000.
    expect(rowFor(proj, 2026).rothContribution1).toBeCloseTo(8000, 6);
  });
  it('a later year is tested on the year before', () => {
    const proj = runProjection(worker(55, { autoMaxContribution1: 'max', salary1: 200000 }));
    expect(rowFor(proj, 2028).rothContribution1).toBeCloseTo(8500 * g, 6);
  });
});
