// Changelog 418: Wisconsin leaves the ACA coverage-gap list (BadgerCare
// covers adults to the poverty line), and a QCD is allowed from the year
// the owner turns 71 (70 1/2 in the law) with or without an RMD, and is
// no longer capped at the RMD.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, ACA_NON_EXPANSION_STATES, QCD_START_AGE, QCD_LIMIT_2026 } from '../calculator';

const START = DEFAULT_INPUTS.planYear;

describe('Wisconsin', () => {
  it('is not a coverage-gap state; the nine that are stay', () => {
    expect(ACA_NON_EXPANSION_STATES.has('WI')).toBe(false);
    expect([...ACA_NON_EXPANSION_STATES].sort()).toEqual(['AL', 'FL', 'GA', 'KS', 'MS', 'SC', 'TN', 'TX', 'WY']);
  });

  it('a low-income early retiree in Wisconsin is never flagged in the gap, nor forced to convert', () => {
    const plan = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: START - 60, retireAge1: 60, salary1: 0,
      preTaxInit: 400000, taxableInit: 600000, taxableBasisInit: 600000, rothInit: 0, lifestyleExpense: 30000,
      withdrawalStrategy: 'TaxableFirst', acaSubsidyProtectionEnabled: true, acaCreditSource: 'manual',
    };
    const wi = runProjection({ ...plan, stateOfResidence: 'WI', stateTaxState: 'state_rules' }).years.slice(0, 5);
    expect(wi.every((y) => !y.inAcaCoverageGap && y.acaSubsidyBoost === 0)).toBe(true);
    // The same household in Texas is in the gap and is lifted out of it.
    const tx = runProjection({ ...plan, stateOfResidence: 'TX', stateTaxState: 'none' }).years.slice(0, 5);
    expect(tx.some((y) => y.acaSubsidyBoost > 0)).toBe(true);
  });
});

describe('QCDs from 70 1/2', () => {
  const giver = {
    ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: START - 69, retireAge1: 65, salary1: 0,
    preTaxInit: 800000, taxableInit: 300000, rothInit: 0, lifestyleExpense: 40000, qcdAnnualAmount: 20000,
  };

  it('the start age is 71 in whole years, before any RMD', () => {
    expect(QCD_START_AGE).toBe(71);
    const years = runProjection(giver).years;
    const at70 = years.find((y) => y.age1 === 70);
    const at71 = years.find((y) => y.age1 === 71);
    const at72 = years.find((y) => y.age1 === 72);
    expect(at70.qcdAmount).toBe(0);
    expect(at71.rmdAmount).toBe(0);          // born 1957: RMDs from 73
    expect(at71.qcdAmount).toBeCloseTo(20000, 6);
    expect(at72.qcdAmount).toBeCloseTo(20000, 6);
  });

  it('a QCD before RMDs leaves the IRA, is never income, and never reaches the household', () => {
    const with_ = runProjection(giver).years;
    const without = runProjection({ ...giver, qcdAnnualAmount: 0 }).years;
    const a = with_.find((y) => y.age1 === 71);
    const b = without.find((y) => y.age1 === 71);
    expect(a.rmdTaxableAmount).toBe(0);
    expect(a.ordinaryTaxableIncome).toBeCloseTo(b.ordinaryTaxableIncome, 0);
    // The $20,000 came out of Pre-Tax (plus the growth it would have earned)
    // and went nowhere else.
    expect(b.preTaxEnd - a.preTaxEnd).toBeGreaterThanOrEqual(20000);
    expect(b.preTaxEnd - a.preTaxEnd).toBeLessThan(20000 * 1.1);
    expect(a.totalExpenses).toBeCloseTo(b.totalExpenses, 0);
  });

  it('once RMDs begin, a QCD larger than the RMD satisfies it and the excess is a further tax-free distribution', () => {
    // Born 1953 (RMDs from 73), $200,000 IRA: the RMD is about $7,500, the
    // QCD asked for is $20,000.
    const big = { ...giver, birthYear1: START - 74, preTaxInit: 200000 };
    const y = runProjection(big).years[0];
    expect(y.rmdAmount).toBeGreaterThan(5000);
    expect(y.rmdAmount).toBeLessThan(10000);
    expect(y.qcdAmount).toBeCloseTo(20000, 6);
    expect(y.rmdTaxableAmount).toBe(0);
    const none = runProjection({ ...big, qcdAnnualAmount: 0 }).years[0];
    const excess = 20000 - y.rmdAmount;
    expect(none.preTaxEnd - y.preTaxEnd).toBeGreaterThanOrEqual(excess);
    expect(none.preTaxEnd - y.preTaxEnd).toBeLessThan(excess * 1.1);
  });

  it('is still capped at the IRS limit, the balance, and the taxable part of the account', () => {
    const y = runProjection({ ...giver, qcdAnnualAmount: 500000 }).years.find((x) => x.age1 === 71);
    expect(y.qcdAmount).toBeCloseTo(QCD_LIMIT_2026 * Math.pow(1 + DEFAULT_INPUTS.inflationRate / 100, y.year - START), 0);
    const small = runProjection({ ...giver, preTaxInit: 5000, qcdAnnualAmount: 20000 }).years.find((x) => x.age1 === 71);
    expect(small.qcdAmount).toBeLessThanOrEqual(5000 * 1.5);
    const basis = runProjection({ ...giver, preTaxInit: 30000, preTaxBasisInit: 30000, qcdAnnualAmount: 20000 }).years.find((x) => x.age1 === 71);
    // All basis at the start: only the growth since is taxable money, and
    // only that much can be given.
    expect(basis.qcdAmount).toBeLessThan(5000);
    expect(basis.qcdAmount).toBeGreaterThan(0);
  });
});
