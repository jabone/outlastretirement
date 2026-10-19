// Changelog 429: a harvested loss is the loss the taxable account holds --
// its basis over the declined value, plus the year's own contribution --
// and the sale resets the basis to the declined value.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const retiree = (over = {}) => ({
  ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: START - 65, retireAge1: 60, salary1: 0, ss1: 0, pension1: 0,
  lifestyleExpense: 50000, preTaxInit: 0, rothInit: 2000000, taxableInit: 1000000, withdrawalStrategy: 'RothFirst',
  taxableDividendYield: 0, cashFloorEnabled: false, taxLossHarvestingEnabled: true,
  stressType: 'crashYear', stressCrashReturn: -20, stressStartMode: 'specific', stressStartYear: START,
  acaCreditSource: 'manual', itemizeDeductions: 'never',
  ...over,
});

describe('a harvest is the loss the account holds', () => {
  it('an account sitting on gains harvests nothing on a dip', () => {
    const y = runProjection(retiree({ taxableBasisInit: 400000 })).years[0];
    expect(y.growthRate).toBe(-20);
    expect(y.taxLossHarvestedThisYear).toBe(0);
    expect(y.lossCarryforward).toBe(0);
  });

  it('a fresh account harvests the whole decline, and its basis is reset to the crashed value', () => {
    const y = runProjection(retiree({ taxableBasisInit: 1000000 })).years[0];
    expect(y.taxLossHarvestedThisYear).toBeCloseTo(1000000 * 0.2, 0);
    expect(y.taxableBasis).toBeCloseTo(y.taxableEnd, 0);
  });

  it('an account a little above basis harvests only the dip below it', () => {
    // Basis 90%: a 20% decline leaves the account 10% under basis.
    const y = runProjection(retiree({ taxableBasisInit: 900000 })).years[0];
    expect(y.taxLossHarvestedThisYear).toBeCloseTo(100000, 0);
    expect(y.taxableBasis).toBeCloseTo(y.taxableEnd, 0);
  });

  it('this year\'s own contribution is harvestable even when the pool sits on gains', () => {
    const worker = retiree({ birthYear1: START - 50, retireAge1: 65, salary1: 200000, taxableContribution: 30000, taxableBasisInit: 400000, lifestyleExpense: 80000 });
    const y = runProjection(worker).years[0];
    expect(y.taxLossHarvestedThisYear).toBeCloseTo(30000 * 0.2, 0);
  });

  it('a deducted loss is not sheltered again: the recovery after a harvest is taxed as gain', () => {
    // Crash, then recover: with the basis reset, the second year's draw
    // realizes gains; without a reset it would not.
    const twoYears = retiree({ taxableBasisInit: 1000000, withdrawalStrategy: 'TaxableFirst', lifestyleExpense: 120000 });
    const p = runProjection(twoYears);
    const y1 = p.years[1];
    expect(y1.growthRate).toBeGreaterThan(0);
    // The year-2 draw comes out of an account whose basis equals its
    // crashed value, so the draw's basis ratio is 1 and the gains are the
    // year's own growth only -- zero at the start of year two, since
    // growth lands at year end.
    // (The harvest is sized on the opening balance while the year's own
    // draw came out before the decline, so a sliver of gain remains --
    // under 5% of the draw; the year-three draw realizes the recovery.)
    expect(y1.lossUsedOnDraw).toBeLessThan(0.05 * y1.drawTaxable);
    const y2 = p.years[2];
    expect(y2.lossUsedOnDraw).toBeGreaterThan(y1.lossUsedOnDraw);
    expect(y2.lossUsedOnDraw).toBeGreaterThan(0);
  });
});
