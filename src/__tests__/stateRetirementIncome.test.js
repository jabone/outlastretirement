// Changelog 120 / audit Q-15: Illinois, Pennsylvania and New York treat
// qualified-plan and IRA distributions (and Roth conversions) as exempt or
// excludable retirement income. The engine used to exempt only `pension`
// and tax every IRA withdrawal, RMD and conversion at the full state rate.
import { describe, it, expect } from 'vitest';
import { calculateStateTaxes, runProjection, DEFAULT_INPUTS, IL_EXEMPTION_ALLOWANCE } from '../calculator';

// Changelog 126 / audit Q-17: IL-1040 Step 4's exemption allowance now comes
// off before the 4.95% flat rate. Nobody here is 65, so it is the flat
// $2,850 personal allowance.
const IL_NET = (base) => Math.max(0, base - IL_EXEMPTION_ALLOWANCE) * 0.0495;

// income = 40,000 of IRA distributions + 10,000 of dividends, no pension, no SS.
const args = (state, age1, extras, status = 'Single', age2 = 65) =>
  calculateStateTaxes(50000, 0, 0, state, false, false, status, age1, age2, 5.0, 0, null, false, { federalTaxableSS: 0, ...extras });

describe('calculateStateTaxes — retirement distributions (Q-15)', () => {
  it('Illinois exempts IRA distributions and Roth conversions in full at any age', () => {
    const taxedInFull = args('il', 45, {});
    expect(taxedInFull).toBeCloseTo(IL_NET(50000), 2);
    expect(args('il', 45, { retirementDistributions: 40000 })).toBeCloseTo(IL_NET(10000), 2);
    expect(args('il', 45, { retirementDistributions: 30000, rothConversionTaxable: 10000 })).toBeCloseTo(IL_NET(10000), 2);
  });

  it('Pennsylvania exempts distributions only from 59½, but a conversion (rollover) at any age', () => {
    expect(args('pa', 58, { retirementDistributions: 40000 })).toBeCloseTo(50000 * 0.0307, 2);
    expect(args('pa', 60, { retirementDistributions: 40000 })).toBeCloseTo(10000 * 0.0307, 2);
    expect(args('pa', 58, { rothConversionTaxable: 40000 })).toBeCloseTo(10000 * 0.0307, 2);
  });

  it('New York shares the $20,000-per-person exclusion between private pension and IRA money at 59½+', () => {
    // Single, 62, no pension: $20,000 of the $40,000 IRA distribution excluded.
    const single = calculateStateTaxes(50000, 0, 0, 'ny', false, false, 'Single', 62, 65, 5, 0,
      { stateExempt: 0, private1: 0, private2: 0 }, false, { federalTaxableSS: 0, retirementDistributions: 40000 });
    const singleNoRoom = calculateStateTaxes(50000, 0, 0, 'ny', false, false, 'Single', 62, 65, 5, 0,
      { stateExempt: 0, private1: 0, private2: 0 }, false, { federalTaxableSS: 0 });
    expect(single).toBeLessThan(singleNoRoom);
    // With a $15,000 private pension already using $15,000 of the cap, only $5,000 of room remains.
    const withPension = calculateStateTaxes(65000, 15000, 0, 'ny', false, false, 'Single', 62, 65, 5, 0,
      { stateExempt: 0, private1: 15000, private2: 0 }, false, { federalTaxableSS: 0, retirementDistributions: 40000 });
    const withPensionNoIra = calculateStateTaxes(25000, 15000, 0, 'ny', false, false, 'Single', 62, 65, 5, 0,
      { stateExempt: 0, private1: 15000, private2: 0 }, false, { federalTaxableSS: 0 });
    // Taxable base: 65,000 − 15,000 pension + 0 taxable pension − 5,000 = 45,000 vs 25,000 − 15,000 = 10,000.
    expect(withPension).toBeGreaterThan(withPensionNoIra);
    // Under 59½: no exclusion for IRA money at all.
    const young = calculateStateTaxes(50000, 0, 0, 'ny', false, false, 'Single', 55, 65, 5, 0,
      { stateExempt: 0, private1: 0, private2: 0 }, false, { federalTaxableSS: 0, retirementDistributions: 40000 });
    expect(young).toBeCloseTo(singleNoRoom, 2);
    // A couple both 59½+ pools two $20,000 caps.
    const couple = calculateStateTaxes(50000, 0, 0, 'ny', false, false, 'MFJ', 62, 63, 5, 0,
      { stateExempt: 0, private1: 0, private2: 0 }, false, { federalTaxableSS: 0, retirementDistributions: 40000 });
    expect(couple).toBeLessThan(single);
  });

  it('leaves every other jurisdiction and the no-extras path unchanged', () => {
    // Colorado left this list in changelog 125 (Q-14c): its $20,000/$24,000
    // pension-and-annuity subtraction now covers IRA distributions too.
    for (const st of ['ca', 'va', 'flat_5']) {
      expect(args(st, 62, { retirementDistributions: 40000 })).toBeCloseTo(args(st, 62, {}), 6);
    }
    expect(args('il', 62, {})).toBeCloseTo(IL_NET(50000), 2);
  });
});

describe('runProjection — IL / PA / NY retirement income end to end (Q-15)', () => {
  const retiree = (stateTaxState, over) => ({
    ...DEFAULT_INPUTS,
    planYear: 2026, spouse2Enabled: false, filingStatus: 'Single',
    birthYear1: 1964, retireAge1: 60, lifeExpectancy1: 90, claimingAge1: 70,
    ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0,
    salary1: 0, partTimeIncome1: 0,
    preTaxInit: 1000000, rothInit: 200000, taxableInit: 0, hsaInit: 0, cashFloorEnabled: false,
    preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, hsaContribution: 0,
    lifestyleExpense: 20000, healthcareBridgeCost: 0, withdrawalStrategy: 'RothFirst',
    stateTaxState, stateOfResidence: stateTaxState.toUpperCase(),
    taxBracketInflationRate: 0, inflationRate: 0,
    rothConversionStrategy: 'fixed', rothConversionAmount: 60000,
    taxLossHarvestingEnabled: false, lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false,
    ...over,
  });
  // Federal tax on the same year, isolated by running the identical plan in a no-tax state.
  const federalOnly = (over) => runProjection(retiree('none', over)).years[0].totalTaxesPaid;

  it('an Illinois Roth ladder pays no state tax on the conversion', () => {
    const il = runProjection(retiree('il')).years[0];
    expect(il.convertAmount).toBe(60000);
    expect(il.totalTaxesPaid).toBeCloseTo(federalOnly(), 0);
  });

  it('a Pennsylvania conversion is untaxed at 62; a pre-59½ Pre-Tax draw is not', () => {
    const pa = runProjection(retiree('pa')).years[0];
    expect(pa.totalTaxesPaid).toBeCloseTo(federalOnly(), 0);
    // Age 57, drawing from Pre-Tax first with no conversion: PA taxes the draw.
    const young = { birthYear1: 1969, retireAge1: 56, withdrawalStrategy: 'PreTaxFirst', rothConversionStrategy: 'none', lifestyleExpense: 50000 };
    const paYoung = runProjection(retiree('pa', young)).years[0];
    expect(paYoung.discretionaryDrawPreTax).toBeGreaterThan(0);
    expect(paYoung.totalTaxesPaid).toBeGreaterThan(federalOnly(young) + 0.03 * paYoung.discretionaryDrawPreTax * 0.9);
  });

  it('a New York conversion gets the $20,000 exclusion and the rest is taxed', () => {
    const ny = runProjection(retiree('ny')).years[0];
    const fed = federalOnly();
    const stateTax = ny.totalTaxesPaid - fed;
    // NY tax on ($60,000 − $20,000 − standard deduction) is well under NY tax on the whole $60,000.
    expect(stateTax).toBeGreaterThan(0);
    const nyStateOnFull = calculateStateTaxes(60000, 0, 0, 'ny', false, false, 'Single', 62, 65, 5, 0,
      { stateExempt: 0, private1: 0, private2: 0 }, false, { federalTaxableSS: 0, calendarYear: 2026 });
    expect(stateTax).toBeLessThan(nyStateOnFull);
  });
});
