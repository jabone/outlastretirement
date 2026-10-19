// Changelog 417: the federal return takes the larger of the standard
// deduction and the itemized total the engine can see -- SALT under the
// OBBBA cap, mortgage interest on acquisition debt, cash gifts after the
// 0.5% floor, medical over 7.5% of AGI -- plus the non-itemizer charitable
// deduction from 2026.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS,
  itemizedDeductionFor, saltCapFor, nonItemizerCharitableFor,
  SALT_CAP_BY_YEAR, MORTGAGE_ACQUISITION_DEBT_LIMIT,
} from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';

const START = DEFAULT_INPUTS.planYear;

describe('the pieces', () => {
  it('SALT cap: $40,400 for 2026, +1%/yr to 2029, $10,000 from 2030, phased down over $505,000, half for MFS', () => {
    expect(SALT_CAP_BY_YEAR[2025]).toBe(40000);
    expect(saltCapFor(2026, 'MFJ', 100000)).toBe(40400);
    expect(saltCapFor(2027, 'Single', 0)).toBe(40804);
    expect(saltCapFor(2029, 'MFJ', 0)).toBe(41624);
    expect(saltCapFor(2030, 'MFJ', 0)).toBe(10000);
    expect(saltCapFor(2024, 'MFJ', 0)).toBe(10000);
    // $550,000: 30% of the $45,000 over the line comes off.
    expect(saltCapFor(2026, 'MFJ', 550000)).toBeCloseTo(40400 - 13500, 6);
    // Far over: the floor.
    expect(saltCapFor(2026, 'MFJ', 900000)).toBe(10000);
    expect(saltCapFor(2026, 'MFS', 0)).toBe(20200);
    expect(saltCapFor(2026, 'MFS', 400000)).toBe(5000);
  });

  it('non-itemizer charitable deduction: from 2026, $1,000 / $2,000 MFJ', () => {
    expect(nonItemizerCharitableFor(2025, 'MFJ', 5000)).toBe(0);
    expect(nonItemizerCharitableFor(2026, 'MFJ', 5000)).toBe(2000);
    expect(nonItemizerCharitableFor(2026, 'MFJ', 500)).toBe(500);
    expect(nonItemizerCharitableFor(2026, 'Single', 5000)).toBe(1000);
    expect(nonItemizerCharitableFor(2026, 'MFS', 5000)).toBe(1000);
    expect(nonItemizerCharitableFor(2026, 'Single', 0)).toBe(0);
  });

  it('the four lines: cap, pro-rated mortgage, charity floor and limit, medical floor', () => {
    const r = itemizedDeductionFor({
      magi: 100000, status: 'MFJ', year: 2026, stateTax: 5000, propertyTax: 9000,
      mortgageInterest: 30000, mortgageBalance: 1000000, charitable: 10000, medical: 20000,
    });
    expect(r.salt).toBe(14000);
    expect(r.mortgage).toBeCloseTo(30000 * (MORTGAGE_ACQUISITION_DEBT_LIMIT / 1000000), 6);
    expect(r.charitable).toBeCloseTo(10000 - 500, 6);
    expect(r.medical).toBeCloseTo(20000 - 7500, 6);
    expect(r.total).toBeCloseTo(r.salt + r.mortgage + r.charitable + r.medical, 6);
    // Capped SALT; a mortgage under the limit in full; a HELOC not at all.
    expect(itemizedDeductionFor({ magi: 100000, status: 'MFJ', year: 2026, stateTax: 30000, propertyTax: 20000 }).salt).toBe(40400);
    expect(itemizedDeductionFor({ magi: 100000, status: 'MFJ', year: 2026, mortgageInterest: 12000, mortgageBalance: 300000 }).mortgage).toBe(12000);
    expect(itemizedDeductionFor({ magi: 100000, status: 'MFJ', year: 2026, mortgageInterest: 12000, mortgageBalance: 300000, mortgageAcquisition: false }).mortgage).toBe(0);
    // Gifts over 60% of AGI are cut to it; the floor only applies from 2026.
    expect(itemizedDeductionFor({ magi: 10000, status: 'Single', year: 2026, charitable: 9000 }).charitable).toBeCloseTo(6000 - 50, 6);
    expect(itemizedDeductionFor({ magi: 10000, status: 'Single', year: 2025, charitable: 1000 }).charitable).toBe(1000);
    // Medical under the floor is nothing; a negative MAGI reads as zero.
    expect(itemizedDeductionFor({ magi: 100000, status: 'Single', year: 2026, medical: 7000 }).medical).toBe(0);
    expect(itemizedDeductionFor({ magi: -5000, status: 'Single', year: 2026, medical: 7000 }).medical).toBe(7000);
  });
});

// A California couple retired at 60/58 living out of a $1.5m IRA, with a
// $400,000 mortgage at 6%, $12,000 of property tax and $8,000 of gifts:
// state tax, property tax, mortgage interest and the pre-65 bridge add up
// well past the standard deduction.
const itemizer = {
  ...DEFAULT_INPUTS, birthYear1: START - 62, birthYear2: START - 60, spouse2Enabled: true, filingStatus: 'MFJ',
  retireAge1: 60, retireAge2: 58, salary1: 0, salary2: 0, preTaxInit: 1500000, taxableInit: 300000, rothInit: 0,
  lifestyleExpense: 90000, stateOfResidence: 'CA', stateTaxState: 'ca', withdrawalStrategy: 'PreTaxFirst',
  propertyTaxAnnual: 12000, charitableGivingAnnual: 8000, mortgageBalance: 400000, mortgageRate: 6, mortgagePayment: 30000,
};

describe('in a plan', () => {
  it('is auto by default; the default plan and the demo households still take the standard deduction', () => {
    expect(DEFAULT_INPUTS.itemizeDeductions).toBe('auto');
    expect(DEFAULT_INPUTS.propertyTaxAnnual).toBe(0);
    expect(DEFAULT_INPUTS.charitableGivingAnnual).toBe(0);
    const plain = runProjection(DEFAULT_INPUTS);
    expect(plain.years.every((y) => y.deductionUsed === 'standard')).toBe(true);
    expect(plain.endingBalance).toBeCloseTo(131245.5150, 2);
    expect(buildDemoInputs().itemizeDeductions).toBe('never');
    expect(buildParkersInputs().itemizeDeductions).toBe('never');
  });

  it('itemizes when the lines beat the standard deduction, with the parts on the row', () => {
    const years = runProjection(itemizer).years;
    const y1 = years[1];
    expect(y1.deductionUsed).toBe('itemized');
    expect(y1.itemizedDeduction).toBeGreaterThan(50000);
    expect(y1.itemizedDeduction).toBeCloseTo(y1.itemizedSalt + y1.itemizedMortgageInterest + y1.itemizedCharitable + y1.itemizedMedical, 6);
    // SALT is last year's settled state tax plus this year's property tax.
    expect(y1.itemizedSalt).toBeCloseTo(years[0].stateTax + 12000 * (1 + DEFAULT_INPUTS.housingInflationRate / 100), 0);
    // Year one has no prior state tax to count: property tax only.
    expect(years[0].itemizedSalt).toBeCloseTo(12000, 6);
    // Mortgage interest on $400,000 at 6% in year one, then the lower balance.
    expect(years[0].itemizedMortgageInterest).toBeCloseTo(24000, 6);
    expect(y1.itemizedMortgageInterest).toBeLessThan(24000);
    expect(y1.itemizedMortgageInterest).toBeGreaterThan(23000);
    // Gifts after the 0.5% floor; medical over 7.5%.
    expect(y1.itemizedCharitable).toBeGreaterThan(0);
    expect(y1.itemizedCharitable).toBeLessThan(8000 * 1.03);
    expect(y1.itemizedMedical).toBeGreaterThan(0);
    expect(y1.nonItemizerCharitable).toBe(0);
    // The row's deduction is the itemized total plus any senior bonus (none under 65).
    expect(y1.stdDeduction).toBeCloseTo(y1.itemizedDeduction, 6);
  });

  it('lowers the tax against the standard deduction, and "never" restores it', () => {
    const auto = runProjection(itemizer).years[1];
    const never = runProjection({ ...itemizer, itemizeDeductions: 'never' }).years[1];
    expect(never.deductionUsed).toBe('standard');
    expect(never.itemizedDeduction).toBe(0);
    expect(never.nonItemizerCharitable).toBe(2000);
    expect(auto.federalTax).toBeLessThan(never.federalTax);
    expect(auto.ordinaryTaxableIncome).toBeLessThan(never.ordinaryTaxableIncome);
  });

  it('a standard-deduction year still deducts gifts up to the non-itemizer cap', () => {
    const giver = { ...DEFAULT_INPUTS, charitableGivingAnnual: 5000, spouse2Enabled: false, filingStatus: 'Single' };
    const y = runProjection(giver).years[0];
    const none = runProjection({ ...giver, charitableGivingAnnual: 0 }).years[0];
    expect(y.deductionUsed).toBe('standard');
    expect(y.nonItemizerCharitable).toBe(1000);
    expect(y.stdDeduction - none.stdDeduction).toBeCloseTo(1000, 6);
    expect(y.federalTax).toBeLessThan(none.federalTax);
  });

  it('leaves a HELOC out, and two MFS returns on the standard deduction', () => {
    const heloc = runProjection({ ...itemizer, mortgageIsAcquisitionDebt: false }).years[1];
    expect(heloc.itemizedMortgageInterest).toBe(0);
    expect(heloc.itemizedDeduction).toBeLessThan(runProjection(itemizer).years[1].itemizedDeduction);
    const mfs = runProjection({ ...itemizer, filingStatus: 'MFS', mfsLivedWithSpouse: true, mfsIncomeSplitPct: 50 }).years[1];
    expect(mfs.deductionUsed).toBe('standard');
  });

  it('the SALT cap binds in a high-tax state', () => {
    const rich = { ...itemizer, preTaxInit: 6000000, lifestyleExpense: 400000, propertyTaxAnnual: 40000 };
    const y = runProjection(rich).years[1];
    expect(y.deductionUsed).toBe('itemized');
    expect(y.itemizedSalt).toBeLessThanOrEqual(40400);
  });
});
