// Changelog 214: the first two Retirement Readiness cards. Both are pure
// functions over the engine's own output, so these tests run the real
// projection and assert on what the cards would say.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import {
  firstYearsFunding, workLongerCompare, workLongerPatch, FUNDING_SOURCES, FIRST_YEARS,
  planSummary, walkAwayNow, walkAwayPatch, crashPatch,
} from '../utils/retirementReadiness';
import { deflateProjectionForDisplay } from '../utils/oneLeverCompare';
import { planVerdict, firstShortfallRow } from '../utils/planVerdict';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
// Retires next year, claims at 70, so the early years are portfolio-only
// and Social Security arrives inside the window.
const retiree = {
  birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
  salary1: 120000, ss1: 42000, preTaxInit: 1300000, taxableInit: 700000, rothInit: 250000,
  lifestyleExpense: 95000, stateOfResidence: 'TX', stateTaxState: 'none',
};

describe('the first five years (Q5)', () => {
  const result = firstYearsFunding(runProjection(plan(retiree)));

  it('describes five retired years, oldest first, and nothing before retirement', () => {
    expect(FIRST_YEARS).toBe(5);
    expect(result.years).toBe(5);
    expect(result.rows.map((r) => r.year)).toEqual([START + 1, START + 2, START + 3, START + 4, START + 5]);
    expect(result.startYear).toBe(START + 1);
    expect(result.endYear).toBe(START + 5);
  });

  it('adds up every source the engine reports, and each share is its part of the year', () => {
    for (const row of result.rows) {
      const sum = row.sources.reduce((t, s) => t + s.amount, 0);
      expect(sum).toBeCloseTo(row.total, 4);
      expect(row.sources.reduce((t, s) => t + s.share, 0)).toBeCloseTo(1, 6);
      expect(row.guaranteed + row.fromPortfolio).toBeCloseTo(row.total, 4);
      // Only sources with money in them are listed.
      expect(row.sources.every((s) => s.amount > 0)).toBe(true);
    }
    expect(result.rows[0].total).toBeGreaterThan(0);
  });

  it('every source reads a real projection field', () => {
    const row = runProjection(plan(retiree)).years.find((y) => y.isRetired);
    for (const s of FUNDING_SOURCES) expect(s.key in row, `${s.key} is a row field`).toBe(true);
  });

  it('says Social Security has not started, then that it has', () => {
    const early = result.rows[0].sources.map((s) => s.key);
    expect(early).not.toContain('ssIncome');
    const atClaim = result.rows.find((r) => r.age >= 70);
    expect(atClaim).toBeUndefined(); // claims at 70, outside the five-year window
    const longer = firstYearsFunding(runProjection(plan(retiree)), { years: 8 });
    const withSS = longer.rows.filter((r) => r.sources.some((s) => s.key === 'ssIncome'));
    expect(withSS.length).toBeGreaterThan(0);
    expect(withSS[0].year).toBe(START + 6); // the year spouse 1 turns 70
  });

  it('explains a Roth conversion year, and an RMD year, in the words of that year', () => {
    const converting = firstYearsFunding(runProjection(plan({ ...retiree, rothConversionStrategy: 'fixed', rothConversionAmount: 60000 })));
    const ids = converting.rows[0].notes.map((n) => n.id);
    expect(ids).toContain('conversion');
    expect(converting.rows[0].notes.find((n) => n.id === 'conversion').amount).toBeGreaterThan(0);
    // The year RMDs begin says they begin; the year after does not.
    const long = firstYearsFunding(runProjection(plan(retiree)), { years: 14 });
    const rmdYears = long.rows.filter((r) => r.notes.some((n) => n.id === 'rmd'));
    expect(rmdYears.length).toBeGreaterThan(1);
    expect(rmdYears[0].notes.find((n) => n.id === 'rmd').text).toMatch(/start this year/);
    expect(rmdYears[1].notes.find((n) => n.id === 'rmd').text).toMatch(/part of the Pre-Tax draw/);
    // An older household is already taking RMDs, and the first year says so.
    const old = firstYearsFunding(runProjection(plan({ ...retiree, birthYear1: START - 75, retireAge1: 60, claimingAge1: 70 })));
    const rmd = old.rows.find((r) => r.notes.some((n) => n.id === 'rmd'));
    expect(rmd).toBeTruthy();
    expect(rmd.notes.find((n) => n.id === 'rmd').text).toMatch(/Required minimum distributions/);
  });

  it('gives the free headline from the first year alone', () => {
    expect(result.headline.year).toBe(START + 1);
    expect(result.headline.biggestLabel).toBeTruthy();
    expect(result.headline.biggestShare).toBeGreaterThan(0);
    expect(result.headline.biggestShare).toBeLessThanOrEqual(1);
    expect(result.headline.total).toBeCloseTo(result.rows[0].total, 6);
  });

  it('is null when the plan never retires inside its horizon', () => {
    expect(firstYearsFunding(runProjection(plan({ ...retiree, retireAge1: 95, lifeExpectancy1: 90 })))).toBe(null);
    expect(firstYearsFunding(null)).toBe(null);
  });
});

describe('working longer (Q6)', () => {
  it('moves both spouses’ retirement dates, and only those', () => {
    const solo = plan({ ...retiree });
    expect(workLongerPatch(solo, 3)).toEqual({ retireAge1: 68 });
    const couple = plan({ ...retiree, spouse2Enabled: true, birthYear2: START - 62, retireAge2: 63 });
    expect(workLongerPatch(couple, 2)).toEqual({ retireAge1: 67, retireAge2: 65 });
  });

  it('retires later, ends with more, and says how many retired years it cost', () => {
    const r = workLongerCompare(plan(retiree), { extraYears: 3, useRealDollars: true });
    expect(r.later.retirementYear).toBe(r.base.retirementYear + 3);
    expect(r.later.endingBalance).toBeGreaterThan(r.base.endingBalance);
    expect(r.yearsGivenUp).toBe(3);
    expect(r.base.retiredYears - r.later.retiredYears).toBe(3);
    expect(r.later.firstYearDraw).toBeGreaterThanOrEqual(0);
    expect(r.benefitUnchanged).toBe(true);
  });

  it('reports today’s dollars when the app is in today’s dollars, and nominal when it is not', () => {
    const real = workLongerCompare(plan(retiree), { extraYears: 3, useRealDollars: true });
    const nominal = workLongerCompare(plan(retiree), { extraYears: 3, useRealDollars: false });
    expect(nominal.base.endingBalance).toBeGreaterThan(real.base.endingBalance);
    expect(nominal.later.lifetimeTaxes).toBeGreaterThan(real.later.lifetimeTaxes);
  });

  it('a longer wait buys more than a shorter one', () => {
    const one = workLongerCompare(plan(retiree), { extraYears: 1 });
    const five = workLongerCompare(plan(retiree), { extraYears: 5 });
    expect(five.later.endingBalance).toBeGreaterThan(one.later.endingBalance);
    expect(five.yearsGivenUp).toBeGreaterThan(one.yearsGivenUp);
    expect(one.base.endingBalance).toBeCloseTo(five.base.endingBalance, 6);
  });

  it('rescues a plan that runs out, which is the whole point of asking', () => {
    const thin = plan({ ...retiree, preTaxInit: 260000, taxableInit: 60000, rothInit: 0, lifestyleExpense: 95000 });
    const r = workLongerCompare(thin, { extraYears: 5 });
    expect(r.base.isSuccessful).toBe(false);
    // Both sides end at zero when the money runs out either way, so the
    // honest signal is the retired years bought, not the ending balance.
    expect(r.base.endingBalance).toBe(0);
    expect(r.later.retirementYear).toBe(r.base.retirementYear + 5);
    const rich = workLongerCompare(plan(retiree), { extraYears: 5 });
    expect(rich.later.endingBalance).toBeGreaterThan(rich.base.endingBalance);
  });
});

// Changelog 238: the "leave now" column of the working-longer card.
describe('one column of the working-longer table', () => {
  const thin = plan({ ...retiree, preTaxInit: 260000, taxableInit: 60000, rothInit: 0, lifestyleExpense: 95000 });

  it('names the year a plan runs out, and taxes it only through that year', () => {
    const proj = deflateProjectionForDisplay(runProjection(thin), true);
    const s = planSummary(proj, { useRealDollars: true });
    expect(s.isSuccessful).toBe(false);
    expect(s.depletionYear).not.toBeNull();
    const broke = proj.years.find((y) => y.year === s.depletionYear);
    expect(broke.isRetired).toBe(true);
    expect(broke.totalPortfolioEnding).toBeLessThanOrEqual(0);
    expect(s.depletionAge).toBe(broke.age1);
    // Each year's tax in today's dollars, through the run-out year only.
    // The converted rows already carry today's dollars.
    const through = proj.years.filter((y) => y.year <= s.depletionYear)
      .reduce((t, y) => t + Math.max(0, y.totalTaxesPaid || 0), 0);
    const rawThrough = runProjection(thin).years.filter((y) => y.year <= s.depletionYear)
      .reduce((t, y) => t + Math.max(0, y.totalTaxesPaid || 0) / (y.priceIndex || y.inflFactor), 0);
    expect(through).toBeCloseTo(rawThrough, 6);
    expect(s.lifetimeTaxes).toBeCloseTo(through, 6);
    expect(s.lifetimeTaxes).toBeLessThanOrEqual(proj.totalTaxesPaid + 1e-6);
  });

  it('leaves a plan that lasts exactly as before: full-horizon tax, no run-out year', () => {
    const proj = deflateProjectionForDisplay(runProjection(plan(retiree)), true);
    const s = planSummary(proj, { useRealDollars: true });
    expect(s.isSuccessful).toBe(true);
    expect(s.depletionYear).toBeNull();
    expect(s.lifetimeTaxes).toBe(proj.totalTaxesPaid);
    expect(workLongerCompare(plan(retiree)).base).toEqual(s);
  });

  it('comes free with the walk-away run: the leave-now column is that projection', () => {
    const p = plan({ ...retiree, birthYear1: START - 58 });
    const w = walkAwayNow(p);
    const direct = planSummary(deflateProjectionForDisplay(runProjection({ ...p, ...walkAwayPatch(p) }), true), { useRealDollars: true });
    expect(w.summary).toEqual(direct);
    expect(w.summary.retirementYear).toBe(w.retirementYear);
    expect(w.summary.depletionYear).toBe(w.depletionYear);
  });

  it('states the first year drawn in today’s dollars when the app is, like the balances beside it', () => {
    const proj = runProjection(plan(retiree));
    const first = proj.years.find((y) => y.isRetired);
    const nominal = first.drawPreTax + first.drawRoth + first.drawTaxable;
    expect(first.inflFactor).toBeGreaterThan(1);
    const real = workLongerCompare(plan(retiree), { extraYears: 3, useRealDollars: true }).base.firstYearDraw;
    const nom = workLongerCompare(plan(retiree), { extraYears: 3, useRealDollars: false }).base.firstYearDraw;
    expect(nom).toBeCloseTo(nominal, 6);
    expect(real).toBeCloseTo(nominal / first.inflFactor, 6);
  });
});

// E24: the crash card's "spending unchanged" column must actually leave
// spending unchanged: no bad-year freeze and no stress-year inflation on the
// housing or medical slices.
describe('the crash card holds spending exactly as planned', () => {
  const MULTS = ['lifestyleMultiplier', 'housingMultiplier', 'medicalMultiplier'];
  for (const sg of [true, false]) {
    it(`every retired year's spending matches the no-crash plan (spendingGuardrails ${sg})`, () => {
      const p = plan({ ...retiree, spendingGuardrails: sg, housingInflationRate: 4, inflationRate: 2.5, medicalInflationRate: 5 });
      const baseline = runProjection({ ...p, stressType: 'none', withdrawalGuardrailsEnabled: false, spendingGuardrails: false });
      const held = runProjection(crashPatch(p, -20, false));
      let compared = 0;
      for (let i = 0; i < baseline.years.length; i++) {
        const b = baseline.years[i];
        const h = held.years[i];
        if (!b.isRetired) continue;
        for (const k of MULTS) {
          expect(h[k], `${b.year} ${k}`).toBeCloseTo(b[k], 9);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(30);
    });
  }
  it('the adapted run keeps the plan\'s own bad-year freeze', () => {
    expect(crashPatch(plan({ ...retiree, spendingGuardrails: true }), -20, true).spendingGuardrails).toBe(true);
    expect(crashPatch(plan({ ...retiree, spendingGuardrails: true }), -20, false).spendingGuardrails).toBe(false);
  });
});

// A28(b): the Readiness cards named the year the portfolio hit $0, or no
// year at all when it never quite did, while the verdict names the first
// shortfall year.
describe('the run-out year is the verdict\'s first shortfall year', () => {
  it('a plan short of spending with money left still gets a year', () => {
    const proj = { isSuccessful: false, endingBalance: 50, years: [
      { year: 2030, age1: 70, isRetired: true, shortfall: 0, totalPortfolioEnding: 900, totalTaxesPaid: 10, inflFactor: 1 },
      { year: 2031, age1: 71, isRetired: true, shortfall: 500, totalPortfolioEnding: 50, totalTaxesPaid: 10, inflFactor: 1 },
      { year: 2032, age1: 72, isRetired: true, shortfall: 800, totalPortfolioEnding: 50, totalTaxesPaid: 10, inflFactor: 1 },
    ] };
    const s = planSummary(proj, { useRealDollars: false });
    expect(s.depletionYear).toBe(2031);
    expect(s.depletionAge).toBe(71);
    expect(planVerdict({ isSuccessful: false, years: proj.years }).detail).toContain('starting in 2031');
  });
  it('walkAwayNow and planSummary agree with the verdict on a real failing plan', () => {
    const thin = plan({ ...retiree, birthYear1: START - 58, preTaxInit: 260000, taxableInit: 60000, rothInit: 0 });
    const w = walkAwayNow(thin);
    expect(w.isSuccessful).toBe(false);
    const proj = deflateProjectionForDisplay(runProjection({ ...thin, ...walkAwayPatch(thin) }), true);
    expect(w.depletionYear).toBe(firstShortfallRow(proj.years).year);
    expect(w.summary.depletionYear).toBe(w.depletionYear);
  });
});
