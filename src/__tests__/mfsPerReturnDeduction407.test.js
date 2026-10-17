// Changelog 407: two MFS returns each floor their OWN standard deduction.
// Until now the household deduction (the two summed) divided between the
// returns in the income proportion, so a low-income return looked as if
// it had used a deduction it could not: at an 80/20 split with $60,000 of
// income, the 20% return has $12,000 of income against a $16,100
// deduction -- $4,100 of it is simply lost, and the 80% return's taxable
// income is $48,000 - $16,100, not $60,000 - $32,200 split 80/20.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS, calculateTaxes, calculateCapitalGainsTaxes, calculateNetInvestmentIncomeTax,
  mfsSplitSpec, mfsReturnsOf, getTaxBracketLimit, mfsLargerShare, ADDITIONAL_DEDUCTION_AGED_MARRIED_2026,
} from '../calculator';

const D = 16100; // 2026 MFS standard deduction
const two = (pct, ordinary, d1 = D, d2 = D) => mfsSplitSpec({ spouse2Enabled: true, mfsIncomeSplitPct: pct }, ordinary, [d1, d2]);

describe('mfsSplitSpec and mfsReturnsOf', () => {
  it('is the plain percentage when there is one return or no per-return deductions', () => {
    expect(mfsSplitSpec({ spouse2Enabled: true, mfsIncomeSplitPct: 50 }, 100000, null)).toBe(50);
    expect(mfsSplitSpec({ spouse2Enabled: false, mfsIncomeSplitPct: 50 }, 100000, [D, D])).toBe(100);
    expect(mfsSplitSpec({ spouse2Enabled: true, mfsIncomeSplitPct: 100 }, 100000, [D, D])).toBe(100);
  });
  it('floors each return on its own deduction', () => {
    const [a, b] = mfsReturnsOf(two(80, 60000));
    expect(a).toEqual({ share: 0.8, deduction: D, taxable: 48000 - D, unusedDeduction: 0 });
    expect(b).toEqual({ share: 0.2, deduction: D, taxable: 0, unusedDeduction: D - 12000 });
  });
});

describe('calculateTaxes on two returns', () => {
  it('even split, same age band: exactly what the proportional split gave', () => {
    for (const A of [20000, 60000, 150000, 400000]) {
      expect(calculateTaxes(Math.max(0, A - 2 * D), 'MFS', 1, false, two(50, A))).toBeCloseTo(calculateTaxes(Math.max(0, A - 2 * D), 'MFS', 1, false, 50), 6);
    }
  });
  it('uneven split: the low return wastes deduction it cannot use, so the household owes more', () => {
    const A = 60000;
    const perReturn = calculateTaxes(Math.max(0, A - 2 * D), 'MFS', 1, false, two(80, A));
    const proportional = calculateTaxes(Math.max(0, A - 2 * D), 'MFS', 1, false, 80);
    expect(perReturn).toBeCloseTo(calculateTaxes(48000 - D, 'MFS', 1, false, 100), 6); // the 80% return alone
    expect(perReturn).toBeGreaterThan(proportional);
  });
  it('a 65+ spouse\'s add-on stays on that spouse\'s return', () => {
    const A = 100000;
    const olderIsSmall = calculateTaxes(0, 'MFS', 1, false, two(90, A, D, D + ADDITIONAL_DEDUCTION_AGED_MARRIED_2026));
    const olderIsBig = calculateTaxes(0, 'MFS', 1, false, two(90, A, D + ADDITIONAL_DEDUCTION_AGED_MARRIED_2026, D));
    // The 10% return has $10,000 against $16,100: the add-on there is lost;
    // on the 90% return it saves tax.
    expect(olderIsSmall).toBeGreaterThan(olderIsBig);
    expect(olderIsSmall).toBeCloseTo(calculateTaxes(90000 - D, 'MFS', 1, false, 100), 6);
  });
});

describe('capital gains and NIIT on two returns', () => {
  it('each return shelters its share of the gains with its OWN unused deduction', () => {
    const A = 20000, cg = 40000;
    // 80/20: return 1 has $16,000 ordinary against $16,100 (unused $100),
    // return 2 has $4,000 against $16,100 (unused $12,100). Gains $32,000
    // and $8,000 ride on each; return 2's are sheltered entirely.
    const spec = two(80, A);
    const expected = calculateCapitalGainsTaxes(0, 32000, 'MFS', 1, D, 100, 0, 100)
      + calculateCapitalGainsTaxes(0, 8000, 'MFS', 1, D, 12100, 0, 100);
    expect(calculateCapitalGainsTaxes(0, cg, 'MFS', 1, 2 * D, 2 * D - A, 0, spec)).toBeCloseTo(expected, 6);
  });
  it('even split, same age band: unchanged', () => {
    const A = 90000, cg = 50000;
    expect(calculateCapitalGainsTaxes(A - 2 * D, cg, 'MFS', 1, 2 * D, 0, 0, two(50, A))).toBeCloseTo(calculateCapitalGainsTaxes(A - 2 * D, cg, 'MFS', 1, 2 * D, 0, 0, 50), 6);
    expect(calculateNetInvestmentIncomeTax(A - 2 * D, cg, 'MFS', 1, 2 * D, 0, 0, two(50, A))).toBeCloseTo(calculateNetInvestmentIncomeTax(A - 2 * D, cg, 'MFS', 1, 2 * D, 0, 0, 50), 6);
  });
});

const base = (o = {}) => ({
  ...DEFAULT_INPUTS,
  planYear: 2026, birthYear1: 1966, retireAge1: 60, lifeExpectancy1: 95, claimingAge1: 70,
  spouse2Enabled: true, birthYear2: 1966, retireAge2: 60, lifeExpectancy2: 95, claimingAge2: 70,
  preTaxInit: 3000000, rothInit: 0, taxableInit: 500000, hsaInit: 0,
  preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0, housingInflationRate: 0,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0, pension1COLA: 0, pension2COLA: 0,
  preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
  lifestyleExpense: 20000, healthcareBridgeCost: 0, taxableDividendYield: 0, taxableBasisInit: 500000, taxableCapitalGainsRatio: 0,
  stateTaxState: 'none', stateOfResidence: 'TX', employerMatchMode1: 'flat', withdrawalStrategy: 'TaxableFirst',
  filingStatus: 'MFS', rothConversionStrategy: 'fixed', rothConversionAmount: 60000, rothConversionDelayUntilRetire: false,
  ...o,
});
const y0 = (o) => runProjection(base(o)).years[0];

describe('in the projection', () => {
  it('an even split is unchanged; an 80/20 split of $60,000 owes the tax of the 80% return alone', () => {
    const even = y0({ mfsIncomeSplitPct: 50 });
    expect(even.federalTax).toBeCloseTo(calculateTaxes(60000 - 2 * D, 'MFS', 1, false, 50), 0);
    const uneven = y0({ mfsIncomeSplitPct: 80 });
    // The ledger's household figures are unchanged: $60,000 of ordinary
    // income, the two deductions summed; the per-return floor is in the tax.
    expect(uneven.ordinaryTaxableIncome + uneven.stdDeduction).toBeCloseTo(60000, 0);
    expect(uneven.stdDeduction).toBeCloseTo(2 * D, 0);
    expect(uneven.federalTax).toBeCloseTo(calculateTaxes(48000 - D, 'MFS', 1, false, 100), 0);
    expect(uneven.federalTax).toBeGreaterThan(even.federalTax);
  });
  it('fill-to-bracket fills the LARGER return to its ceiling less its own deduction, and the ledger\'s bracket reads that return', () => {
    const r = y0({ mfsIncomeSplitPct: 80, rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22, rothConversionBuffer: 0 });
    const limit = getTaxBracketLimit('MFS', 0.22, 1);
    const share = mfsLargerShare(base({ mfsIncomeSplitPct: 80 }), 'MFS');
    expect(share).toBe(0.8);
    // The 80% return's taxable income (its share of the ordinary income
    // less its own deduction) sits at the ceiling.
    const ordinary = r.ordinaryTaxableIncome + r.stdDeduction;
    expect(ordinary * share - D).toBeCloseTo(limit, -2);
    // At the top of the 22% bracket, the bracket shown is 22%, not the 24%
    // a household-figure read would have given.
    expect(r.marginalBracket).toBe(0.22);
  });
});
