// @vitest-environment jsdom
// utils/annualReview.js (changelog 256): the yearly checklist.
import { describe, it, expect, beforeEach } from 'vitest';
import { HISTORY_LAST_YEAR } from '../config/historicalReturns';
import { DEFAULT_INPUTS, runProjection, TAX_YEAR } from '../calculator';
import {
  annualReviewSteps, reviewDue, passedMilestones, carryIrmaaHistoryForward, readReview, markStep, markReviewComplete, REVIEW_KEY,
} from '../utils/annualReview';
import { getPlanFeedback } from '../utils/planFeedback';

const USED_KEYS = ['planYear', 'birthYear1', 'milestones', 'irmaaPriorYearMagi', 'irmaaTwoYearsPriorMagi', 'initialBalancesSource'];

beforeEach(() => { localStorage.clear(); });

describe('vacuity guard', () => {
  it('every input key this file sets exists in DEFAULT_INPUTS', () => {
    expect(USED_KEYS.filter((k) => !(k in DEFAULT_INPUTS))).toEqual([]);
  });
});

describe('reviewDue', () => {
  it('is due only when the plan year lags the calendar', () => {
    expect(reviewDue({ ...DEFAULT_INPUTS, planYear: 2026 }, 2026)).toEqual({ due: false, years: 0 });
    expect(reviewDue({ ...DEFAULT_INPUTS, planYear: 2026 }, 2028)).toEqual({ due: true, years: 2 });
  });

  it('surfaces on the Dashboard feedback with a link to the Plan Year page', () => {
    const behind = { ...DEFAULT_INPUTS, planYear: new Date().getFullYear() - 1 };
    const proj = runProjection(behind);
    const items = getPlanFeedback(behind, proj, null, () => 73);
    const item = items.find((r) => r.action && r.action.subTab === 'planyear');
    expect(item).toBeDefined();
    expect(item.title).toContain(String(behind.planYear));
    const current = getPlanFeedback(DEFAULT_INPUTS, runProjection(DEFAULT_INPUTS), null, () => 73);
    expect(current.find((r) => r.action && r.action.subTab === 'planyear')).toBeUndefined();
  });
});

describe('passedMilestones', () => {
  it('lists events dated before the current age, honoring a recurring end age', () => {
    const age = DEFAULT_INPUTS.planYear - DEFAULT_INPUTS.birthYear1;
    const inputs = { ...DEFAULT_INPUTS, milestones: [
      { id: 'a', name: 'Old roof', type: 'outflow', amount: 1, isRecurring: false, startAge: age - 2, endAge: age - 2 },
      { id: 'b', name: 'Tuition', type: 'outflow', amount: 1, isRecurring: true, startAge: age - 3, endAge: age + 1 },
      { id: 'c', name: 'Boat', type: 'outflow', amount: 1, isRecurring: false, startAge: age + 5, endAge: age + 5 },
    ] };
    expect(passedMilestones(inputs).map((m) => m.id)).toEqual(['a']);
  });
});

describe('carryIrmaaHistoryForward', () => {
  it('shifts the prior year back and estimates the new prior from the plan’s first year', () => {
    const inputs = { ...DEFAULT_INPUTS, irmaaPriorYearMagi: 150000, irmaaTwoYearsPriorMagi: 140000 };
    const proj = runProjection(inputs);
    const patch = carryIrmaaHistoryForward(inputs, proj);
    expect(patch.irmaaTwoYearsPriorMagi).toBe(150000);
    expect(patch.irmaaPriorYearMagi).toBe(Math.round(proj.years[0].irmaaMagi));
    expect(patch.irmaaPriorYearMagi).toBeGreaterThan(0);
  });

  it('is null when there is nothing to carry', () => {
    expect(carryIrmaaHistoryForward({ ...DEFAULT_INPUTS, irmaaPriorYearMagi: 0 }, { years: [{ irmaaMagi: 0 }] })).toBeNull();
  });
});

describe('annualReviewSteps', () => {
  const proj = runProjection(DEFAULT_INPUTS);

  it('starts with the calendar and ends with the snapshot, every step with a why', () => {
    const steps = annualReviewSteps(DEFAULT_INPUTS, proj, { realYear: DEFAULT_INPUTS.planYear + 1 });
    expect(steps[0].id).toBe('advanceYear');
    expect(steps[steps.length - 1].id).toBe('snapshot');
    for (const s of steps) { expect(s.title.length).toBeGreaterThan(8); expect(s.why.length).toBeGreaterThan(20); }
  });

  it('the data-vintage step ticks itself while the market history reaches the last full year, and says how far behind otherwise (changelog 269)', () => {
    const current = annualReviewSteps({ ...DEFAULT_INPUTS, planYear: HISTORY_LAST_YEAR + 1 }, proj, { realYear: HISTORY_LAST_YEAR + 1 }).find((s) => s.id === 'dataVintage');
    expect(current.autoDone).toBe(true);
    expect(current.title).toContain(`through ${HISTORY_LAST_YEAR}`);
    expect(current.title).toContain('Period Life Table');
    const behind = annualReviewSteps({ ...DEFAULT_INPUTS, planYear: HISTORY_LAST_YEAR + 3 }, proj, { realYear: HISTORY_LAST_YEAR + 3 }).find((s) => s.id === 'dataVintage');
    expect(behind.autoDone).toBe(false);
    expect(behind.why).toContain('2 years short');
  });

  it('ticks the calendar step by itself once the plan year is current, and the tax step when TAX_YEAR covers it', () => {
    const cur = annualReviewSteps(DEFAULT_INPUTS, proj, { realYear: DEFAULT_INPUTS.planYear });
    expect(cur.find((s) => s.id === 'advanceYear').autoDone).toBe(true);
    const behind = annualReviewSteps(DEFAULT_INPUTS, proj, { realYear: DEFAULT_INPUTS.planYear + 1 });
    expect(behind.find((s) => s.id === 'advanceYear').autoDone).toBe(false);
    expect(behind.find((s) => s.id === 'taxTables').autoDone).toBe(TAX_YEAR >= DEFAULT_INPUTS.planYear);
  });

  it('offers Carry forward only when there is MAGI to carry, and routes linked balances to Detailed Holdings', () => {
    const steps = annualReviewSteps({ ...DEFAULT_INPUTS, irmaaPriorYearMagi: 120000 }, proj);
    expect(steps.find((s) => s.id === 'magi').auto).toBe('carryMagi');
    const linked = annualReviewSteps({ ...DEFAULT_INPUTS, initialBalancesSource: 'holdings' }, proj);
    expect(linked.find((s) => s.id === 'balances').where.tab).toBe('portfolio');
    expect(linked.find((s) => s.id === 'balances').auto).toBeNull();
    const manual = annualReviewSteps(DEFAULT_INPUTS, proj);
    expect(manual.find((s) => s.id === 'balances').auto).toBe('quickUpdate');
  });

  it('names passed life events in the milestones step', () => {
    const age = DEFAULT_INPUTS.planYear - DEFAULT_INPUTS.birthYear1;
    const inputs = { ...DEFAULT_INPUTS, milestones: [{ id: 'a', name: 'Old roof', type: 'outflow', amount: 1, isRecurring: false, startAge: age - 1, endAge: age - 1 }] };
    const step = annualReviewSteps(inputs, proj).find((s) => s.id === 'milestones');
    expect(step.title).toContain('Clear 1 life event');
    expect(step.why).toContain('Old roof');
  });
});

describe('review memory', () => {
  it('remembers ticks per plan year and a completion date', () => {
    expect(readReview(2026)).toEqual({ done: {}, completedAt: null });
    markStep(2026, 'income', true, new Date('2026-01-05'));
    expect(Object.keys(readReview(2026).done)).toEqual(['income']);
    expect(readReview(2027).done).toEqual({});
    markStep(2026, 'income', false);
    expect(readReview(2026).done).toEqual({});
    markReviewComplete(2026, new Date('2026-01-06'));
    expect(readReview(2026).completedAt).toBe(new Date('2026-01-06').toISOString());
    expect(JSON.parse(localStorage.getItem(REVIEW_KEY))['2026'].completedAt).toBeTruthy();
  });
});
