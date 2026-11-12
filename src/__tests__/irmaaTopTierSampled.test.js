// The IRMAA top tier is frozen in nominal dollars through 2027 and indexes
// from 2028 by the path's own inflation since 2027. In a Monte Carlo trial
// that samples inflation, or a history replay, the factor used to be
// recovered as a geometric mean of the whole path, so inflation sampled in
// the frozen years leaked into the top tier. Review example: 5.5% in 2027,
// then 2.5%, put the 2028 single top tier at $519,946 (the review rounded it
// to $519,941) instead of $512,500.
import { describe, it, expect } from 'vitest';
import {
  TAX_YEAR, DEFAULT_INPUTS, IRMAA_THRESHOLDS_SINGLE, IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR,
  irmaaTopTierFactor, runProjection,
} from '../calculator';
import { buildTaxVisualizerData } from '../utils/taxVisualizerData';

const TOP = IRMAA_THRESHOLDS_SINGLE[4];
const base = {
  ...DEFAULT_INPUTS, planYear: 2026, birthYear1: 1960, filingStatus: 'Single', spouse2Enabled: false,
  inflationRate: 2.5, taxBracketInflationRate: 2.5,
};
const rowFor = (rows, y) => rows.find((r) => r.year === y);
const topLine = (rows, y) => buildTaxVisualizerData(rows, false, {})[rows.findIndex((r) => r.year === y)].irmaaTier5;
const trial = (plan, sampled) => {
  const ret = {}; const inf = {};
  for (let y = plan.planYear; y < plan.planYear + 60; y += 1) { ret[y] = 5; inf[y] = sampled[y] ?? 2.5; }
  return runProjection(plan, ret, inf).years;
};

describe('IRMAA top tier on a sampled or replayed inflation path', () => {
  it('the freeze year is still 2027 and the table is 2026 vintage', () => {
    expect(IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR).toBe(2027);
    expect(TAX_YEAR).toBeLessThanOrEqual(2027);
  });

  it('the helper with the path factor: 2028 indexes by 2028 alone', () => {
    const f27 = 1.055; const f28 = 1.055 * 1.025;
    expect(TOP * irmaaTopTierFactor(2028, f28, 2026)).toBeCloseTo(519945.91, 2); // geometric mean, the old figure
    expect(TOP * irmaaTopTierFactor(2028, f28, 2026, (from) => (from === 2027 ? f28 / f27 : NaN))).toBeCloseTo(512500, 6);
  });

  it('review example: 5.5% sampled in 2027 then 2.5% puts 2028 at $512,500, not about $519,946', () => {
    const rows = trial(base, { 2027: 5.5 });
    const y27 = rowFor(rows, 2027); const y28 = rowFor(rows, 2028);
    expect(y27.taxBracketInflationFactor).toBeCloseTo(1.055, 12); // the lower tiers did move
    expect(y27.irmaaTopTierFactor).toBe(1);
    expect(y28.irmaaTopTierFactor).toBeCloseTo(1.025, 12);
    expect(topLine(rows, 2027)).toBe(500000);
    expect(topLine(rows, 2028)).toBeCloseTo(512500, 6);
  });

  it('frozen years are unaffected by any inflation sampled in them', () => {
    const rows = trial(base, { 2026: 9, 2027: 12 });
    for (const y of [2026, 2027]) {
      expect(rowFor(rows, y).irmaaTopTierFactor).toBe(1);
      expect(topLine(rows, y)).toBe(500000);
    }
    // ...and the later years carry none of it: only 2028 on at 2.5%.
    expect(topLine(rows, 2028)).toBeCloseTo(512500, 6);
    expect(topLine(rows, 2030)).toBeCloseTo(538445.3125, 4);
  });

  it('after the freeze the top tier follows the path\'s own inflation', () => {
    const rows = trial(base, { 2027: 5.5, 2028: 7, 2029: 1 });
    const f = (y) => rowFor(rows, y).taxBracketInflationFactor;
    expect(rowFor(rows, 2028).irmaaTopTierFactor).toBeCloseTo(1.07, 12);
    expect(rowFor(rows, 2029).irmaaTopTierFactor).toBeCloseTo(1.07 * 1.01, 12);
    for (const y of [2028, 2029, 2035]) {
      expect(rowFor(rows, y).irmaaTopTierFactor).toBeCloseTo(f(y) / f(2027), 12);
      // The same ratio the federal tables use for a year after their table year.
      expect(rowFor(rows, y).irmaaTopTierFactor).toBeCloseTo(rowFor(rows, y).federalTaxFactor, 12);
    }
  });

  it('a plan starting before TAX_YEAR with inflation sampled in TAX_YEAR', () => {
    const rows = trial({ ...base, planYear: TAX_YEAR - 1 }, { [TAX_YEAR]: 6 });
    expect(rowFor(rows, 2027).irmaaTopTierFactor).toBe(1);
    expect(topLine(rows, 2028)).toBeCloseTo(512500, 6);
  });

  it('a plan starting after the freeze uses the planned rate before its first year, then its path', () => {
    const rows = trial({ ...base, planYear: 2029 }, { 2029: 8, 2030: 4 });
    expect(topLine(rows, 2029)).toBeCloseTo(525312.5, 4);
    expect(topLine(rows, 2030)).toBeCloseTo(525312.5 * 1.04, 4);
  });

  it('a history replay from 1973 keeps 2027 frozen and indexes 2028 by the replayed year only', () => {
    const rows = runProjection({ ...base, stressType: 'history', stressStartMode: 'specific', stressStartYear: 2026, stressHistoryStartYear: 1973 }).years;
    const f = (y) => rowFor(rows, y).taxBracketInflationFactor;
    expect(f(2027)).toBeGreaterThan(1.05); // the replayed 1974 CPI
    expect(topLine(rows, 2027)).toBe(500000);
    expect(rowFor(rows, 2028).irmaaTopTierFactor).toBeCloseTo(f(2028) / f(2027), 12);
    expect(topLine(rows, 2028)).toBeCloseTo(TOP * f(2028) / f(2027), 4);
  });

  it('a stress inflation override outside a replay leaves the top tier on the planned rate', () => {
    const rows = runProjection({ ...base, stressType: 'crashYear', stressStartMode: 'specific', stressStartYear: 2027, stressCrashReturn: -30, stressCrashInflation: 12 }).years;
    expect(topLine(rows, 2027)).toBe(500000);
    expect(topLine(rows, 2028)).toBeCloseTo(512500, 6);
  });

  it('deterministic and vintage-shifted plans are unchanged', () => {
    for (const planYear of [2025, 2026, 2027, 2029]) {
      const rows = runProjection({ ...base, planYear }).years;
      if (planYear <= 2027) expect(topLine(rows, 2027)).toBe(500000);
      expect(topLine(rows, 2030)).toBeCloseTo(538445.3125, 4);
    }
  });
});
