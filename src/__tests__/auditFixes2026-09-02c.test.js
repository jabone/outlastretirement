// Changelog 126: the TAX_RULES_SPEC Section 6 questions closed on 2026-09-02
// in the third batch of the day -- Q-17 (state standard deductions and the
// Illinois exemption allowance), Q-8 (an HSA cannot pay pre-Medicare
// insurance premiums) and Q-9 (pension lump sums, the s 72(b) annuity
// exclusion ratio, and after-tax basis pro-rata on every Pre-Tax
// distribution rather than only on Roth conversions).
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, calculateStateTaxes,
  illinoisExemptionAllowance,
  CA_STD_DEDUCTION_SINGLE, CA_STD_DEDUCTION_MFJ,
  NY_STD_DEDUCTION_SINGLE, NY_STD_DEDUCTION_MFJ,
  IL_EXEMPTION_ALLOWANCE, IL_EXEMPTION_AGE_65,
  IL_EXEMPTION_AGI_LIMIT_SINGLE, IL_EXEMPTION_AGI_LIMIT_MFJ,
} from '../calculator';
import { assertKnownInputKeys } from './knownInputKeys';

describe('Q-17: states subtract their own standard deduction before their rate schedule', () => {
  it('California uses the FTB 540 amounts, not the federal deduction and not zero', () => {
    expect(CA_STD_DEDUCTION_SINGLE).toBe(5706);
    expect(CA_STD_DEDUCTION_MFJ).toBe(2 * CA_STD_DEDUCTION_SINGLE);
    // The deduction shifts the whole schedule down by its own amount: two
    // incomes $5,706 apart, both inside the flat 9.3% band and both below
    // the exemption-credit phase-out, differ by exactly one bracket step.
    const at200k = calculateStateTaxes(200000, 0, 0, 'ca', false, false, 'Single', 70, 70);
    const atLess = calculateStateTaxes(200000 - CA_STD_DEDUCTION_SINGLE, 0, 0, 'ca', false, false, 'Single', 70, 70);
    expect(at200k - atLess).toBeCloseTo(CA_STD_DEDUCTION_SINGLE * 0.093, 2);
    // Income at or below the deduction owes nothing at all.
    expect(calculateStateTaxes(CA_STD_DEDUCTION_SINGLE, 0, 0, 'ca', false, false, 'Single', 70, 70)).toBe(0);
    expect(calculateStateTaxes(CA_STD_DEDUCTION_MFJ, 0, 0, 'ca', false, false, 'MFJ', 70, 70)).toBe(0);
  });

  it('New York uses Tax Law s 614: $8,000 single, $16,050 joint, and MFS on the single figure', () => {
    expect(NY_STD_DEDUCTION_SINGLE).toBe(8000);
    expect(NY_STD_DEDUCTION_MFJ).toBe(16050);
    expect(calculateStateTaxes(NY_STD_DEDUCTION_SINGLE, 0, 0, 'ny', false, false, 'Single', 70, 70)).toBe(0);
    expect(calculateStateTaxes(NY_STD_DEDUCTION_SINGLE, 0, 0, 'ny', false, false, 'MFS', 70, 70)).toBe(0);
    expect(calculateStateTaxes(NY_STD_DEDUCTION_MFJ, 0, 0, 'ny', false, false, 'MFJ', 70, 70)).toBe(0);
    // Joint gets more than twice single's slice off, so the same income is
    // taxed less jointly than the doubled-single shortcut would give.
    expect(NY_STD_DEDUCTION_MFJ).toBeGreaterThan(2 * NY_STD_DEDUCTION_SINGLE);
  });

  it('Illinois subtracts the IL-1040 Step 4 exemption allowance, with the 65+ addition', () => {
    expect(illinoisExemptionAllowance(50000, 'Single', 45)).toBe(IL_EXEMPTION_ALLOWANCE);
    expect(illinoisExemptionAllowance(50000, 'Single', 70)).toBe(IL_EXEMPTION_ALLOWANCE + IL_EXEMPTION_AGE_65);
    // Joint: two personal exemptions, plus $1,000 for each spouse who is 65+.
    expect(illinoisExemptionAllowance(50000, 'MFJ', 60, 60)).toBe(2 * IL_EXEMPTION_ALLOWANCE);
    expect(illinoisExemptionAllowance(50000, 'MFJ', 70, 60)).toBe(2 * IL_EXEMPTION_ALLOWANCE + IL_EXEMPTION_AGE_65);
    expect(illinoisExemptionAllowance(50000, 'MFJ', 70, 70)).toBe(2 * (IL_EXEMPTION_ALLOWANCE + IL_EXEMPTION_AGE_65));
  });

  it('the Illinois allowance disappears entirely above the AGI limit -- a cliff, not a phase-out', () => {
    expect(illinoisExemptionAllowance(IL_EXEMPTION_AGI_LIMIT_SINGLE, 'Single', 45)).toBe(IL_EXEMPTION_ALLOWANCE);
    expect(illinoisExemptionAllowance(IL_EXEMPTION_AGI_LIMIT_SINGLE + 1, 'Single', 45)).toBe(0);
    expect(illinoisExemptionAllowance(IL_EXEMPTION_AGI_LIMIT_MFJ, 'MFJ', 45, 45)).toBe(2 * IL_EXEMPTION_ALLOWANCE);
    expect(illinoisExemptionAllowance(IL_EXEMPTION_AGI_LIMIT_MFJ + 1, 'MFJ', 45, 45)).toBe(0);
    expect(IL_EXEMPTION_AGI_LIMIT_MFJ).toBe(2 * IL_EXEMPTION_AGI_LIMIT_SINGLE);
  });

  it('flows through the projection: CA and NY charge the plan, but less than the gross income implies', () => {
    const base = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1956, retireAge1: 60,
      salary1: 0, ss1: 0, ss2: 0, pension1: 90000, pensionStartAge1: 60, pension1COLA: 0,
      preTaxInit: 0, rothInit: 0, taxableInit: 0, lifestyleExpense: 40000,
      inflationRate: 0, taxBracketInflationRate: 0, stateTaxPensionTaxable: true,
    };
    const none = runProjection({ ...base, stateTaxState: 'none' }).years[0].totalTaxesPaid;
    // Illinois is not in this loop: it exempts pension income outright, so
    // its allowance is only visible on income it actually taxes (unit-tested
    // above against IL-1040 Step 4).
    for (const st of ['ca', 'ny']) {
      const withState = runProjection({ ...base, stateTaxState: st }).years[0].totalTaxesPaid;
      // The state still charges something...
      expect(withState).toBeGreaterThan(none);
      // ...but less than it would with no deduction at all, which is what
      // taxing the same plan on $X + the deduction would have produced.
      const grossed = runProjection({ ...base, stateTaxState: st, pension1: 90000 + 20000 }).years[0].totalTaxesPaid;
      expect(withState).toBeLessThan(grossed);
    }
  });
});

describe('Q-8: an HSA cannot pay pre-Medicare insurance premiums (IRS Pub. 969)', () => {
  const hsaPlan = {
    ...DEFAULT_INPUTS, spouse2Enabled: false, retireAge1: 60, birthYear1: 2026 - 60,
    healthcareBridgeCost: 20000, hsaInit: 500000, hsaContribution: 0,
    inflationRate: 0, ltcActive1: false,
  };

  it('only the non-premium share of the bridge is drawn tax-free by default', () => {
    const y = runProjection(hsaPlan).years.find(r => r.isRetired);
    // Default split: 70% premiums, so 30% of $20,000 is qualified.
    expect(y.hsaMedicalDraw).toBeCloseTo(20000 * 0.30, 2);
  });

  it('the premium share is a dial, and 0% restores the old whole-bridge behavior', () => {
    const none = runProjection({ ...hsaPlan, healthcareBridgePremiumPct: 0 }).years.find(r => r.isRetired);
    expect(none.hsaMedicalDraw).toBeCloseTo(20000, 2);
    const all = runProjection({ ...hsaPlan, healthcareBridgePremiumPct: 100 }).years.find(r => r.isRetired);
    expect(all.hsaMedicalDraw).toBeCloseTo(0, 2);
    const half = runProjection({ ...hsaPlan, healthcareBridgePremiumPct: 50 }).years.find(r => r.isRetired);
    expect(half.hsaMedicalDraw).toBeCloseTo(10000, 2);
  });

  it('the COBRA / unemployment exception makes the whole bridge qualified again', () => {
    const y = runProjection({ ...hsaPlan, hsaPreMedicarePremiumsQualified: true }).years.find(r => r.isRetired);
    expect(y.hsaMedicalDraw).toBeCloseTo(20000, 2);
  });

  it('Medicare premiums and long-term care stay fully qualified -- the exceptions Pub. 969 lists', () => {
    // Age 70: no bridge at all, but LTC premiums are an explicit exception
    // and IRMAA is a Medicare premium, so both still come out of the HSA.
    const old = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, retireAge1: 70, birthYear1: 2026 - 70,
      healthcareBridgeCost: 0, hsaInit: 500000, hsaContribution: 0, inflationRate: 0,
      ltcActive1: true, ltcCost1: 60000, ltcStartAge1: 70, ltcDurationYears1: 5,
    };
    assertKnownInputKeys(old);
    const y = runProjection(old).years[0];
    expect(y.hsaMedicalDraw).toBeGreaterThan(0);
  });
});

describe('Q-9(a): a pension lump sum is ordinary income unless it is rolled over', () => {
  const lumpPlan = {
    ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 2026 - 65, retireAge1: 65,
    salary1: 0, ss1: 0, ss2: 0, pension1: 40000, pensionStartAge1: 65,
    pension1LumpSum: true, pension1LumpSumValue: 400000,
    preTaxInit: 0, rothInit: 0, taxableInit: 100000, lifestyleExpense: 40000,
    inflationRate: 0, taxBracketInflationRate: 0, stateTaxState: 'none',
  };

  it('taken in cash it is taxed as ordinary income in the year received', () => {
    const y = runProjection(lumpPlan).years[0];
    expect(y.pension).toBeCloseTo(400000, 0);
    expect(y.ordinaryTaxableIncome).toBeGreaterThan(350000);
    expect(y.totalTaxesPaid).toBeGreaterThan(80000);
  });

  it('rolled over it is not income, not spendable cash, and lands in Pre-Tax', () => {
    const y = runProjection({ ...lumpPlan, pension1LumpSumRollover: true }).years[0];
    expect(y.pension).toBeCloseTo(0, 6);
    expect(y.preTaxEnd).toBeGreaterThan(350000);
    expect(y.ordinaryTaxableIncome).toBeLessThan(50000);
    // The lump sum is no longer paying the bills, so the plan must draw
    // elsewhere -- but it is not paying $80,000 of tax on it either.
    expect(y.totalTaxesPaid).toBeLessThan(runProjection(lumpPlan).years[0].totalTaxesPaid);
  });

  it('a government or military lump sum keeps that source\'s state treatment', () => {
    const inState = { ...lumpPlan, stateTaxState: 'ny', governmentPension1: true };
    const govt = runProjection(inState).years[0];
    const priv = runProjection({ ...inState, governmentPension1: false }).years[0];
    // NY exempts government pensions in full; a private one only gets $20,000.
    expect(govt.totalTaxesPaid).toBeLessThan(priv.totalTaxesPaid);
  });
});

describe('Q-9(b): the IRC s 72(b) exclusion ratio on a non-qualified annuity', () => {
  const annuityPlan = {
    ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 2026 - 65, retireAge1: 65,
    lifeExpectancy1: 85, salary1: 0, ss1: 0, ss2: 0, pension1: 0,
    annuityPurchaseAmount: 200000, annuityPurchaseAge: 65, annuityPayoutRate: 6.0,
    annuityIndexation: 0, annuitySourceAccount: 'taxable', annuityIsTaxable: false,
    preTaxInit: 0, rothInit: 0, taxableInit: 500000, lifestyleExpense: 10000,
    // All basis, so the brokerage sale that pays the premium and the draws
    // that pay the extra tax realize no gain: the two runs compared below
    // then differ by the excluded annuity slice alone. (Since the 2026-09-30
    // fix (E18) the premium sale takes basis pro rata, so with a partial
    // basis the all-taxable twin's larger draw realized more gain.)
    taxableBasisInit: 500000,
    inflationRate: 0, taxBracketInflationRate: 0, stateTaxState: 'none',
    hsaInit: 0, hsaContribution: 0, healthcareBridgeCost: 0,
  };

  it('excludes investment / expected return of each payout', () => {
    const y = runProjection(annuityPlan).years[0];
    // $12,000/yr for 21 years (65 through 85) = $252,000 expected return;
    // ratio 200,000/252,000 = 79.4%, so ~$2,857 of each payout is income.
    expect(y.annuityPayout).toBeCloseTo(12000, 2);
    const expectedTaxable = 12000 * (1 - 200000 / 252000);
    // irmaaMagi is a gross AGI measure, so it shows the excluded slice even
    // when the standard deduction wipes out the taxable income entirely.
    const allTaxable = runProjection({ ...annuityPlan, annuityIsTaxable: true }).years[0];
    expect(allTaxable.irmaaMagi - y.irmaaMagi).toBeCloseTo(12000 - expectedTaxable, 0);
  });

  it('recovers the premium once and only once over the contract -- s 72(b)(2)', () => {
    // 31 payouts (65 through 95) of $12,000 = $372,000 of expected return
    // against a $200,000 premium, so 53.76% of every payment is excluded and
    // the premium is exactly used up by the last one. The cap is what stops
    // a plan that outlives its own life expectancy excluding more than it
    // ever put in.
    const long = runProjection({ ...annuityPlan, lifeExpectancy1: 95 }).years;
    const fully = runProjection({ ...annuityPlan, lifeExpectancy1: 95, annuityIsTaxable: true }).years;
    const excludedIn = (i) => fully[i].irmaaMagi - long[i].irmaaMagi;
    expect(excludedIn(1)).toBeCloseTo(12000 * (200000 / 372000), 2);
    const totalExcluded = long.reduce((a, _y, i) => a + excludedIn(i), 0);
    expect(totalExcluded).toBeLessThanOrEqual(200000 + 1);
    expect(totalExcluded).toBeGreaterThan(190000);
    // A shorter expected return means a bigger slice of each payout is
    // excluded -- but never more than the premium in total.
    const short = runProjection({ ...annuityPlan, lifeExpectancy1: 80 }).years;
    const shortFully = runProjection({ ...annuityPlan, lifeExpectancy1: 80, annuityIsTaxable: true }).years;
    expect(shortFully[1].irmaaMagi - short[1].irmaaMagi).toBeGreaterThan(excludedIn(1));
    const shortTotal = short.reduce((a, _y, i) => a + (shortFully[i].irmaaMagi - short[i].irmaaMagi), 0);
    expect(shortTotal).toBeLessThanOrEqual(200000 + 1);
  });

  it('a Pre-Tax purchase is fully taxable and a Roth purchase fully excluded', () => {
    const pre = runProjection({ ...annuityPlan, annuitySourceAccount: 'preTax', preTaxInit: 500000 }).years[0];
    const allTaxable = runProjection({ ...annuityPlan, annuitySourceAccount: 'preTax', preTaxInit: 500000, annuityIsTaxable: true }).years[0];
    expect(pre.irmaaMagi).toBeCloseTo(allTaxable.irmaaMagi, 6);

    const rothBought = runProjection({ ...annuityPlan, annuitySourceAccount: 'roth', rothInit: 500000 }).years[0];
    const rothAll = runProjection({ ...annuityPlan, annuitySourceAccount: 'roth', rothInit: 500000, annuityIsTaxable: true }).years[0];
    expect(rothAll.irmaaMagi - rothBought.irmaaMagi).toBeCloseTo(12000, 0);
  });

  it('annuityIsTaxable is still an honest override, and stays the default', () => {
    expect(DEFAULT_INPUTS.annuityIsTaxable).toBe(true);
  });
});

describe('Q-9(c): after-tax basis comes back pro-rata on EVERY Pre-Tax distribution', () => {
  // Half the Pre-Tax bucket is after-tax basis, so half of anything that
  // leaves it is a tax-free return of that basis.
  const basisPlan = {
    ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1950, retireAge1: 60,
    salary1: 0, ss1: 0, ss2: 0, pension1: 0,
    preTaxInit: 1000000, preTaxBasisInit: 500000, rothInit: 0, taxableInit: 0,
    lifestyleExpense: 60000, withdrawalStrategy: 'PreTaxFirst',
    inflationRate: 0, taxBracketInflationRate: 0, preRetireReturn: 0, postRetireReturn: 0,
    rothConversionStrategy: 'none', backdoorRothEnabled: false, cashFloorEnabled: false,
    stateTaxState: 'none', hsaInit: 0, hsaContribution: 0, healthcareBridgeCost: 0,
    ltcActive1: false, ltcActive2: false,
  };

  it('the solver\'s discretionary draw is only half income when the bucket is half basis', () => {
    const y = runProjection(basisPlan).years[0];
    expect(y.drawPreTax).toBeGreaterThan(0);
    // Ordinary income is about half the gross draw, not all of it.
    expect(y.ordinaryTaxableIncome).toBeLessThan(y.drawPreTax * 0.6);
    expect(y.ordinaryTaxableIncome).toBeGreaterThan(0);
    // With no basis at all the same plan recognizes roughly twice as much.
    const noBasis = runProjection({ ...basisPlan, preTaxBasisInit: 0 }).years[0];
    expect(noBasis.ordinaryTaxableIncome).toBeGreaterThan(y.ordinaryTaxableIncome * 1.5);
    expect(noBasis.totalTaxesPaid).toBeGreaterThan(y.totalTaxesPaid);
  });

  it('an RMD recovers basis too, so the basis pool falls as the money leaves', () => {
    const rmdPlan = { ...basisPlan, birthYear1: 1950, lifestyleExpense: 1000 };
    const years = runProjection(rmdPlan).years;
    const withRmd = years.find(y => y.rmdAmount > 0);
    expect(withRmd).toBeTruthy();
    expect(withRmd.ordinaryTaxableIncome).toBeLessThan(withRmd.rmdAmount + withRmd.drawPreTax);
    // The basis pool is being consumed, not left behind forever.
    expect(years.at(-1).preTaxBasis).toBeLessThan(500000);
  });

  it('a Life-Event Pre-Tax withdrawal is part basis, part income', () => {
    const milestone = {
      ...basisPlan, lifestyleExpense: 1000,
      milestones: [{ id: 'm1', name: 'Boat', year: 2027, amount: 200000, type: 'expense', fundingAccount: 'preTax' }],
    };
    const y = runProjection(milestone).years.find(r => r.year === 2027);
    const noBasis = runProjection({ ...milestone, preTaxBasisInit: 0 }).years.find(r => r.year === 2027);
    expect(y.ordinaryTaxableIncome).toBeLessThan(noBasis.ordinaryTaxableIncome);
    expect(y.totalTaxesPaid).toBeLessThan(noBasis.totalTaxesPaid);
  });

  it('a pure backdoor contribution converted the same year is still 100% tax-free', () => {
    // Form 8606 line 2 counts the year's own non-deductible contribution in
    // the ratio, which is why hoisting the ratio ahead of distributions did
    // not break the backdoor case.
    const backdoor = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1986, retireAge1: 65,
      preTaxInit: 0, preTaxBasisInit: 0, rothInit: 0, taxableInit: 200000,
      backdoorRothEnabled: true, backdoorRothAnnualAmount1: 7000,
      rothConversionStrategy: 'none', inflationRate: 0,
    };
    const y = runProjection(backdoor).years[0];
    expect(y.backdoorRothContribution).toBe(7000);
    expect(y.convertAmountTaxable).toBeCloseTo(0, 6);
  });
});
