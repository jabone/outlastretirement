// Changelog 335: the spending-rules fixes (SPENDING_RULES_SPEC.md phase 0)
// and the realized price index.
//
// Every test here is an equivalence or a bound, not "something moved":
// the Q4 lesson was that asserting a change happened is not asserting it
// happened correctly.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';
import { HISTORICAL_RETURNS } from '../config/historicalReturns';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const retiree = {
  birthYear1: START - 62, retireAge1: 63, lifeExpectancy1: 92, claimingAge1: 67,
  salary1: 150000, ss1: 40000, preTaxInit: 1400000, taxableInit: 600000, rothInit: 300000,
  lifestyleExpense: 110000, stateOfResidence: 'TX', stateTaxState: 'none',
};
const numbersOnly = (proj) => JSON.stringify(proj, (k, v) => (k.startsWith('wrGuardrail') ? undefined : v));
const retired = (p) => p.years.filter((y) => y.isRetired);

// An override path: from the retirement year, `years` years of `ret`% with
// `infl`% inflation, then the plan's own assumptions.
function pathFrom(p, years, ret, infl) {
  const r = runProjection(p);
  const first = retired(r)[0].year;
  const R = {};
  const I = {};
  for (let i = 0; i < years; i += 1) { R[first + i] = ret; I[first + i] = infl; }
  return [R, I];
}

describe('withdrawal-rate guardrail measures against the plan’s own path', () => {
  // The demo's failure, reproduced: retirement year carries a cash-reserve
  // fill and a one-off event, and Social Security starts four years in.
  // The old rule anchored on that year's drawdown and raised spending 20%
  // for life. With nothing but the plan's own assumptions, the rule must
  // do NOTHING.
  const busyFirstYear = plan({
    ...retiree,
    cashFloorEnabled: true, cashFloorTargetMonths: 24, cashFloorPreFundEnabled: true,
    milestones: [{ id: 1, name: 'Wedding', type: 'outflow', amount: 60000, startAge: 63, endAge: 63, targetAccount: 'taxable' }],
    withdrawalGuardrailsEnabled: true,
  });

  it('never acts on a smooth projection, however busy the first retired year', () => {
    const on = runProjection(busyFirstYear);
    const judged = retired(on).filter((y) => y.wrGuardrailAction);
    expect(judged.length).toBeGreaterThan(10);
    expect(judged.every((y) => y.wrGuardrailAction === 'hold')).toBe(true);
    // Bit-identical numbers to the rule being off.
    const off = runProjection({ ...busyFirstYear, withdrawalGuardrailsEnabled: false });
    expect(numbersOnly(on)).toBe(numbersOnly(off));
  });

  it('measures spending, and reports the planned rate the band is drawn around', () => {
    const on = runProjection(busyFirstYear);
    const y = retired(on).find((r) => r.wrGuardrailRate !== null);
    const prev = on.years[on.years.indexOf(y) - 1];
    // Changelog 421: last year's spending over THIS year's opening balance
    // (last year's closing one), the rate the household faces going in.
    const opening = y.preTaxStart + y.rothStart + y.taxableStart + y.hsaStart;
    expect(y.wrGuardrailRate).toBeCloseTo(prev.lifestyleExpenses / opening, 12);
    // On a smooth path, actual and planned are the same number.
    expect(y.wrGuardrailRate).toBeCloseTo(y.wrGuardrailPlannedRate, 12);
  });

  it('cuts when a bad run puts the portfolio behind the plan, and not before', () => {
    const [R, I] = pathFrom(busyFirstYear, 3, -15, 3);
    const on = runProjection(busyFirstYear, R, I);
    const judged = retired(on).filter((y) => y.wrGuardrailAction);
    const firstCut = judged.findIndex((y) => y.wrGuardrailAction === 'cut');
    expect(firstCut).toBeGreaterThanOrEqual(0);
    // Nothing but holds before the first cut: the rule's first move after a
    // bad run is down, never up.
    expect(judged.slice(0, firstCut).every((y) => y.wrGuardrailAction === 'hold')).toBe(true);
    expect(firstCut).toBeLessThanOrEqual(3);
  });

  it('a crash is acted on the very next year, not the one after (changelog 421)', () => {
    // One bad year, three years into retirement, on an otherwise planned
    // path: the portfolio closes that year well below the plan's, and the
    // rule must cut in the year that opens on that balance.
    const first = retired(runProjection(busyFirstYear))[0].year;
    const crashYear = first + 3;
    const R = { [crashYear]: -30 };
    const I = { [crashYear]: busyFirstYear.inflationRate };
    const on = runProjection(busyFirstYear, R, I);
    const byYear = Object.fromEntries(on.years.map((y) => [y.year, y]));
    expect(byYear[crashYear].wrGuardrailAction).toBe('hold');
    expect(byYear[crashYear + 1].wrGuardrailAction).toBe('cut');
  });
});

describe('crash guardrail catches up after a recovery', () => {
  const p = plan({ ...retiree, spendingGuardrails: true });

  it('restores the frozen raises and lifts the cut once the portfolio is back', () => {
    // Two bad years right at retirement (freeze + cut), then strong years.
    const [R, I] = pathFrom(p, 2, -20, 3);
    const first = retired(runProjection(p))[0].year;
    for (let i = 2; i < 6; i += 1) { R[first + i] = 25; I[first + i] = 3; }
    const on = runProjection(p, R, I);
    const off = runProjection({ ...p, spendingGuardrails: false }, R, I);
    const rows = retired(on);
    // The freeze really happened before the recovery (non-vacuous).
    const froze = rows.filter((y, i) => y.lifestyleExpenses < retired(off)[i].lifestyleExpenses - 1);
    expect(froze.length).toBeGreaterThan(0);
    // And after the first year back above the retirement line, spending is
    // EXACTLY the unguarded plan's -- multipliers and dollars.
    const lastFrozen = froze[froze.length - 1].year;
    const after = rows.filter((y) => y.year > lastFrozen);
    expect(after.length).toBeGreaterThan(10);
    for (const y of after) {
      const o = off.years.find((x) => x.year === y.year);
      expect(y.lifestyleMultiplier).toBeCloseTo(o.lifestyleMultiplier, 9);
      expect(y.lifestyleExpenses).toBeCloseTo(o.lifestyleExpenses, 4);
    }
  });

  it('keeps freezing while the portfolio stays behind the plan', () => {
    // A long flat, inflationary run -- the 1970s shape. No recovery, so no
    // catch-up.
    const [R, I] = pathFrom(p, 12, -3, 7);
    const on = runProjection(p, R, I);
    const off = runProjection({ ...p, spendingGuardrails: false }, R, I);
    const gaps = retired(on).slice(0, 12).map((y, i) => 1 - y.lifestyleExpenses / retired(off)[i].lifestyleExpenses);
    // The gap widens year after year: frozen, not restored.
    expect(gaps[11]).toBeGreaterThan(gaps[2]);
    expect(gaps[11]).toBeGreaterThan(0.3);
  });
});

describe('floor-aware: neither rule cuts into essentials', () => {
  const ledgerAt = (essentialPct) => {
    const essential = 48000 * essentialPct / 100;
    return {
      lines: [
        { id: 'e', categoryId: 'housing', amount: essential },
        { id: 'd', categoryId: 'personal', amount: 48000 - essential },
      ],
      essentialCategoryIds: ['housing'],
    };
  };
  const withLedger = (essentialPct, over) => plan({
    ...retiree, lifestyleExpenseInputMode: 'categories', spendingBlueprint: ledgerAt(essentialPct),
    floorAwareGuardrailsEnabled: true, ...over,
  });

  // Returns the smallest share of the unguarded spending that the guarded
  // run kept, over retired years.
  function keptShare(p, R, I) {
    const on = retired(runProjection(p, R, I));
    const off = retired(runProjection({ ...p, spendingGuardrails: false, withdrawalGuardrailsEnabled: false }, R, I));
    return Math.min(...on.map((y, i) => y.lifestyleExpenses / off[i].lifestyleExpenses));
  }

  it('holds the crash freeze at the essential floor in a long inflationary slump', () => {
    const p = withLedger(75, { spendingGuardrails: true, discretionaryCutPct: 100 });
    const [R, I] = pathFrom(p, 12, -3, 7);
    const kept = keptShare(p, R, I);
    // Bound AND bite: the floor is reached, and never crossed.
    expect(kept).toBeGreaterThanOrEqual(0.75 - 1e-9);
    expect(kept).toBeLessThan(0.75 + 1e-6);
    // The same slump without the floor goes well below it.
    const bare = keptShare({ ...p, floorAwareGuardrailsEnabled: false }, R, I);
    expect(bare).toBeLessThan(0.7);
  });

  it('holds the withdrawal-rate cut at the essential floor', () => {
    const p = withLedger(90, { withdrawalGuardrailsEnabled: true });
    const [R, I] = pathFrom(p, 4, -20, 3);
    const kept = keptShare(p, R, I);
    expect(kept).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(kept).toBeLessThan(0.9 + 1e-6);
    // Without the floor the 20% maximum cut goes through.
    expect(keptShare({ ...p, floorAwareGuardrailsEnabled: false }, R, I)).toBeCloseTo(0.8, 6);
  });
});

describe('realized price index', () => {
  it('is exactly inflFactor when inflation never departs from the plan', () => {
    const r = runProjection(plan(retiree));
    expect(r.years.length).toBeGreaterThan(20);
    for (const y of r.years) expect(y.priceIndex).toBe(y.inflFactor);
  });

  it('compounds the inflation each year actually had', () => {
    const p = plan({ ...retiree, stressType: '1973', stressStartMode: 'retirement' });
    const r = runProjection(p);
    const first = retired(r)[0].year;
    // The 1973 scenario's four inflation years, from the history table the
    // named scenarios replay (A30, 2026-09-30).
    const cpi = (y) => HISTORICAL_RETURNS.find((row) => row[0] === y)[3];
    const stress = { [first]: cpi(1973), [first + 1]: cpi(1974), [first + 2]: cpi(1975), [first + 3]: cpi(1976) };
    let idx = 1;
    r.years.forEach((y, i) => {
      if (i > 0) idx *= 1 + (stress[y.year] ?? p.inflationRate) / 100;
      expect(y.priceIndex).toBeCloseTo(idx, 9);
    });
    // After a 1970s shock, prices are well above the plan's path.
    const last = r.years[r.years.length - 1];
    expect(last.priceIndex / last.inflFactor).toBeGreaterThan(1.2);
  });
});
