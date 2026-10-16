// Changelog 216: withdrawal-rate guardrails, and the readiness card that
// asks what a crash right after retirement would actually cost.
//
// The load-bearing test in this file is the FIRST one: off by default and
// bit-identical when off. Everything else is about a feature nobody has
// turned on yet; that one is about every plan that already exists.
import { describe, it, expect } from 'vitest';
import { runProjection, sanitizeInputs, DEFAULT_INPUTS } from '../calculator';
import { crashCompare, crashBreakPoint, crashPatch, CRASH_HEADLINE_RETURN } from '../utils/retirementReadiness';

const plan = (over) => {
  for (const k of Object.keys(over)) {
    if (!(k in DEFAULT_INPUTS)) throw new Error(`not a real input key: ${k}`);
  }
  return { ...DEFAULT_INPUTS, ...over };
};
const START = DEFAULT_INPUTS.planYear;
const retiree = {
  birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 67,
  salary1: 150000, ss1: 40000, preTaxInit: 1400000, taxableInit: 600000, rothInit: 300000,
  lifestyleExpense: 110000, stateOfResidence: 'TX', stateTaxState: 'none',
};
// Strip the fields the feature itself adds, so "unchanged" means the
// numbers, not the shape of the row.
const numbersOnly = (proj) => JSON.stringify(proj, (k, v) => (k.startsWith('wrGuardrail') ? undefined : v));

describe('off by default', () => {
  it('is off in the defaults', () => {
    expect(DEFAULT_INPUTS.withdrawalGuardrailsEnabled).toBe(false);
  });

  it('changes nothing in any plan while it is off', () => {
    let compared = 0;
    for (const lifestyleExpense of [70000, 110000, 180000]) {
      for (const stressType of ['none', 'crashYear', '2008']) {
        for (const spendingGuardrails of [false, true]) {
          const p = plan({ ...retiree, lifestyleExpense, stressType, spendingGuardrails });
          const off = runProjection(p);
          const alsoOff = runProjection({ ...p, withdrawalGuardrailsEnabled: false });
          expect(numbersOnly(alsoOff)).toBe(numbersOnly(off));
          // And the row fields are null rather than a stray 1.0, so a
          // surface can tell "rule is off" from "rule held steady".
          expect(off.years.every((y) => y.wrGuardrailMultiplier === null)).toBe(true);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(18);
  });

  it('gives a plan saved before the feature existed the documented settings, not zero', () => {
    // sanitizeInputs turns a missing number into 0, which would leave a
    // zero-wide band and steps of nothing -- a feature that looks broken.
    const clean = sanitizeInputs({ withdrawalGuardrailsEnabled: true });
    expect(clean.wrGuardrailBandPct).toBe(DEFAULT_INPUTS.wrGuardrailBandPct);
    expect(clean.wrGuardrailCutPct).toBe(DEFAULT_INPUTS.wrGuardrailCutPct);
    expect(clean.wrGuardrailRaisePct).toBe(DEFAULT_INPUTS.wrGuardrailRaisePct);
    expect(clean.wrGuardrailMaxCutPct).toBe(DEFAULT_INPUTS.wrGuardrailMaxCutPct);
    expect(clean.wrGuardrailMaxRaisePct).toBe(DEFAULT_INPUTS.wrGuardrailMaxRaisePct);
  });
});

describe('the rule itself', () => {
  const crashed = plan({
    ...retiree, lifestyleExpense: 150000, withdrawalGuardrailsEnabled: true,
    stressType: 'crashYear', stressStartMode: 'retirement', stressCrashReturn: -30, stressCrashInflation: 3,
  });

  it('cuts spending after the rate drifts above the band, and the cut compounds', () => {
    const rows = runProjection(crashed).years.filter((y) => y.wrGuardrailAction);
    const cuts = rows.filter((y) => y.wrGuardrailAction === 'cut');
    expect(cuts.length).toBeGreaterThan(0);
    // Changelog 335: there is no 'baseline' year any more -- every retired
    // year after the first is judged against the plan's own path.
    expect(rows.some((y) => y.wrGuardrailAction === 'baseline')).toBe(false);
    // Each cut leaves the multiplier below the one before it, until the
    // floor. Counted, so an empty loop cannot pass.
    let stepped = 0;
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i].wrGuardrailAction !== 'cut') continue;
      if (rows[i - 1].wrGuardrailMultiplier <= 0.8 + 1e-9) continue;
      expect(rows[i].wrGuardrailMultiplier).toBeLessThan(rows[i - 1].wrGuardrailMultiplier);
      stepped += 1;
    }
    expect(stepped).toBeGreaterThan(0);
  });

  it('never cuts past the floor or raises past the ceiling', () => {
    for (const over of [{ stressCrashReturn: -45 }, { stressCrashReturn: 60 }]) {
      const rows = runProjection({ ...crashed, ...over }).years.filter((y) => typeof y.wrGuardrailMultiplier === 'number');
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.wrGuardrailMultiplier).toBeGreaterThanOrEqual(0.8 - 1e-9);
        expect(r.wrGuardrailMultiplier).toBeLessThanOrEqual(1.2 + 1e-9);
      }
    }
  });

  it('obeys the user’s own limits rather than the defaults', () => {
    const tight = runProjection({ ...crashed, wrGuardrailMaxCutPct: 5, wrGuardrailCutPct: 30 });
    const floors = tight.years.map((y) => y.wrGuardrailMultiplier).filter((m) => typeof m === 'number');
    expect(Math.min(...floors)).toBeCloseTo(0.95, 6);
  });

  it('raises spending when the markets run well ahead of the plan', () => {
    // Changelog 335: a plan that ASSUMES 10% returns is not ahead of itself
    // when it earns them. A boom the plan did not assume is.
    const boom = runProjection(plan({
      ...retiree, withdrawalGuardrailsEnabled: true, postRetireReturn: 10,
      stressType: 'crashYear', stressStartMode: 'retirement', stressCrashReturn: 40, stressCrashInflation: 2.5,
    }));
    const raises = boom.years.filter((y) => y.wrGuardrailAction === 'raise');
    expect(raises.length).toBeGreaterThan(0);
    expect(Math.max(...boom.years.map((y) => y.wrGuardrailMultiplier || 0))).toBeGreaterThan(1);
    // A raise is money actually spent, so it must leave less behind.
    const flat = runProjection(plan({
      ...retiree, postRetireReturn: 10,
      stressType: 'crashYear', stressStartMode: 'retirement', stressCrashReturn: 40, stressCrashInflation: 2.5,
    }));
    expect(boom.endingBalance).toBeLessThan(flat.endingBalance);
  });

  it('spends less, and so leaves more, when a crash forces the cuts', () => {
    const on = runProjection(crashed);
    const off = runProjection({ ...crashed, withdrawalGuardrailsEnabled: false });
    const spend = (p) => p.years.filter((y) => y.isRetired).reduce((t, y) => t + (y.lifestyleExpenses || 0), 0);
    expect(spend(on)).toBeLessThan(spend(off));
  });

  it('never acts before retirement', () => {
    const rows = runProjection(crashed).years.filter((y) => !y.isRetired);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((y) => y.wrGuardrailAction === null)).toBe(true);
  });
});

describe('the readiness card (Q2)', () => {
  const comfortable = plan({ ...retiree, lifestyleExpense: 90000 });

  it('reads the crash as a one-year market fall, with inflation left alone', () => {
    const r = crashCompare(comfortable);
    expect(CRASH_HEADLINE_RETURN).toBe(-20);
    expect(r.crashReturn).toBe(-20);
    // The crash costs something, or it was not a crash.
    expect(r.held.endingBalance).toBeLessThan(r.baseline.endingBalance);
    expect(r.guardrailsOnInPlan).toBe(false);
  });

  it('answers with the guardrail on as well as off', () => {
    const r = crashCompare(plan({ ...retiree, lifestyleExpense: 110000 }));
    expect(r.adapted.deepestCutPct).toBeGreaterThan(0);
    expect(r.adapted.cutYears).toBeGreaterThan(0);
    // This is the whole card in one assertion: the same crash sinks the
    // plan if spending never changes, and does not if it does.
    expect(r.held.isSuccessful).toBe(false);
    expect(r.adapted.isSuccessful).toBe(true);
    expect(r.adapted.endingBalance).toBeGreaterThan(r.held.endingBalance);
  });

  it('finds a break point the plan genuinely survives, and one just past it that it does not', () => {
    const bp = crashBreakPoint(comfortable);
    expect(bp.reason).toBe('found');
    expect(bp.decline).toBeLessThan(0);
    // The card's own "spending unchanged" run (E24: both spending rules
    // off, and the crash year's inflation kept off housing and medical).
    const survives = (ret) => runProjection(crashPatch(comfortable, ret, false)).isSuccessful;
    expect(survives(bp.decline)).toBe(true);
    expect(survives(bp.firstFailing)).toBe(false);
  });

  it('says so rather than blaming the market when the plan fails without a crash', () => {
    const bp = crashBreakPoint(plan({ ...retiree, lifestyleExpense: 260000 }));
    expect(bp.reason).toBe('failsWithoutCrash');
    expect(bp.decline).toBeNull();
  });

  it('reports a plan that survives the whole search range instead of inventing a number', () => {
    const bp = crashBreakPoint(plan({ ...retiree, lifestyleExpense: 40000, preTaxInit: 4000000 }));
    expect(bp.reason).toBe('survivesAll');
    expect(bp.worst).toBe(-80);
  });
});
