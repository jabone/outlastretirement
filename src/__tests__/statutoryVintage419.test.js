// Changelog 419: statutory figures (brackets, deductions, IRMAA thresholds
// and premiums, contribution and QCD limits, the wage base, the estate
// exemption) are the TAX_YEAR's and index from that vintage, not from the
// plan's first year. A plan starting in 2027 and one starting in 2026 must
// agree about calendar 2027 to the dollar.
import { describe, it, expect } from 'vitest';
import { runProjection, TAX_YEAR, calculateHeirEstateTax } from '../calculator';
// The reference household (the pre-467 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';

const base = {
  ...DEFAULT_INPUTS, birthYear1: 1960, birthYear2: 1962, retireAge1: 60, retireAge2: 60, salary1: 0, salary2: 0,
  preTaxInit: 1000000, taxableInit: 200000, lifestyleExpense: 80000, taxBracketInflationRate: 2.5, inflationRate: 2.5,
  medicarePartBInflationRate: 5, medicarePartDInflationRate: 5,
  // Keep the comparison about the factors.
  acaCreditSource: 'manual', itemizeDeductions: 'never', taxableQualifiedDividendFollowsAllocation: false, ssColaAnnounced: false,
};
const rowFor = (planYear, year) => runProjection({ ...base, planYear }).years.find((y) => y.year === year);

describe('statutory figures index from TAX_YEAR', () => {
  it('a 2027 plan prices 2027 on the 2026 figures carried one year, as a 2026 plan does', () => {
    const from26 = rowFor(TAX_YEAR, TAX_YEAR + 1);
    const from27 = rowFor(TAX_YEAR + 1, TAX_YEAR + 1);
    expect(from27.taxBracketInflationFactor).toBeCloseTo(1.025, 9);
    expect(from27.taxBracketInflationFactor).toBeCloseTo(from26.taxBracketInflationFactor, 9);
    expect(from27.partBInflFactor).toBeCloseTo(1.05, 9);
    expect(from27.partDInflFactor).toBeCloseTo(from26.partDInflFactor, 9);
    expect(from27.stdDeduction).toBeCloseTo(from26.stdDeduction, 2);
    expect(from27.irmaaThresholdFactor).toBeCloseTo(from26.irmaaThresholdFactor, 9);
  });

  it('a plan starting before TAX_YEAR carries the figures back', () => {
    const from25 = rowFor(TAX_YEAR - 1, TAX_YEAR - 1);
    expect(from25.taxBracketInflationFactor).toBeCloseTo(1 / 1.025, 9);
    expect(from25.partBInflFactor).toBeCloseTo(1 / 1.05, 9);
    // ...and lands on exactly the TAX_YEAR figures in TAX_YEAR.
    const at26 = rowFor(TAX_YEAR - 1, TAX_YEAR);
    expect(at26.taxBracketInflationFactor).toBeCloseTo(1, 9);
  });

  it('a plan starting in TAX_YEAR is unchanged, and so is the default plan', () => {
    expect(rowFor(TAX_YEAR, TAX_YEAR).taxBracketInflationFactor).toBe(1);
    expect(rowFor(TAX_YEAR, TAX_YEAR).partBInflFactor).toBe(1);
    expect(runProjection(DEFAULT_INPUTS).endingBalance).toBeCloseTo(36762.2363, 2);
  });

  it('contribution limits, the QCD limit and the wage base follow the same vintage', () => {
    const worker = {
      ...base, birthYear1: 1980, birthYear2: 1982, retireAge1: 65, retireAge2: 65, salary1: 200000, salary2: 0,
      autoMaxContribution1: 'max', employerMatchPct: 0,
    };
    const w26 = runProjection({ ...worker, planYear: TAX_YEAR }).years.find((y) => y.year === TAX_YEAR + 1);
    // Salary is entered in each plan's own today's dollars, so hold it to
    // the same calendar-2027 figure before comparing the limits.
    const w27 = runProjection({ ...worker, planYear: TAX_YEAR + 1, salary1: 200000 * 1.025 }).years.find((y) => y.year === TAX_YEAR + 1);
    expect(w27.preTaxContribution1).toBeCloseTo(w26.preTaxContribution1, 0);
    expect(w27.preTaxContribution1).toBeGreaterThan(24500); // the 2026 limit, indexed
    const giver = { ...base, birthYear1: 1950, birthYear2: 1950, qcdAnnualAmount: 1000000, preTaxInit: 3000000 };
    const q26 = runProjection({ ...giver, planYear: TAX_YEAR }).years.find((y) => y.year === TAX_YEAR + 1);
    const q27 = runProjection({ ...giver, planYear: TAX_YEAR + 1 }).years.find((y) => y.year === TAX_YEAR + 1);
    expect(q27.qcdAmount).toBeCloseTo(q26.qcdAmount, 0);
  });

  it('the estate exemption counts its years from TAX_YEAR', () => {
    const estate = { ...base, planYear: TAX_YEAR + 1, lifeExpectancy1: 90, lifeExpectancy2: 90, spouse2Enabled: false, filingStatus: 'Single' };
    const a = calculateHeirEstateTax({ ...estate }, { preTax: 20000000, roth: 0, taxable: 0 }, []);
    const b = calculateHeirEstateTax({ ...estate, planYear: TAX_YEAR, birthYear1: 1959 }, { preTax: 20000000, roth: 0, taxable: 0 }, []);
    // Same death year (2050) from either start: the same exemption, so the
    // same federal estate tax.
    expect(a.federalEstateTax ?? a.estateTax ?? 0).toBeCloseTo(b.federalEstateTax ?? b.estateTax ?? 0, 0);
  });
});
