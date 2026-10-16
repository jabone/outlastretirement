// Changelog 125: the second Q-list batch of 2026-09-02 -- Q-21 (inherited
// IRA annual RMDs under the 2024 final regulations), Q-10(a) (rents and
// annuities in the NIIT base) and Q-14 (Colorado: Social Security by age
// band, IRA money inside the pension subtraction, the under-55 military
// cap, and a federal-taxable-income starting point). Q-16 (California
// military exclusion is per return) was confirmed as-is.
import { describe, it, expect } from 'vitest';
import {
  runProjection, calculateHeirEstateTax, DEFAULT_INPUTS,
  calculateCapitalGainsTaxes, calculateStateTaxes,
  SINGLE_LIFE_TABLE, singleLifeExpectancy, heirInheritanceContext, coloradoMilitarySubtraction,
} from '../calculator';

describe('Q-21: inherited IRA annual RMDs (Reg. 1.401(a)(9)-5(d))', () => {
  it('carries the 2022 Single Life Table', () => {
    expect(SINGLE_LIFE_TABLE[30]).toBe(55.3);
    expect(SINGLE_LIFE_TABLE[65]).toBe(22.9);
    expect(SINGLE_LIFE_TABLE[90]).toBe(5.7);
    expect(singleLifeExpectancy(130)).toBe(1.0);
    expect(singleLifeExpectancy(-3)).toBe(84.6);
  });

  it('reads the heir age and the decedent RBD status from the plan', () => {
    // Spouse 1 born 1980 (46 in 2026), life expectancy 90 -> dies 2070, 44 years out.
    const ctx = heirInheritanceContext({ ...DEFAULT_INPUTS, spouse2Enabled: false }, { age: 20 });
    expect(ctx.yearsUntilDeath).toBe(44);
    expect(ctx.heirAgeYearAfterDeath).toBe(65);
    // Born 1980 -> RMD age 75; dying at 90 is past the RBD.
    expect(ctx.decedentPastRbd).toBe(true);
    // No age entered: assumed 30 years younger than spouse 1 (16 today).
    expect(heirInheritanceContext({ ...DEFAULT_INPUTS, spouse2Enabled: false }, {}).heirAgeYearAfterDeath).toBe(61);
    // Dying at 70 (before 75) is not past the RBD.
    expect(heirInheritanceContext({ ...DEFAULT_INPUTS, spouse2Enabled: false, lifeExpectancy1: 70 }, {}).decedentPastRbd).toBe(false);
  });

  it('is the default schedule: small required minimums in years 1-9, the balance in year 10', () => {
    expect(DEFAULT_INPUTS.heirDistributionStrategy).toBe('rmd_10');
    const res = calculateHeirEstateTax({ ...DEFAULT_INPUTS, spouse2Enabled: false, heirs: [{ id: 1, name: 'H', filingStatus: 'Single', income: 100000, splitPct: 100, relationship: 'child', age: 20 }] }, 1000000, 0, 0);
    const h = res.perHeir[0];
    expect(h.distributionStrategy).toBe('rmd_10');
    const w = h.annualWithdrawals.map(r => r.withdrawal);
    // Year 1: balance grown one year / greater of heir LE (65 -> 22.9) and
    // decedent LE (90 -> 5.7).
    const g = 1 + DEFAULT_INPUTS.postRetireReturn / 100;
    expect(w[0]).toBeCloseTo(1000000 * g / 22.9, 2);
    // Denominator shrinks by one each year: year 2 uses 21.9.
    const bal1 = 1000000 * g - w[0];
    expect(w[1]).toBeCloseTo(bal1 * g / 21.9, 2);
    // Years 1-9 are small; year 10 is the remainder and the largest.
    expect(Math.max(...w.slice(0, 9))).toBeLessThan(w[9]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(h.preTaxWithdrawn, 6);
  });

  it('requires nothing in years 1-9 when the owner died before the RBD', () => {
    const res = calculateHeirEstateTax({ ...DEFAULT_INPUTS, spouse2Enabled: false, lifeExpectancy1: 70 }, 1000000, 0, 0);
    const w = res.perHeir[0].annualWithdrawals.map(r => r.withdrawal);
    expect(w.slice(0, 9).every(x => x === 0)).toBe(true);
    expect(w[9]).toBeGreaterThan(1000000);
  });

  it('a year-10 lump sum is not permitted after the RBD and is replaced by the RMD schedule', () => {
    const past = calculateHeirEstateTax({ ...DEFAULT_INPUTS, spouse2Enabled: false, heirDistributionStrategy: 'lump_sum_end' }, 1000000, 0, 0).perHeir[0];
    expect(past.distributionStrategyChosen).toBe('lump_sum_end');
    expect(past.distributionStrategy).toBe('rmd_10');
    expect(past.strategyOverridden).toBe(true);
    const before = calculateHeirEstateTax({ ...DEFAULT_INPUTS, spouse2Enabled: false, lifeExpectancy1: 70, heirDistributionStrategy: 'lump_sum_end' }, 1000000, 0, 0).perHeir[0];
    expect(before.distributionStrategy).toBe('lump_sum_end');
    expect(before.strategyOverridden).toBe(false);
  });

  it('the annual minimums spread the heir\'s tax versus a year-10 lump sum and versus flat_10', () => {
    const base = { ...DEFAULT_INPUTS, spouse2Enabled: false, lifeExpectancy1: 70 }; // pre-RBD so all three are allowed
    const rmd = calculateHeirEstateTax({ ...base, heirDistributionStrategy: 'rmd_10' }, 2000000, 0, 0).totalHeirTax;
    const lump = calculateHeirEstateTax({ ...base, heirDistributionStrategy: 'lump_sum_end' }, 2000000, 0, 0).totalHeirTax;
    // Before the RBD rmd_10 collapses to the year-10 lump sum.
    expect(rmd).toBeCloseTo(lump, 2);
    const pastBase = { ...DEFAULT_INPUTS, spouse2Enabled: false };
    const rmdPast = calculateHeirEstateTax({ ...pastBase, heirDistributionStrategy: 'rmd_10' }, 2000000, 0, 0).totalHeirTax;
    const flat = calculateHeirEstateTax({ ...pastBase, heirDistributionStrategy: 'flat_10' }, 2000000, 0, 0).totalHeirTax;
    // Flat tenths keep the heir in lower brackets than the back-loaded RMD schedule.
    expect(flat).toBeLessThan(rmdPast);
  });
});

describe('Q-10(a): rents and annuity income are net investment income', () => {
  it('widens the NIIT base without touching the capital-gains bands', () => {
    // MFJ, taxable ordinary $260,000 (deduction 32,200 -> AGI ~292,200), gains $10,000.
    const gainsOnly = calculateCapitalGainsTaxes(260000, 10000, 'MFJ', 1, 32200, 0, 0);
    const withRents = calculateCapitalGainsTaxes(260000, 10000, 'MFJ', 1, 32200, 0, 30000);
    // Both: 10,000 at 15% = 1,500. NIIT: MAGI 302,200 - 250,000 = 52,200 excess;
    // gains-only NII 10,000 -> 380; with rents NII 40,000 -> 1,520.
    expect(gainsOnly).toBeCloseTo(1500 + 10000 * 0.038, 2);
    expect(withRents).toBeCloseTo(1500 + 40000 * 0.038, 2);
  });
  it('owes NIIT on rents alone when there are no gains', () => {
    expect(calculateCapitalGainsTaxes(300000, 0, 'Single', 1, 16100, 0, 20000)).toBeCloseTo(20000 * 0.038, 2);
    expect(calculateCapitalGainsTaxes(100000, 0, 'Single', 1, 16100, 0, 20000)).toBe(0);
  });
  it('flows through the projection: a high earner with rental income pays more than one without', () => {
    const base = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: 1976, retireAge1: 67,
      salary1: 250000, taxableInit: 200000, stateTaxState: 'none',
    };
    const without = runProjection({ ...base, rentalIncome: 0 }).years[0];
    const withRent = runProjection({ ...base, rentalIncome: 30000 }).years[0];
    // Rent is ordinary income (brackets) AND NII: the tax difference exceeds
    // the bracket tax on $30,000 alone by 3.8% of it.
    const bracketOnly = 30000 * 0.24; // 24% band at this income
    expect(withRent.totalTaxesPaid - without.totalTaxesPaid).toBeGreaterThan(bracketOnly + 30000 * 0.038 - 1);
  });
});

describe('Q-14: Colorado', () => {
  // income = pension 30,000 + IRA 40,000 + other 10,000 = 80,000; SS 20,000
  // gross of which 17,000 is federally taxable.
  const co = (age1, age2, status, extras = {}, income = 80000, pension = 30000) =>
    calculateStateTaxes(income, pension, 20000, 'co', true, true, status, age1, age2, 5, 0, null, false, { federalTaxableSS: 17000, federalAGI: income, ...extras });

  it('(a) Social Security: exempt at 65+, exempt at 55-64 only under the AGI limit, taxed under 55', () => {
    const at70 = co(70, 65, 'Single', { retirementDistributions: 40000 });
    // SS fully exempt, and it uses the same $24,000 cap (Colorado DOR: the
    // SS subtraction "will reduce the subtraction an individual can claim
    // for any other pension and annuity income"): 24,000 - 17,000 = 7,000
    // left for the pension and IRA money.
    expect(at70).toBeCloseTo((80000 - 17000 - 7000) * 0.044, 2);
    // 58, AGI 80,000 > 75,000: SS competes for the $20,000 cap.
    const at58High = co(58, 65, 'Single', { retirementDistributions: 40000 });
    expect(at58High).toBeCloseTo((80000 - 20000) * 0.044, 2);
    // 58, AGI 70,000 <= 75,000: SS fully exempt; it uses 17,000 of the
    // $20,000 cap, leaving 3,000 for the rest.
    const at58Low = co(58, 65, 'Single', { retirementDistributions: 40000, federalAGI: 70000 }, 70000);
    expect(at58Low).toBeCloseTo((70000 - 17000 - 3000) * 0.044, 2);
    // 50: nothing subtracted at all -- no cap, SS taxed.
    const at50 = co(50, 65, 'Single', { retirementDistributions: 40000 });
    expect(at50).toBeCloseTo(80000 * 0.044, 2);
  });

  it('(c) IRA distributions and conversions share the cap, unless premature', () => {
    // 66, no pension: $40,000 of IRA money -> the 7,000 of cap SS left.
    const ira = co(66, 65, 'Single', { retirementDistributions: 40000 }, 50000, 0);
    expect(ira).toBeCloseTo((50000 - 17000 - 7000) * 0.044, 2);
    const conv = co(66, 65, 'Single', { rothConversionTaxable: 40000 }, 50000, 0);
    expect(conv).toBeCloseTo(ira, 6);
    // 57 (premature) with the same IRA money: nothing qualifies; SS in cap
    // (AGI 50,000 <= 75,000 -> SS fully exempt), cap unused.
    const early = co(57, 65, 'Single', { retirementDistributions: 40000 }, 50000, 0);
    expect(early).toBeCloseTo((50000 - 17000) * 0.044, 2);
  });

  it('(b) military retirement: $15,000 under 55 (through 2028), inside the ordinary cap from 55', () => {
    expect(coloradoMilitarySubtraction(30000, 50, 65, 'Single', 2026)).toBe(15000);
    expect(coloradoMilitarySubtraction(10000, 50, 65, 'Single', 2026)).toBe(10000);
    expect(coloradoMilitarySubtraction(30000, 58, 65, 'Single', 2026)).toBe(0);
    expect(coloradoMilitarySubtraction(30000, 50, 65, 'Single', 2029)).toBe(0);
    expect(coloradoMilitarySubtraction(40000, 50, 52, 'MFJ', 2026)).toBe(30000);
    // 50-year-old with a $30,000 military pension and nothing else: $15,000 comes off.
    const t = calculateStateTaxes(30000, 30000, 0, 'co', true, true, 'Single', 50, 65, 5, 30000, null, false, { federalTaxableSS: 0, federalAGI: 30000 });
    expect(t).toBeCloseTo(15000 * 0.044, 2);
  });

  it('(e) the base is federal TAXABLE income, so the standard deduction comes off', () => {
    const noDed = co(70, 65, 'Single', { retirementDistributions: 40000 });
    const withDed = co(70, 65, 'Single', { retirementDistributions: 40000, federalDeduction: 16100 });
    expect(noDed - withDed).toBeCloseTo(16100 * 0.044, 2);
    // (d) the rate stays 4.4%.
    expect(co(70, 65, 'Single', { retirementDistributions: 40000, federalDeduction: 0 })).toBeCloseTo((80000 - 17000 - 7000) * 0.044, 2);
  });

  it('flows through the projection for a Colorado retiree', () => {
    const retiree = {
      ...DEFAULT_INPUTS, planYear: 2026, spouse2Enabled: false, filingStatus: 'Single',
      birthYear1: 1958, retireAge1: 60, lifeExpectancy1: 90, claimingAge1: 66 + 8 / 12, ss1: 24000, ss2: 0,
      pension1: 0, salary1: 0, preTaxInit: 1500000, rothInit: 0, taxableInit: 0, lifestyleExpense: 70000,
      stateTaxState: 'co', stateOfResidence: 'CO', inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
      rothConversionStrategy: 'none', withdrawalStrategy: 'PreTaxFirst', cashFloorEnabled: false,
    };
    const y0 = runProjection(retiree).years[0];
    // 68: SS exempt, up to $24,000 of the IRA draw subtracted, and the
    // federal standard deduction (16,100 + 2,050 + senior bonus) off the base.
    const stateOnlyBase = { ...retiree, stateTaxState: 'none' };
    const fedOnly = runProjection(stateOnlyBase).years[0];
    const coTax = y0.totalTaxesPaid - fedOnly.totalTaxesPaid;
    // The draw is roughly $70,000 + tax; SS exempt; 24,000 off; ~24,150 of
    // deduction off -> a base well under the draw. Bound it: more than 0,
    // less than 4.4% of the whole draw.
    expect(coTax).toBeGreaterThan(0);
    expect(coTax).toBeLessThan(y0.drawPreTax * 0.044);
  });
});
