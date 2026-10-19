// Changelog 119: the ACA 400%-of-FPL subsidy cliff, the exact Social
// Security taxability worksheet, and the HSA in the heir estate model.
//
// The Social Security fixture is lifted verbatim from an independent
// source -- The Ways To Wealth's "Why Tax Brackets Matter More After You
// Stop Working" (R.J. Weiss, CFP, 2026): Diane and Tom, both 68, MFJ,
// $40,000 of Social Security + $24,000 pension, then a $40,000 IRA
// withdrawal. Their published figures ($0 tax before; $6,000 -> $34,000 of
// taxable benefits; $47,500 of deductions; $50,500 taxable; $5,564 tax)
// are reproduced here to the dollar, which makes this a genuine external
// cross-check of the engine's 2026 federal math rather than a self-test.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, calculateHeirEstateTax, getFederalPovertyLevel,
  ACA_SUBSIDY_CLIFF_FPL_MULTIPLE,
} from '../calculator';

const dianeAndTom = {
  ...DEFAULT_INPUTS,
  planYear: 2026, spouse2Enabled: true, filingStatus: 'MFJ',
  birthYear1: 1958, birthYear2: 1958, retireAge1: 60, retireAge2: 60, lifeExpectancy1: 90, lifeExpectancy2: 90,
  // Born 1958: FRA is 66 and 8 months (changelog 124, Q-7), so claim exactly there to keep the booklet's $40,000.
  claimingAge1: 66 + 8 / 12, claimingAge2: 66 + 8 / 12, ss1: 20000, ss2: 20000, ssSpousalEnabled1: false, ssSpousalEnabled2: false,
  pension1: 24000, pensionStartAge1: 65, pension1COLA: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0,
  salary1: 0, salary2: 0, partTimeIncome1: 0, partTimeIncome2: 0,
  preTaxInit: 1000000, rothInit: 100000, taxableInit: 0, hsaInit: 0, cashFloorEnabled: false,
  lifestyleExpense: 15000, healthcareBridgeCost: 0, ltcActive1: false, ltcActive2: false,
  stateTaxState: 'none', stateOfResidence: 'TX', taxBracketInflationRate: 0, inflationRate: 0, ssCOLA: 0,
  rothConversionStrategy: 'none', qcdAnnualAmount: 0, backdoorRothEnabled: false, taxLossHarvestingEnabled: false,
  lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false,
  taxableContribution: 0, preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, hsaContribution: 0,
};

describe('Social Security taxability uses the exact IRS worksheet (changelog 119, audit Q-5)', () => {
  it('Diane & Tom before the withdrawal: $6,000 of benefits taxable, $0 federal tax', () => {
    const y0 = runProjection(dianeAndTom).years[0];
    // Provisional income $24,000 + 50% x $40,000 = $44,000: exactly at the
    // upper threshold, so 50% of the $12,000 excess over $32,000.
    expect(y0.taxableSS).toBeCloseTo(6000, 0);
    expect(y0.stdDeduction).toBeCloseTo(47500, 0); // $32,200 + 2 x $1,650 + $12,000 senior bonus
    expect(y0.totalTaxesPaid).toBeCloseTo(0, 0);
  });

  it('Diane & Tom after a $40,000 IRA withdrawal: 85% taxable, $50,500 taxable income, $5,564 tax', () => {
    // A fixed Roth conversion is taxed identically to a withdrawal and
    // keeps the solver out of it.
    const y0 = runProjection({ ...dianeAndTom, rothConversionStrategy: 'fixed', rothConversionAmount: 40000 }).years[0];
    expect(y0.convertAmount).toBe(40000);
    expect(y0.taxableSS).toBeCloseTo(34000, 0);
    // $40,000 + $34,000 + $24,000 - $47,500 = $50,500 -> 10% x $24,800 + 12% x $25,700
    expect(y0.totalTaxesPaid).toBeCloseTo(5564, 0);
  });

  it('is monotone and capped: the 85% ceiling still applies well above the threshold', () => {
    const y0 = runProjection({ ...dianeAndTom, rothConversionStrategy: 'fixed', rothConversionAmount: 200000 }).years[0];
    expect(y0.taxableSS).toBeCloseTo(40000 * 0.85, 0);
  });
});

describe('ACA 400% FPL subsidy cliff (changelog 119)', () => {
  // Single early retiree, 58, living off Taxable + Roth with a big Pre-Tax
  // balance she converts aggressively. For 2026 coverage the single cliff
  // is 4 x the 2025 guideline, $15,650 = $62,600 (changelog 409; until then
  // the app read the 2026 figure, $63,840).
  const earlyRetiree = {
    ...DEFAULT_INPUTS,
    planYear: 2026, spouse2Enabled: false, filingStatus: 'Single',
    birthYear1: 1968, retireAge1: 57, lifeExpectancy1: 90, claimingAge1: 70,
    ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0,
    salary1: 0, partTimeIncome1: 0,
    preTaxInit: 1500000, rothInit: 300000, taxableInit: 0, hsaInit: 0, cashFloorEnabled: false,
    // Off here so the "protection off" cases below test what they say;
    // the default has been on since changelog 443.
    acaCliffProtectionEnabled: false,
    preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, hsaContribution: 0,
    lifestyleExpense: 40000, healthcareBridgeCost: 18000, withdrawalStrategy: 'RothFirst',
    stateTaxState: 'none', stateOfResidence: 'CO', // expansion state: no coverage-gap branch
    taxBracketInflationRate: 0, inflationRate: 0, medicalInflationRate: 0,
    rothConversionStrategy: 'fixed', rothConversionAmount: 150000,
    taxLossHarvestingEnabled: false, lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false,
  };
  const cliff = ACA_SUBSIDY_CLIFF_FPL_MULTIPLE * getFederalPovertyLevel(1);

  it('exposes the year\'s ACA MAGI and threshold and flags a breach when protection is off', () => {
    const y0 = runProjection(earlyRetiree).years[0];
    expect(y0.acaCliffThreshold).toBeCloseTo(cliff, 0);
    expect(y0.convertAmount).toBe(150000);
    expect(y0.acaMagi).toBeGreaterThan(cliff);
    expect(y0.acaCliffBreached).toBe(true);
    expect(y0.acaCliffCappedConversion).toBe(0);
  });

  it('caps the voluntary conversion at the cliff when protection is on', () => {
    const y0 = runProjection({ ...earlyRetiree, acaCliffProtectionEnabled: true }).years[0];
    expect(y0.convertAmount).toBeCloseTo(cliff, 0); // no other income, so the whole line is headroom
    expect(y0.acaCliffCappedConversion).toBeCloseTo(150000 - cliff, 0);
    expect(y0.acaMagi).toBeLessThanOrEqual(cliff + 0.01);
    expect(y0.acaCliffBreached).toBe(false);
  });

  it('nets the estimated premium tax credit out of the healthcare bridge while eligible', () => {
    const y0 = runProjection({ ...earlyRetiree, acaCliffProtectionEnabled: true, acaCreditSource: 'manual', acaSubsidyAnnualValue: 8000 }).years[0];
    expect(y0.acaSubsidyApplied).toBe(8000);
    expect(y0.healthcareBridge).toBe(10000);
    expect(y0.acaSubsidyClawback).toBe(0);
  });

  it('claws the whole credit back as tax in a year that crosses the cliff', () => {
    const over = runProjection({ ...earlyRetiree, acaCreditSource: 'manual', acaSubsidyAnnualValue: 8000 }).years[0];
    const under = runProjection({ ...earlyRetiree, acaCreditSource: 'manual', acaSubsidyAnnualValue: 8000, acaCliffProtectionEnabled: true }).years[0];
    expect(over.acaCliffBreached).toBe(true);
    expect(over.acaSubsidyClawback).toBe(8000);
    expect(under.acaSubsidyClawback).toBe(0);
    // The repaid credit is tax, so the breached year's tax bill carries it.
    expect(over.totalTaxesPaid - under.totalTaxesPaid).toBeGreaterThan(8000);
  });

  it('is inert once on Medicare and when both new inputs are at their defaults', () => {
    const proj = runProjection(earlyRetiree);
    const age66 = proj.years.find(y => y.age1 === 66);
    expect(age66.acaCliffThreshold).toBe(0);
    expect(age66.acaMagi).toBe(0);
    expect(age66.acaCliffBreached).toBe(false);
    // Cliff Protection is on by default since 443 but inert without a
    // marketplace year and a conversion, so the historical golden holds
    // (see calculator.test.js); the typed credit defaults to 0.
    expect(DEFAULT_INPUTS.acaCliffProtectionEnabled).toBe(true);
    expect(DEFAULT_INPUTS.acaSubsidyAnnualValue).toBe(0);
  });
});

describe('HSA in the heir estate model (changelog 119, audit Q-13 partial)', () => {
  const oneChild = { ...DEFAULT_INPUTS, heirs: [{ id: 1, name: 'Kid', filingStatus: 'Single', income: 100000, splitPct: 100 }] };

  it('taxes a non-spouse heir on the whole HSA as ordinary income in year one', () => {
    const r = calculateHeirEstateTax(oneChild, 0, 0, 0, 0, 0, false, 200000);
    expect(r.hsaInherited).toBe(200000);
    expect(r.grossInherited).toBe(200000);
    // $200,000 stacked on $100,000 of the heir's own income: a real bill,
    // well above 22% marginal -- the point of the booklet's red row.
    // Changelog 127 / audit Q-13: the heir's brackets and their own income
    // are now carried to the plan's final year together, which widens the
    // bands slightly against a nominal inheritance and brings the effective
    // rate just under 24%. The bill is still the great majority of a
    // quarter of the account, which is what this test is here to show.
    expect(r.totalHsaHeirTax).toBeGreaterThan(200000 * 0.22);
    expect(r.totalHsaHeirTax).toBeLessThan(200000 * 0.37);
    expect(r.netInherited).toBeCloseTo(200000 - r.totalHsaHeirTax, 2);
    expect(r.perHeir[0].hsaHeirTax).toBeCloseTo(r.totalHsaHeirTax, 2);
  });

  it('adds nothing when there is no HSA, and defaults the new argument to 0', () => {
    const withoutArg = calculateHeirEstateTax(oneChild, 500000, 100000, 100000);
    const withZero = calculateHeirEstateTax(oneChild, 500000, 100000, 100000, 0, 0, false, 0);
    expect(withZero.netInherited).toBe(withoutArg.netInherited);
    expect(withoutArg.totalHsaHeirTax).toBe(0);
  });

  it('splits the HSA across heirs by share, each taxed at their own income', () => {
    const two = { ...DEFAULT_INPUTS, heirs: [
      { id: 1, name: 'A', filingStatus: 'Single', income: 40000, splitPct: 50 },
      { id: 2, name: 'B', filingStatus: 'Single', income: 400000, splitPct: 50 },
    ] };
    const r = calculateHeirEstateTax(two, 0, 0, 0, 0, 0, false, 100000);
    expect(r.perHeir[0].hsaInherited).toBe(50000);
    expect(r.perHeir[1].hsaInherited).toBe(50000);
    expect(r.perHeir[1].hsaHeirTax).toBeGreaterThan(r.perHeir[0].hsaHeirTax);
  });
});

describe('the cliff sits where the marketplace puts it (changelog 409)', () => {
  // A couple, both 60, retired, on the marketplace, converting to the cliff
  // with protection on. 2026 coverage is measured against the 2025
  // guidelines: 4 x $21,150 = $84,600. Until 409 the engine read the 2026
  // guideline and let a conversion run to $86,560 -- over the real line,
  // which forfeits the whole year's credit.
  const couple = {
    ...DEFAULT_INPUTS,
    planYear: 2026, spouse2Enabled: true, filingStatus: 'MFJ',
    birthYear1: 1966, birthYear2: 1966, retireAge1: 59, retireAge2: 59, lifeExpectancy1: 90, lifeExpectancy2: 90, claimingAge1: 70, claimingAge2: 70,
    ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0, salary1: 0, salary2: 0, partTimeIncome1: 0, partTimeIncome2: 0,
    preTaxInit: 2000000, rothInit: 500000, taxableInit: 0, hsaInit: 0, cashFloorEnabled: false,
    preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0, hsaContribution: 0,
    lifestyleExpense: 50000, healthcareBridgeCost: 24000, acaCreditSource: 'manual', acaSubsidyAnnualValue: 14000, withdrawalStrategy: 'RothFirst',
    stateTaxState: 'none', stateOfResidence: 'CO',
    taxBracketInflationRate: 0, inflationRate: 0, medicalInflationRate: 0,
    rothConversionStrategy: 'fixed', rothConversionAmount: 200000, acaCliffProtectionEnabled: true,
    taxLossHarvestingEnabled: false, lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false,
  };
  it('caps a couple\'s 2026 conversion at $84,600 of ACA MAGI, not $86,560', () => {
    const y = runProjection(couple).years[0];
    expect(y.acaCliffThreshold).toBe(84600);
    expect(y.acaMagi).toBeLessThanOrEqual(84600 + 0.01);
    expect(y.acaMagi).toBeGreaterThan(84000);
    expect(y.acaCliffBreached).toBe(false);
  });
  it('2027 coverage reads the 2026 guideline; later years index it', () => {
    const years = runProjection({ ...couple, taxBracketInflationRate: 2 }).years;
    expect(years[1].acaCliffThreshold).toBe(4 * 21640);
    expect(years[2].acaCliffThreshold).toBeCloseTo(4 * 21640 * 1.02, 6);
  });
});
