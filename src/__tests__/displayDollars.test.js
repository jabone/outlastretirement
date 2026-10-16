// utils/displayDollars.js: the one conversion between future dollars (what
// runProjection returns) and today's dollars (the default display).
//
// The census test is the guard against drift. App.jsx used to keep its own
// hand-written list of money fields, which covered about 106 of the row's
// numeric fields; federalTax, stateTax, FICA, the MAGI figures and more were
// left in future dollars beside a converted total. Here every numeric field
// a projection row can carry must be classified, or the test fails and names
// the field.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import {
  ROW_FIELD_CLASS, deflateProjectionForDisplay, monteCarloForDisplay,
  yearFactor, yearEndFactor, finalBalanceFactor, END_OF_YEAR_BALANCES,
} from '../utils/displayDollars';
import { monteCarloRange } from '../utils/monteCarloRange';

const real = (over, base = DEFAULT_INPUTS) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...base, ...over };
};

const START = DEFAULT_INPUTS.planYear;
const demo = buildDemoInputs();

// Plans that switch on the branches that emit extra row fields.
const PLANS = {
  demo,
  defaults: DEFAULT_INPUTS,
  guardrails: real({ withdrawalGuardrailsEnabled: true, spendingGuardrails: true }, demo),
  abroad: real({
    birthYear1: START - 64, retireAge1: 64, lifeExpectancy1: 90, claimingAge1: 67,
    salary1: 0, ss1: 36000, preTaxInit: 1500000, taxableInit: 500000, rothInit: 300000,
    lifestyleExpense: 90000, stateOfResidence: 'CA', stateTaxState: 'ca',
    residencyTimeline: [{
      id: 'pt', fromYear: START + 3, kind: 'foreign', countryName: 'Portugal', stateDomicileSevered: true,
      foreign: { ordinaryRate: 30, investmentRate: 28, roth: 'respect', treatyResourcing: true },
    }],
  }),
};

describe('every numeric projection-row field is classified', () => {
  for (const [name, inputs] of Object.entries(PLANS)) {
    it(`${name} plan`, () => {
      const years = runProjection(inputs).years;
      const unclassified = new Set();
      let numeric = 0;
      for (const y of years) {
        for (const [k, v] of Object.entries(y)) {
          if (typeof v !== 'number') continue;
          numeric += 1;
          if (!ROW_FIELD_CLASS[k]) unclassified.add(k);
        }
      }
      expect(numeric).toBeGreaterThan(1000);
      expect([...unclassified]).toEqual([]);
    });
  }
});

describe('today’s dollars conversion', () => {
  const raw = runProjection(demo);
  const shown = deflateProjectionForDisplay(raw, true);
  const i2055 = raw.years.findIndex((y) => y.year === 2055);

  it('converts the tax detail with the total, so the parts still add up', () => {
    expect(i2055).toBeGreaterThan(0);
    const r = raw.years[i2055];
    const s = shown.years[i2055];
    const f = yearFactor(r);
    expect(f).toBeGreaterThan(1.5);
    for (const k of ['federalTax', 'stateTax', 'ficaTax', 'baseFederalTax', 'irmaaMagi', 'realizedGains', 'totalTaxesPaid']) {
      expect(s[k]).toBeCloseTo(r[k] / f, 6);
    }
    // Rates, ages and factors are left alone.
    expect(s.marginalBracket).toBe(r.marginalBracket);
    expect(s.age1).toBe(r.age1);
    expect(s.priceIndex).toBe(r.priceIndex);
  });

  it('converts end-of-year balances by the end-of-year price level', () => {
    expect(END_OF_YEAR_BALANCES).toBe(true);
    let checked = 0;
    raw.years.forEach((r, i) => {
      const endF = i + 1 < raw.years.length ? yearFactor(raw.years[i + 1]) : yearEndFactor(raw.years, i);
      expect(shown.years[i].totalPortfolioEnding).toBeCloseTo(r.totalPortfolioEnding / endF, 6);
      expect(shown.years[i].preTaxEnd).toBeCloseTo(r.preTaxEnd / endF, 6);
      // Start-of-year balances stay at the year's own level.
      expect(shown.years[i].preTaxStart).toBeCloseTo(r.preTaxStart / yearFactor(r), 6);
      checked += 1;
    });
    expect(checked).toBe(raw.years.length);
    // The last year carries one more year of the plan's inflation.
    const n = raw.years.length;
    const rate = yearFactor(raw.years[n - 1]) / yearFactor(raw.years[n - 2]);
    expect(finalBalanceFactor(raw.years)).toBeCloseTo(yearFactor(raw.years[n - 1]) * rate, 9);
    expect(shown.endingBalance).toBeCloseTo(raw.endingBalance / finalBalanceFactor(raw.years), 6);
  });

  it('re-derives the lifetime totals as a present value from the converted rows', () => {
    const pv = (key) => raw.years.reduce((t, y) => t + (y[key] || 0) / yearFactor(y), 0);
    expect(shown.totalTaxesPaid).toBeCloseTo(pv('totalTaxesPaid'), 6);
    expect(shown.totalIRMAAPaid).toBeCloseTo(pv('irmaaCost'), 6);
    expect(shown.totalRMDsForced).toBeCloseTo(pv('rmdAmount'), 6);
    expect(shown.totalTaxesPaid).toBeLessThan(raw.totalTaxesPaid);
  });

  it('never converts twice and leaves future dollars alone', () => {
    expect(shown.displayBasis).toBe('today');
    expect(deflateProjectionForDisplay(shown, true)).toBe(shown);
    expect(deflateProjectionForDisplay(raw, false)).toBe(raw);
  });
});

describe('Monte Carlo figures share the Ending Balance’s basis', () => {
  const raw = runProjection(demo);
  const shown = deflateProjectionForDisplay(raw, true);
  // A synthetic result whose median is exactly the plan's own path.
  const mc = {
    successProbability: 90,
    endingP10: raw.endingBalance * 0.5,
    endingP50: raw.endingBalance,
    endingP90: raw.endingBalance * 2,
    growthCurves: raw.years.map((y) => ({ year: y.year, p10: 0, p50: y.totalPortfolioEnding, p90: 0 })),
  };

  it('the median of a run equal to the plan reads as the plan’s Ending Balance', () => {
    const out = monteCarloForDisplay(mc, raw, true);
    expect(out.endingP50).toBeCloseTo(shown.endingBalance, 6);
    const last = out.growthCurves[out.growthCurves.length - 1];
    expect(Math.abs(last.p50 - shown.endingBalance)).toBeLessThan(1);
    // The Dashboard band uses the same factor.
    const band = monteCarloRange(mc, 'k', 'k', raw, true);
    expect(band.p50).toBeCloseTo(out.endingP50, 6);
  });

  it('future dollars passes the figures through', () => {
    const out = monteCarloForDisplay(mc, raw, false);
    expect(out.endingP50).toBe(mc.endingP50);
    expect(out.displayBasis).toBe('future');
  });
});
