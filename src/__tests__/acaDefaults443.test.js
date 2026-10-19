// Changelog 443: with the credit computed (415) the default bridge cost --
// $12,000 a person, 70% of it premium, not age-rated -- sits far under the
// age-rated benchmark, so the credit covered the whole premium and one
// dollar over the 400% line then cost $17k-$25k. The plan now says so
// (a Plan Feedback card), and ACA Cliff Protection is on by default so a
// new plan's conversions stop at the line.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, acaBenchmarkPremiumAnnual, sanitizeInputs } from '../calculator';
import { planWarningFeedback } from '../utils/planNotices';

const START = DEFAULT_INPUTS.planYear;
const couple60 = {
  ...DEFAULT_INPUTS, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: START - 60, birthYear2: START - 60, retireAge1: 59, retireAge2: 59,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0, claimingAge1: 70, claimingAge2: 70, stateOfResidence: 'TX', stateTaxState: 'none',
  preTaxInit: 1500000, taxableInit: 600000, taxableBasisInit: 600000, rothInit: 0, lifestyleExpense: 60000, withdrawalStrategy: 'TaxableFirst',
  acaCreditSource: 'formula', taxableQualifiedDividendFollowsAllocation: false, itemizeDeductions: 'never',
};

describe('the ACA defaults (443)', () => {
  it('a default bridge premium far under the benchmark raises one Plan Feedback card', () => {
    const proj = runProjection(couple60);
    const y = proj.years[0];
    const benchmark = acaBenchmarkPremiumAnnual('TX', [60, 60]);
    expect(benchmark).toBeGreaterThan(30000);
    expect(y.acaPremiumPaid ?? 24000 * 0.7).toBeLessThan(benchmark * 0.75);
    const w = proj.warnings.filter((x) => x.code === 'aca-premium-below-benchmark');
    expect(w).toHaveLength(1);
    expect(w[0].benchmark).toBeGreaterThan(w[0].premium * 1.33);
    const card = planWarningFeedback(proj, couple60).find((c) => c.code === 'aca-premium-below-benchmark');
    expect(card.title).toMatch(/premium looks low/i);
    expect(card.action.subTab).toBe('spending');
  });

  it('a premium at the benchmark raises nothing', () => {
    const benchmark = acaBenchmarkPremiumAnnual('TX', [60, 60]);
    const proj = runProjection({ ...couple60, healthcareBridgeCost: benchmark / 2 / 0.7 });
    expect(proj.warnings.some((x) => x.code === 'aca-premium-below-benchmark')).toBe(false);
  });

  it('Cliff Protection is on by default, a $90k conversion is capped at the line, and a saved "off" is kept', () => {
    expect(DEFAULT_INPUTS.acaCliffProtectionEnabled).toBe(true);
    const withConv = { ...couple60, rothConversionStrategy: 'fixed', rothConversionAmount: 90000 };
    const on = runProjection(withConv).years[0];
    expect(on.acaCliffBreached).toBe(false);
    expect(on.acaMagi).toBeLessThanOrEqual(on.acaCliffThreshold + 0.01);
    expect(on.convertAmount).toBeLessThan(90000);
    const off = runProjection({ ...withConv, acaCliffProtectionEnabled: false }).years[0];
    expect(off.convertAmount).toBeCloseTo(90000, 0);
    expect(off.acaCliffBreached).toBe(true);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, acaCliffProtectionEnabled: false }).acaCliffProtectionEnabled).toBe(false);
  });
});
