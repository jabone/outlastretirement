// The IRMAA top tier ($500,000 single / $750,000 joint) is frozen through
// 2027 and indexed from 2028 (42 U.S.C. 1395r(i)(5)). Its factor must be
// measured from the threshold table's own year (TAX_YEAR), whatever year a
// plan starts in. Audit C1 (2026-11-09): a plan starting in 2029 put the
// 2030 top tier at $672,444 instead of $538,445.
import { describe, it, expect } from 'vitest';
import {
  TAX_YEAR, DEFAULT_INPUTS, IRMAA_THRESHOLDS_SINGLE, IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR,
  irmaaTopTierFactor, irmaaScaledThresholds, runProjection,
} from '../calculator';
import { buildTaxVisualizerData } from '../utils/taxVisualizerData';

const g = 1.025;
const factorFromTaxYear = (year) => Math.pow(g, year - TAX_YEAR);
const top = (year) => IRMAA_THRESHOLDS_SINGLE[4] * irmaaTopTierFactor(year, factorFromTaxYear(year));

describe('IRMAA top tier indexing', () => {
  it('is frozen through 2027 and indexed from 2028 on the years since the freeze', () => {
    expect(TAX_YEAR).toBeLessThanOrEqual(IRMAA_TOP_TIER_FREEZE_THROUGH_YEAR);
    expect(top(2027)).toBe(500000);
    expect(top(2028)).toBeCloseTo(512500, 6);
    expect(top(2029)).toBeCloseTo(525312.5, 6);
    expect(top(2030)).toBeCloseTo(538445.3125, 6);
  });

  it('defaults the base year to TAX_YEAR', () => {
    expect(irmaaTopTierFactor(2030, factorFromTaxYear(2030))).toBe(irmaaTopTierFactor(2030, factorFromTaxYear(2030), TAX_YEAR));
  });

  it('a table already past the freeze moves its top figure with the other tiers', () => {
    expect(irmaaTopTierFactor(2031, 1.1, 2028)).toBe(1.1);
  });

  it('the audit example: a plan starting in 2029 indexes 2029 and 2030 from the freeze, not from its own first year', () => {
    const plan = { ...DEFAULT_INPUTS, planYear: 2029, birthYear1: 1960, filingStatus: 'Single', spouse2Enabled: false, taxBracketInflationRate: 2.5 };
    const rows = runProjection(plan).years;
    const lines = buildTaxVisualizerData(rows, false, {});
    const at = (year) => lines[rows.findIndex((r) => r.year === year)];
    expect(at(2029).irmaaTier5).toBeCloseTo(525312.5, 2); // was $500,000
    expect(at(2030).irmaaTier5).toBeCloseTo(538445.3125, 2); // was $672,444
    // The single-filer schedule's other tiers ride the ordinary factor.
    const scaled = irmaaScaledThresholds('Single', false, rows[1].irmaaThresholdFactor, irmaaTopTierFactor(2030, rows[1].irmaaThresholdFactor));
    expect(scaled[4]).toBeCloseTo(538445.3125, 2);
  });

  it('a plan starting in 2027 indexes 2028 by one year, not two', () => {
    const plan = { ...DEFAULT_INPUTS, planYear: 2027, birthYear1: 1960, filingStatus: 'Single', spouse2Enabled: false, taxBracketInflationRate: 2.5 };
    const rows = runProjection(plan).years;
    const lines = buildTaxVisualizerData(rows, false, {});
    expect(lines[rows.findIndex((r) => r.year === 2028)].irmaaTier5).toBeCloseTo(512500, 2); // was $525,313
  });
});
