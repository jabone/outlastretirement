// Changelog 514: year-end figures that did not wait on Medicare.
// - The ACA applicable percentages are kept by coverage year (2027 from
//   Rev. Proc. 2026-26).
// - The ledger's ACA percentage is the one the settled year's income earns.
// - Virginia's standard deduction follows the 2026 Appropriation Act.
import { describe, it, expect } from 'vitest';
import {
  runProjection, acaApplicablePercent, acaApplicablePctTable, acaPremiumTaxCredit,
  ACA_APPLICABLE_PCT_2026, ACA_APPLICABLE_PCT_TABLES, getFederalPovertyLevel,
  vaStandardDeduction, VA_STD_DEDUCTION_SINGLE, VA_STD_DEDUCTION_MFJ, VA_STD_DEDUCTION_SCHEDULE,
  calculateStateTaxes,
} from '../calculator';
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';

const START = DEFAULT_INPUTS.planYear;

describe('ACA applicable percentages by year', () => {
  it('2026 is unchanged and 2027 is Rev. Proc. 2026-26', () => {
    expect(ACA_APPLICABLE_PCT_TABLES[2026]).toBe(ACA_APPLICABLE_PCT_2026);
    expect(ACA_APPLICABLE_PCT_TABLES[2027]).toEqual([
      [1.00, 1.33, 2.15, 2.15],
      [1.33, 1.50, 3.23, 4.30],
      [1.50, 2.00, 4.30, 6.78],
      [2.00, 2.50, 6.78, 8.66],
      [2.50, 3.00, 8.66, 10.22],
      [3.00, 4.00, 10.22, 10.22],
    ]);
  });
  it('a year uses the newest table at or before it', () => {
    expect(acaApplicablePctTable(2025)).toBe(ACA_APPLICABLE_PCT_2026);
    expect(acaApplicablePctTable(2026)).toBe(ACA_APPLICABLE_PCT_2026);
    expect(acaApplicablePctTable(2027)).toBe(ACA_APPLICABLE_PCT_TABLES[2027]);
    expect(acaApplicablePctTable(2040)).toBe(ACA_APPLICABLE_PCT_TABLES[2027]);
  });
  it('the percentage and the credit read the coverage year', () => {
    expect(acaApplicablePercent(3.5)).toBeCloseTo(9.96, 9);
    expect(acaApplicablePercent(3.5, 2027)).toBeCloseTo(10.22, 9);
    expect(acaApplicablePercent(2.75, 2027)).toBeCloseTo(8.66 + (10.22 - 8.66) / 2, 9);
    expect(acaApplicablePercent(1.2, 2027)).toBeCloseTo(2.15, 9);
    expect(acaApplicablePercent(4.01, 2027)).toBeNull();
    // A couple at $86,000 in 2027, benchmark $30,000: 10.22% of income.
    const fpl = getFederalPovertyLevel(2, 2027);
    const r = acaPremiumTaxCredit({ benchmark: 30000, magi: 86000, fpl, premiumPaid: 30000, year: 2027 });
    expect(r.applicablePct).toBeCloseTo(10.22, 9);
    expect(r.credit).toBeCloseTo(30000 - 86000 * 0.1022, 6);
  });
});

describe('the ledger shows the settled year’s percentage', () => {
  // A Texas couple retired at 60 and 58 on a $30,000 pension and a brokerage
  // account, with marketplace coverage.
  const couple = {
    ...DEFAULT_INPUTS, birthYear1: START - 60, birthYear2: START - 58, spouse2Enabled: true, filingStatus: 'MFJ',
    retireAge1: 60, retireAge2: 58, salary1: 0, salary2: 0, ss1: 0, ss2: 0, claimingAge1: 70, claimingAge2: 70,
    preTaxInit: 800000, taxableInit: 600000, taxableBasisInit: 500000, rothInit: 200000, lifestyleExpense: 60000,
    stateOfResidence: 'TX', stateTaxState: 'tx', pension1: 30000, healthcareBridgeCost: 12000, healthcareBridgePremiumPct: 70,
  };
  it('every marketplace year’s percentage matches its settled income', () => {
    const years = runProjection(couple).years.filter((y) => y.acaCreditSettled > 0);
    expect(years.length).toBeGreaterThan(2);
    for (const y of years) {
      const size = y.year < START + 7 ? 2 : 1;
      const fpl = getFederalPovertyLevel(size, y.year, couple.taxBracketInflationRate);
      expect(y.acaApplicablePct).toBeCloseTo(acaApplicablePercent(y.acaMagi / fpl, y.year), 6);
    }
  });
});

describe('Virginia standard deduction by year', () => {
  it('follows the 2026 Appropriation Act, holding the 2029 amounts after', () => {
    expect(VA_STD_DEDUCTION_SINGLE).toBe(8750);
    expect(VA_STD_DEDUCTION_MFJ).toBe(17500);
    expect(VA_STD_DEDUCTION_SCHEDULE).toEqual([[2027, 9200, 18400], [2028, 9300, 18600]]);
    expect(vaStandardDeduction(false, 2026)).toBe(8750);
    expect(vaStandardDeduction(true, 2026)).toBe(17500);
    expect(vaStandardDeduction(true, 2027)).toBe(18400);
    expect(vaStandardDeduction(false, 2027)).toBe(9200);
    expect(vaStandardDeduction(true, 2029)).toBe(18600);
    expect(vaStandardDeduction(true, 2035)).toBe(18600);
  });
  it('a Virginia couple pays 5.75% less tax on the $900 more deducted in 2027', () => {
    const tax = (calendarYear) => calculateStateTaxes(90000, 0, 0, 'va', false, true, 'MFJ', 60, 60, 5, 0, null, false, { calendarYear });
    expect(tax(2026) - tax(2027)).toBeCloseTo(900 * 0.0575, 6);
    expect(tax(2027) - tax(2028)).toBeCloseTo(200 * 0.0575, 6);
  });
});
