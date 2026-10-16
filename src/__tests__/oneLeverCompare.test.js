// CFE-COMPARE-01 / changelog 175 -- the one-lever compare.
//
// The whole promise of that panel is that the difference between its two
// lines is the lever and nothing else. Two ways that promise can break, and
// this file exists for both:
//
//   1. THE LEVER DOES NOTHING. `sanitizeInputs()` passes unknown keys
//      through silently, and two of these four levers are ignored unless a
//      companion key is set alongside them. A lever that silently no-ops
//      renders two identical lines and invites the user to conclude the
//      change does not matter -- a confidently wrong answer, which is worse
//      than an error. Every lever below is asserted to MOVE the projection.
//
//   2. THE LEVER DOES TOO MUCH. A patch that quietly changed a second input
//      would still draw two different lines, and nothing on screen would
//      say so. Each patch is asserted to touch only the keys it claims.
//
// Mutation-tested per DEVELOPMENT.md, 2026-09-13. Each guard was watched to fail:
// dropping `rothConversionStrategy: 'fixed'` from the Roth patch fails the
// Roth "moves the projection" case; widening any patch fails its key case.
import { describe, it, expect } from 'vitest';
import { LEVERS, sanitizeForProjection, deflateProjectionForDisplay } from '../utils/oneLeverCompare';
import { finalBalanceFactor, yearEndFactor } from '../utils/displayDollars';
import { runProjection, DEFAULT_INPUTS } from '../calculator';

// A household with enough of everything for all four levers to bite: still
// working (so a claim age can move), a real Pre-Tax balance (so conversions
// and withdrawal order have something to act on), and a taxable account (so
// the order is a genuine choice rather than a single-account formality).
//
// Every key here is checked against DEFAULT_INPUTS below, because a
// misspelled key in a fixture is not an error -- it is a default, silently
// applied, and a green test that asserted nothing.
const BASELINE = {
  ...DEFAULT_INPUTS,
  planYear: 2026,
  spouse2Enabled: false,
  filingStatus: 'Single',
  birthYear1: 1966,
  retireAge1: 65,
  lifeExpectancy1: 92,
  claimingAge1: 67,
  ss1: 36000,
  salary1: 140000,
  preTaxInit: 1200000,
  taxableInit: 600000,
  rothInit: 150000,
  hsaInit: 0,
  lifestyleExpense: 80000,
  lifestyleExpenseInputMode: 'annual',
  rothConversionStrategy: 'none',
  rothConversionAmount: 25000,
  withdrawalStrategy: 'TaxableFirst',
};

describe('one-lever compare fixture', () => {
  // DEVELOPMENT.md: sanitizeInputs() passes unknown keys through silently, so a
  // typo above would quietly test the default instead of what it names.
  it('uses only real input keys, so no assertion below is vacuous', () => {
    const unknown = Object.keys(BASELINE).filter(k => !(k in DEFAULT_INPUTS));
    expect(unknown).toEqual([]);
  });

  it('covers all four levers, so adding a fifth cannot skip these guards', () => {
    expect(LEVERS.map(l => l.id).sort()).toEqual(
      ['claimingAge', 'rothConversion', 'spendLevel', 'withdrawalOrder']
    );
  });
});

describe('every lever actually moves the projection', () => {
  const baseProj = runProjection(sanitizeForProjection(BASELINE));

  // Counting the levers exercised, rather than asserting inside the loop,
  // is the DEVELOPMENT.md rule about assertions in branches applied to a loop:
  // an empty LEVERS array would otherwise pass this block having checked
  // nothing at all.
  let exercised = 0;

  LEVERS.forEach(lever => {
    it(`${lever.id}: a changed value produces a different plan`, () => {
      exercised += 1;
      const from = lever.baselineValue(BASELINE);
      const to = lever.suggest(from);
      // The suggestion must itself be a real change, or the case below
      // would pass by comparing a plan against itself.
      expect(String(to)).not.toBe(String(from));

      const forked = runProjection(sanitizeForProjection({ ...BASELINE, ...lever.patch(to) }));

      // Ending balance is the headline the panel leads with. Anything that
      // leaves it untouched to the dollar across a 26-year projection is a
      // lever that did not fire.
      expect(forked.endingBalance).not.toBeCloseTo(baseProj.endingBalance, 2);
    });
  });

  it('exercised every lever', () => {
    expect(exercised).toBe(LEVERS.length);
  });
});

describe('the Roth conversion lever switches the strategy on with the amount', () => {
  // The specific trap: `rothConversionAmount` is read only when
  // `rothConversionStrategy === 'fixed'`. This baseline sits on 'none' --
  // the DEFAULT_INPUTS value, so the common case -- which is exactly when
  // setting the amount alone changes nothing.
  const lever = LEVERS.find(l => l.id === 'rothConversion');

  it('setting the amount ALONE is a silent no-op, which is why the patch sets both', () => {
    const amountOnly = runProjection(sanitizeForProjection({ ...BASELINE, rothConversionAmount: 50000 }));
    const untouched = runProjection(sanitizeForProjection(BASELINE));
    // This is the bug being guarded against, asserted as the fact it is.
    expect(amountOnly.endingBalance).toBeCloseTo(untouched.endingBalance, 2);
  });

  it('the lever patch sets the strategy too, so conversions actually happen', () => {
    const patch = lever.patch(50000);
    expect(patch.rothConversionStrategy).toBe('fixed');
    expect(patch.rothConversionAmount).toBe(50000);

    const forked = runProjection(sanitizeForProjection({ ...BASELINE, ...patch }));
    const converted = forked.years.reduce((s, y) => s + (y.convertAmount || 0), 0);
    expect(converted).toBeGreaterThan(0);
  });

  it('says so on screen when it has switched conversions on for you', () => {
    expect(lever.describe(50000, BASELINE)).toMatch(/converts nothing today/i);
    // And stays quiet when the plan already converts, so the note means
    // something when it does appear.
    expect(lever.describe(50000, { ...BASELINE, rothConversionStrategy: 'fixed' })).toBeNull();
  });
});

describe('no lever changes more than the one thing it names', () => {
  const EXPECTED_KEYS = {
    rothConversion: ['rothConversionAmount', 'rothConversionStrategy'],
    claimingAge: ['claimingAge1'],
    spendLevel: ['lifestyleExpense'],
    withdrawalOrder: ['withdrawalStrategy'],
  };

  let checked = 0;

  LEVERS.forEach(lever => {
    it(`${lever.id}: patches only its own keys`, () => {
      checked += 1;
      const patch = lever.patch(lever.suggest(lever.baselineValue(BASELINE)));
      expect(Object.keys(patch).sort()).toEqual(EXPECTED_KEYS[lever.id]);
      // Every patched key must be one the engine actually reads. A patch
      // onto an invented key would sail through sanitizeInputs and show a
      // zero difference forever.
      Object.keys(patch).forEach(k => expect(DEFAULT_INPUTS).toHaveProperty(k));
    });
  });

  it('checked every lever', () => {
    expect(checked).toBe(LEVERS.length);
  });

  // rothConversionStrategy is the deliberate exception to "one key", and it
  // is a companion to the amount rather than a second lever: on its own it
  // would convert the plan's pre-existing rothConversionAmount. Naming that
  // here stops a future reader from "tidying" it away.
  it('the Roth pair is the only patch with two keys, and the second is a companion', () => {
    const multi = LEVERS.filter(l => Object.keys(l.patch(1)).length > 1).map(l => l.id);
    expect(multi).toEqual(['rothConversion']);
  });
});

describe('the baseline side is the plan as it stands', () => {
  const baselineEnding = runProjection(sanitizeForProjection(BASELINE)).endingBalance;

  it('sanitizeForProjection turns half-typed fields into zeros, not NaN', () => {
    const cleaned = sanitizeForProjection({ ...BASELINE, rentalIncome: '' });
    expect(cleaned.rentalIncome).toBe(0);
    expect(Number.isFinite(runProjection(cleaned).endingBalance)).toBe(true);
  });

  it('a lever set back to the plan\'s own value reproduces the plan exactly', () => {
    let checked = 0;
    LEVERS.forEach(lever => {
      const same = lever.patch(lever.baselineValue(BASELINE));
      const forked = runProjection(sanitizeForProjection({ ...BASELINE, ...same }));
      // The Roth lever is the exception by design: re-applying the plan's
      // own amount (0, since the plan converts nothing) also writes
      // strategy 'fixed', which converts nothing -- same answer, reached a
      // different way. Every other lever must be a true identity.
      if (lever.id !== 'rothConversion') {
        checked += 1;
        expect(forked.endingBalance).toBeCloseTo(baselineEnding, 2);
      }
    });
    expect(checked).toBe(LEVERS.length - 1);
  });
});

describe('the panel shows the same dollars as the rest of the app', () => {
  // THE TEST THAT WAS MISSING. Every assertion above compares the panel
  // against ITSELF -- both sides equally nominal, so every delta and
  // ordering held while the panel disagreed with the whole app by 2.5x.
  //
  // App.jsx renders `projection`, which deflates each year by its own
  // inflFactor when `useRealDollars` is on. That toggle DEFAULTS TO ON, so
  // the panel's raw runProjection output was the odd one out: the demo
  // household read $10,997,850 here and $4,410,875 in the KPI header and the
  // comparison table on the same screen. Found by opening the deployed app.
  const raw = runProjection(sanitizeForProjection(BASELINE));

  it('deflates the ending balance exactly as App.jsx does', () => {
    // App.jsx converts through the same function: the final balance by the
    // price level at the END of the last year (utils/displayDollars.js).
    const finalFactor = finalBalanceFactor(raw.years);
    const shown = deflateProjectionForDisplay(raw, true);
    expect(shown.endingBalance).toBeCloseTo(raw.endingBalance / finalFactor, 6);
    // And the fixture must actually inflate, or this proves nothing.
    expect(finalFactor).toBeGreaterThan(1.5);
  });

  it('deflates each year of the chart by ITS OWN factor, not the final one', () => {
    const shown = deflateProjectionForDisplay(raw, true);
    let checked = 0;
    shown.years.forEach((y, i) => {
      const src = raw.years[i];
      checked += 1;
      expect(y.totalPortfolioEnding).toBeCloseTo(src.totalPortfolioEnding / yearEndFactor(raw.years, i), 6);
    });
    expect(checked).toBe(raw.years.length);
    expect(checked).toBeGreaterThan(20);
  });

  it('reports lifetime totals as a present value, not a nominal sum', () => {
    const shown = deflateProjectionForDisplay(raw, true);
    const pvTaxes = raw.years.reduce((s, y) => s + (y.totalTaxesPaid || 0) / (y.inflFactor || 1), 0);
    expect(shown.totalTaxesPaid).toBeCloseTo(pvTaxes, 6);
    // Strictly below the nominal sum -- dividing the whole sum by the final
    // factor instead would understate it badly over 40 years, so this also
    // pins down WHICH deflation was used.
    expect(shown.totalTaxesPaid).toBeLessThan(raw.totalTaxesPaid);
    expect(shown.totalTaxesPaid).toBeGreaterThan(raw.totalTaxesPaid / (raw.years[raw.years.length - 1].inflFactor || 1));
  });

  it('leaves everything alone when the toggle is off', () => {
    const same = deflateProjectionForDisplay(raw, false);
    expect(same.endingBalance).toBe(raw.endingBalance);
    expect(same.totalTaxesPaid).toBe(raw.totalTaxesPaid);
    expect(same.years[5].totalPortfolioEnding).toBe(raw.years[5].totalPortfolioEnding);
  });

  it('survives an empty or malformed projection rather than dividing by nothing', () => {
    expect(deflateProjectionForDisplay(null, true)).toBe(null);
    const empty = { years: [], endingBalance: 0 };
    expect(deflateProjectionForDisplay(empty, true)).toBe(empty);
  });
});
