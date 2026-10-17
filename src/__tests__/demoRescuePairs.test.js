// The demo's failing plans and their one-change rescues (outside review,
// 2026-09-28). Each pair must actually fail and then actually be rescued,
// in the verdict terms the app shows, or the demo teaches the wrong lesson.
import { describe, it, expect } from 'vitest';
import { buildDemoInputs, DEMO_SCENARIO_DEFS } from '../config/demoPlan';
import { runProjection, runMonteCarlo } from '../calculator';
import { planVerdict } from '../utils/planVerdict';

const base = buildDemoInputs();
const verdictOf = (name) => {
  const def = DEMO_SCENARIO_DEFS.find((d) => d.name === name);
  expect(def, name).toBeTruthy();
  const inputs = def.mutate(base);
  const proj = runProjection(inputs);
  const mc = runMonteCarlo(inputs);
  return { inputs, v: planVerdict({ isSuccessful: proj.isSuccessful, years: proj.years, mc: { status: 'fresh', successProbability: mc.successProbability, trials: 1000 } }) };
};
const changedKeys = (a, b) => Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

describe('the demo includes plans that fail, each rescued by one change', () => {
  it('$180k a year runs short; Sam working to 64 rescues it', () => {
    const fail = verdictOf('Demo: Spends $180,000 a year (runs short)');
    const fix = verdictOf('Demo: $180,000 a year, and Sam works to 64');
    expect(fail.v.label).toBe('Runs short');
    expect(['On track', 'Mostly on track']).toContain(fix.v.label);
    expect(changedKeys(fail.inputs, fix.inputs)).toEqual(['retireAge1']);
  }, 60000);

  it('$170k a year is at risk; spending guardrails rescue it', () => {
    const fail = verdictOf('Demo: Spends $170,000 a year (at risk in weak markets)');
    const fix = verdictOf('Demo: $170,000 a year, with spending guardrails (they act only after down years)');
    expect(fail.v.label).toBe('At risk');
    expect(['On track', 'Mostly on track']).toContain(fix.v.label);
    expect(changedKeys(fail.inputs, fix.inputs)).toEqual(['spendingGuardrails']);
  }, 60000);
});
