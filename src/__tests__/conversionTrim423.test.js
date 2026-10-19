// Changelog 423: a max-bracket Roth conversion is trimmed to the income the
// withdrawal solver's own draws add. The fill was sized before the solver
// ran; a plan that funds spending from Pre-Tax then stacked that draw on a
// bracket the conversion had already filled and overshot the target by the
// whole draw.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, getTaxBracketLimit, calculateTaxes } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const base = {
  ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: START - 62, retireAge1: 60,
  salary1: 0, ss1: 0, claimingAge1: 70, preTaxInit: 2000000, taxableInit: 50000, rothInit: 100000,
  lifestyleExpense: 60000, withdrawalStrategy: 'PreTaxFirst',
  rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.22, rothConversionBuffer: 0,
  acaCreditSource: 'manual', itemizeDeductions: 'never', taxableQualifiedDividendFollowsAllocation: false,
  acaCliffProtectionEnabled: false, rothConversionIrmaaCapEnabled: false,
};
const ceilingFor = (y) => getTaxBracketLimit('Single', 0.22, y.taxBracketInflationFactor);

describe('the max-bracket fill is trimmed to the solver\'s draw', () => {
  it('a Pre-Tax First plan lands on the bracket ceiling to the dollar, conversion and draw together', () => {
    const years = runProjection(base).years.slice(0, 8);
    for (const y of years) {
      expect(y.drawPreTax).toBeGreaterThan(1000); // spending came from Pre-Tax
      expect(y.convertAmount).toBeGreaterThan(0); // and a conversion still fit
      expect(y.conversionTrimmedForDraw).toBeGreaterThan(1000);
      expect(y.ordinaryTaxableIncome).toBeCloseTo(ceilingFor(y), 0);
      expect(y.federalTax + y.stateTax + y.ficaTax).toBeCloseTo(y.totalTaxesPaid, 6);
      // Changelog 435: landing on the ceiling is not enough -- the year
      // must owe the ceiling's tax. The only federal tax beyond the
      // ordinary brackets is the 15% on the taxable account's dividends.
      const atCeiling = calculateTaxes(ceilingFor(y), 'Single', y.taxBracketInflationFactor, DEFAULT_INPUTS.tcjaSunsetEnabled);
      expect(y.federalTax - atCeiling).toBeGreaterThanOrEqual(-1);
      expect(y.federalTax - atCeiling).toBeLessThanOrEqual(0.15 * y.taxableDividends + 1);
    }
    // And the first year's draw is the spending plus that tax, nothing more.
    const y0 = years[0];
    expect(y0.drawPreTax).toBeCloseTo(60000 + y0.healthcareBridge + y0.federalTax, -1);
  });

  it('the trimmed fixture no longer pays 40% more than the ceiling owes (435)', () => {
    // The reviewer's reproducer: before 435 this year sat on the $105,700
    // ceiling and paid $25,483 of federal tax against $17,966 at the
    // ceiling, because the trim loop priced each pass before the draw it
    // returned to Pre-Tax came off the year's income.
    const y = runProjection(base).years[0];
    const atCeiling = calculateTaxes(ceilingFor(y), 'Single', y.taxBracketInflationFactor, DEFAULT_INPUTS.tcjaSunsetEnabled);
    expect(y.federalTax).toBeLessThan(atCeiling + 200);
    expect(y.convertAmount).toBeGreaterThan(30000);
  });

  it('a spending draw that fills the bracket on its own leaves no conversion', () => {
    const y = runProjection({ ...base, lifestyleExpense: 110000 }).years[0];
    expect(y.drawPreTax).toBeGreaterThan(ceilingFor(y));
    expect(y.convertAmount).toBe(0);
    expect(y.conversionTrimmedForDraw).toBeGreaterThan(0);
  });

  it('a plan that spends from Taxable is untouched', () => {
    const y = runProjection({ ...base, taxableInit: 2000000, withdrawalStrategy: 'TaxableFirst' }).years[0];
    expect(y.drawPreTax).toBe(0);
    expect(y.conversionTrimmedForDraw).toBe(0);
    expect(y.convertAmount).toBeGreaterThan(50000);
    expect(y.ordinaryTaxableIncome).toBeCloseTo(ceilingFor(y), 0);
  });

  it('the trim conserves money: Pre-Tax falls by the conversion plus the draw, Roth rises by the conversion', () => {
    const inputs = { ...base, preRetireReturn: 0, postRetireReturn: 0, dividendYield: 0 };
    const y = runProjection(inputs).years[0];
    expect(y.preTaxEnd).toBeCloseTo(inputs.preTaxInit - y.convertAmount - y.drawPreTax, 0);
    expect(y.rothEnd).toBeCloseTo(inputs.rothInit + y.convertAmount - y.drawRoth, 0);
  });
});
