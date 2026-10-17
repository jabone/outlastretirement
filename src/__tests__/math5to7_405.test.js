// Changelog 405: the tax charged after the withdrawal solver, the foreign
// surtax and FTC limitation on a split year, and the QCD on Form 8606.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, priceForeignYear, readForeignTerms, QCD_LIMIT_2026 } from '../calculator';

const quiet = {
  ...DEFAULT_INPUTS, planYear: 2026, spouse2Enabled: false, filingStatus: 'Single',
  ss1: 0, ss2: 0, pension1: 0, pension2: 0, rentalIncome: 0, annuityIncome: 0, salary1: 0, partTimeIncome1: 0,
  preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, hsaContribution: 0, hsaInit: 0, cashFloorEnabled: false,
  taxBracketInflationRate: 0, inflationRate: 0, medicalInflationRate: 0, preRetireReturn: 0, postRetireReturn: 0,
  taxableDividendYield: 0, rothConversionStrategy: 'none', taxLossHarvestingEnabled: false, lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false,
};

describe('[5a] the ACA boost conversion\'s tax is split between federal and state', () => {
  it('a Georgia retiree in the coverage gap pays the boost\'s state tax as state, not federal', () => {
    const y0 = runProjection({
      ...quiet, birthYear1: 1966, retireAge1: 60, lifeExpectancy1: 90, claimingAge1: 70,
      stateOfResidence: 'GA', stateTaxState: 'state_rules',
      preTaxInit: 500000, rothInit: 200000, taxableInit: 100000, taxableBasisInit: 100000,
      lifestyleExpense: 25000, healthcareBridgeCost: 0, withdrawalStrategy: 'TaxableFirst',
      acaSubsidyProtectionEnabled: true,
    }).years[0];
    expect(y0.acaSubsidyBoost).toBeGreaterThan(10000);
    // Georgia's deduction is below the federal one, so the boost owes
    // Georgia something and the federal government nothing.
    expect(y0.extraTaxState).toBeGreaterThan(0);
    expect(y0.stateTax).toBeGreaterThan(0);
    expect(y0.extraTaxFederal).toBeCloseTo(0, 2);
    expect(y0.federalTax + y0.stateTax + y0.ficaTax).toBeCloseTo(y0.totalTaxesPaid, 6);
  });
});

describe('[5b] draws that fund the ACA clawback are taxed and penalized like any other', () => {
  const retiree58 = {
    ...quiet, birthYear1: 1968, retireAge1: 57, lifeExpectancy1: 90, claimingAge1: 70,
    stateTaxState: 'none', stateOfResidence: 'CO',
    preTaxInit: 1500000, rothInit: 300000, taxableInit: 0, lifestyleExpense: 40000, healthcareBridgeCost: 18000,
    withdrawalStrategy: 'RothFirst', rothConversionStrategy: 'fixed', rothConversionAmount: 150000, acaSubsidyAnnualValue: 8000,
  };
  it('a clawback funded from Pre-Tax at 58 costs the clawback plus income tax and the 10% penalty on the draw', () => {
    // Roth and Taxable empty: the clawback can only come from Pre-Tax.
    // No Roth and no conversion: spending alone crosses the cliff, and the
    // clawback can only come from Pre-Tax.
    const plan = { ...retiree58, rothInit: 0, rothConversionStrategy: 'none', lifestyleExpense: 70000, withdrawalStrategy: 'PreTaxFirst' };
    const y0 = runProjection(plan).years[0];
    expect(y0.acaSubsidyClawback).toBe(8000);
    expect(y0.drawRoth).toBe(0);
    // The same household with the credit priced as cost from the start
    // (no credit, an $8,000 dearer bridge) needs the same cash and owes
    // the same income tax on it; the only difference is that here $8,000 of
    // it is called a clawback. So the totals agree once the draw that paid
    // the clawback is taxed -- before changelog 405 this year was cheaper
    // by the tax and penalty on that draw.
    const none = runProjection({ ...plan, acaSubsidyAnnualValue: 0 }).years[0];
    expect(Math.abs(y0.drawPreTax - none.drawPreTax) / none.drawPreTax).toBeLessThan(0.005);
    expect(Math.abs(y0.totalTaxesPaid - (none.totalTaxesPaid + 8000)) / none.totalTaxesPaid).toBeLessThan(0.005);
    expect(y0.federalTax + y0.stateTax + y0.ficaTax).toBeCloseTo(y0.totalTaxesPaid, 6);
  });
  it('a clawback funded from Roth keeps the layer accounting and penalizes a young conversion', () => {
    // Roth empty at the start, so the only Roth money is this year's
    // conversion: the clawback drawn from it is a penalized young
    // conversion at 58 (10%), which the old funding never charged.
    const y0 = runProjection({ ...retiree58, rothInit: 0 }).years[0];
    expect(y0.acaSubsidyClawback).toBe(8000);
    expect(y0.drawRoth).toBeGreaterThan(8000);
    expect(y0.rothDrawFromBasis + y0.rothDrawEarningsTaxed).toBeCloseTo(y0.drawRoth, 2);
    expect(y0.rothDrawPenalized).toBeCloseTo(y0.drawRoth, 2);
    expect(y0.extraTaxFederal).toBeGreaterThan(8000 + 0.1 * 8000);
  });
});

describe('[6a] the foreign dividend surtax follows the split-year share', () => {
  const ctx = (yearShare) => ({
    f: readForeignTerms({ taxMode: 'brackets', brackets: [{ upTo: null, rate: 0 }], investmentRate: 0, dividendSurtax: 10, taxesInvestmentIncome: true, roth: 'respect' }),
    inflFactor: 1, fxFactor: 1, wages: 0, pension: 0, iraBase: 0, rentalAnnuity: 0, ssGross: 0, dividends: 40000, rothStart: 0, dividendYield: 0.04, yearShare,
  });
  const d = { preTaxOrdinary: 0, realizedGains: 0, rothDraw: 0, rothEarnings: 0, usRegularTax: 0, usOrdinaryIncome: 0, usCapGains: 0, usCapGainsTax: 0 };
  it('a December move owes one month of the surtax, not twelve', () => {
    expect(priceForeignYear(ctx(1), d).localTax).toBeCloseTo(4000, 2);
    expect(priceForeignYear(ctx(1 / 12), d).localTax).toBeCloseTo(4000 / 12, 2);
  });
});

describe('[6b] the s 904 limitation re-sources only the share of the year lived there', () => {
  const base = { ordinaryRate: 45, investmentRate: 0, roth: 'respect', treatyResourcing: true };
  const ctx = (terms, yearShare, cf = {}) => ({
    f: readForeignTerms(terms), inflFactor: 1, fxFactor: 1, wages: 0, pension: 0, iraBase: 120000, rentalAnnuity: 0, ssGross: 0,
    dividends: 0, rothStart: 0, dividendYield: 0, yearShare, cf,
  });
  it('a December move cannot credit one month of foreign tax against eleven months of US tax', () => {
    const d = { preTaxOrdinary: 0, realizedGains: 0, rothDraw: 0, rothEarnings: 0, usRegularTax: 18000, usOrdinaryIncome: 120000, usCapGains: 0, usCapGainsTax: 0 };
    const full = priceForeignYear(ctx(base, 1), d);
    const dec = priceForeignYear(ctx(base, 1 / 12), d);
    expect(full.credit.general).toBeCloseTo(18000, 0); // 45% local on $120k exceeds US tax; limit is all of it
    // One month: foreign tax 1/12 x 45% x 120k = 4,500; the limit is 1/12 of US tax = 1,500.
    expect(dec.credit.general).toBeCloseTo(1500, 0);
    expect(dec.creditable.general).toBeCloseTo(4500, 0);
  });
  it('a passive carryforward cannot shelter US tax on gains the country does not tax', () => {
    const d = { preTaxOrdinary: 0, realizedGains: 100000, rothDraw: 0, rothEarnings: 0, usRegularTax: 20000, usOrdinaryIncome: 0, usCapGains: 100000, usCapGainsTax: 15000 };
    const exempt = priceForeignYear(ctx({ ...base, taxesInvestmentIncome: false }, 1, { passive: 15000 }), d);
    expect(exempt.credit.passive).toBe(0);
    const taxed = priceForeignYear(ctx({ ...base, taxesInvestmentIncome: true, investmentRate: 20 }, 1, { passive: 15000 }), d);
    expect(taxed.credit.passive).toBeGreaterThan(0);
  });
});

describe('[7b] a QCD comes from the taxable part only, and leaves the Form 8606 ratio', () => {
  const at75 = {
    ...quiet, birthYear1: 1951, retireAge1: 65, lifeExpectancy1: 95, claimingAge1: 70,
    stateTaxState: 'none', stateOfResidence: 'TX', lifestyleExpense: 0, taxableInit: 1000000, taxableBasisInit: 1000000, rothInit: 0,
    withdrawalStrategy: 'TaxableFirst', qcdEnabled: true,
  };
  it('with 20% basis, the cash half of the RMD recovers basis over the pool less the QCD', () => {
    const y0 = runProjection({ ...at75, preTaxInit: 246000, preTaxBasisInit: 49200, qcdAnnualAmount: 5000 }).years[0];
    expect(y0.rmdAmount).toBeCloseTo(10000, 0);
    expect(y0.qcdAmount).toBeCloseTo(5000, 0);
    // 49,200 / (246,000 - 5,000) = 20.4149% of the $5,000 cash portion.
    expect(y0.rmdTaxableAmount).toBeCloseTo(5000 - 5000 * 49200 / 241000, 0);
  });
  it('is capped at the otherwise-taxable part of the account', () => {
    const y0 = runProjection({ ...at75, preTaxInit: 100000, preTaxBasisInit: 98000, qcdAnnualAmount: 4000 }).years[0];
    expect(y0.qcdAmount).toBeCloseTo(2000, 0);
    expect(QCD_LIMIT_2026).toBeGreaterThan(4000);
  });
});

describe('[7c] the IRMAA true-up\'s draw is in the year\'s settled income', () => {
  it('the MAGI the lookback will read includes the draw that paid the true-up', () => {
    // No pre-plan MAGI: year one is priced on its own settled income, and a
    // large Pre-Tax draw lifts the tier, so a true-up is owed and funded.
    const years = runProjection({
      ...quiet, birthYear1: 1958, retireAge1: 65, lifeExpectancy1: 95, claimingAge1: 70,
      stateTaxState: 'none', stateOfResidence: 'TX', preTaxInit: 3000000, rothInit: 0, taxableInit: 0,
      lifestyleExpense: 250000, withdrawalStrategy: 'PreTaxFirst',
    }).years;
    const y0 = years[0];
    expect(y0.irmaaTrueUp).toBeGreaterThan(0);
    // ordinaryTaxableIncome carries every Pre-Tax dollar drawn, true-up
    // included; the settled IRMAA MAGI must agree with it.
    expect(y0.irmaaMagi).toBeCloseTo(y0.ordinaryTaxableIncome + y0.stdDeduction + y0.seniorBonusDeduction, 0);
  });
});
