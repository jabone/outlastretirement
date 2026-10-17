// Changelog 217: readiness question 3 -- the paycheck replacement. The card
// adds no new modeling; it restates the year the engine published as the
// shape a household recognizes. These tests pin the restatement, and above
// all the one distinction the card exists to make: what LEAVES the
// portfolio is not what you get to spend.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import { paycheckPlan, firstYearsFunding, firstYearsPlan, FIRST_YEARS } from '../utils/retirementReadiness';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const retiree = {
  birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
  salary1: 120000, ss1: 42000, preTaxInit: 1300000, taxableInit: 700000, rothInit: 250000,
  lifestyleExpense: 95000, stateOfResidence: 'TX', stateTaxState: 'none',
  // Rent is one of the streams that arrives on its own, so the plan has
  // some -- otherwise a card that forgot rent entirely would still pass.
  rentalIncome: 18000, pension1: 12000, pensionStartAge1: 65,
};
const withReserve = plan({ ...retiree, cashFloorEnabled: true, cashFloorInit: 150000 });
const withoutReserve = plan(retiree);

describe('the paycheck (Q3)', () => {
  it('describes the first five retired years and nothing before them', () => {
    const r = paycheckPlan(runProjection(withReserve));
    expect(r.rows).toHaveLength(FIRST_YEARS);
    expect(r.rows.map((x) => x.year)).toEqual([1, 2, 3, 4, 5].map((i) => START + i));
    expect(r.startYear).toBe(START + 1);
  });

  it('separates what leaves the portfolio from what there is to live on', () => {
    const r = paycheckPlan(runProjection(withReserve));
    // A year that tops the reserve back up moves more than it hands over.
    const topUp = r.rows.find((x) => x.replenish > 0);
    expect(topUp).toBeTruthy();
    expect(topUp.total).toBeCloseTo(topUp.moved - topUp.replenish, 6);
    expect(topUp.total).toBeLessThan(topUp.moved);
    expect(topUp.monthly).toBeCloseTo(topUp.total / 12, 6);
  });

  it('adds up to the year the engine published, source by source', () => {
    const proj = runProjection(withReserve);
    const r = paycheckPlan(proj);
    let checked = 0;
    for (const row of r.rows) {
      const src = proj.years.find((y) => y.year === row.year);
      expect(row.automatic).toBeCloseTo(src.ssIncome + src.pension + src.rentalAnnuity, 6);
      expect(row.moved - row.automatic - row.working).toBeCloseTo(
        src.drawTaxable + src.drawPreTax + src.drawRoth + src.cashReserveDraw, 6
      );
      expect(row.taxes).toBeCloseTo(src.totalTaxesPaid, 6);
      expect(row.taxesPerQuarter).toBeCloseTo(src.totalTaxesPaid / 4, 6);
      checked += 1;
    }
    expect(checked).toBe(FIRST_YEARS);
  });

  it('reports months of cover that really are months of that year\u2019s spending', () => {
    const proj = runProjection(withReserve);
    const r = paycheckPlan(proj);
    expect(r.reserveEnabled).toBe(true);
    let checked = 0;
    for (const row of r.rows) {
      const src = proj.years.find((y) => y.year === row.year);
      expect(row.reserveBalance).toBeCloseTo(src.cashReserveBalance, 6);
      expect(row.reserveTarget).toBeGreaterThan(0);
      // Derived from the target the engine set, not from the same field
      // the card reads -- so zeroing or doubling the engine's own monthly
      // basis fails here rather than passing on both sides at once.
      const monthlySpend = row.reserveTarget / DEFAULT_INPUTS.cashFloorTargetMonths;
      expect(row.reserveMonths).toBeCloseTo(row.reserveBalance / monthlySpend, 6);
      // The plan tops the reserve back up to target every up year, so
      // cover sits at the configured months plus the year's interest --
      // near 24, never half of it or double it.
      expect(row.reserveMonths).toBeGreaterThanOrEqual(DEFAULT_INPUTS.cashFloorTargetMonths);
      expect(row.reserveMonths).toBeLessThan(DEFAULT_INPUTS.cashFloorTargetMonths + 1);
      checked += 1;
    }
    expect(checked).toBe(FIRST_YEARS);
    // A plan whose reserve is off reports no cover at all, rather than a
    // number that looks like one.
    const none = paycheckPlan(runProjection(withoutReserve));
    expect(none.reserveEnabled).toBe(false);
    expect(none.rows.every((x) => x.reserveMonths === 0 && x.reserveTarget === 0)).toBe(true);
  });

  it('explains a year in its own words, and only when there is something to explain', () => {
    const r = paycheckPlan(runProjection(withReserve));
    const ids = new Set(r.rows.flatMap((x) => x.notes.map((n) => n.id)));
    expect(ids.has('reserveTopUp')).toBe(true);
    expect(r.rows.every((x) => x.notes.every((n) => n.text.length > 0))).toBe(true);
    const none = paycheckPlan(runProjection(withoutReserve));
    expect(none.rows.some((x) => x.notes.some((n) => n.id === 'reserveTopUp'))).toBe(false);
  });

  it('names the down year the reserve covered', () => {
    const crashed = plan({
      ...retiree, cashFloorEnabled: true, cashFloorInit: 150000,
      stressType: 'crashYear', stressStartMode: 'retirement', stressCrashReturn: -25,
    });
    const r = paycheckPlan(runProjection(crashed));
    const drew = r.rows.find((x) => x.fromReserve > 0);
    expect(drew).toBeTruthy();
    expect(drew.notes.some((n) => n.id === 'reserveDraw')).toBe(true);
    // And the reserve draw is part of what was moved that year: a card
    // that counted only the market accounts would understate the year.
    const src = runProjection(crashed).years.find((y) => y.year === drew.year);
    expect(drew.moved - drew.automatic - drew.working).toBeCloseTo(
      src.drawTaxable + src.drawPreTax + src.drawRoth + src.cashReserveDraw, 6
    );
    expect(src.cashReserveDraw).toBeGreaterThan(0);
  });

  it('says nothing at all when the plan has no retired year', () => {
    expect(paycheckPlan(runProjection(plan({ ...retiree, retireAge1: 95, lifeExpectancy1: 90 })))).toBeNull();
  });
});

// Changelog 239: questions 5 and 3 as one card. The merged plan must say
// exactly what the two functions it is built on say, and say each thing once.
describe('the first five years, where from and how it arrives (Q5 + Q3)', () => {
  const crashed = plan({
    ...retiree, cashFloorEnabled: true, cashFloorInit: 150000,
    stressType: 'crashYear', stressStartMode: 'retirement', stressCrashReturn: -25,
  });

  it('carries the paycheck figures and the funding sources for the same years', () => {
    const proj = runProjection(withReserve);
    const m = firstYearsPlan(proj);
    const p = paycheckPlan(proj);
    const f = firstYearsFunding(proj);
    expect(m.rows).toHaveLength(FIRST_YEARS);
    let checked = 0;
    m.rows.forEach((row, i) => {
      const src = proj.years.find((y) => y.year === row.year);
      expect(row.year).toBe(p.rows[i].year);
      expect(row.year).toBe(f.rows[i].year);
      expect(row.monthly).toBeCloseTo(p.rows[i].monthly, 6);
      // What is sold, straight from the engine's own draw fields.
      expect(row.transfer).toBeCloseTo(src.drawTaxable + src.drawPreTax + src.drawRoth + src.cashReserveDraw, 6);
      expect(row.sources).toEqual(f.rows[i].sources);
      expect(row.taxesPerQuarter).toBeCloseTo(src.totalTaxesPaid / 4, 6);
      checked++;
    });
    expect(checked).toBe(FIRST_YEARS);
  });

  it('names the account most of the transfer comes from', () => {
    const proj = runProjection(withReserve);
    const row = firstYearsPlan(proj).rows[0];
    const src = proj.years.find((y) => y.year === row.year);
    const draws = { 'Taxable brokerage': src.drawTaxable, 'Pre-Tax (IRA / 401k), RMDs included': src.drawPreTax, Roth: src.drawRoth, 'Cash reserve': src.cashReserveDraw };
    const top = Object.entries(draws).sort((a, b) => b[1] - a[1])[0];
    expect(top[1]).toBeGreaterThan(0);
    expect(row.biggestDraw.label).toBe(top[0]);
    expect(firstYearsPlan(proj).headline.biggestDrawLabel).toBe(top[0]);
  });

  it('says the reserve draw once, in the paycheck wording that leads with the amount', () => {
    const m = firstYearsPlan(runProjection(crashed));
    const drew = m.rows.filter((r) => r.notes.some((n) => n.id === 'reserveDraw'));
    expect(drew.length).toBeGreaterThan(0);
    for (const r of m.rows) {
      expect(r.notes.some((n) => n.id === 'reserve')).toBe(false);
      for (const n of r.notes.filter((x) => x.id === 'reserveDraw')) expect(n.amountFirst).toBe(true);
    }
  });

  it('says an RMD once, in the funding wording that says when they start', () => {
    const late = plan({ ...retiree, birthYear1: START - 72, retireAge1: 73, claimingAge1: 70, pensionStartAge1: 73 });
    const m = firstYearsPlan(runProjection(late));
    const rmdYears = m.rows.filter((r) => r.notes.some((n) => n.id === 'rmd'));
    expect(rmdYears.length).toBeGreaterThan(0);
    for (const r of rmdYears) {
      const rmds = r.notes.filter((n) => n.id === 'rmd');
      expect(rmds).toHaveLength(1);
      expect(rmds[0].text).toMatch(/^Required minimum distributions/);
      expect(rmds[0].amountFirst).toBe(false);
    }
  });

  it('keeps the reserve top-up note, which only the paycheck side had', () => {
    const m = firstYearsPlan(runProjection(withReserve));
    expect(m.rows.some((r) => r.notes.some((n) => n.id === 'reserveTopUp'))).toBe(true);
  });

  it('says nothing at all when the plan has no retired year', () => {
    expect(firstYearsPlan(runProjection(plan({ ...retiree, retireAge1: 95, lifeExpectancy1: 90 })))).toBeNull();
  });
});

