// A complete federal/state split (changelog 182).
//
// WHAT CHANGED AND WHY IT WAS DEFERRED TWICE. Changelog 176 found that the
// Tax & Estate panel was inventing a federal tax figure from ordinary
// bracket bars, and fixing it turned up something bigger: the engine could
// not produce a complete federal-only figure AT ALL. The marginal tax on
// the withdrawal the solver sizes landed in `extraTax` as one blended
// number, and in a taxable-funded year that is the larger part of the bill.
// Splitting it meant touching `getTax` inside a 40-iteration binary search
// -- the most load-bearing code in the app -- so it was deliberately not
// bundled with a display fix, twice.
//
// The refactor is behavior-neutral by construction: `getTaxParts` returns
// exactly what `getTax` used to compute plus the decomposition it was
// already making internally, `getTax` is now a `.total` accessor over it,
// and the split of the chosen draw is computed ONCE at the end rather than
// threaded through the search.
//
// THE INVARIANT THIS FILE EXISTS FOR:
//     federalTax + stateTax + ficaTax === totalTaxesPaid, every year.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';

const FUNDED = {
  ...DEFAULT_INPUTS,
  // Changelog 414 made the brokerage yield's bond share ordinary income;
  // this file is about something else, so the yield stays all-qualified.
  taxableQualifiedDividendFollowsAllocation: false,
  planYear: 2026,
  spouse2Enabled: false,
  filingStatus: 'Single',
  lifeExpectancy1: 88,
  preTaxInit: 900000, taxableInit: 700000, rothInit: 250000, hsaInit: 0,
  lifestyleExpense: 85000,
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
};

// Deliberately spans every code path that contributes to extraTax: the
// solver under each withdrawal order, a pre-59.5 penalty, a state with its
// own additional tax, and the two ACA items.
const SHAPES = {
  'default retiree': {},
  'taxable-funded, gains heavy': { birthYear1: 1959, retireAge1: 60, salary1: 0, taxableInit: 6000000, taxableBasisInit: 1200000, lifestyleExpense: 400000, withdrawalStrategy: 'TaxableFirst' },
  'pre-tax first, large draw': { birthYear1: 1960, retireAge1: 60, salary1: 0, preTaxInit: 3000000, lifestyleExpense: 180000, withdrawalStrategy: 'PreTaxFirst' },
  'pro-rata': { withdrawalStrategy: 'ProRata', birthYear1: 1962, retireAge1: 62 },
  'pre-59.5 bridge, no state tax': { birthYear1: 1975, retireAge1: 52, salary1: 0, preTaxInit: 1500000, withdrawalStrategy: 'PreTaxFirst', lifestyleExpense: 90000, stateTaxState: 'none' },
  'pre-59.5 bridge in California': { birthYear1: 1975, retireAge1: 52, salary1: 0, preTaxInit: 1500000, withdrawalStrategy: 'PreTaxFirst', lifestyleExpense: 90000, stateTaxState: 'ca' },
  'still working, FICA in play': { birthYear1: 1985, retireAge1: 65, salary1: 180000 },
  'ACA pre-65 with subsidy': { birthYear1: 1968, retireAge1: 58, salary1: 0, stateTaxState: 'none', stateOfResidence: 'TX', acaCliffProtectionEnabled: true, healthcareBridgeCost: 18000, acaCreditSource: 'manual', acaSubsidyAnnualValue: 9000 },
};

describe('the fixtures are real', () => {
  it('use only input keys the engine reads', () => {
    const bad = [];
    for (const [name, over] of Object.entries(SHAPES)) {
      Object.keys(over).forEach(k => { if (!(k in DEFAULT_INPUTS)) bad.push(`${name}:${k}`); });
    }
    expect(bad).toEqual([]);
  });
});

describe('the parts reconcile to the whole, in every year of every shape', () => {
  let yearsChecked = 0;

  Object.entries(SHAPES).forEach(([name, over]) => {
    it(`${name}: federal + state + FICA === totalTaxesPaid`, () => {
      const res = runProjection({ ...FUNDED, ...over });
      let mismatches = 0;
      for (const y of res.years) {
        yearsChecked += 1;
        const recombined = (y.federalTax || 0) + (y.stateTax || 0) + (y.ficaTax || 0);
        if (Math.abs(recombined - y.totalTaxesPaid) > 1e-6) mismatches += 1;
      }
      // Counted rather than asserted inside the loop: an empty projection
      // would otherwise pass having checked nothing (DEVELOPMENT.md).
      expect(mismatches).toBe(0);
      expect(res.years.length).toBeGreaterThan(10);
    });
  });

  it('checked a meaningful number of years', () => {
    expect(yearsChecked).toBeGreaterThan(200);
  });
});

describe('extraTax splits exactly, and the solver owns most of it', () => {
  it('extraTaxFederal + extraTaxState === extraTax', () => {
    let mismatches = 0, yearsWithExtra = 0;
    for (const over of Object.values(SHAPES)) {
      for (const y of runProjection({ ...FUNDED, ...over }).years) {
        if ((y.extraTax || 0) > 0.005) yearsWithExtra += 1;
        if (Math.abs((y.extraTaxFederal || 0) + (y.extraTaxState || 0) - (y.extraTax || 0)) > 1e-6) mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
    // And the guard against a vacuous pass: extraTax must actually be
    // non-zero somewhere, or the reconciliation above is 0 === 0.
    expect(yearsWithExtra).toBeGreaterThan(20);
  });

  it('federalTax is NOT baseFederalTax -- the draw\'s tax is really in there', () => {
    // The whole reason this was worth doing. In a taxable-funded year the
    // marginal tax on the withdrawal dwarfs the pre-withdrawal figure.
    const y0 = runProjection({ ...FUNDED, ...SHAPES['taxable-funded, gains heavy'] }).years[0];
    expect(y0.extraTax).toBeGreaterThan(y0.baseFederalTax * 5);
    expect(y0.federalTax).toBeGreaterThan(y0.baseFederalTax * 5);
    expect(y0.federalTax).toBeCloseTo(y0.baseFederalTax + y0.extraTaxFederal, 6);
  });
});

describe('federal and state land on the right side of the line', () => {
  it('a no-income-tax state reports exactly zero state tax, penalty and all', () => {
    // The discriminating case for the 10% early-withdrawal penalty, which
    // is FEDERAL. This household is under 59.5 and drawing hard from
    // Pre-Tax, so a penalty is certainly being charged -- if it were
    // attributed to the state side, a state with no income tax would
    // nonetheless report state tax. A reconciliation test cannot catch
    // that, because the sum is right either way.
    const res = runProjection({ ...FUNDED, ...SHAPES['pre-59.5 bridge, no state tax'] });
    // The plan's FIRST year is age 51 and pre-retirement, so nothing is
    // drawn and no tax is charged -- testing it would assert 0 === 0. Pick
    // the first year that actually takes a penalized draw.
    const y = res.years.find(r => r.drawPreTax > 50000 && r.age1 < 59.5);
    expect(y).toBeTruthy();
    expect(y.stateTax).toBeCloseTo(0, 6);
    expect(y.federalTax).toBeGreaterThan(0);
    expect(y.federalTax).toBeCloseTo(y.totalTaxesPaid, 6);
  });

  it('California\'s own additional tax on the same distribution is state, not federal', () => {
    const pick = (over) => runProjection({ ...FUNDED, ...over }).years.find(r => r.drawPreTax > 50000 && r.age1 < 59.5);
    const none = pick(SHAPES['pre-59.5 bridge, no state tax']);
    const ca = pick(SHAPES['pre-59.5 bridge in California']);
    expect(none.stateTax).toBeCloseTo(0, 6);
    expect(ca.stateTax).toBeGreaterThan(0);
    // Both still reconcile -- the point is only that the extra landed on
    // the state side.
    expect(ca.federalTax + ca.stateTax + ca.ficaTax).toBeCloseTo(ca.totalTaxesPaid, 6);
  });

  it('an ACA premium-credit clawback is federal, not state', () => {
    // Repaying an advance premium tax credit happens on Form 8962 -- a
    // federal return. This household is in a state with no income tax and
    // repays the credit every pre-65 year, so if the clawback were
    // attributed to the state side, state tax would appear from nowhere.
    //
    // Reconciliation alone cannot catch that: the sum is right either way.
    // That is exactly how a mutation moving it to state passed the first
    // version of this file.
    const res = runProjection({ ...FUNDED, ...SHAPES['ACA pre-65 with subsidy'] });
    const clawbackYears = res.years.filter(y => (y.acaSubsidyClawback || 0) > 0);
    expect(clawbackYears.length).toBeGreaterThan(3);
    const leaked = clawbackYears.filter(y => Math.abs(y.stateTax) > 1e-6);
    expect(leaked).toHaveLength(0);
    // And the clawback really is inside the federal figure.
    const y = clawbackYears[0];
    expect(y.extraTaxFederal).toBeGreaterThanOrEqual(y.acaSubsidyClawback - 1e-6);
  });

  it('FICA is neither federal income tax nor state, and shows up only while working', () => {
    const working = runProjection({ ...FUNDED, ...SHAPES['still working, FICA in play'] }).years[0];
    expect(working.ficaTax).toBeGreaterThan(0);
    const retired = runProjection({ ...FUNDED, ...SHAPES['taxable-funded, gains heavy'] }).years[0];
    expect(retired.ficaTax).toBeCloseTo(0, 6);
  });
});
