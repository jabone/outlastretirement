// Changelog 404: a harvested loss nets against EVERY capital gain before any
// of it offsets ordinary income (s 1211(b)), including the gains the
// withdrawal solver's own Taxable draw realizes; and the ledger's MAGI for
// the senior-bonus phase-out nets the loss used on the draw.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, seniorBonusDeduction } from '../calculator';

const retired = (crashPct, lifestyleExpense = 250000) => ({
  ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1961, retireAge1: 60, salary1: 0, ss1: 0, ss2: 0, pension1: 0,
  lifestyleExpense, preTaxInit: 0, rothInit: 0, taxableInit: 3000000, taxableBasisInit: 900000,
  withdrawalStrategy: 'TaxableFirst', cashFloorEnabled: false, taxLossHarvestingEnabled: true,
  stressType: 'crashYear', stressCrashReturn: crashPct, stressStartMode: 'specific', stressStartYear: 2027,
});

describe('the $3,000 ordinary offset is reclaimed when the year\'s draw realizes more gain than the carryforward covers', () => {
  it('a small harvest is used up by the crash year\'s own draw and none of it offsets ordinary income', () => {
    const y = runProjection(retired(-2)).years.find((r) => r.year === 2027);
    expect(y.taxLossHarvestedThisYear).toBeGreaterThan(3000);
    // The year's draw realizes far more gain than was harvested...
    expect(y.realizedGains).toBeGreaterThan(0);
    // ...so the whole harvest went against gains, none against ordinary income.
    expect(y.harvestedOrdinaryOffset).toBe(0);
    expect(y.lossUsedOnDraw).toBeCloseTo(y.taxLossHarvestedThisYear, 2);
    expect(y.lossCarryforward).toBe(0);
  });

  it('a large harvest still takes the $3,000 ordinary offset, since the gains leave loss over', () => {
    const y = runProjection(retired(-20)).years.find((r) => r.year === 2027);
    expect(y.harvestedOrdinaryOffset).toBeCloseTo(3000, 2);
    // Conservation: what was harvested equals what went to gains, to
    // ordinary income, and what is carried on.
    expect(y.harvestedGainsOffset + y.harvestedOrdinaryOffset + y.lossUsedOnDraw + y.lossCarryforward)
      .toBeCloseTo(y.taxLossHarvestedThisYear, 2);
  });
});

describe('the ledger\'s MAGI for the senior bonus nets the loss used on the draw', () => {
  it('the senior bonus shown is the one this year\'s net MAGI earns', () => {
    // 66 in 2027, single, MAGI inside the $75,000-$175,000 phase-out, and a
    // harvest the draw nets: the deduction the ledger shows must be the
    // bonus at the NET MAGI (the same figure IRMAA is priced on), not at
    // the gross-gains figure, which read the bonus thousands lower.
    // ($230,000 of spending: at $250,000 the draws that settle the year's
    // IRMAA true-up, changelog 405, carry the MAGI past the band.)
    const y = runProjection(retired(-3, 230000)).years.find((r) => r.year === 2027);
    expect(y.lossUsedOnDraw).toBeGreaterThan(0);
    expect(y.seniorCount).toBe(1);
    expect(y.irmaaMagi).toBeGreaterThan(75000);
    expect(y.irmaaMagi).toBeLessThan(175000);
    expect(y.seniorBonusDeduction).toBeCloseTo(seniorBonusDeduction(y.irmaaMagi, 'Single', 2027, 1), 2);
    expect(y.seniorBonusDeduction).toBeGreaterThan(0);
  });
});
