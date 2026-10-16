// Changelog 176 -- the projection now publishes the federal / state / FICA
// split it has always computed internally, and the Tax & Estate "Filing
// Detail" panel reads it instead of rebuilding one.
//
// THE CLASS OF BUG THIS GUARDS. Changelog 174 was a display surface that
// computed its own version of a number the engine already published, and
// drifted when the engine moved. This file exists because that was not a
// one-off: thirty lines away in the same panel, the "Effective Fed Rate"
// summed ORDINARY BRACKET FILLING ONLY -- no capital-gains tax, no NIIT, no
// AMT -- and divided it by a denominator that included the standard
// deduction. Both errors understate the rate, on the tab where people decide
// how much to convert.
//
// The first test below is the important one: it reconstructs the OLD number
// the way the panel used to, and asserts the engine's real figure is
// materially higher. That is the bug, written down, so it cannot come back
// quietly.
import { describe, it, expect } from 'vitest';
import { runProjection, getBracketFilling, DEFAULT_INPUTS } from '../calculator';

// A retired single filer living off a large taxable account: the draw
// realizes capital gains every year, which is precisely the income the
// bracket-bar reconstruction could not see. Kept above the NIIT threshold
// ($200,000 single) so that tax is in play too.
const GAINS_HEAVY = {
  ...DEFAULT_INPUTS,
  planYear: 2026,
  spouse2Enabled: false,
  filingStatus: 'Single',
  birthYear1: 1959,
  retireAge1: 60,
  lifeExpectancy1: 90,
  claimingAge1: 70,
  ss1: 36000,
  salary1: 0,
  pension1: 0,
  preTaxInit: 200000,
  rothInit: 0,
  taxableInit: 6000000,
  taxableBasisInit: 1200000, // 20% basis, so a draw realizes real gains
  hsaInit: 0,
  lifestyleExpense: 400000,
  withdrawalStrategy: 'TaxableFirst',
  stateTaxState: 'none',
  inflationRate: 0,
  taxBracketInflationRate: 0,
  ssCOLA: 0,
};

describe('the fixture is real, so nothing below is vacuous', () => {
  // DEVELOPMENT.md: sanitizeInputs() passes unknown keys through silently, so a
  // typo here would quietly test DEFAULT behavior instead.
  it('uses only real input keys', () => {
    expect(Object.keys(GAINS_HEAVY).filter(k => !(k in DEFAULT_INPUTS))).toEqual([]);
  });

  it('actually realizes capital gains, or the whole file proves nothing', () => {
    const y0 = runProjection(GAINS_HEAVY).years[0];
    expect(y0.realizedGains).toBeGreaterThan(50000);
  });
});

describe('the published split says what it means, and the total is complete', () => {
  const y0 = runProjection(GAINS_HEAVY).years[0];

  // Exactly what TaxEstateTab's "Effective Fed Rate" did before changelog
  // 176: sum the ordinary bracket bars and call it federal tax.
  const reconstructedTheOldWay = getBracketFilling(
    y0.ordinaryTaxableIncome,
    y0.householdStatus,
    y0.taxBracketInflationFactor || 1
  ).reduce((sum, b) => sum + b.tax, 0);

  it('the old reconstruction showed $0 of tax on a year that really paid five figures', () => {
    // This household lives entirely off realized capital gains, so its
    // ORDINARY taxable income is zero and the bracket bars are empty. The
    // panel therefore displayed a 0.0% effective rate for a year the plan
    // charges tens of thousands. This is the bug, written down.
    expect(y0.ordinaryTaxableIncome).toBeCloseTo(0, 6);
    expect(reconstructedTheOldWay).toBeCloseTo(0, 6);
    expect(y0.totalTaxesPaid).toBeGreaterThan(50000);
  });

  it('baseFederalTax is the pre-withdrawal figure ONLY, and is named so', () => {
    // The trap this file exists to prevent: treating baseFederalTax as "the
    // year's federal tax". Here the draw's tax is nearly ten times larger.
    expect(y0.baseFederalTax).toBeGreaterThan(0);
    expect(y0.extraTax).toBeGreaterThan(y0.baseFederalTax * 5);
  });

  it('no field on the row is a complete federal-only figure', () => {
    // extraTax blends federal and state, so baseFederalTax + extraTax is not
    // federal tax. Asserted as a fact so a future "federalTax" field cannot
    // be added from these parts without this test being confronted.
    const caYear = runProjection({ ...GAINS_HEAVY, stateTaxState: 'ca' }).years[0];
    const noStateYear = y0;
    // Moving to California leaves baseFederalTax untouched...
    expect(caYear.baseFederalTax).toBeCloseTo(noStateYear.baseFederalTax, 6);
    // ...but changes extraTax, proving state tax is inside it.
    expect(caYear.extraTax).not.toBeCloseTo(noStateYear.extraTax, 2);
  });

  it('the parts reconcile to the total the plan actually charges', () => {
    const recombined = y0.baseFederalTax + y0.baseStateTax + y0.ficaTax + (y0.extraTax || 0);
    expect(recombined).toBeCloseTo(y0.totalTaxesPaid, 6);
  });

  it('every projected year carries the split, not just the first', () => {
    const years = runProjection(GAINS_HEAVY).years;
    const missing = years.filter(y =>
      !Number.isFinite(y.baseFederalTax) || !Number.isFinite(y.baseStateTax) || !Number.isFinite(y.ficaTax)
    );
    expect(missing).toHaveLength(0);
    expect(years.length).toBeGreaterThan(20);
  });
});

describe('state tax is separated from federal in the BASE figures', () => {
  it('a state with income tax moves baseStateTax, never baseFederalTax', () => {
    // Ordinary-income household, so there is base state tax to see.
    const base = {
      ...GAINS_HEAVY, taxableInit: 300000, taxableBasisInit: 300000,
      preTaxInit: 3000000, lifestyleExpense: 120000, withdrawalStrategy: 'PreTaxFirst',
      pension1: 150000, pensionStartAge1: 60,
    };
    const noState = runProjection(base).years[0];
    const withState = runProjection({ ...base, stateTaxState: 'ca' }).years[0];
    expect(noState.baseStateTax).toBeCloseTo(0, 6);
    expect(withState.baseStateTax).toBeGreaterThan(1000);
    expect(withState.baseFederalTax).toBeCloseTo(noState.baseFederalTax, 6);
  });
});

describe('marginalBracket follows the TCJA sunset toggle; a bracket walk cannot', () => {
  // The panel derived its marginal rate by walking the drawn bracket bars,
  // which are built from current-law brackets only. Under a modeled sunset
  // the engine's own marginalBracket and that walk disagree -- which is why
  // the panel now reads the engine's.
  // Pension sized so taxable ordinary income lands near $99,000 -- inside
  // the 22% band under current law and the 28% band under the sunset table.
  // A household at $300,000 would NOT work: 35% exists in both tables, so
  // the two agree and the test would pass without proving anything.
  const ordinaryEarner = {
    ...GAINS_HEAVY,
    ss1: 0,
    taxableInit: 300000, taxableBasisInit: 300000,
    preTaxInit: 2000000, lifestyleExpense: 72000,
    withdrawalStrategy: 'PreTaxFirst',
    pension1: 120000, pensionStartAge1: 60, pension1COLA: 0,
  };

  it('a modeled sunset changes the marginal bracket the engine reports', () => {
    const current = runProjection(ordinaryEarner).years[0];
    const sunset = runProjection({ ...ordinaryEarner, tcjaSunsetEnabled: true }).years[0];
    // Incomes are NOT asserted equal -- a different bracket table changes the
    // tax, which changes the withdrawal the solver sizes. What matters is
    // that the reported bracket moves, which a walk up the drawn bars (built
    // from current-law brackets only) could never show.
    expect(current.marginalBracket).toBe(0.22);
    expect(sunset.marginalBracket).toBe(0.28);
  });

  it('marginalBracket is a fraction, as the ledger and this panel both assume', () => {
    const y0 = runProjection(ordinaryEarner).years[0];
    expect(y0.marginalBracket).toBeGreaterThan(0);
    expect(y0.marginalBracket).toBeLessThan(1);
  });
});
