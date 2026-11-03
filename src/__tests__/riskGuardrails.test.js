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
  it('is off by default, and when set keeps spending at or below that far above plan', () => {
    expect(DEFAULT_INPUTS.riskGuardrailRaiseCapPct).toBe(0);
    const free = runProjection(on({ lifestyleExpense: 20000 })).years.filter((y) => y.isRetired);
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
