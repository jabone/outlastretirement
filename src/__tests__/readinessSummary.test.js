// utils/readinessSummary.js (changelog 253): the six Readiness answers as
// six sentences for the printed report. Each line restates a figure the
// Readiness utilities already produce; these tests pin that restatement
// to the source it came from, so the report can never say something the
// tab does not.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { readinessSummary } from '../utils/readinessSummary';
import { walkAwayNow, crashCompare, workLongerCompare, firstYearsPlan } from '../utils/retirementReadiness';
import { findBigExpenses } from '../utils/bigExpenses';

const USED_KEYS = ['milestones', 'retireAge1', 'birthYear1', 'planYear', 'spouse2Enabled', 'preTaxInit', 'lifestyleExpense'];

describe('vacuity guard', () => {
  it('every input key this file sets exists in DEFAULT_INPUTS', () => {
    expect(USED_KEYS.filter((k) => !(k in DEFAULT_INPUTS))).toEqual([]);
  });
});

describe('readinessSummary', () => {
  const inputs = { ...DEFAULT_INPUTS };
  const projection = runProjection(inputs);
  const lines = readinessSummary(inputs, projection);
  const byId = Object.fromEntries(lines.map((l) => [l.id, l]));

  it('answers all six questions, each as one non-empty sentence', () => {
    expect(lines.map((l) => l.id)).toEqual(['walkAway', 'crash', 'paycheck', 'bigExpenses', 'firstYears', 'workLonger']);
    for (const l of lines) {
      expect(l.question.length).toBeGreaterThan(20);
      expect(l.answer.length).toBeGreaterThan(20);
      expect(l.answer.trim().endsWith('.')).toBe(true);
    }
  });

  it('walk-away restates walkAwayNow', () => {
    const w = walkAwayNow(inputs);
    expect(byId.walkAway.ok).toBe(w.isSuccessful);
    if (!w.alreadyRetired) expect(byId.walkAway.answer).toContain(String(w.retirementYear));
    if (w.depletionYear) expect(byId.walkAway.answer).toContain(String(w.depletionYear));
  });

  it('the crash line restates crashCompare and names the depletion year when it fails', () => {
    const c = crashCompare(inputs);
    expect(byId.crash.ok).toBe(c.held.isSuccessful);
    if (!c.held.isSuccessful && c.held.depletionYear) expect(byId.crash.answer).toContain(String(c.held.depletionYear));
  });

  it('the paycheck line carries the first retired year and its monthly figure', () => {
    const f = firstYearsPlan(projection);
    expect(byId.paycheck.answer).toContain(String(f.headline.year));
    expect(byId.paycheck.answer).toContain('$' + Math.round(f.headline.monthly).toLocaleString());
  });

  it('big expenses: none flagged reads as none; a flagged one is named with its year', () => {
    expect(findBigExpenses(inputs, projection)).toEqual([]);
    expect(byId.bigExpenses.answer).toMatch(/^No life event/);
    expect(byId.bigExpenses.ok).toBe(true);
    const retireYear = inputs.planYear + (inputs.retireAge1 - (inputs.planYear - inputs.birthYear1));
    const withRoof = { ...inputs, milestones: [{ id: 'roof', name: 'New roof', type: 'outflow', amount: 400000, isRecurring: false, startAge: inputs.retireAge1 + 1, endAge: inputs.retireAge1 + 1, targetAccount: 'auto', isTaxable: false, inflationCategory: 'General', fundedExternally: false }] };
    const proj2 = runProjection(withRoof);
    const flagged = findBigExpenses(withRoof, proj2);
    expect(flagged.length).toBe(1);
    const line = readinessSummary(withRoof, proj2).find((l) => l.id === 'bigExpenses');
    expect(line.answer).toContain('New roof');
    expect(line.answer).toContain(String(flagged[0].year));
    expect(line.answer).toContain(String(retireYear + 1));
    expect(line.ok).toBe(false);
  });

  it('working longer restates workLongerCompare for three years', () => {
    const l = workLongerCompare(inputs, { extraYears: 3 });
    expect(byId.workLonger.answer).toContain(String(l.later.retirementYear));
    expect(byId.workLonger.answer).toContain(`${l.yearsGivenUp} fewer`);
  });

  it('uses the caller’s currency formatter', () => {
    const fmt = (v) => `€${Math.round(v)}`;
    const l = readinessSummary(inputs, projection, { formatCurrency: fmt });
    expect(l.find((x) => x.id === 'paycheck').answer).toContain('€');
  });
});
