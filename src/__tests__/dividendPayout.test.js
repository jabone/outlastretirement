// Changelog 231: what happens to dividends once you retire.
//
// Three modes, and the one that matters most is the DEFAULT: 'reinvest' is
// what the plan has always done, so a saved plan must project to the bit
// exactly as it did.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import { paycheckPlan, firstYearsFunding } from '../utils/retirementReadiness';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const S = DEFAULT_INPUTS.planYear;
// Lives off a large taxable bucket: the shape where reinvesting dividends
// and then selling shares to eat is doing the same trade twice.
const taxableFunded = {
  birthYear1: S - 62, retireAge1: 62, lifeExpectancy1: 88, claimingAge1: 67,
  salary1: 0, ss1: 40000, preTaxInit: 300000, rothInit: 0,
  taxableInit: 1500000, taxableBasisInit: 600000, withdrawalStrategy: 'TaxableFirst',
  taxableDividendYield: 2.5, lifestyleExpense: 70000,
  stateOfResidence: 'TX', stateTaxState: 'none',
};
const strip = (proj) => JSON.stringify(proj, (k, v) => (k === 'dividendCash' ? undefined : v));

describe('reinvesting stays the default', () => {
  it('is the default, and projects identically to a plan that never heard of the setting', () => {
    expect(DEFAULT_INPUTS.dividendPayoutMode).toBe('reinvest');
    let compared = 0;
    for (const over of [{}, { withdrawalStrategy: 'PreTaxFirst' }, { taxableDividendYield: 4 },
      { cashFloorEnabled: true, cashFloorInit: 80000 }, { lifestyleExpense: 140000 }]) {
      const p = plan({ ...taxableFunded, ...over });
      expect(strip(runProjection({ ...p, dividendPayoutMode: 'reinvest' }))).toBe(strip(runProjection(p)));
      compared += 1;
    }
    expect(compared).toBe(5);
  });

  it('pays nothing out in a working year, whatever the mode', () => {
    const working = plan({ ...taxableFunded, retireAge1: 70, salary1: 150000, dividendPayoutMode: 'cash' });
    const proj = runProjection(working);
    const before = proj.years.filter((y) => !y.isRetired);
    expect(before.length).toBeGreaterThan(3);
    expect(before.every((y) => y.dividendCash === 0)).toBe(true);
    expect(proj.years.some((y) => y.isRetired && y.dividendCash > 0)).toBe(true);
  });
});

describe('taking the dividends', () => {
  const run = (mode, over = {}) => runProjection(plan({ ...taxableFunded, ...over, dividendPayoutMode: mode }));

  it('takes only what the year needs under asNeeded, and the lot under cash', () => {
    // A plan whose spending is far below its dividends separates the two.
    const rich = { lifestyleExpense: 20000, ss1: 60000 };
    const asNeeded = run('asNeeded', rich);
    const cash = run('cash', rich);
    let compared = 0;
    for (let i = 0; i < asNeeded.years.length; i += 1) {
      const a = asNeeded.years[i];
      const c = cash.years[i];
      if (!a.isRetired) continue;
      expect(a.dividendCash).toBeLessThanOrEqual(c.dividendCash + 0.01);
      expect(c.dividendCash).toBeCloseTo(a.taxableDividends, 6);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(10);
    expect(asNeeded.years.some((y) => y.dividendCash < y.taxableDividends - 1)).toBe(true);
  });

  it('gives the same answer as reinvesting when the money was not needed', () => {
    // The point for anyone who stopped their DRIP without needing to: the
    // unspent dividend goes straight back in, so nothing at all changes.
    const rich = { lifestyleExpense: 20000, ss1: 60000 };
    const reinvest = run('reinvest', rich);
    const cash = run('cash', rich);
    expect(Math.round(cash.endingBalance)).toBe(Math.round(reinvest.endingBalance));
    expect(Math.round(cash.totalTaxesPaid)).toBe(Math.round(reinvest.totalTaxesPaid));
    // And it really did take them -- this is not a test of nothing.
    expect(cash.years.some((y) => y.dividendCash > 1000)).toBe(true);
  });

  it('sells far less, and pays less tax, in a plan funded from the taxable bucket', () => {
    const reinvest = run('reinvest');
    const asNeeded = run('asNeeded');
    const sold = (p) => p.years.reduce((t, y) => t + y.drawTaxable, 0);
    expect(sold(asNeeded)).toBeLessThan(sold(reinvest) / 2);
    expect(asNeeded.totalTaxesPaid).toBeLessThan(reinvest.totalTaxesPaid);
    expect(asNeeded.endingBalance).toBeGreaterThan(reinvest.endingBalance);
  });

  it('does not change what the dividend itself is taxed on', () => {
    // The tax on a dividend is the same whether it buys shares or buys
    // groceries, and so is the income it adds to IRMAA and ACA.
    const reinvest = run('reinvest');
    const cash = run('cash');
    let checked = 0;
    for (let i = 0; i < 8; i += 1) {
      const a = reinvest.years[i];
      const b = cash.years[i];
      if (!a.isRetired) continue;
      // Same opening balance in the first retired year, so the same yield.
      if (checked === 0) expect(b.taxableDividends).toBeCloseTo(a.taxableDividends, 6);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('credits basis only for the part that was reinvested', () => {
    const cash = run('cash');
    const reinvest = run('reinvest');
    // Same year, same account: the reinvesting plan's basis grows by the
    // dividend, the paying-out plan's does not.
    // Skip the first retired year -- it has no prior year to compare with
    // when the plan retires in year one.
    const i = cash.years.findIndex((y, n) => n > 0 && y.isRetired && y.dividendCash > 0);
    expect(i).toBeGreaterThan(0);
    const grewBy = (p) => p.years[i].taxableBasis - p.years[i - 1].taxableBasis;
    expect(grewBy(reinvest)).toBeGreaterThan(grewBy(cash));
  });

  it('keeps the account and its basis honest in every mode', () => {
    for (const mode of ['reinvest', 'cash', 'asNeeded']) {
      const proj = run(mode, { lifestyleExpense: 160000 });
      let checked = 0;
      for (const y of proj.years) {
        expect(y.taxableEnd).toBeGreaterThanOrEqual(-0.01);
        expect(y.taxableBasis).toBeGreaterThanOrEqual(-0.01);
        expect(y.taxableBasis).toBeLessThanOrEqual(y.taxableEnd + 1);
        expect(y.dividendCash).toBeGreaterThanOrEqual(0);
        expect(y.dividendCash).toBeLessThanOrEqual(y.taxableDividends + 0.01);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(20);
    }
  });
});

// The readiness cards read the new row field, which is the question that
// started all this: "where does 'arrives on its own' come from?"
describe('the paycheck card counts dividends that arrive as cash', () => {
  it('puts them on the arrives-on-its-own side, and only when they are taken', () => {
    const taken = plan({ ...taxableFunded, dividendPayoutMode: 'asNeeded' });
    const reinvested = plan({ ...taxableFunded, dividendPayoutMode: 'reinvest' });
    const a = paycheckPlan(runProjection(taken));
    const b = paycheckPlan(runProjection(reinvested));
    expect(a.rows[0].automatic).toBeGreaterThan(b.rows[0].automatic);
    const proj = runProjection(taken);
    const first = proj.years.find((y) => y.isRetired);
    expect(a.rows[0].automatic).toBeCloseTo(
      first.ssIncome + first.pension + first.rentalAnnuity + first.dividendCash, 6
    );
    expect(first.dividendCash).toBeGreaterThan(0);
  });

  it('names them among the first five years’ sources', () => {
    const taken = plan({ ...taxableFunded, dividendPayoutMode: 'asNeeded' });
    const funding = firstYearsFunding(runProjection(taken));
    const labels = funding.rows[0].sources.map((x) => x.label);
    expect(labels).toContain('Dividends taken as cash');
    const reinvested = firstYearsFunding(runProjection(plan({ ...taxableFunded, dividendPayoutMode: 'reinvest' })));
    expect(reinvested.rows[0].sources.map((x) => x.label)).not.toContain('Dividends taken as cash');
  });
});
