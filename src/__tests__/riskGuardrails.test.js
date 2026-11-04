// Risk-based guardrails: spending moves when the plan's chance of lasting,
// measured against real historical sequences, leaves its band.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, runHistoricalStarts, _riskGuardrailModel, _riskSuccess } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';

const START = DEFAULT_INPUTS.planYear;
const retiree = {
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, rebalancingEnabled: true, spouse2Enabled: false,
  birthYear1: START - 65, retireAge1: 65, lifeExpectancy1: 95, claimingAge1: 67,
  salary1: 0, ss1: 30000, preTaxInit: 600000, rothInit: 200000, taxableInit: 200000, hsaInit: 0,
  lifestyleExpense: 55000, stateTaxState: 'none', stockAllocationPost: 60, glideAllocationEnabled: false,
};
const on = (over = {}) => ({ ...retiree, riskGuardrailsEnabled: true, ...over });

describe('risk-based guardrails', () => {
  it('are off by default with 80 / cut below 50 to 70 / raise at 99, all the way', () => {
    expect(DEFAULT_INPUTS.riskGuardrailsEnabled).toBe(false);
    expect(DEFAULT_INPUTS.riskGuardrailTargetPct).toBe(80);
    expect(DEFAULT_INPUTS.riskGuardrailCutToPct).toBe(70);
    expect(DEFAULT_INPUTS.riskGuardrailCutAtPct).toBe(50);
    expect(DEFAULT_INPUTS.riskGuardrailRaiseAtPct).toBe(99);
    expect(DEFAULT_INPUTS.riskGuardrailMovePct).toBe(100);
  });

  it('moving none of the way leaves the plan at fixed spending exactly', () => {
    const wide = runProjection(on({ riskGuardrailMovePct: 0 }));
    const fixed = runProjection(retiree);
    expect(wide.endingBalance).toBeCloseTo(fixed.endingBalance, 4);
    expect(wide.years.find((y) => y.isRetired).riskGuardrailChance).toBeGreaterThan(0);
  });

  it('the chance of lasting falls as spending rises, and rises with a bigger balance', () => {
    const model = _riskGuardrailModel(retiree);
    const p = 1000000;
    expect(_riskSuccess(model, 0, p, 1.3)).toBeLessThanOrEqual(_riskSuccess(model, 0, p, 1));
    expect(_riskSuccess(model, 0, p * 1.5, 1)).toBeGreaterThanOrEqual(_riskSuccess(model, 0, p, 1));
  });

  it('a plan whose chance starts below the cut line is cut to the 70% level in its first retired year', () => {
    const over = on({ lifestyleExpense: 95000 });
    const y = runProjection(over).years.find((r) => r.isRetired);
    expect(y.riskGuardrailChance).toBeLessThan(0.5);
    expect(y.riskGuardrailAction).toBe('cut');
    expect(y.riskGuardrailMultiplier).toBeLessThan(1);
    // Re-measured at the new spending, the chance is the cut-back level.
    const model = _riskGuardrailModel(over);
    const opening = (over.preTaxInit + over.rothInit + over.taxableInit);
    const after = _riskSuccess(model, 0, opening / (y.inflFactor || 1), y.riskGuardrailMultiplier);
    expect(after).toBeGreaterThanOrEqual(0.7);
    expect(after).toBeLessThan(0.8);
  });

  it('a plan far under its means is raised, but not in its first five retired years, and by no more than 20% at a time', () => {
    const ys = runProjection(on({ lifestyleExpense: 20000 })).years.filter((r) => r.isRetired);
    expect(ys.slice(0, 5).every((y) => y.riskGuardrailAction !== 'raise')).toBe(true);
    const firstRaise = ys.findIndex((y) => y.riskGuardrailAction === 'raise');
    expect(firstRaise).toBe(5);
    expect(ys[firstRaise].riskGuardrailMultiplier).toBeCloseTo(1.2, 6);
  });

  it('moving part of the way changes spending less than all the way', () => {
    const all = runProjection(on({ lifestyleExpense: 95000 })).years.find((r) => r.isRetired).riskGuardrailMultiplier;
    const part = runProjection(on({ lifestyleExpense: 95000, riskGuardrailMovePct: 10 })).years.find((r) => r.isRetired).riskGuardrailMultiplier;
    expect(part).toBeGreaterThan(all);
    expect(part).toBeLessThan(1);
  });

  it('appears in the historical comparison, and is the plan\'s own rule when on', () => {
    const h = runHistoricalStarts(on());
    expect(h.inPlan).toBe('risk');
    const risk = h.rules.find((r) => r.key === 'risk');
    expect(risk.inPlan).toBe(true);
    expect(risk.count).toBe(h.count);
    // It spends more than fixed spending over a lifetime when the plan is
    // underspending, which is the point; whether it lasts in more starts
    // depends on the plan.
    expect(risk.medianLifetimeShare).toBeGreaterThan(0);
  });
});

import { historicalByRiskTarget } from '../calculator';

describe('risk-based guardrails at several targets', () => {
  it('a higher target lasts at least as often', () => {
    const t = historicalByRiskTarget(on());
    expect(t.rows.map((r) => r.target)).toEqual([70, 80, 90]);
    expect(t.rows.find((r) => r.target === 80).isPlan).toBe(true);
    const [lo, , hi] = t.rows;
    expect(hi.lasted).toBeGreaterThanOrEqual(lo.lasted - 2);
  });
});

import { runMonteCarlo, sanitizeInputs } from '../calculator';

describe('risk-based guardrails: independent-review fixes', () => {
  it('fees lower the chance of lasting', () => {
    const plain = _riskGuardrailModel(retiree);
    const fee = _riskGuardrailModel({ ...retiree, advisorFeePct: 1.5 });
    expect(_riskSuccess(fee, 0, 1000000, 1.3)).toBeLessThan(_riskSuccess(plain, 0, 1000000, 1.3));
  });

  it('a Keep at Least floor counts as running short', () => {
    const plain = _riskGuardrailModel(retiree);
    const floored = _riskGuardrailModel({ ...retiree, portfolioFloorReal: 400000 });
    expect(_riskSuccess(floored, 0, 1000000, 1)).toBeLessThan(_riskSuccess(plain, 0, 1000000, 1));
    const h = runHistoricalStarts(on({ portfolioFloorReal: 400000, lifestyleExpense: 60000 }));
    const risk = h.rules.find((r) => r.key === 'risk');
    expect(risk.lasted).toBeGreaterThan(0);
  });

  it('does not raise spending sharply in the last years of the plan', () => {
    const years = runProjection(on()).years.filter((y) => y.isRetired);
    const last = years[years.length - 1].riskGuardrailMultiplier;
    expect(last).toBeLessThan(2);
  });

  it('never cuts below half the plan\'s spending when no essentials are set', () => {
    const y = runProjection(on({ lifestyleExpense: 400000 })).years.find((r) => r.isRetired);
    expect(y.riskGuardrailMultiplier).toBeGreaterThanOrEqual(0.5);
  });

  it('runs alone: an old plan with every guardrail on uses only this one', () => {
    const clean = sanitizeInputs(on({ spendingGuardrails: true, withdrawalGuardrailsEnabled: true }));
    expect(clean.spendingGuardrails).toBe(false);
    expect(clean.withdrawalGuardrailsEnabled).toBe(false);
  });

  it('the Monte Carlo reports what the rule cost in spending', () => {
    const m = runMonteCarlo(on({ monteCarloTrials: 40 }));
    expect(m.spendingCost).toBeTruthy();
  }, 120000);
});

describe('a cap on total raises', () => {
  it('is 50% by default, and when set keeps spending at or below that far above plan', () => {
    expect(DEFAULT_INPUTS.riskGuardrailRaiseCapPct).toBe(50);
    const free = runProjection(on({ lifestyleExpense: 20000, riskGuardrailRaiseCapPct: 0 })).years.filter((y) => y.isRetired);
    const capped = runProjection(on({ lifestyleExpense: 20000, riskGuardrailRaiseCapPct: 25 })).years.filter((y) => y.isRetired);
    expect(Math.max(...free.map((y) => y.riskGuardrailMultiplier))).toBeGreaterThan(1.25);
    expect(Math.max(...capped.map((y) => y.riskGuardrailMultiplier))).toBeLessThanOrEqual(1.25 + 1e-9);
  });
});

describe('the ceiling on raises in a real start and with a partial move', () => {
  it('still cuts in 1966 and never passes the ceiling, and holds with 10% of the way', () => {
    const h = runProjection(on({ lifestyleExpense: 45000, riskGuardrailRaiseCapPct: 25, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1966 })).years.filter((y) => y.isRetired);
    expect(h.some((y) => y.riskGuardrailAction === 'cut')).toBe(true);
    expect(Math.max(...h.map((y) => y.riskGuardrailMultiplier))).toBeLessThanOrEqual(1.25 + 1e-9);
    const p = runProjection(on({ lifestyleExpense: 20000, riskGuardrailRaiseCapPct: 25, riskGuardrailMovePct: 10 })).years.filter((y) => y.isRetired);
    expect(Math.max(...p.map((y) => y.riskGuardrailMultiplier))).toBeLessThanOrEqual(1.25 + 1e-9);
  });
});

describe('the fast chance of lasting', () => {
  it('matches running every sequence directly', async () => {
    const { _riskGuardrailModel, _riskSuccess, _riskSuccessDirect, sanitizeInputs } = await import('../calculator');
    for (const over of [{}, { portfolioFloorReal: 200000 }, { lifestyleExpense: 80000 }]) {
      const model = _riskGuardrailModel(sanitizeInputs(on(over)));
      for (const k of [0, 5, 20]) {
        for (const bal of [300000, 1000000, 2500000]) {
          for (const m of [0.3, 0.8, 1, 1.4, 2.5]) {
            for (const h of [0, 10]) {
              expect(_riskSuccess(model, k, bal, m, h)).toBeCloseTo(_riskSuccessDirect(model, k, bal, m, h), 9);
            }
          }
        }
      }
    }
  });
});

describe('the rule-off reference read from the guarded run', () => {
  it('prices the spending cost exactly as a second projection does', async () => {
    const { _riskOnlyRef, sanitizeInputs } = await import('../calculator');
    const { spendingCost } = await import('../utils/spendingCost');
    const plans = [
      { lifestyleExpense: 45000 },
      { lifestyleExpense: 70000, goGoBumpEnabled: true, lifestyleThreePhaseEnabled: true },
      { lifestyleExpense: 30000, riskGuardrailRaiseCapPct: 50, portfolioFloorReal: 100000 },
    ];
    let compared = 0;
    for (const over of plans) {
      for (const start of [1929, 1937, 1966, 1973, 1982, 2000]) {
        const inp = sanitizeInputs(on({ ...over, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start }));
        const res = runProjection(inp);
        const offRun = runProjection({ ...inp, riskGuardrailsEnabled: false });
        const a = spendingCost(res, offRun);
        const b = spendingCost(res, _riskOnlyRef(inp, res));
        for (const key of ['deepestCut', 'cutYears', 'raiseYears', 'retiredYears', 'lifetimeShare', 'essentialsTouched']) {
          if (typeof a[key] === 'number') expect(b[key]).toBeCloseTo(a[key], 9); else expect(b[key]).toBe(a[key]);
        }
        compared += 1;
      }
    }
    expect(compared).toBe(18);
  });
});

describe('the rule follows what has happened', () => {
  const couple = (over = {}) => on({
    spouse2Enabled: true, birthYear2: START - 65, retireAge2: 65, lifeExpectancy2: 95, claimingAge2: 67,
    salary2: 0, ss2: 30000, lifestyleExpense: 75000, ...over,
  });
  it('knows nothing of a death or care until it happens', async () => {
    const { _riskStatePatch } = await import('../calculator');
    const base = couple();
    const alive = { dead1: null, dead2: null, age1: 70, age2: 70 };
    expect(_riskStatePatch(base, base, alive)).toBe(null);
    expect(_riskStatePatch(base, base, { ...alive, dead1: 72, age1: 75 })).toEqual({ lifeExpectancy1: 72 });
    const stressed = couple({ survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 72 });
    expect(_riskStatePatch(base, stressed, { ...alive, dead1: 72, age1: 75 })).toEqual({ survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 72 });
    expect(_riskStatePatch(base, base, { ...alive, age1: 97 })).toEqual({ lifeExpectancy1: 100 });
    const care = couple({ ltcActive2: true, ltcStartAge2: 80, ltcDurationYears2: 3 });
    expect(_riskStatePatch(base, care, { ...alive, age2: 79 })).toBe(null);
    expect(_riskStatePatch(base, care, { ...alive, age2: 80 })).toMatchObject({ ltcActive2: true, ltcStartAge2: 80, ltcDurationYears2: 3 });
  });
  it('after an early death measures the survivor’s own income and spending', () => {
    const plain = runProjection(couple()).years.filter((y) => y.isRetired);
    const stressed = runProjection(couple({ survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 70, riskGuardrailReplanOnEvent: false })).years.filter((y) => y.isRetired);
    const before = (rows) => rows.find((y) => y.year === START + 5);
    const after = (rows) => rows.find((y) => y.year === START + 7);
    // The same chance before the death (the rule does not see it coming)...
    expect(before(stressed).riskGuardrailChance).toBeCloseTo(before(plain).riskGuardrailChance, 6);
    // ...and a different one after it, from the survivor's flows.
    expect(after(stressed).riskGuardrailChance).not.toBeCloseTo(after(plain).riskGuardrailChance, 3);
  });
});

describe('dollar guardrails', () => {
  it('put each line exactly where the chance crosses it', async () => {
    const { _riskBalanceFor, sanitizeInputs } = await import('../calculator');
    for (const over of [{}, { portfolioFloorReal: 150000 }]) {
      const model = _riskGuardrailModel(sanitizeInputs(on(over)));
      for (const k of [0, 6, 18]) {
        for (const [m, t, h] of [[1, 0.5, 0], [0.8, 0.7, 0], [1.2, 0.99, 10]]) {
          const line = _riskBalanceFor(model, k, m, t, h);
          expect(Number.isFinite(line)).toBe(true);
          expect(_riskSuccess(model, k, line + 1, m, h)).toBeGreaterThanOrEqual(t);
          expect(_riskSuccess(model, k, line - 1, m, h)).toBeLessThan(t);
        }
      }
    }
  });
  it('show in each retired year, the raise line only once raises are allowed', () => {
    const rows = runProjection(on()).years.filter((y) => y.isRetired);
    expect(rows[0].riskGuardrailCutBalance).toBeGreaterThan(0);
    expect(rows[0].riskGuardrailRaiseBalance).toBeNull();
    const fifth = rows[5];
    expect(fifth.riskGuardrailRaiseBalance).toBeGreaterThan(fifth.riskGuardrailCutBalance);
    // A cut happened exactly when the opening balance was under the line.
    const hist = runProjection(on({ stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1966 })).years.filter((y) => y.isRetired);
    expect(hist.some((y) => y.riskGuardrailAction === 'cut')).toBe(true);
  });
});

describe('care entered in the plan, and getting back to plan', () => {
  const couple = (over = {}) => on({
    spouse2Enabled: true, birthYear2: START - 65, retireAge2: 65, lifeExpectancy2: 95, claimingAge2: 67,
    salary2: 0, ss2: 30000, lifestyleExpense: 75000, ...over,
  });
  const care = { ltcActive2: true, ltcStartAge2: 80, ltcDurationYears2: 3 };
  it('counts entered care from the start, so the plan does not spend it early', () => {
    const plain = runProjection(couple()).years.filter((y) => y.isRetired);
    const withCare = runProjection(couple(care)).years.filter((y) => y.isRetired);
    expect(withCare[0].riskGuardrailChance).toBeLessThan(plain[0].riskGuardrailChance);
    // No cut the year care begins on the plan's own projection: it was planned.
    const at80 = withCare.find((y) => y.age2 === 80);
    expect(at80.riskGuardrailAction).not.toBe('cut');
  });
  it('raises back to the plan\u2019s own spending over the years left once a cut is no longer needed', () => {
    let restores = 0;
    for (const start of [1929, 1937, 1966, 1969, 1973, 2000]) {
      const rows = runProjection(on({ lifestyleExpense: 62000, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: start })).years.filter((y) => y.isRetired);
      rows.forEach((y, i) => {
        const before = i > 0 ? rows[i - 1].riskGuardrailMultiplier : 1;
        if (y.riskGuardrailAction === 'raise' && before < 1 - 1e-9) {
          restores += 1;
          // A raise from below plan never jumps more than 20%.
          expect(y.riskGuardrailMultiplier).toBeLessThanOrEqual(before * 1.2 + 1e-9);
        }
      });
    }
    expect(restores).toBeGreaterThan(0);
  });
});

describe('what each line would do, the chance after a move, and a minimum change', () => {
  const hist = (over = {}) => runProjection(on({ lifestyleExpense: 62000, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1966, ...over })).years.filter((y) => y.isRetired);
  it('says what spending a cut or raise at the line would set', () => {
    const rows = hist();
    rows.forEach((y, i) => {
      const before = i > 0 ? rows[i - 1].riskGuardrailMultiplier : 1;
      if (Number.isFinite(y.riskGuardrailMultiplierIfCut)) expect(y.riskGuardrailMultiplierIfCut).toBeLessThan(y.riskGuardrailMultiplier + 1e-9);
      if (Number.isFinite(y.riskGuardrailMultiplierIfRaise)) expect(y.riskGuardrailMultiplierIfRaise).toBeGreaterThan(y.riskGuardrailMultiplier - 1e-9);
      expect(before).toBeGreaterThan(0);
    });
    expect(rows.some((y) => Number.isFinite(y.riskGuardrailMultiplierIfCut))).toBe(true);
  });
  it('reports the chance at the new spending after a full cut, at the cut-back level', () => {
    const cuts = hist().filter((y) => y.riskGuardrailAction === 'cut' && !y.riskGuardrailAtFloor);
    expect(cuts.length).toBeGreaterThan(0);
    for (const y of cuts) {
      if (y.riskGuardrailMultiplier > 0.5 + 1e-6) expect(y.riskGuardrailChanceAfter).toBeGreaterThanOrEqual(0.7 - 1e-9);
    }
  });
  it('skips raises smaller than the minimum but never holds back a cut', () => {
    expect(DEFAULT_INPUTS.riskGuardrailMinChangePct).toBe(0);
    const moves = (rows) => rows.map((y, i) => ({ y, before: i > 0 ? rows[i - 1].riskGuardrailMultiplier : 1 }))
      .filter(({ y }) => y.riskGuardrailAction === 'cut' || y.riskGuardrailAction === 'raise');
    const partial = moves(hist({ riskGuardrailMovePct: 10 }));
    expect(partial.some(({ y, before }) => Math.abs(y.riskGuardrailMultiplier / before - 1) < 0.05)).toBe(true);
    const rows = hist({ riskGuardrailMovePct: 10, riskGuardrailMinChangePct: 5 });
    for (const { y, before } of moves(rows)) {
      const size = Math.abs(y.riskGuardrailMultiplier / before - 1);
      if (y.riskGuardrailAction === 'raise' && y.riskGuardrailMultiplier < 1 - 1e-9) expect(size).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
    // Every year below the cut line still cuts (unless at the floor).
    rows.forEach((y, i) => {
      const before = i > 0 ? rows[i - 1].riskGuardrailMultiplier : 1;
      if (y.riskGuardrailChance < 0.5 && before > 0.5 + 1e-6) expect(y.riskGuardrailAction).toBe('cut');
    });
  });
  it('shows the lines at the spending after a move, so a cut year names where it would cut again', () => {
    const rows = hist();
    for (const y of rows.filter((r) => r.riskGuardrailAction === 'cut' && Number.isFinite(r.riskGuardrailCutBalance))) {
      expect(y.riskGuardrailCutBalance).toBeLessThan(y.riskGuardrailOpeningBalance);
      if (Number.isFinite(y.riskGuardrailMultiplierIfCut)) expect(y.riskGuardrailMultiplierIfCut).toBeLessThan(y.riskGuardrailMultiplier);
    }
    for (const y of rows.filter((r) => r.riskGuardrailAction === 'raise' && Number.isFinite(r.riskGuardrailMultiplierIfRaise))) {
      expect(y.riskGuardrailMultiplierIfRaise).toBeGreaterThan(y.riskGuardrailMultiplier);
    }
  });
});

describe('re-planning after a life event', () => {
  const couple = (over = {}) => on({
    spouse2Enabled: true, birthYear2: START - 65, retireAge2: 65, lifeExpectancy2: 95, claimingAge2: 67,
    salary2: 0, ss2: 30000, lifestyleExpense: 75000,
    survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 70, ...over,
  });
  it('is on by default and, the year after a death, brings spending back to the target level', () => {
    expect(DEFAULT_INPUTS.riskGuardrailReplanOnEvent).toBe(true);
    const rows = runProjection(couple()).years.filter((y) => y.isRetired);
    const year = rows.find((y) => y.year === START + 6);
    expect(year.riskGuardrailReplanned).toBe(true);
    expect(year.riskGuardrailChanceAfter).toBeGreaterThanOrEqual(0.8 - 1e-9);
    // Without it the survivor waits inside the band.
    const off = runProjection(couple({ riskGuardrailReplanOnEvent: false })).years.filter((y) => y.isRetired);
    const inBand = off.filter((y) => y.year > START + 5 && y.riskGuardrailChance >= 0.5 && y.riskGuardrailChance < 0.8).length;
    const inBandOn = rows.filter((y) => y.year > START + 5 && y.riskGuardrailChance >= 0.5 && y.riskGuardrailChance < 0.8).length;
    expect(inBand).toBeGreaterThan(10);
    expect(inBandOn).toBeLessThan(inBand);
  });
  it('counts a death before retirement, skips a death that left the survivor better off, and counts life insurance', () => {
    const early = runProjection(couple({ birthYear1: START - 60, birthYear2: START - 60, survivorStressAge: 63, survivorExpenseDropPct: 0, lifestyleExpense: 80000 })).years.filter((y) => y.isRetired);
    expect(early[0].riskGuardrailReplanned).toBe(true);
    expect(early[0].riskGuardrailChanceAfter).toBeGreaterThanOrEqual(0.8 - 1e-9);
    // A death before retirement that left the survivor better off than the
    // couple's own plan (spending drops more than income): no reset.
    const better = runProjection(couple({ birthYear1: START - 60, birthYear2: START - 60, survivorStressAge: 63, lifestyleExpense: 100000 })).years.filter((y) => y.isRetired);
    expect(better.some((y) => y.riskGuardrailReplanned)).toBe(false);
    // With a large term policy the survivor's check counts that year.
    const insured = runProjection(couple({ lifeInsuranceEnabled1: true, lifeInsuranceDeathBenefit1: 300000 })).years.filter((y) => y.isRetired);
    const payYear = insured.find((y) => y.lifeInsurancePayoutToSurvivor > 0);
    expect(payYear).toBeTruthy();
    expect(payYear.riskGuardrailOpeningBalance).toBeGreaterThan(payYear.lifeInsurancePayoutToSurvivor);
    expect(payYear.riskGuardrailAction).not.toBe('cut');
  });
  it('never raises spending', () => {
    const rows = runProjection(couple({ lifestyleExpense: 40000 })).years.filter((y) => y.isRetired);
    for (const y of rows.filter((r) => r.riskGuardrailReplanned)) expect(y.riskGuardrailAction).toBe('cut');
  });
});

describe('the age the rule plans to', () => {
  it('is a cautious one-in-four age by default, never earlier than life expectancy, and only for the rule', async () => {
    const { riskPlanningAges, sanitizeInputs } = await import('../calculator');
    expect(DEFAULT_INPUTS.riskGuardrailPlanToAge).toBe('oneInFour');
    const p = on({ lifeExpectancy1: 85, sex1: 'male' });
    const ages = riskPlanningAges(sanitizeInputs(p));
    expect(ages.age1).toBeGreaterThan(85);
    expect(riskPlanningAges(sanitizeInputs(on({ lifeExpectancy1: 104 }))).age1).toBe(104);
    const longer = _riskGuardrailModel(sanitizeInputs(p)).flows.length;
    const shorter = _riskGuardrailModel(sanitizeInputs({ ...p, riskGuardrailPlanToAge: 'expectancy' })).flows.length;
    expect(longer).toBeGreaterThan(shorter);
    // The plan itself still ends at life expectancy.
    const rows = runProjection(p).years;
    expect(rows[rows.length - 1].age1).toBe(85);
  });
});

describe('the age a couple plans to', () => {
  it('keeps the first to die at life expectancy and plans the last survivor to the couple\u2019s one-in-four age', async () => {
    const { riskPlanningAges, sanitizeInputs } = await import('../calculator');
    const c = sanitizeInputs(on({ spouse2Enabled: true, sex1: 'male', sex2: 'female', birthYear2: START - 65, lifeExpectancy1: 88, lifeExpectancy2: 92, ss2: 30000 }));
    const a = riskPlanningAges(c);
    expect(a.couple).toBe(true);
    expect(a.last).toBe(2);
    expect(a.age1).toBe(88);
    expect(a.age2).toBeGreaterThan(92);
    // A bad value is reset to the default.
    expect(sanitizeInputs({ ...c, riskGuardrailPlanToAge: 'bogus' }).riskGuardrailPlanToAge).toBe('oneInFour');
  });
});

describe('a couple’s cautious age after the unexpected death, and an ill spouse', () => {
  const pair = (over = {}) => on({ spouse2Enabled: true, sex1: 'male', sex2: 'female', birthYear2: START - 65, lifeExpectancy1: 88, lifeExpectancy2: 92, ss2: 30000, lifestyleExpense: 100000, ...over });
  it('plans a widower to his own cautious age when the wife the plan expected to outlive him dies first', async () => {
    const { _riskStatePatch, sanitizeInputs } = await import('../calculator');
    const base = sanitizeInputs(pair());
    const patch = _riskStatePatch({ ...base, lifeExpectancy2: 94 }, base, { dead1: null, dead2: 72, age1: 73, age2: null });
    expect(patch.lifeExpectancy1).toBeGreaterThan(88);
    // At the plan's own first death, nothing changes.
    expect(_riskStatePatch({ ...base, lifeExpectancy2: 94 }, base, { dead1: 88, dead2: null, age1: null, age2: 89 })).toBe(null);
  });
  it('does not stretch the survivor by the odds of a spouse whose short life expectancy says otherwise', async () => {
    const { riskPlanningAges, sanitizeInputs } = await import('../calculator');
    const healthy = riskPlanningAges(sanitizeInputs(pair()));
    const ill = riskPlanningAges(sanitizeInputs(pair({ lifeExpectancy1: 92, lifeExpectancy2: 75 })));
    expect(ill.last).toBe(1);
    expect(ill.cautious).toBeLessThan(healthy.cautious);
    expect(ill.raised).toBe(false);
  });
});
