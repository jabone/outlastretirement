// The 0% tier (changelog 463): a fill-to-bracket Roth conversion may
// target 0%, converting as much as the year's deductions cover with no
// federal income tax. getTaxBracketLimit gives 0% a $0 ceiling on
// purpose; the sanitizer keeps targets to the real brackets; the Roth
// Ladder grid tests all eight.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS, runProjection, sanitizeInputs, getTaxBracketLimit,
  getRothBracketWithdrawalHeatmap, gridBestExtraStrategy, ROTH_CONVERSION_BRACKETS,
} from '../calculator';
import { assertKnownInputKeys } from './knownInputKeys';

// A retiree whose only taxable income is the conversion: no wages, Social
// Security or pension, and the year's costs (Medicare premiums at 65+)
// drawn from Roth basis, so nothing else reaches the return.
const single = {
  ...DEFAULT_INPUTS, planYear: 2026, spouse2Enabled: false, filingStatus: 'Single', birthYear1: 1966,
  retireAge1: 50, salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0,
  preTaxInit: 500000, rothInit: 200000, rothBasisInit: 200000, taxableInit: 0, hsaInit: 0,
  withdrawalStrategy: 'RothFirst', lifestyleExpense: 0, mortgageBalance: 0, mortgagePayment: 0, homeOwned: false,
  rothConversionStrategy: 'maxBracket', rothConversionBracket: 0, rothConversionBuffer: 0, rothConversionDelayUntilRetire: true,
  itemizeDeductions: 'auto', acaCliffProtectionEnabled: false, rothConversionIrmaaCapEnabled: false,
  healthcareBridgeCost: 0, stateOfResidence: 'TX', stateTaxState: 'none',
};
assertKnownInputKeys(single);
const couple = { ...single, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1960, birthYear2: 1960, retireAge2: 50 };
const firstYear = (inputs) => runProjection(inputs).years[0];

describe('the 0% tier fills the deductions with no federal income tax (2026)', () => {
  const cases = [
    // [label, inputs, expected conversion, why]
    ['A1 single, 60', single, 16100],                                   // the 2026 standard deduction
    ['A3 single, 66', { ...single, birthYear1: 1960 }, 24150],          // + 2,050 at 65 + 6,000 senior deduction
    ['A4 married, both 66', couple, 47500],                             // 32,200 + 2 x 1,650 + 2 x 6,000
  ];
  for (const [label, inputs, expected] of cases) {
    it(label, () => {
      const y = firstYear(inputs);
      expect(y.year).toBe(2026);
      expect(y.convertAmount).toBeCloseTo(expected, 0);
      expect(Math.abs(y.federalTax)).toBeLessThanOrEqual(1);
      expect(y.deductionUsed).toBe('standard');
      expect(y.stdDeduction).toBeCloseTo(expected, 0);
    });
  }

  it('A2 the buffer stops the fill that far short of the deduction', () => {
    expect(firstYear({ ...single, rothConversionBuffer: 1000 }).convertAmount).toBeCloseTo(15100, 0);
  });

  it('A5 the 10% bracket adds its 12,400 on top, taxed at 10%', () => {
    const y = firstYear({ ...single, rothConversionBracket: 0.10 });
    expect(y.convertAmount).toBeCloseTo(16100 + 12400, 0);
    expect(y.federalTax).toBeCloseTo(1240, 0);
  });

  it('0% has a $0 ceiling, the real brackets keep theirs', () => {
    expect(getTaxBracketLimit('Single', 0)).toBe(0);
    expect(getTaxBracketLimit('Single', 0.10)).toBe(12400);
    expect(getTaxBracketLimit('MFJ', 0.12)).toBe(100800);
  });
});

describe('the sanitizer keeps a target to the real brackets', () => {
  const clean = (b) => sanitizeInputs({ ...DEFAULT_INPUTS, rothConversionBracket: b });
  it('0 stays 0, 22 reads as 22%, 0.15 takes the default and is listed', () => {
    expect(clean(0).rothConversionBracket).toBe(0);
    expect(clean(0.1).rothConversionBracket).toBe(0.10);
    expect(clean(22).rothConversionBracket).toBe(0.22);
    const odd = clean(0.15);
    expect(odd.rothConversionBracket).toBe(DEFAULT_INPUTS.rothConversionBracket);
    const r = runProjection({ ...DEFAULT_INPUTS, rothConversionBracket: 0.15 });
    expect(r.invalidInputs).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'rothConversionBracket', reason: 'unknown-bracket' })]));
  });
  it('every bracket the form offers is a real target', () => {
    for (const b of [0, 0.1, 0.12, 0.22, 0.24, 0.32]) expect(ROTH_CONVERSION_BRACKETS).toContain(b);
  });
});

describe('the Roth Ladder grid tests the 0% tier', () => {
  it('8 targets x 4 withdrawal orders, and 0% can be the Full-Grid Best', () => {
    const cells = getRothBracketWithdrawalHeatmap({ ...single, birthYear1: 1960 });
    expect(cells).toHaveLength(32);
    expect(cells.filter((c) => c.bracket === 0)).toHaveLength(4);
    // Forced: a grid whose best cell is the 0% tier becomes the extra card.
    const forced = cells.map((c) => ({ ...c, isSuccessful: true, afterTaxLegacy: c.bracket === 0 && c.withdrawalStrategy === 'RothFirst' ? 1e12 : 1 }));
    const extra = gridBestExtraStrategy(forced);
    expect(extra.config.rothConversionBracket).toBe(0);
    expect(extra.name).toContain('0% Tier');
  });
});
