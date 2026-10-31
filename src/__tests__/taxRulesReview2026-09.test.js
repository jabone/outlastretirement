// Tax and benefit rule fixes from the 2026-09 review (E2-E22, A11-A15,
// B1-B8, C5). Each test failed against the engine before its fix.
import { describe, it, expect } from 'vitest';
import {
  runProjection, seniorBonusDeduction, calculateStateTaxes, calculateIRMAA, calculateMedicarePartD,
  irmaaScaledThresholds, illinoisExemptionAllowance, getHSAContributionLimit,
  calculateFederalEstateTax, getMaxContributionSplit, ssEarningsTestWithholding,
  IRMAA_TIER_PREMIUMS, IRMAA_THRESHOLDS_SINGLE, SS_EARNINGS_TEST_EXEMPT_FRA_YEAR,
} from '../calculator';
// The reference household (the pre-469 default plan): see referenceHousehold.js.
import { REFERENCE_INPUTS as DEFAULT_INPUTS } from './referenceHousehold';

// A quiet retiree: single, born 1960 (66 in 2026), no growth, no inflation,
// no Social Security, nothing contributed. Every key here is a real
// DEFAULT_INPUTS key (checked below).
const base = (o = {}) => ({
  ...DEFAULT_INPUTS,
  planYear: 2026, birthYear1: 1960, retireAge1: 60, lifeExpectancy1: 95, claimingAge1: 70,
  spouse2Enabled: false, filingStatus: 'Single',
  preTaxInit: 0, rothInit: 0, taxableInit: 0, hsaInit: 0,
  preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0, housingInflationRate: 0,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0, pension1COLA: 0, pension2COLA: 0,
  preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
  lifestyleExpense: 0, healthcareBridgeCost: 0, taxableDividendYield: 0, taxableBasisInit: 0, taxableCapitalGainsRatio: 0,
  stateTaxState: 'none', stateOfResidence: 'TX', employerMatchMode1: 'flat',
  ...o,
});
const y0 = (o) => runProjection(base(o)).years[0];
const couple = (o = {}) => ({
  spouse2Enabled: true, birthYear2: 1960, retireAge2: 60, lifeExpectancy2: 95, claimingAge2: 70, ...o,
});

describe('test inputs are real', () => {
  it('every key the base plan sets exists in DEFAULT_INPUTS', () => {
    const extra = ['stressType', 'pensionStartAge1', 'pensionStartAge2', 'milestones', 'annuityPurchaseAmount', 'annuityPurchaseAge',
      'annuityPayoutRate', 'annuitySourceAccount', 'annuityIsTaxable', 'autoMaxContribution1', 'nqdcEnabled1', 'nqdcDeferralAmount1',
      'rothConversionStrategy', 'rothConversionBracket', 'rothConversionDelayUntilRetire', 'acaSubsidyAnnualValue', 'mfsIncomeSplitPct', 'mfsLivedWithSpouse',
      'hsaContribution', 'retireAge2', 'lifeExpectancy2', 'claimingAge2', 'birthYear2'];
    for (const k of [...Object.keys(base()), ...extra]) expect(k in DEFAULT_INPUTS, k).toBe(true);
  });
});

describe('E2 senior bonus phases out per person', () => {
  it('two seniors at $200,000 keep $6,000, and nothing at $250,000+', () => {
    expect(seniorBonusDeduction(200000, 'MFJ', 2026, 2)).toBeCloseTo(6000, 6);
    expect(seniorBonusDeduction(260000, 'MFJ', 2026, 2)).toBe(0);
  });
  it('flows into the projection: MFJ both 66 on a $200,000 pension', () => {
    const r = y0(couple({ filingStatus: 'MFJ', pension1: 200000, pensionStartAge1: 60 }));
    expect(r.seniorBonusDeduction).toBeCloseTo(6000, 0);
    expect(r.stdDeduction).toBeCloseTo(32200 + 3300 + 6000, 0);
  });
});

describe('E3 provisional income includes every AGI item', () => {
  // Single, 70, $29,333 of benefits (claimed at 66). $40,000 of other
  // income taxes $22,067 of benefits whether it is a pension or a
  // Life-Event Pre-Tax withdrawal.
  const s = { birthYear1: 1956, claimingAge1: 66, ss1: 30000 };
  it('a Life-Event Pre-Tax withdrawal counts like a pension', () => {
    const pension = y0({ ...s, pension1: 40000, pensionStartAge1: 60 });
    const lifeEvent = y0({ ...s, preTaxInit: 40000, milestones: [{ name: 'x', type: 'outflow', amount: 40000, startAge: 70, endAge: 70, targetAccount: 'preTax' }] });
    expect(pension.taxableSS).toBeGreaterThan(20000);
    expect(lifeEvent.taxableSS).toBeCloseTo(pension.taxableSS, 0);
  });
});

describe('E4 MFS: each return has its own standard deduction', () => {
  it('both 60, $150,000 pension split 50/50: MFS federal tax equals MFJ', () => {
    const o = couple({ birthYear1: 1966, birthYear2: 1966, pension1: 150000, pensionStartAge1: 60 });
    const mfj = y0({ ...o, filingStatus: 'MFJ' });
    const mfs = y0({ ...o, filingStatus: 'MFS' });
    expect(mfs.stdDeduction).toBeCloseTo(2 * 16100, 0);
    expect(mfs.federalTax).toBeCloseTo(mfj.federalTax, 0);
  });
  it('a 100% split is still one return with one deduction', () => {
    const r = y0({ ...couple({ birthYear1: 1966, birthYear2: 1966, pension1: 150000, pensionStartAge1: 60 }), filingStatus: 'MFS', mfsIncomeSplitPct: 100 });
    expect(r.stdDeduction).toBeCloseTo(16100, 0);
  });
  it('each spouse 65+ gets their own age add-on, and no senior bonus', () => {
    const r = y0({ ...couple({ birthYear1: 1959, birthYear2: 1959, pension1: 150000, pensionStartAge1: 60 }), filingStatus: 'MFS' });
    expect(r.seniorCount).toBe(2);
    expect(r.seniorBonusDeduction).toBe(0);
    expect(r.stdDeduction).toBeCloseTo(2 * 16100 + 2 * 1650, 0);
  });
});

describe('E5 MFS: IRMAA priced per spouse on their own return', () => {
  it('$75,000 each, both 67: the same Part B and D as filing jointly', () => {
    const o = couple({ birthYear1: 1959, birthYear2: 1959, pension1: 75000, pension2: 75000, pensionStartAge1: 60, pensionStartAge2: 60 });
    const mfj = y0({ ...o, filingStatus: 'MFJ' });
    const mfs = y0({ ...o, filingStatus: 'MFS' });
    expect(mfs.partBCost).toBeCloseTo(mfj.partBCost, 2);
    expect(mfs.partDCost).toBeCloseTo(mfj.partDCost, 2);
  });
});

describe('E6 MFS: state tax per return', () => {
  it('California, $75,000 each at 60: MFS equals MFJ', () => {
    const o = couple({ birthYear1: 1966, birthYear2: 1966, stateTaxState: 'ca', stateOfResidence: 'CA', pension1: 75000, pension2: 75000, pensionStartAge1: 60, pensionStartAge2: 60 });
    const mfj = y0({ ...o, filingStatus: 'MFJ' });
    const mfs = y0({ ...o, filingStatus: 'MFS' });
    expect(mfj.stateTax).toBeGreaterThan(5000);
    expect(mfs.stateTax).toBeCloseTo(mfj.stateTax, 0);
  });
  it('the direct call splits only when asked', () => {
    const one = calculateStateTaxes(150000, 150000, 0, 'ca', false, true, 'MFS', 60, 60);
    const two = calculateStateTaxes(150000, 150000, 0, 'ca', false, true, 'MFS', 60, 60, 5, 0, null, false, { mfsSplitPct: 50 });
    expect(two).toBeCloseTo(2 * calculateStateTaxes(75000, 75000, 0, 'ca', false, true, 'MFS', 60, 60), 6);
    expect(two).toBeLessThan(one);
  });
});

describe('E10 the surviving spouse keeps their own 65+ deduction', () => {
  it('Spouse 1 dies first; Spouse 2 (67, Single) gets $2,050 + the senior bonus', () => {
    // Spouse 1 (70 in 2026) lives through 2026; 2027 is the first survivor
    // year. (A life expectancy below today's age is run as today's age,
    // E28, so "already died" cannot be written as 69 at 70 any more.)
    const p = runProjection(base(couple({ filingStatus: 'MFJ', birthYear1: 1956, lifeExpectancy1: 70, pension2: 60000, pensionStartAge2: 60 })));
    expect(p.years.find((r) => r.year === 2026).householdStatus).toBe('MFJ');
    const y = p.years.find((r) => r.year === 2027);
    expect(y.householdStatus).toBe('Single');
    expect(y.seniorCount).toBe(1);
    expect(y.stdDeduction).toBeCloseTo(16100 + 2050 + 6000, 0);
  });
});

describe('E19 a Life-Event Pre-Tax withdrawal before 59 1/2 is penalized', () => {
  const o = { birthYear1: 1976, retireAge1: 45, preTaxInit: 500000, milestones: [{ name: 'x', type: 'outflow', amount: 100000, startAge: 50, endAge: 50, targetAccount: 'preTax' }] };
  it('10% federal on top of the income tax', () => {
    const r = y0(o);
    const ti = 100000 - 16100;
    const incomeTax = 12400 * 0.10 + (50400 - 12400) * 0.12 + (ti - 50400) * 0.22;
    expect(r.baseFederalTax).toBeCloseTo(incomeTax + 10000, 0);
  });
  it('and California adds 2.5%', () => {
    const none = y0(o);
    const ca = y0({ ...o, stateTaxState: 'ca', stateOfResidence: 'CA' });
    const caNoPenalty = calculateStateTaxes(100000, 0, 0, 'ca', false, true, 'Single', 50, 50, 5, 0, null, false, { federalAGI: 100000, calendarYear: 2026 });
    expect(none.baseStateTax).toBe(0);
    expect(ca.baseStateTax).toBeCloseTo(caNoPenalty + 2500, 0);
  });
});

describe('E20 Colorado: Social Security uses the same pension cap', () => {
  it('single 67, $34,453 taxable SS + $60,000 pension', () => {
    const income = 60000 + 34453;
    const ded = 16100 + 2050 + (6000 - 0.06 * (income - 75000));
    const t = calculateStateTaxes(income, 60000, 40533, 'co', false, true, 'Single', 67, 67, 5, 0, null, false,
      { federalTaxableSS: 34453, federalAGI: income, federalDeduction: ded });
    // SS subtracted in full uses all of the $24,000 cap: no pension room left.
    expect(t).toBeCloseTo((60000 - ded) * 0.044, 2);
    expect(t).toBeGreaterThan(1600);
  });
});

describe('E21 Pennsylvania taxes employee 401(k) deferrals', () => {
  it('a Pre-Tax deferral does not lower PA tax the way a Roth one does not', () => {
    const o = { birthYear1: 1976, retireAge1: 65, salary1: 100000, stateTaxState: 'pa', stateOfResidence: 'PA' };
    const pre = y0({ ...o, preTaxContribution1: 20000 });
    const roth = y0({ ...o, rothContribution1: 20000 });
    expect(pre.stateTax).toBeCloseTo(roth.stateTax, 0);
    expect(pre.stateTax).toBeCloseTo(100000 * 0.0307, 0);
  });
});

describe('E22 NIIT excludes a qualified (Pre-Tax) annuity', () => {
  it('same ordinary income, NIIT only on the non-qualified contract', () => {
    const o = { pension1: 300000, pensionStartAge1: 60, preTaxInit: 2000000, taxableInit: 2000000, taxableBasisInit: 2000000,
      annuityPurchaseAmount: 500000, annuityPurchaseAge: 66, annuityPayoutRate: 6, annuityIsTaxable: true };
    const fromTaxable = y0({ ...o, annuitySourceAccount: 'taxable' });
    const fromPreTax = y0({ ...o, annuitySourceAccount: 'preTax' });
    expect(fromTaxable.federalTax - fromPreTax.federalTax).toBeCloseTo(30000 * 0.038, 0);
  });
});

describe('A11 Auto-Max 401(k) mode routes the catch-up to Roth above the wage threshold', () => {
  it('age 55, $200,000 wages', () => {
    const r = y0({ birthYear1: 1971, retireAge1: 65, salary1: 200000, autoMaxContribution1: '401k' });
    const split = getMaxContributionSplit(55, 200000, 1);
    expect(split.mandatoryRothCatchup).toBe(true);
    expect(r.preTaxContribution1).toBeCloseTo(split.preTax, 0);
    expect(r.rothContribution1).toBeCloseTo(split.roth, 0);
  });
});

describe('A12/A14 IRMAA top tiers', () => {
  it('MFS-together top threshold is $500,000 less the indexed lower one', () => {
    const t = irmaaScaledThresholds('MFS', true, 1.1, 1);
    expect(t[3]).toBeCloseTo(109000 * 1.1, 6);
    expect(t[4]).toBeCloseTo(500000 - 109000 * 1.1, 6);
    expect(irmaaScaledThresholds('MFS', true, 1, 1)[4]).toBe(391000);
  });
  it('the top tier starts AT its threshold', () => {
    expect(calculateIRMAA(IRMAA_THRESHOLDS_SINGLE[4], 'Single', 1)).toBeCloseTo(IRMAA_TIER_PREMIUMS[4] * 12, 6);
    expect(calculateMedicarePartD(IRMAA_THRESHOLDS_SINGLE[4], 'Single', 1)).toBeCloseTo((38.99 + 91.00) * 12, 6);
    // the lower tiers are still strictly above
    expect(calculateIRMAA(IRMAA_THRESHOLDS_SINGLE[0], 'Single', 1)).toBeCloseTo(202.90 * 12, 6);
  });
});

describe('A13 Illinois 2026 exemption', () => {
  it('$2,925 per person', () => {
    expect(illinoisExemptionAllowance(50000, 'Single', 60, 60)).toBe(2925);
  });
});

describe('A15 earnings test in the FRA year for FRA 67', () => {
  it('born 1960: claimed at 62, still earning $100,000 the year they turn 67', () => {
    expect(ssEarningsTestWithholding(100000, 30000, 67, 67, 1).withheld).toBeCloseTo((100000 - SS_EARNINGS_TEST_EXEMPT_FRA_YEAR) / 3, 6);
    const r = runProjection(base({ birthYear1: 1960, retireAge1: 70, salary1: 100000, ss1: 30000, claimingAge1: 62 })).years
      .find((y) => y.age1 === 67);
    expect(r.ssEarningsTestWithheld).toBeGreaterThan(0);
  });
  it('a claim at FRA is never tested', () => {
    const r = runProjection(base({ birthYear1: 1960, retireAge1: 70, salary1: 100000, ss1: 30000, claimingAge1: 67 })).years
      .find((y) => y.age1 === 67);
    expect(r.ssEarningsTestWithheld).toBe(0);
  });
});

describe('B4 HSA catch-up is not indexed', () => {
  it('only the base limit grows', () => {
    expect(getHSAContributionLimit(56, false, 2)).toBe(4400 * 2 + 1000);
    expect(getHSAContributionLimit(56, false)).toBe(5400);
  });
});

describe('B3 max-bracket conversion sees AGI net of NQDC deferrals', () => {
  it('a $50,000 NQDC deferral leaves the same conversion as $50,000 less salary', () => {
    const o = { birthYear1: 1971, retireAge1: 65, preTaxInit: 2000000, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.24, rothConversionDelayUntilRetire: false };
    const deferring = y0({ ...o, salary1: 200000, nqdcEnabled1: true, nqdcDeferralAmount1: 50000 });
    const lower = y0({ ...o, salary1: 150000 });
    expect(deferring.convertAmount).toBeGreaterThan(0);
    expect(deferring.convertAmount).toBeCloseTo(lower.convertAmount, 0);
  });
});

describe('B1/B2 estate exemption for a married couple', () => {
  it('MFS is married: the exemption doubles', () => {
    expect(calculateFederalEstateTax(40e6, 'MFS', 1)).toBeCloseTo((40e6 - 30e6) * 0.4, 2);
  });
  it('the first spouse\'s DSUE is indexed only to the first death', () => {
    expect(calculateFederalEstateTax(60e6, 'MFJ', 1, 0, 0, 2, 1.5)).toBeCloseTo((60e6 - 15e6 * 3.5) * 0.4, 2);
  });
});

describe('B8 MFS gets no premium tax credit', () => {
  it('no credit is applied in an MFS marketplace year', () => {
    const o = couple({ birthYear1: 1966, birthYear2: 1966, preTaxInit: 1000000, lifestyleExpense: 40000, healthcareBridgeCost: 10000, acaCreditSource: 'manual', acaSubsidyAnnualValue: 8000 });
    expect(y0({ ...o, filingStatus: 'MFJ' }).acaSubsidyApplied).toBeGreaterThan(0);
    expect(y0({ ...o, filingStatus: 'MFS' }).acaSubsidyApplied).toBe(0);
  });
});

describe('C5 Trustees 2026 defaults', () => {
  it('OASI depletion 2032, 78% payable', () => {
    expect(DEFAULT_INPUTS.ssDepletionYear).toBe(2032);
    expect(DEFAULT_INPUTS.ssCutPercent).toBe(22);
  });
});
