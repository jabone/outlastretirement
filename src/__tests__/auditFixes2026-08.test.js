// Regression tests for the August 2026 external logic audit (changelog 99).
// Each block pins one of the confirmed bugs so it can't quietly come back.
import { describe, it, expect } from 'vitest';
import {
  IL_EXEMPTION_ALLOWANCE, IL_EXEMPTION_AGE_65,
  runProjection,
  DEFAULT_INPUTS,
  calculateStateTaxes,
  calculateCapitalGainsTaxes,
  getSSMultiplier,
  calculateFICATaxes,
} from '../calculator';
import { buildYearLedgerCsvRows, buildYearLedgerCsv, YEAR_LEDGER_CSV_HEADERS } from '../utils/yearLedgerCsv';

// Retired single filer, flat everything, no SS/pension noise (see the
// backlog memory: DEFAULT_INPUTS leaks ss2 and pension COLA into
// single-filer fixtures unless zeroed explicitly).
const RETIRED_SINGLE = {
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: 1966, // age 60: under 65, so no age-65 deductions muddy the arithmetic
  planYear: 2026,
  retireAge1: 60,
  lifeExpectancy1: 90,
  ss1: 0, ss2: 0,
  pension1: 0, pension2: 0, pension1COLA: 0,
  annuityIncome: 0, rentalIncome: 0,
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, housingInflationRate: 0,
  medicarePartBInflationRate: 0, medicarePartDInflationRate: 0,
  preTaxInit: 500000, rothInit: 500000, taxableInit: 500000,
  lifestyleExpense: 60000,
  rothConversionStrategy: 'none',
  stateTaxState: 'none',
};

describe('1.1 Rental and annuity income are ordinary taxable income', () => {
  it('raises ordinary taxable income and federal tax dollar-for-dollar with rental income', () => {
    // Compare $40k vs $80k of rent so the standard deduction is already
    // absorbed on both sides (ordinaryTaxableIncome is post-deduction).
    const low = runProjection({ ...RETIRED_SINGLE, rentalIncome: 40000 }).years[0];
    const high = runProjection({ ...RETIRED_SINGLE, rentalIncome: 80000 }).years[0];
    expect(high.fixedInflows - low.fixedInflows).toBeCloseTo(40000, 0);
    expect(high.ordinaryTaxableIncome - low.ordinaryTaxableIncome).toBeCloseTo(40000, 0);
    expect(high.totalTaxesPaid).toBeGreaterThan(low.totalTaxesPaid + 4000);
  });

  it('treats Annuity Income ($/yr) the same way', () => {
    const low = runProjection({ ...RETIRED_SINGLE, annuityIncome: 40000 }).years[0];
    const high = runProjection({ ...RETIRED_SINGLE, annuityIncome: 80000 }).years[0];
    expect(high.ordinaryTaxableIncome - low.ordinaryTaxableIncome).toBeCloseTo(40000, 0);
  });

  it('reduces max-bracket Roth conversion headroom by the rental income', () => {
    const base = { ...RETIRED_SINGLE, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22, rothConversionBuffer: 0 };
    const without = runProjection(base).years[0];
    const withRent = runProjection({ ...base, rentalIncome: 30000 }).years[0];
    expect(without.convertAmount - withRent.convertAmount).toBeCloseTo(30000, -2);
  });
});

describe('1.2 State SS exemption backs out only the federally-taxable SS that is in the income base', () => {
  it('does not manufacture a phantom deduction in an SS-exempt state', () => {
    // Income base of $100k ordinary income that already contains $34k of
    // federally taxable SS (85% of a $40k benefit). Illinois exempts SS, so
    // state taxable income must be $66k -- not $60k (which is what
    // subtracting the gross $40k used to give).
    const il = calculateStateTaxes(100000, 0, 40000, 'il', false, false, 'Single', 66, 66, 5, 0, null, false,
      { federalTaxableSS: 34000 });
    // Changelog 126 / audit Q-17: less IL-1040 Step 4's exemption allowance
    // ($2,850 personal + $1,000 for a 66-year-old).
    expect(il).toBeCloseTo((66000 - IL_EXEMPTION_ALLOWANCE - IL_EXEMPTION_AGE_65) * 0.0495, 2);
  });

  it('keeps the old gross-SS convention for callers that do not say what is in the base', () => {
    const il = calculateStateTaxes(100000, 0, 40000, 'il', false, false, 'Single');
    expect(il).toBeCloseTo((60000 - IL_EXEMPTION_ALLOWANCE - IL_EXEMPTION_AGE_65) * 0.0495, 2);
  });

  it('in the projection, the state engine is handed the federally-taxable SS actually in the base', () => {
    const base = { ...RETIRED_SINGLE, stateTaxState: 'il', lifestyleExpense: 90000, preTaxInit: 2000000, withdrawalStrategy: 'PreTaxFirst', ss1: 40000, claimingAge1: 67 };
    const withSS = runProjection(base).years.find(y => y.age1 === 70);
    expect(withSS.ssIncome).toBeCloseTo(40000, 0);
    expect(withSS.taxableSS).toBeGreaterThan(0);
    expect(withSS.taxableSS).toBeLessThanOrEqual(withSS.ssIncome * 0.85 + 1);
    // Recompute the state tax the projection should be charging from the
    // row's own numbers, both ways; the gap is exactly the phantom
    // deduction the old code granted.
    const agiProxy = withSS.ordinaryTaxableIncome + withSS.stdDeduction;
    const correct = calculateStateTaxes(agiProxy, 0, withSS.ssIncome, 'il', false, false, 'Single', 70, 70, 5, 0, null, false, { federalTaxableSS: withSS.taxableSS });
    const oldWay = calculateStateTaxes(agiProxy, 0, withSS.ssIncome, 'il', false, false, 'Single', 70, 70);
    expect(correct - oldWay).toBeCloseTo((withSS.ssIncome - withSS.taxableSS) * 0.0495, 0);
  });
});

describe('2.1 Social Security claiming multiplier follows the statutory schedule', () => {
  it('pays 70% of PIA at 62 and 124% at 70', () => {
    expect(getSSMultiplier(62)).toBeCloseTo(0.70, 4);
    expect(getSSMultiplier(70)).toBeCloseTo(1.24, 4);
  });
  it('flows through runProjection', () => {
    const proj = runProjection({ ...RETIRED_SINGLE, birthYear1: 1966, ss1: 30000, claimingAge1: 62 });
    const y = proj.years.find(r => r.age1 === 63);
    expect(y.ssIncome).toBeCloseTo(30000 * 0.70, 0);
  });
});

describe('2.3 NIIT thresholds are not inflation-indexed and are tested against MAGI', () => {
  it('ignores the bracket inflation factor for the NIIT threshold', () => {
    // $190k taxable + $30k gains with a $30k deduction -> MAGI $250k, $50k
    // over the Single threshold, so all $30k of gains owe NIIT. With the
    // brackets inflated x1.5 the gains all sit in the 15% band, so
    // anything above 15% is NIIT. If the threshold were (wrongly) indexed
    // to $300k there would be none.
    const withFactor = calculateCapitalGainsTaxes(190000, 30000, 'Single', 1.5, 30000);
    expect(withFactor - 30000 * 0.15).toBeCloseTo(30000 * 0.038, 2);
  });

  it('adds the standard deduction back so the test is against MAGI, not taxable income', () => {
    // Taxable $180k + $15k gains = $195k taxable; MAGI with a $16k standard
    // deduction is $211k -> $11k over the Single threshold -> NIIT on $11k.
    const withDeduction = calculateCapitalGainsTaxes(180000, 15000, 'Single', 1, 16000);
    const noDeduction = calculateCapitalGainsTaxes(180000, 15000, 'Single', 1, 0);
    expect(withDeduction - noDeduction).toBeCloseTo(11000 * 0.038, 2);
  });
});

describe('2.4 FICA wage base grows with wages', () => {
  it('scales the Social Security wage base by the wage index factor, not the Additional Medicare threshold', () => {
    const now = calculateFICATaxes(300000, 0, 'Single', 1);
    const later = calculateFICATaxes(300000 * 1.5, 0, 'Single', 1.5);
    // Year 1: 184,500 * 6.2% + 300,000 * 1.45% + (300,000 - 200,000) * 0.9%
    expect(now).toBeCloseTo(184500 * 0.062 + 300000 * 0.0145 + 100000 * 0.009, 2);
    // Later: wage base 276,750; Medicare on 450,000; Additional Medicare
    // threshold still $200,000 (statutory, unindexed).
    expect(later).toBeCloseTo(276750 * 0.062 + 450000 * 0.0145 + 250000 * 0.009, 2);
  });
  it('is threaded through runProjection with the plan inflation factor', () => {
    const working = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1990, planYear: 2026, retireAge1: 65, lifeExpectancy1: 90,
      salary1: 300000, inflationRate: 3, taxBracketInflationRate: 3, ss1: 0, ss2: 0, pension1: 0, pension2: 0,
      rothConversionStrategy: 'none', stateTaxState: 'none',
    };
    const proj = runProjection(working);
    const y0 = proj.years[0];
    const y20 = proj.years[20];
    // With wages and brackets indexed at the same rate, the real tax bill
    // is roughly flat -- slightly UP, because the statutory unindexed
    // thresholds (NIIT, Additional Medicare) bite harder. A frozen wage
    // base would have pushed it DOWN by about $5k real as more of the
    // salary escaped the 6.2%.
    const realY0 = y0.totalTaxesPaid;
    const realY20 = y20.totalTaxesPaid / y20.inflFactor;
    expect(realY20).toBeGreaterThanOrEqual(realY0 - 100);
    expect(realY20).toBeLessThan(realY0 * 1.05);
  });
});

describe('3.1 RMDs continue for a surviving spouse and honour each owner\'s start age', () => {
  const couple = {
    ...DEFAULT_INPUTS,
    spouse2Enabled: true,
    birthYear1: 1955, birthYear2: 1962, planYear: 2026,
    retireAge1: 65, retireAge2: 65,
    lifeExpectancy1: 76, lifeExpectancy2: 95,
    ss1: 0, ss2: 0, pension1: 0, pension2: 0, pension1COLA: 0,
    inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
    preTaxInit: 1500000, rothInit: 200000, taxableInit: 800000,
    lifestyleExpense: 50000, rothConversionStrategy: 'none', stateTaxState: 'none',
    withdrawalStrategy: 'TaxableFirst',
  };

  it('keeps forcing RMDs after Spouse 1 dies, on Spouse 2\'s age', () => {
    const proj = runProjection(couple);
    const widowAt80 = proj.years.find(y => y.age1 === null && y.age2 === 80);
    expect(widowAt80).toBeTruthy();
    expect(widowAt80.spouse1Alive).toBe(false);
    expect(widowAt80.rmdAmount).toBeGreaterThan(0);
    expect(widowAt80.rmdAmount).toBeCloseTo(widowAt80.preTaxStart / 20.2, -1);
  });

  it('a surviving spouse born 1960+ does not start until 75', () => {
    const proj = runProjection(couple);
    const at73 = proj.years.find(y => y.age1 === null && y.age2 === 73);
    const at75 = proj.years.find(y => y.age1 === null && y.age2 === 75);
    expect(at73.rmdAmount).toBe(0);
    expect(at75.rmdAmount).toBeGreaterThan(0);
  });

  it('the Forced RMDs KPI sums the RMDs actually taken (no phantom 73-74 RMDs for 1960+ births)', () => {
    const proj = runProjection({ ...RETIRED_SINGLE, birthYear1: 1962, lifeExpectancy1: 80 });
    const expected = proj.years.reduce((s, y) => s + (y.rmdAmount || 0), 0);
    expect(proj.totalRMDsForced).toBeCloseTo(expected, 2);
    expect(proj.years.find(y => y.age1 === 74).rmdAmount).toBe(0);
    expect(proj.years.find(y => y.age1 === 75).rmdAmount).toBeGreaterThan(0);
  });
});

describe('1.3 Yearly Ledger CSV export maps to real projection fields', () => {
  it('produces numeric cells, not NaN', () => {
    const proj = runProjection(RETIRED_SINGLE);
    const rows = buildYearLedgerCsvRows(proj);
    expect(rows.length).toBe(proj.years.length);
    expect(rows[0].length).toBe(YEAR_LEDGER_CSV_HEADERS.length);
    const csv = buildYearLedgerCsv(proj);
    expect(csv).not.toMatch(/NaN/);
    expect(csv.split('\n')[0]).toBe(YEAR_LEDGER_CSV_HEADERS.join(','));
    const first = rows[0];
    const endIdx = YEAR_LEDGER_CSV_HEADERS.indexOf('Ending Portfolio');
    expect(first[endIdx]).toBe(Math.round(proj.years[0].totalPortfolioEnding));
  });
  it('leaves a dead spouse\'s age blank rather than "null"', () => {
    const proj = runProjection({ ...RETIRED_SINGLE, spouse2Enabled: true, birthYear2: 1960, lifeExpectancy2: 70, retireAge2: 60 });
    const csv = buildYearLedgerCsv(proj);
    expect(csv).not.toMatch(/null/);
  });
});

// ---------------------------------------------------------------------------
// Second batch (changelog 100): the two engine-level items the first batch
// deferred -- age-65 deductions and the SS tax torpedo in conversion sizing.
// ---------------------------------------------------------------------------
import {
  additionalStandardDeductionAged,
  seniorBonusDeduction,
  SENIOR_BONUS_DEDUCTION,
  getTaxBracketLimit,
} from '../calculator';

describe('2.5 Age-65+ additional standard deduction (IRC 63(f)) and the OBBBA senior bonus', () => {
  it('63(f): $1,650 per aged spouse on a married return, $2,050 single, indexed', () => {
    expect(additionalStandardDeductionAged('MFJ', 2)).toBe(3300);
    expect(additionalStandardDeductionAged('MFJ', 1)).toBe(1650);
    expect(additionalStandardDeductionAged('MFS', 1)).toBe(1650);
    expect(additionalStandardDeductionAged('Single', 1)).toBe(2050);
    expect(additionalStandardDeductionAged('Single', 0)).toBe(0);
    expect(additionalStandardDeductionAged('Single', 1, 1.1)).toBeCloseTo(2255, 6);
  });

  it('OBBBA bonus: $6,000 per senior, 2025-2028 only, 6% phase-out over $75k/$150k, MFS excluded, unindexed', () => {
    expect(SENIOR_BONUS_DEDUCTION).toBe(6000);
    expect(seniorBonusDeduction(50000, 'Single', 2026, 1)).toBe(6000);
    expect(seniorBonusDeduction(100000, 'Single', 2026, 1)).toBeCloseTo(6000 - 25000 * 0.06, 6);
    expect(seniorBonusDeduction(175000, 'Single', 2026, 1)).toBe(0);
    expect(seniorBonusDeduction(100000, 'MFJ', 2026, 2)).toBe(12000);
    // The phase-out reduces EACH senior's $6,000 separately: two seniors at
    // $200,000 keep 2 x (6,000 - 3,000), and are fully out at $250,000.
    expect(seniorBonusDeduction(200000, 'MFJ', 2026, 2)).toBeCloseTo(2 * (6000 - 50000 * 0.06), 6);
    expect(seniorBonusDeduction(250000, 'MFJ', 2026, 2)).toBe(0);
    expect(seniorBonusDeduction(260000, 'MFJ', 2026, 2)).toBe(0);
    expect(seniorBonusDeduction(350000, 'MFJ', 2026, 2)).toBe(0);
    expect(seniorBonusDeduction(50000, 'MFS', 2026, 1)).toBe(0);
    expect(seniorBonusDeduction(50000, 'Single', 2024, 1)).toBe(0);
    expect(seniorBonusDeduction(50000, 'Single', 2029, 1)).toBe(0);
    expect(seniorBonusDeduction(50000, 'Single', 2028, 1)).toBe(6000);
    expect(seniorBonusDeduction(50000, 'Single', 2026, 0)).toBe(0);
  });

  it('a 66-year-old single retiree with modest income gets basic + $2,050 + $6,000 in 2026', () => {
    const proj = runProjection({ ...RETIRED_SINGLE, birthYear1: 1960, lifestyleExpense: 40000 });
    const y0 = proj.years[0];
    expect(y0.seniorCount).toBe(1);
    expect(y0.seniorBonusDeduction).toBeCloseTo(6000, 0);
    expect(y0.stdDeduction).toBeCloseTo(16100 + 2050 + 6000, 0);
  });

  it('a 64-year-old gets neither, and picks both up the year they turn 65', () => {
    const proj = runProjection({ ...RETIRED_SINGLE, birthYear1: 1962, lifestyleExpense: 40000 });
    const at64 = proj.years.find(y => y.age1 === 64);
    const at65 = proj.years.find(y => y.age1 === 65);
    expect(at64.seniorCount).toBe(0);
    expect(at64.stdDeduction).toBeCloseTo(16100, 0);
    expect(at65.seniorCount).toBe(1);
    expect(at65.stdDeduction).toBeCloseTo(16100 + 2050 + 6000, 0); // 2027, bonus still live
  });

  it('the OBBBA bonus disappears in 2029 while the 63(f) add-on stays', () => {
    const proj = runProjection({ ...RETIRED_SINGLE, birthYear1: 1960, lifestyleExpense: 40000 });
    const y2028 = proj.years.find(y => y.year === 2028);
    const y2029 = proj.years.find(y => y.year === 2029);
    expect(y2028.seniorBonusDeduction).toBeCloseTo(6000, 0);
    expect(y2029.seniorBonusDeduction).toBe(0);
    expect(y2029.stdDeduction).toBeCloseTo(16100 + 2050, 0);
  });

  it('a joint return counts both spouses and phases the bonus out against household MAGI', () => {
    const couple = {
      ...RETIRED_SINGLE, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1958, birthYear2: 1959,
      retireAge1: 60, retireAge2: 60, lifeExpectancy2: 90,
      preTaxInit: 3000000, withdrawalStrategy: 'PreTaxFirst', lifestyleExpense: 150000,
    };
    const y0 = runProjection(couple).years[0];
    expect(y0.seniorCount).toBe(2);
    expect(y0.householdStatus).toBe('MFJ');
    // Household draws ~$170k+ from Pre-Tax to fund spending: MAGI is over
    // $150k (and under $250k), so the $12k bonus is partly phased out, and the
    // deduction shown is what that MAGI actually got.
    expect(y0.seniorBonusDeduction).toBeGreaterThan(0);
    expect(y0.seniorBonusDeduction).toBeLessThan(12000);
    expect(y0.stdDeduction).toBeCloseTo(32200 + 3300 + y0.seniorBonusDeduction, 0);
  });

  it('the withdrawal solver prices the phase-out against the income the draw creates', () => {
    // Same household, spending pushed high enough that the bonus fully
    // phases out: the solver's tax (and so the draw) must reflect a $0
    // bonus, not the pre-draw $12k.
    const couple = {
      ...RETIRED_SINGLE, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1958, birthYear2: 1959,
      retireAge1: 60, retireAge2: 60, lifeExpectancy2: 90,
      preTaxInit: 5000000, withdrawalStrategy: 'PreTaxFirst', lifestyleExpense: 400000,
    };
    const y0 = runProjection(couple).years[0];
    expect(y0.seniorBonusDeduction).toBe(0);
    expect(y0.stdDeduction).toBeCloseTo(32200 + 3300, 0);
  });
});

describe('3.3 Max-bracket Roth conversion re-solves the Social Security tax torpedo', () => {
  // Single, 64 (so no age-65 deductions enter the arithmetic), claimed SS
  // at 62 ($40k FRA -> $28k), small pension: other income sits in the 50%
  // SS tier before any conversion. Filling the 12% bracket against the
  // pre-conversion taxableSS used to overshoot once the conversion pushed
  // benefits into the 85% tier.
  const torpedo = {
    ...RETIRED_SINGLE, birthYear1: 1962, ss1: 40000, claimingAge1: 62, pension1: 10000, pensionStartAge1: 60,
    preTaxInit: 800000, taxableInit: 200000, rothInit: 100000,
    lifestyleExpense: 45000, withdrawalStrategy: 'TaxableFirst',
    rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.12, rothConversionBuffer: 0,
  };

  it('lands taxable ordinary income at (not over) the target bracket ceiling after the SS tier jump', () => {
    const y0 = runProjection(torpedo).years[0];
    const ceiling = getTaxBracketLimit('Single', 0.12, 1);
    expect(y0.convertAmount).toBeGreaterThan(0);
    // The conversion moved benefits to the 85% tier...
    expect(y0.ssIncome).toBeCloseTo(28000, 0);
    expect(y0.taxableSS).toBeCloseTo(28000 * 0.85, 0);
    // ...and the sized conversion still fits: taxable income (before any
    // discretionary Pre-Tax draw, which TaxableFirst avoids here) is at the
    // ceiling within a dollar, not above it.
    const taxableBeforeDraw = y0.ordinaryTaxableIncome - Math.max(0, y0.discretionaryDrawPreTax || 0);
    expect(taxableBeforeDraw).toBeLessThanOrEqual(ceiling + 1);
    expect(taxableBeforeDraw).toBeGreaterThan(ceiling - 1);
  });

  it('the naive one-shot sizing would have overshot the bracket', () => {
    const y0 = runProjection(torpedo).years[0];
    const ceiling = getTaxBracketLimit('Single', 0.12, 1);
    // Reconstruct what "ceiling minus pre-conversion taxable income" would
    // have converted with SS at the 50% tier, then price it with SS at 85%.
    const preConversionTaxableSS = 28000 * 0.5;
    const otherOrdinary = 10000; // pension
    const naiveHeadroom = ceiling - (otherOrdinary + preConversionTaxableSS - y0.stdDeduction);
    const naiveTaxable = otherOrdinary + 28000 * 0.85 + naiveHeadroom - y0.stdDeduction;
    expect(naiveHeadroom).toBeGreaterThan(y0.convertAmount);
    expect(naiveTaxable).toBeGreaterThan(ceiling + 5000);
  });

  it('taxable Social Security in the year reflects the conversion that was actually made', () => {
    const withConv = runProjection(torpedo).years[0];
    const noConv = runProjection({ ...torpedo, rothConversionStrategy: 'none' }).years[0];
    // Exact worksheet (changelog 119), now against the provisional income
    // the plan actually has (changelog 132): the $10,000 pension + $4,000
    // of dividends (2% of the $200k taxable balance) + the realized gains
    // on the Taxable draw this TaxableFirst plan takes to fund its $45,000
    // of spending + half the $28,000 benefit. Those realized gains are
    // capital gains on the return, hence AGI, hence provisional income;
    // before changelog 132 they were omitted and this read $1,500 off a
    // combined income of $28,000.
    //
    // Counting them puts combined income at ~$39,589 -- ABOVE the $34,000
    // single upper threshold -- so the 85% branch applies, not the 50% one:
    // 85% of the excess over $34,000, plus the capped 50%-tier amount.
    const provisional = 10000 + noConv.taxableStart * 0.02 + noConv.realizedGains;
    const combined = provisional + 28000 * 0.5;
    expect(noConv.realizedGains).toBeGreaterThan(0);
    expect(combined).toBeGreaterThan(34000);
    const lowerTier = Math.min(28000 * 0.5, 0.5 * (34000 - 25000));
    const expected = Math.min(28000 * 0.85, 0.85 * (combined - 34000) + lowerTier);
    expect(noConv.taxableSS).toBeCloseTo(expected, 0);
    // Still short of the 85% cap the conversion year reaches.
    expect(noConv.taxableSS).toBeLessThan(28000 * 0.85);
    expect(withConv.taxableSS).toBeCloseTo(28000 * 0.85, 0);
  });
});

describe('Single-filer Social Security starts at the chosen claiming age (spec-survey finding, changelog 101)', () => {
  const single = { ...RETIRED_SINGLE, birthYear1: 1964, ss1: 30000, ss2: 18000, spouse2Enabled: false };
  it('pays nothing before claimingAge1 and the delayed benefit from it', () => {
    const p = runProjection({ ...single, claimingAge1: 70 });
    expect(p.years.find(y => y.age1 === 62).ssIncome).toBe(0);
    expect(p.years.find(y => y.age1 === 69).ssIncome).toBe(0);
    expect(p.years.find(y => y.age1 === 70).ssIncome).toBeCloseTo(30000 * 1.24, 0);
  });
  it('ignores the stray ss2 default for a single-person plan', () => {
    const p = runProjection({ ...single, ss1: 10000, ss2: 50000, claimingAge1: 67 });
    expect(p.years.find(y => y.age1 === 67).ssIncome).toBeCloseTo(10000, 0);
  });
  it('still pays the survivor on the deceased spouse\u2019s record when a spouse was enabled (survivor rules since changelog 265)', () => {
    const p = runProjection({ ...single, spouse2Enabled: true, filingStatus: 'MFJ', birthYear2: 1964, lifeExpectancy2: 60, retireAge2: 60, ss2: 40000, claimingAge1: 70, claimingAge2: 67 });
    const at63 = p.years.find(y => y.age1 === 63);
    expect(at63.spouse2Alive).toBe(false);
    // Spouse 2 died at 60 before claiming: the base is the full $40,000.
    // The plan starts with the survivor already 62 (FRA 67), so the
    // survivor benefit starts 60 months early: 40,000 x (1 - 0.285 x
    // 60/84) = 31,857 and stays there; own benefit is not claimed until 70.
    expect(at63.ssIncome).toBeCloseTo(40000 * (1 - 0.285 * 60 / 84), 0);
    const at70 = p.years.find(y => y.age1 === 70);
    expect(at70.ssIncome).toBeCloseTo(30000 * 1.24, 0);
  });
});
