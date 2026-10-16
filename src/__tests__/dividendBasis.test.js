// Changelog 230: a reinvested dividend is basis.
//
// The dividend is taxed as income the year it arrives. The engine then
// reinvested it into the taxable bucket carrying NO basis, so the same
// dollar was taxed again as a capital gain when the shares were sold. The
// milestone-inflow code had called this trap out in a comment for a year
// ("taxing it again as a capital gain later would double-tax it");
// dividends were simply missed.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
// Retired, no salary, everything funded from a large taxable bucket at 40%
// basis -- the shape where the double-tax actually bites.
const taxableHeavy = {
  birthYear1: START - 62, retireAge1: 62, lifeExpectancy1: 92, claimingAge1: 67,
  salary1: 0, ss1: 40000, preTaxInit: 200000, rothInit: 0,
  taxableInit: 1000000, taxableBasisInit: 400000, withdrawalStrategy: 'TaxableFirst',
  taxableDividendYield: 2.0, stateOfResidence: 'TX', stateTaxState: 'none',
};

describe('a reinvested dividend is basis', () => {
  it('adds the year’s dividend to basis, and nothing when the yield is zero', () => {
    const withYield = runProjection(plan({ ...taxableHeavy, lifestyleExpense: 20000 }));
    const noYield = runProjection(plan({ ...taxableHeavy, lifestyleExpense: 20000, taxableDividendYield: 0 }));
    // Same plan, same return; the only difference is that part of that
    // return is named as a dividend. Naming it must not destroy basis.
    const basisAt = (p, n) => p.years[n].taxableBasis;
    expect(basisAt(withYield, 10)).toBeGreaterThan(basisAt(noYield, 10));
    let grew = 0;
    for (let i = 1; i < 20; i += 1) {
      const row = withYield.years[i];
      const prev = withYield.years[i - 1];
      // Basis rises by that year's dividend, absent any sale.
      if (row.drawTaxable === 0 && row.taxableEnd > row.taxableStart) {
        expect(row.taxableBasis).toBeGreaterThan(prev.taxableBasis);
        grew += 1;
      }
    }
    expect(grew).toBeGreaterThan(0);
  });

  it('keeps the standing invariant: never negative, never above the balance', () => {
    for (const lifestyleExpense of [20000, 90000, 160000]) {
      const proj = runProjection(plan({ ...taxableHeavy, lifestyleExpense }));
      let checked = 0;
      for (const y of proj.years) {
        expect(y.taxableBasis).toBeGreaterThanOrEqual(-0.01);
        expect(y.taxableBasis).toBeLessThanOrEqual(y.taxableEnd + 1);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(20);
    }
  });

  it('charges the dividend once, not twice — lifetime tax falls where taxable is actually sold', () => {
    // A plan that barely touches the taxable bucket realizes few gains, so
    // the correction is small; one that lives off it realizes many, and
    // this is where the double charge was.
    const light = runProjection(plan({ ...taxableHeavy, lifestyleExpense: 20000 }));
    const heavy = runProjection(plan({ ...taxableHeavy, lifestyleExpense: 90000 }));
    const soldMore = heavy.years.reduce((t, y) => t + y.drawTaxable, 0);
    const soldLess = light.years.reduce((t, y) => t + y.drawTaxable, 0);
    expect(soldMore).toBeGreaterThan(soldLess);
    // And the basis the sales draw against is real money, not zero.
    expect(heavy.years[5].taxableBasis).toBeGreaterThan(0);
  });

  it('creates no basis out of an empty bucket', () => {
    // A dividend is a yield ON a balance. With nothing in the account
    // there is nothing to credit, and an account emptied mid-year must not
    // end it holding basis against a zero balance.
    const none = plan({ ...taxableHeavy, taxableInit: 0, taxableBasisInit: 0, preTaxInit: 1200000, lifestyleExpense: 50000, withdrawalStrategy: 'PreTaxFirst' });
    let empty = 0;
    for (const y of runProjection(none).years) {
      if (y.taxableEnd < 1) { expect(y.taxableBasis).toBeLessThan(1); empty += 1; }
    }
    expect(empty).toBeGreaterThan(0);
  });
});
