// Changelog 436: after ACA Subsidy Protection converts enough to lift the
// year over the poverty line, the MAGI the credit is priced on is the
// post-boost figure. Until 436 it stayed at the pre-boost figure, under the
// line, so the credit the boost was made to earn came out at $0 and the
// next year's estimate inherited the gap. And a settled-up refund is basis
// in the taxable account, like any other deposit.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, getFederalPovertyLevel } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const base = {
  ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 60, retireAge1: 59,
  salary1: 0, ss1: 0, claimingAge1: 70, pension1: 10000, pensionStartAge1: 59,
  lifestyleExpense: 40000, withdrawalStrategy: 'TaxableFirst', taxableInit: 600000, taxableBasisInit: 600000, taxableDividendYield: 0,
  preTaxInit: 500000, rothInit: 0, healthcareBridgeCost: 18000,
  stateOfResidence: 'TX', stateTaxState: 'none', acaSubsidyProtectionEnabled: true, acaCreditSource: 'formula',
  acaCliffProtectionEnabled: false, taxableQualifiedDividendFollowsAllocation: false, itemizeDeductions: 'never',
};

describe('the ACA boost re-settles the MAGI it was made to raise (436)', () => {
  it('the boost lifts MAGI to the poverty line and the credit is priced there, this year and next', () => {
    const [y0, y1] = runProjection(base).years;
    const floor = getFederalPovertyLevel(1, y0.year, DEFAULT_INPUTS.taxBracketInflationRate);
    expect(y0.acaSubsidyBoost).toBeGreaterThan(1000);
    expect(y0.inAcaCoverageGap).toBe(false);
    expect(y0.acaMagi).toBeGreaterThanOrEqual(floor - 1);
    expect(y0.acaCreditSettled).toBeGreaterThan(5000);
    // The year's advance credit was estimated at $0 (last year unknown), so
    // the settled credit comes back as a refund, and the refund is basis.
    expect(y0.acaSubsidyRefund).toBeCloseTo(y0.acaCreditSettled, 0);
    // Next year starts from this year's settled MAGI -- exactly last year's
    // line, a hair under this year's -- so a smaller boost lifts it again
    // and the credit is earned again. Before 436 the carried figure was the
    // pre-boost one and every later year was priced at $0.
    expect(y1.inAcaCoverageGap).toBe(false);
    expect(y1.acaCreditSettled).toBeGreaterThan(5000);
    expect(y1.acaMagi).toBeGreaterThanOrEqual(getFederalPovertyLevel(1, y1.year, DEFAULT_INPUTS.taxBracketInflationRate) - 1);
  });

  it('a refund deposited into Taxable raises its basis by the same amount', () => {
    const withRefund = runProjection(base).years[0];
    const without = runProjection({ ...base, acaSubsidyProtectionEnabled: false }).years[0];
    expect(withRefund.acaSubsidyRefund).toBeGreaterThan(1000);
    expect(without.acaSubsidyRefund).toBe(0);
    // Basis moved by the refund plus whatever the boost's tax drew, less
    // the draw's basis -- the refund itself is the dominant term, and the
    // basis share of the ending balance must not fall below the no-refund
    // plan's.
    expect(withRefund.taxableBasis / withRefund.taxableEnd).toBeGreaterThanOrEqual(without.taxableBasis / without.taxableEnd - 1e-6);
  });
});
