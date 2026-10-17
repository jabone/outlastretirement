// Changelog 403: two places still read a per-return MFS line against the
// HOUSEHOLD figure after the two-return split (Rule 1.1): the maxBracket
// conversion ceiling, which converted half of what fit for an even split,
// and the ledger's marginal bracket, which read the household's taxable
// income as if one return carried it all.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, getTaxBracketLimit, mfsLargerShare } from '../calculator';

const base = (o = {}) => ({
  ...DEFAULT_INPUTS,
  planYear: 2026, birthYear1: 1960, retireAge1: 60, lifeExpectancy1: 95, claimingAge1: 70,
  spouse2Enabled: true, birthYear2: 1960, retireAge2: 60, lifeExpectancy2: 95, claimingAge2: 70,
  preTaxInit: 3000000, rothInit: 0, taxableInit: 500000, hsaInit: 0,
  preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0, housingInflationRate: 0,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0, pension1COLA: 0, pension2COLA: 0,
  preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
  lifestyleExpense: 20000, healthcareBridgeCost: 0, taxableDividendYield: 0, taxableBasisInit: 500000, taxableCapitalGainsRatio: 0,
  stateTaxState: 'none', stateOfResidence: 'TX', employerMatchMode1: 'flat', withdrawalStrategy: 'TaxableFirst',
  rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22, rothConversionBuffer: 0, rothConversionDelayUntilRetire: false,
  ...o,
});
const y0 = (o) => runProjection(base(o)).years[0];

describe('mfsLargerShare', () => {
  it('is the larger return\'s share on a two-return MFS plan, and 1 otherwise', () => {
    expect(mfsLargerShare({ spouse2Enabled: true, mfsIncomeSplitPct: 50 }, 'MFS')).toBe(0.5);
    expect(mfsLargerShare({ spouse2Enabled: true, mfsIncomeSplitPct: 30 }, 'MFS')).toBe(0.7);
    expect(mfsLargerShare({ spouse2Enabled: true, mfsIncomeSplitPct: 100 }, 'MFS')).toBe(1);
    expect(mfsLargerShare({ spouse2Enabled: false, mfsIncomeSplitPct: 50 }, 'MFS')).toBe(1);
    expect(mfsLargerShare({ spouse2Enabled: true, mfsIncomeSplitPct: 50 }, 'MFJ')).toBe(1);
  });
});

describe('maxBracket conversion sizing on two MFS returns', () => {
  it('an even MFS split fills the 22% bracket on BOTH returns, so it converts what MFJ does', () => {
    const mfj = y0({ filingStatus: 'MFJ' });
    const mfs = y0({ filingStatus: 'MFS', mfsIncomeSplitPct: 50 });
    expect(mfj.convertAmount).toBeGreaterThan(100000);
    // MFS brackets and deductions are exactly half of MFJ below the top, so
    // two even returns fill to the same household figure.
    expect(Math.abs(mfs.convertAmount - mfj.convertAmount) / mfj.convertAmount).toBeLessThan(0.005);
  });

  it('a one-return MFS plan (split 100) fills one MFS bracket, about half', () => {
    const one = y0({ filingStatus: 'MFS', mfsIncomeSplitPct: 100 });
    const two = y0({ filingStatus: 'MFS', mfsIncomeSplitPct: 50 });
    expect(one.convertAmount).toBeLessThan(two.convertAmount * 0.6);
  });

  it('the household taxable income after an even-split fill is the ceiling over the larger share', () => {
    const r = y0({ filingStatus: 'MFS', mfsIncomeSplitPct: 50 });
    const ceiling = getTaxBracketLimit('MFS', 0.22, 1) / 0.5;
    expect(r.ordinaryTaxableIncome).toBeCloseTo(ceiling, -2);
  });
});

describe('the ledger\'s marginal bracket on two MFS returns', () => {
  it('reads the larger return\'s bracket, not the household figure against one return', () => {
    const r = y0({ filingStatus: 'MFS', mfsIncomeSplitPct: 50 });
    // Filled to the top of the 22% bracket on each return.
    expect(r.marginalBracket).toBe(0.22);
    const mfj = y0({ filingStatus: 'MFJ' });
    expect(mfj.marginalBracket).toBe(0.22);
  });
});
