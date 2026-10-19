// Changelog 430: California's 2025 figures carry forward by the Tax Bracket
// Inflation Rate -- (1 + r) to 2026, then the plan's indexing -- instead of
// standing still for the whole plan.
import { describe, it, expect } from 'vitest';
import { calculateStateTaxes, californiaExemptionCredits, californiaIndexFactor, CA_STD_DEDUCTION_SINGLE, CA_VINTAGE_YEAR, TAX_YEAR, runProjection, DEFAULT_INPUTS } from '../calculator';

describe('California indexes from its 2025 vintage', () => {
  it('the factor is (1 + r) to reach 2026 and the plan factor from there', () => {
    expect(CA_VINTAGE_YEAR).toBe(TAX_YEAR - 1);
    expect(californiaIndexFactor({})).toBe(1);
    expect(californiaIndexFactor({ inflationFactor: 1, taxBracketInflationRate: 2.5 })).toBeCloseTo(1.025, 9);
    expect(californiaIndexFactor({ inflationFactor: 1.025, taxBracketInflationRate: 2.5 })).toBeCloseTo(1.025 * 1.025, 9);
  });

  it('indexed thresholds lower the tax on the same income', () => {
    const income = 120000;
    const flat = calculateStateTaxes(income, 0, 0, 'ca', false, true, 'Single', 60, 60, 0, 0, null, false, { federalAGI: income });
    const indexed = calculateStateTaxes(income, 0, 0, 'ca', false, true, 'Single', 60, 60, 0, 0, null, false, { federalAGI: income, inflationFactor: 1.1, taxBracketInflationRate: 2.5 });
    expect(indexed).toBeLessThan(flat);
    // The exemption credit grows with the factor too.
    expect(californiaExemptionCredits(50000, 'Single', 60, 60, 1.1)).toBeCloseTo(153 * 1.1, 6);
    // A deduction-sized income owes nothing either way.
    expect(calculateStateTaxes(CA_STD_DEDUCTION_SINGLE * 1.1, 0, 0, 'ca', false, true, 'Single', 60, 60, 0, 0, null, false, { inflationFactor: 1.1, taxBracketInflationRate: 2.5 })).toBe(0);
  });

  it('a 2027 plan and a 2026 plan agree about California in 2027', () => {
    const base = { ...DEFAULT_INPUTS, stateOfResidence: 'CA', stateTaxState: 'ca', birthYear1: 1960, birthYear2: 1962, retireAge1: 60, retireAge2: 60, salary1: 0, salary2: 0,
      preTaxInit: 2000000, taxableInit: 200000, lifestyleExpense: 120000, withdrawalStrategy: 'PreTaxFirst', taxBracketInflationRate: 2.5, inflationRate: 2.5,
      acaCreditSource: 'manual', itemizeDeductions: 'never', taxableQualifiedDividendFollowsAllocation: false, ssColaAnnounced: false };
    const from26 = runProjection({ ...base, planYear: TAX_YEAR }).years.find((y) => y.year === TAX_YEAR + 1);
    const from27 = runProjection({ ...base, planYear: TAX_YEAR + 1, lifestyleExpense: 120000 * 1.025 }).years.find((y) => y.year === TAX_YEAR + 1);
    expect(from26.stateTax).toBeGreaterThan(0);
    expect(from27.stateTax / from26.stateTax).toBeGreaterThan(0.97);
    expect(from27.stateTax / from26.stateTax).toBeLessThan(1.03);
  });
});
