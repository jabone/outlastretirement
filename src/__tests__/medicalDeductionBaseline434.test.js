// Changelog 434: the base federal and state tax are priced on the same
// medical line the withdrawal solver reads. Until 434 the base was priced
// with the bridge before its ACA credit and before the HSA draw, while the
// solver's increase was measured against the final line, so the year's
// federal tax was the solver's increase on top of the wrong baseline: an
// HSA that paid the whole bridge left the year under-taxed by 70%, an ACA
// credit by half. And a fill-to-bracket conversion was sized before any
// medical cost was in the deduction, so it under-filled the bracket.
import { describe, it, expect } from 'vitest';
import { runProjection, calculateTaxes, getTaxBracketLimit } from '../calculator';
// The reference household (the pre-469 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';

const START = DEFAULT_INPUTS.planYear;
const base = {
  ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 62, retireAge1: 60,
  salary1: 0, ss1: 0, claimingAge1: 70, pension1: 50000, pensionStartAge1: 60,
  healthcareBridgeCost: 24000, propertyTaxAnnual: 15000, charitableGivingAnnual: 5000, lifestyleExpense: 20000,
  withdrawalStrategy: 'TaxableFirst', taxableInit: 500000, taxableBasisInit: 500000, preTaxInit: 0, rothInit: 0,
  stateOfResidence: 'CA', stateTaxState: 'ca', itemizeDeductions: 'auto', acaCreditSource: 'manual',
  acaCliffProtectionEnabled: false, taxableQualifiedDividendFollowsAllocation: false,
};
// The year's federal tax must be the tax on the year's own taxable income
// (plus the gains tax on the dividends, which is zero or small here).
const regularTaxOn = (y) => calculateTaxes(y.ordinaryTaxableIncome, 'Single', y.taxBracketInflationFactor, DEFAULT_INPUTS.tcjaSunsetEnabled);

describe('the base tax is priced on the final medical line (434)', () => {
  it('an HSA that pays the bridge tax-free: the deduction loses the bridge and the tax rises to match', () => {
    const y = runProjection({ ...base, hsaInit: 100000, hsaPreMedicarePremiumsQualified: true }).years[0];
    expect(y.hsaMedicalDraw).toBeCloseTo(24000, 0);
    expect(y.deductionUsed).toBe('itemized');
    expect(y.itemizedMedical).toBe(0);
    expect(y.federalTax).toBeCloseTo(regularTaxOn(y), 0);
  });

  it('an ACA credit that nets the bridge down: same', () => {
    const y = runProjection({ ...base, acaCreditSource: 'formula' }).years[0];
    expect(y.acaSubsidyApplied).toBeGreaterThan(5000);
    expect(y.deductionUsed).toBe('itemized');
    expect(y.federalTax).toBeCloseTo(regularTaxOn(y), 0);
  });

  it('Medicare premiums that add to the line after 65: same', () => {
    const y = runProjection({ ...base, birthYear1: START - 68, healthcareBridgeCost: 0, ltcActive1: true, ltcStartAge1: 60, ltcCost1: 10000, ltcDurationYears1: 30 }).years[0];
    expect(y.irmaaCost).toBeGreaterThan(2000);
    expect(y.deductionUsed).toBe('itemized');
    expect(y.federalTax).toBeCloseTo(regularTaxOn(y), 0);
  });

  it('a fill-to-bracket conversion sees the medical deduction and lands on the ceiling', () => {
    const y = runProjection({
      ...base, stateOfResidence: 'TX', stateTaxState: 'none', pension1: 0, preTaxInit: 2000000, withdrawalStrategy: 'PreTaxFirst',
      taxableInit: 50000, taxableBasisInit: 50000, ltcActive1: true, ltcStartAge1: 60, ltcCost1: 40000, ltcDurationYears1: 30, propertyTaxAnnual: 10000,
      rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22, rothConversionBuffer: 0, rothConversionIrmaaCapEnabled: false,
    }).years[0];
    expect(y.itemizedMedical).toBeGreaterThan(30000);
    expect(y.deductionUsed).toBe('itemized');
    expect(Math.abs(y.ordinaryTaxableIncome - getTaxBracketLimit("Single", 0.22, y.taxBracketInflationFactor))).toBeLessThan(5);
  });

  it('a standard-deduction year is untouched', () => {
    const y = runProjection({ ...base, propertyTaxAnnual: 0, charitableGivingAnnual: 0, hsaInit: 100000, hsaPreMedicarePremiumsQualified: true }).years[0];
    expect(y.deductionUsed).toBe('standard');
    expect(y.federalTax).toBeCloseTo(regularTaxOn(y), 0);
  });
});
