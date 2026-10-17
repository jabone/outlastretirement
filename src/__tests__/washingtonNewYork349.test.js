// Changelog 349: Washington's capital gains excise tax and 2028 income tax
// (the 'wa' jurisdiction), Washington's graduated estate-tax table, and the
// New York rate steps confirmed against Tax Law s 601.
//
// Every expected figure below is worked by hand from the law, not read back
// from the engine:
//   capital gains tax  RCW 82.87.040: 7% of Washington capital gains, +2.9%
//                      of the part over $1,000,000 (from tax year 2025);
//                      standard deduction $278,000 (2025, the latest
//                      published), one per household (RCW 82.87.060).
//   income tax         ESSB 6346 (2026): 9.9% from 2028 on federal AGI less
//                      all long-term gains plus the Washington capital gains,
//                      less a $1,000,000 deduction (one per household), with
//                      the capital gains tax as a nonrefundable credit.
//   estate tax         dor.wa.gov Table W for deaths from July 1, 2026, on
//                      the estate less the $3,000,000 exclusion.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS,
  runProjection,
  calculateStateTaxes,
  washingtonStateTax,
  washingtonIncomeTaxDeduction,
  stateGrossEstateTax,
  calculateStateEstateInheritanceTax,
  stateTaxJurisdictionFor,
  newYorkEraForYear,
  WA_CAPITAL_GAINS_STD_DEDUCTION,
  STATE_TAX_JURISDICTIONS,
} from '../calculator';

describe('Washington capital gains excise tax', () => {
  it('is 7% of long-term gains above the standard deduction, with nothing on wages or retirement income before 2028', () => {
    expect(WA_CAPITAL_GAINS_STD_DEDUCTION).toBe(278000);
    // $500,000 of gains: 7% x (500,000 - 278,000) = 15,540.
    const r = washingtonStateTax(600000, 500000, 2027);
    expect(r.capitalGainsTax).toBeCloseTo(15540, 6);
    expect(r.incomeTax).toBe(0);
    expect(r.total).toBeCloseTo(15540, 6);
    // Gains under the deduction owe nothing; neither does any other income.
    expect(washingtonStateTax(5000000, 278000, 2027).total).toBe(0);
  });

  it('adds 2.9% on Washington capital gains over $1,000,000', () => {
    // $1,500,000 of gains: 1,222,000 taxable -> 7% = 85,540, plus 2.9% of
    // 222,000 = 6,438 -> 91,978.
    expect(washingtonStateTax(1500000, 1500000, 2026).total).toBeCloseTo(91978, 6);
  });

  it('grows the deduction with the year\'s indexing factor', () => {
    // Factor 1.1 -> deduction 305,800; $500,000 of gains -> 7% x 194,200.
    expect(washingtonStateTax(500000, 500000, 2027, 1.1).total).toBeCloseTo(0.07 * (500000 - 305800), 6);
  });
});

describe('Washington income tax from 2028', () => {
  it('taxes income over $1,000,000 at 9.9%, Social Security, pensions and IRA money included', () => {
    // No gains: 9.9% x (2,000,000 - 1,000,000) = 99,000.
    expect(washingtonStateTax(2000000, 0, 2028).total).toBeCloseTo(99000, 6);
    // Through calculateStateTaxes: none of the state's pension or SS
    // subtractions apply (there are none in the law).
    const t = (year) => calculateStateTaxes(3000000, 100000, 40000, 'wa', false, false, 'MFJ', 70, 70, 5, 0, null, false, { calendarYear: year });
    expect(t(2027)).toBe(0);
    expect(t(2028)).toBeCloseTo(0.099 * 2000000, 6);
  });

  it('credits the capital gains tax against the income tax, so the larger of the two is paid', () => {
    // AGI 2,000,000 of which 1,500,000 gains: capital gains tax 91,978 (above).
    // Base = 500,000 + 1,222,000 = 1,722,000 -> 9.9% x 722,000 = 71,478,
    // wholly covered by the credit.
    const gainsHeavy = washingtonStateTax(2000000, 1500000, 2028);
    expect(gainsHeavy.incomeTaxBeforeCredit).toBeCloseTo(71478, 6);
    expect(gainsHeavy.incomeTax).toBe(0);
    expect(gainsHeavy.total).toBeCloseTo(91978, 6);
    // AGI 3,000,000 of which 500,000 gains: capital gains tax 15,540. Base =
    // 2,500,000 + 222,000 = 2,722,000 -> 9.9% x 1,722,000 = 170,478; after the
    // credit 154,938; total 170,478.
    const mixed = washingtonStateTax(3000000, 500000, 2028);
    expect(mixed.capitalGainsTax).toBeCloseTo(15540, 6);
    expect(mixed.incomeTax).toBeCloseTo(154938, 6);
    expect(mixed.total).toBeCloseTo(170478, 6);
  });

  it('holds the $1,000,000 deduction through 2029, then adds one year of inflation every second year', () => {
    const f = (y) => Math.pow(1.03, y - 2026);
    expect(washingtonIncomeTaxDeduction(2028, f(2028))).toBe(1000000);
    expect(washingtonIncomeTaxDeduction(2029, f(2029))).toBe(1000000);
    expect(washingtonIncomeTaxDeduction(2030, f(2030))).toBe(1030000);
    expect(washingtonIncomeTaxDeduction(2031, f(2031))).toBe(1030000);
    // 1,000,000 x 1.03^2 = 1,060,900 -> nearest $1,000.
    expect(washingtonIncomeTaxDeduction(2032, f(2032))).toBe(1061000);
  });

  it('shares one deduction between spouses who file separately', () => {
    // Two MFS returns splitting $2,400,000 evenly in 2028: each return gets
    // half the one $1,000,000 deduction -> 9.9% x 700,000 x 2 = 138,600, the
    // same as one joint return (9.9% x 1,400,000).
    const extras = { calendarYear: 2028, mfsSplitPct: 50 };
    const mfs = calculateStateTaxes(2400000, 0, 0, 'wa', false, false, 'MFS', 60, 60, 5, 0, null, false, extras);
    expect(mfs).toBeCloseTo(138600, 6);
    // Capital gains in 2026, $3,000,000 split evenly: each return's gains
    // 1,500,000 less half the deduction (139,000) = 1,361,000 -> 95,270 +
    // 2.9% x 361,000 (10,469) = 105,739 per return; 211,478 in all.
    const mfsGains = calculateStateTaxes(3000000, 0, 0, 'wa', false, false, 'MFS', 60, 60, 5, 0, null, false,
      { calendarYear: 2026, mfsSplitPct: 50, longTermGains: 3000000 });
    expect(mfsGains).toBeCloseTo(211478, 6);
  });

  it('is a jurisdiction of its own, chosen for a Washington resident', () => {
    expect(STATE_TAX_JURISDICTIONS).toContain('wa');
    expect(stateTaxJurisdictionFor('WA')).toBe('wa');
    expect(stateTaxJurisdictionFor('TX')).toBe('none');
  });
});

describe('Washington in the projection', () => {
  // A retiree drawing a zero-basis taxable account: every dollar drawn is a
  // realized long-term gain, found by the withdrawal solver.
  const retiree = {
    ...DEFAULT_INPUTS,
    birthYear1: 1956, retireAge1: 60, claimingAge1: 67, lifeExpectancy1: 95,
    salary1: 0, preTaxInit: 0, rothInit: 0,
    taxableInit: 8000000, taxableBasisInit: 0, lifestyleExpense: 600000,
    withdrawalStrategy: 'TaxableFirst',
  };
  const stateTaxIn = (p, y) => p.years.find((r) => r.year === y).stateTax;

  it('taxes the gains the solver realizes in Washington, and nothing under "Tax-Free State"', () => {
    const wa = runProjection({ ...retiree, stateOfResidence: 'WA', stateTaxState: 'wa' });
    const none = runProjection({ ...retiree, stateOfResidence: 'WA', stateTaxState: 'none' });
    expect(none.years.every((r) => r.stateTax === 0)).toBe(true);
    const row = wa.years.find((r) => r.year === 2026);
    // The year's realized gains (well over the deduction, under $1.278M)
    // less the $278,000 deduction, at 7%; dividends are not gains.
    expect(row.realizedGains).toBeGreaterThan(300000);
    expect(row.realizedGains).toBeLessThan(1278000);
    expect(row.stateTax).toBeCloseTo(0.07 * (row.realizedGains - 278000), 0);
  });

  it('taxes the gain on a Life-Event withdrawal from the taxable account', () => {
    const base = { ...retiree, stateOfResidence: 'WA', stateTaxState: 'wa' };
    const withEvent = {
      ...base,
      milestones: [{ id: 'e', name: 'Gift', type: 'outflow', amount: 800000, startAge: 71, endAge: 71, targetAccount: 'taxable' }],
    };
    // The year's tax before the solver's draw holds only the Life-Event
    // gain: none without the event, 7% of the gain over the deduction with
    // it (the account's basis is its reinvested dividends, so the gain is
    // most but not all of the withdrawal).
    const baseTax = (inputs) => runProjection(inputs).years.find((r) => r.year === 2027).baseStateTax;
    expect(baseTax(base)).toBe(0);
    const withTax = baseTax(withEvent);
    expect(withTax).toBeGreaterThan(0.07 * 100000);
    expect(withTax).toBeLessThan(0.07 * (800000 * 1.03 - 278000));
  });

  it('follows a move to Washington on the residency timeline', () => {
    const moved = runProjection({
      ...retiree, stateOfResidence: 'TX', stateTaxState: 'none',
      residencyTimeline: [{ id: 'm', fromYear: 2028, kind: 'domestic', stateOfResidence: 'WA' }],
    });
    expect(stateTaxIn(moved, 2027)).toBe(0);
    expect(stateTaxIn(moved, 2028)).toBeGreaterThan(0);
  });
});

describe('Washington estate tax table', () => {
  // Excess over $3,000,000 run through Table W.
  it.each([
    [2500000, 0],
    [3000000, 0],
    [3500000, 50000],        // 10% x 500,000
    [4250000, 135000],       // 100,000 + 14% x 250,000
    [5000000, 240000],       // 100,000 + 14% x 1,000,000
    [8000000, 730000],       // 550,000 + 18% x 1,000,000
    [12000000, 1490000],     // 9,000,000 taxable -> the last row's base
    [20000000, 3090000],     // 1,490,000 + 20% x 8,000,000
  ])('an estate of %i owes %i', (estate, tax) => {
    expect(stateGrossEstateTax('WA', estate)).toBeCloseTo(tax, 6);
  });

  it('does not index the $3,000,000 exclusion or double it for a couple', () => {
    expect(stateGrossEstateTax('WA', 5000000, { inflationFactor: 1.5, married: true })).toBeCloseTo(240000, 6);
    expect(calculateStateEstateInheritanceTax('WA', 5000000, 0.5)).toBeCloseTo(120000, 6);
  });
});

describe('New York rate steps (Tax Law s 601 as amended by the 2025-26 budget)', () => {
  it('uses 3.9% in 2026, 3.8% from 2027 through 2032, and the 8.82% top rate from 2033', () => {
    expect(newYorkEraForYear(2026).single[0].rate).toBe(0.039);
    expect(newYorkEraForYear(2026).mfj.map((b) => b.rate).slice(0, 5)).toEqual([0.039, 0.044, 0.0515, 0.054, 0.059]);
    expect(newYorkEraForYear(2027).mfj.map((b) => b.rate).slice(0, 5)).toEqual([0.038, 0.043, 0.0505, 0.053, 0.058]);
    expect(newYorkEraForYear(2032).single[0].rate).toBe(0.038);
    const top2033 = newYorkEraForYear(2033).single;
    expect(top2033[top2033.length - 1].rate).toBe(0.0882);
  });
});
