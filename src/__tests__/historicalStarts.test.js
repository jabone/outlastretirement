// Changelog 335: every historical start, the spending-cost measure, and the
// Monte Carlo / guardrails-grid cost fields (SPENDING_RULES_SPEC.md phases
// 1-3). Counts are checked against independent projections, never against
// the function's own output.
import { describe, it, expect } from 'vitest';
import {
  runProjection, runMonteCarlo, runHistoricalStarts, historicalStartYears,
  getGuardrailsComparisonHeatmap, DEFAULT_INPUTS, sanitizeInputs,
} from '../calculator';
import { HISTORICAL_RETURNS, HISTORY_FIRST_YEAR, HISTORY_LAST_YEAR } from '../config/historicalReturns';
import { historicalPortfolioReturn } from '../utils/bootstrap';
import { spendingCost } from '../utils/spendingCost';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
// A short horizon keeps the start count high and the suite fast.
const retiree = {
  birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 88, claimingAge1: 67,
  salary1: 150000, ss1: 36000, preTaxInit: 1300000, taxableInit: 500000, rothInit: 200000,
  lifestyleExpense: 120000, stateOfResidence: 'TX', stateTaxState: 'none',
};
const retired = (p) => p.years.filter((y) => y.isRetired);

describe('spendingCost', () => {
  it('is zero cost against itself', () => {
    const r = runProjection(plan(retiree));
    const c = spendingCost(r, r);
    expect(c.deepestCut).toBe(0);
    expect(c.cutYears).toBe(0);
    expect(c.raiseYears).toBe(0);
    expect(c.lifetimeShare).toBeCloseTo(1, 12);
    expect(c.retiredYears).toBe(retired(r).length);
    // No ledger: say nothing about essentials.
    expect(c.essentialsTouched).toBeNull();
  });

  it('matches a hand computation on a guarded slump', () => {
    const p = plan({ ...retiree, spendingGuardrails: true });
    const first = retired(runProjection(p))[0].year;
    const R = {}; const I = {};
    for (let i = 0; i < 8; i += 1) { R[first + i] = -4; I[first + i] = 6; }
    const on = runProjection(p, R, I);
    const off = runProjection({ ...p, spendingGuardrails: false }, R, I);
    const a = retired(on); const b = retired(off);
    const ratios = a.map((y, i) => y.lifestyleExpenses / b[i].lifestyleExpenses);
    const spent = a.reduce((t, y) => t + y.lifestyleExpenses / y.priceIndex, 0);
    const planned = b.reduce((t, y) => t + y.lifestyleExpenses / y.priceIndex, 0);
    const c = spendingCost(on, off);
    expect(c.deepestCut).toBeCloseTo(1 - Math.min(...ratios), 12);
    expect(c.deepestCut).toBeGreaterThan(0.1);
    expect(c.cutYears).toBe(ratios.filter((x) => x < 0.999).length);
    expect(c.lifetimeShare).toBeCloseTo(spent / planned, 12);
  });
});

describe('the history stress type (replay one real start)', () => {
  const base = plan(retiree);
  const replay = (start, over = {}) => runProjection({ ...base, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start, ...over });

  it('replays raw history at the plan’s stock share from the retirement year', () => {
    const r = replay(1966);
    const rows = retired(r);
    const byYear = new Map(HISTORICAL_RETURNS.map((x) => [x[0], x]));
    let checked = 0;
    rows.forEach((y, i) => {
      const h = byYear.get(1966 + i);
      if (!h) return;
      expect(y.growthRate).toBeCloseTo(historicalPortfolioReturn(h, base.stockAllocationPost), 12);
      if (i > 0) expect(y.priceIndex / rows[i - 1].priceIndex).toBeCloseTo(1 + h[3] / 100, 12);
      checked += 1;
    });
    expect(checked).toBe(rows.length);
    // Years before retirement are untouched.
    const before = r.years.filter((y) => !y.isRetired);
    const plain = runProjection(base).years.filter((y) => !y.isRetired);
    expect(before.map((y) => y.growthRate)).toEqual(plain.map((y) => y.growthRate));
  });

  it('goes back to the plan’s own assumptions when the record runs out', () => {
    const r = replay(HISTORY_LAST_YEAR - 2);
    const rows = retired(r);
    const plain = retired(runProjection(base));
    expect(rows[2].growthRate).toBeCloseTo(historicalPortfolioReturn(HISTORICAL_RETURNS[HISTORICAL_RETURNS.length - 1], base.stockAllocationPost), 12);
    expect(rows[3].growthRate).toBe(plain[3].growthRate);
    expect(rows[rows.length - 1].growthRate).toBe(plain[plain.length - 1].growthRate);
  });

  it('keeps a saved plan’s start year on the record', () => {
    expect(sanitizeInputs({}).stressHistoryStartYear).toBe(DEFAULT_INPUTS.stressHistoryStartYear);
    // Changelog 449: the record reaches back to 1871 (Shiller's data).
    expect(sanitizeInputs({ stressHistoryStartYear: 1800 }).stressHistoryStartYear).toBe(1871);
    expect(sanitizeInputs({ stressHistoryStartYear: 3000 }).stressHistoryStartYear).toBe(HISTORY_LAST_YEAR);
    expect(sanitizeInputs({ stressHistoryStartYear: '1973' }).stressHistoryStartYear).toBe(1973);
  });

  it('lists every start with a full horizon of history, and no more', () => {
    const years = historicalStartYears(24);
    expect(years.length).toBe(HISTORY_LAST_YEAR - HISTORY_FIRST_YEAR - 24 + 2);
    expect(years[0]).toBe(HISTORY_FIRST_YEAR);
    expect(years[years.length - 1] + 23).toBe(HISTORY_LAST_YEAR);
  });
});

describe('runHistoricalStarts', () => {
  const p = plan(retiree);
  const data = runHistoricalStarts(p);

  it('runs from the household retirement year to the end of the plan', () => {
    const base = runProjection(p);
    expect(data.retirementYear).toBe(retired(base)[0].year);
    expect(data.horizonYears).toBe(base.years[base.years.length - 1].year - data.retirementYear + 1);
    expect(data.count).toBe(data.starts.length);
    expect(data.count).toBeGreaterThan(40);
  });

  it('counts survivals that independent projections agree with', () => {
    const fixed = data.rules.find((r) => r.key === 'fixed');
    let lasted = 0;
    for (const start of historicalStartYears(data.horizonYears)) {
      const run = runProjection({ ...p, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start });
      if (run.isSuccessful) lasted += 1;
      // Each row is exactly the run the Risk tab replays for that start.
      expect(data.starts.find((s) => s.start === start).fixed.ok).toBe(run.isSuccessful);
    }
    expect(fixed.lasted).toBe(lasted);
    // The spread makes this a real test: some starts fail, some last.
    expect(lasted).toBeGreaterThan(0);
    expect(lasted).toBeLessThan(data.count);
  });

  it('names the plan’s own rule, and adds "both" only when the plan uses both', () => {
    expect(data.inPlan).toBe('fixed');
    expect(data.rules.map((r) => r.key)).toEqual(['fixed', 'crash', 'wr']);
    const both = runHistoricalStarts({ ...p, spendingGuardrails: true, withdrawalGuardrailsEnabled: true });
    expect(both.inPlan).toBe('both');
    expect(both.rules.map((r) => r.key)).toEqual(['fixed', 'crash', 'wr', 'both']);
    expect(both.rules.filter((r) => r.inPlan).map((r) => r.key)).toEqual(['both']);
  });

  it('prices each rule against fixed spending in the same start', () => {
    const wr = data.rules.find((r) => r.key === 'wr');
    const cuts = data.starts.map((s) => s.wr.deepestCut);
    expect(wr.deepestCut).toBeCloseTo(Math.max(...cuts), 12);
    expect(data.starts.find((s) => s.start === wr.deepestCutStart).wr.deepestCut).toBe(wr.deepestCut);
    // The rule's cap holds in every start.
    expect(Math.max(...cuts)).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(data.starts.every((s) => s.fixed.deepestCut === undefined)).toBe(true);
  });

  it('reports no starts, rather than inventing some, when the horizon outruns history', () => {
    // The engine clamps life expectancy to 120 and retirement to 30+ (E28,
    // 2026-09-30), so no valid plan's retirement outruns the record any
    // more; the start-year list itself still refuses to invent starts.
    const record = HISTORY_LAST_YEAR - HISTORY_FIRST_YEAR + 1;
    expect(historicalStartYears(record + 1)).toEqual([]);
    expect(historicalStartYears(record)).toEqual([HISTORY_FIRST_YEAR]);
    // The longest plan the engine accepts still gets only starts whose
    // whole retirement is on record.
    const long = runHistoricalStarts(plan({ ...retiree, birthYear1: START - 30, retireAge1: 31, lifeExpectancy1: 130, salary1: 0 }));
    expect(long.starts.every((st) => st.start + long.horizonYears - 1 <= HISTORY_LAST_YEAR)).toBe(true);
  });
});

describe('cost fields on the other surfaces', () => {
  it('the guardrails grid prices the on-cells and leaves the off-cells at plan', () => {
    const grid = getGuardrailsComparisonHeatmap(plan(retiree));
    const on1973 = grid.find((c) => c.stressType === '1973' && c.guardrailsOn);
    const off1973 = grid.find((c) => c.stressType === '1973' && !c.guardrailsOn);
    expect(off1973.lifetimeShare).toBe(1);
    expect(off1973.deepestCut).toBe(0);
    expect(on1973.deepestCut).toBeGreaterThan(0);
    expect(on1973.lifetimeShare).toBeLessThan(1);
    // 'none' has no down year, so the rule costs nothing there.
    expect(grid.find((c) => c.stressType === 'none' && c.guardrailsOn).deepestCut).toBe(0);
  });

  it('the Monte Carlo reports a cost only when a guardrail is on', () => {
    const quick = { ...retiree, lifeExpectancy1: 75 };
    expect(runMonteCarlo(plan(quick)).spendingCost).toBeNull();
    const mc = runMonteCarlo(plan({ ...quick, withdrawalGuardrailsEnabled: true }));
    expect(mc.spendingCost).not.toBeNull();
    expect(mc.spendingCost.trialsWithCutPct).toBeGreaterThan(0);
    expect(mc.spendingCost.trialsWithCutPct).toBeLessThanOrEqual(100);
    expect(mc.spendingCost.p90DeepestCut).toBeGreaterThanOrEqual(mc.spendingCost.medianDeepestCut);
    expect(mc.spendingCost.p90DeepestCut).toBeLessThanOrEqual(0.2 + 1e-9);
  });
});
