// Changelog 433: an itemizer's AMTI adds back only the state and local tax
// line (and the senior deduction), not the whole itemized total. Until 433
// AMTI was the ordinary income before ANY deduction, so a year that
// deducted $100k of gifts and mortgage interest compared a regular tax that
// had subtracted them against a tentative minimum tax that had not, and a
// phantom AMT of $8k-$23k appeared for exactly the households that itemize.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, calculateAMT, calculateTaxes } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const working = (over) => ({
  ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 50, retireAge1: 65,
  stateOfResidence: 'TX', stateTaxState: 'none', itemizeDeductions: 'auto', taxableInit: 50000, taxableQualifiedDividendFollowsAllocation: false,
  ...over,
});
const couple = (over) => working({
  spouse2Enabled: true, filingStatus: 'MFJ', birthYear2: START - 50, retireAge2: 65, ...over,
});

// The reviewer's hand computation: tentative minimum tax on taxable income
// plus the SALT line, against the regular tax on taxable income.
const expectNoPhantomAmt = (y) => {
  expect(y.deductionUsed).toBe('itemized');
  const amti = y.ordinaryTaxableIncome + y.itemizedSalt;
  const tmt = calculateAMT(amti, y.filingStatus || 'Single', y.taxBracketInflationFactor);
  const regular = calculateTaxes(y.ordinaryTaxableIncome, y.filingStatus || 'Single', y.taxBracketInflationFactor, DEFAULT_INPUTS.tcjaSunsetEnabled);
  expect(y.amtTax).toBeCloseTo(Math.max(0, tmt - regular), 0);
};

describe('AMT for a year that itemizes (433)', () => {
  it('single, $350k salary, $90k of gifts, $15k property tax: no AMT', () => {
    const y = runProjection(working({ salary1: 350000, charitableGivingAnnual: 90000, propertyTaxAnnual: 15000 })).years[0];
    expect(y.itemizedDeduction).toBeGreaterThan(100000);
    expect(y.amtTax).toBe(0);
    expectNoPhantomAmt({ ...y, filingStatus: 'Single' });
  });

  it('three joint households with large itemized totals and modest SALT: no AMT', () => {
    for (const [salary, gifts, salt] of [[400000, 130000, 20000], [300000, 85000, 15000], [600000, 100000, 20000]]) {
      const y = runProjection(couple({ salary1: salary, charitableGivingAnnual: gifts, propertyTaxAnnual: salt })).years[0];
      expect(y.deductionUsed, `${salary}`).toBe('itemized');
      expect(y.amtTax, `${salary}/${gifts}/${salt}`).toBe(0);
      expectNoPhantomAmt({ ...y, filingStatus: 'MFJ' });
    }
  });

  it('an itemizer whose only line is SALT, $200k joint: no AMT', () => {
    // SALT alone at the cap is under the standard deduction for a couple,
    // so this household takes the standard deduction; the point is that
    // no AMT appears either way.
    const y = runProjection(couple({ salary1: 200000, propertyTaxAnnual: 40000 })).years[0];
    expect(y.amtTax).toBe(0);
  });

  it('a standard-deduction year is unchanged: AMTI is the income before the deduction', () => {
    const y = runProjection(working({ salary1: 350000 })).years[0];
    expect(y.deductionUsed).toBe('standard');
    const tmt = calculateAMT(y.ordinaryTaxableIncome + y.stdDeduction, 'Single', y.taxBracketInflationFactor);
    const regular = calculateTaxes(y.ordinaryTaxableIncome, 'Single', y.taxBracketInflationFactor, DEFAULT_INPUTS.tcjaSunsetEnabled);
    expect(y.amtTax).toBeCloseTo(Math.max(0, tmt - regular), 0);
    expect(y.amtTax).toBe(0);
  });

  it('a California itemizer with SALT at the cap and a mortgage follows the hand rule', () => {
    // SALT at the $40,400 cap plus mortgage interest: the SALT line is
    // added back, the interest is not. Whatever the AMT comes to, it is the
    // rule's number, and it is not zero only when the tentative tax really
    // exceeds the regular one.
    const y = runProjection(working({ salary1: 450000, propertyTaxAnnual: 20000, stateOfResidence: 'CA', stateTaxState: 'ca', mortgageBalance: 600000, mortgageRate: 6, mortgagePayment: 45000 })).years[1];
    expect(y.itemizedSalt).toBeGreaterThan(30000);
    expect(y.itemizedMortgageInterest).toBeGreaterThan(20000);
    expectNoPhantomAmt({ ...y, filingStatus: 'Single' });
  });
});
