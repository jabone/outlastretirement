// First-time user review, round B (changelog 472): the verdict says what it
// means in plain words, the Dashboard offers three changes that would
// help, Plan Feedback stops reading like errors, the Action Plan folds its
// comparisons, and the verdict comes first on a phone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { planVerdict } from '../utils/planVerdict';
import { threeChanges, MAX_RETIRE_AGE } from '../utils/threeChanges';
import { sanitizeForProjection } from '../utils/oneLeverCompare';
import { getPlanFeedback } from '../utils/planFeedback';
import { buildActionPlan } from '../utils/actionPlan';

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

describe('the verdict in plain words', () => {
  it('At risk says how many tries in 100 fell short and what the label means', () => {
    const v = planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 54, trials: 1000 } });
    expect(v.label).toBe('At risk');
    expect(v.plain).toMatch(/fell short in about 46 of 100 tries/);
    expect(v.plain).toMatch(/“At risk” means a bad stretch of markets/);
  });
  it('Mostly on track and Runs short have their own line; On track has none', () => {
    expect(planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 80 } }).plain).toMatch(/about 20 of 100/);
    const short = planVerdict({ isSuccessful: false, years: [{ year: 2050, shortfall: 10 }], mc: { status: 'none' } });
    expect(short.plain).toMatch(/runs out in 2050/);
    expect(planVerdict({ isSuccessful: true, mc: { status: 'fresh', successProbability: 95 } }).plain).toBeUndefined();
  });
  it('the historical stand-in counts real starts', () => {
    const v = planVerdict({ isSuccessful: true, history: { lasted: 60, count: 98, firstStart: 1928 } });
    expect(v.plain).toMatch(/fell short 38 times in 98/);
  });
  it('the card shows it, and the card comes first on a phone or tablet', () => {
    expect(read('App.jsx')).toMatch(/data-testid="verdict-plain"/);
    expect(read('App.jsx')).toMatch(/kpi-card kpi-verdict/);
    expect(read('index.css')).toMatch(/\.kpi-grid > \.kpi-verdict \{\s*order: -1;/);
  });
  it('the first-safe-year card no longer says "safe"', () => {
    const dash = read('components/tabs/DashboardTab.jsx');
    expect(dash).not.toMatch(/First safe year/);
    expect(dash).toMatch(/First year that lasts with average returns/);
  });
});

describe('three changes that would help', () => {
  const base = { ...DEFAULT_INPUTS };
  it('offers work longer, spend less and claim at 70 for a working single, each with a patch that moves the plan', () => {
    const list = threeChanges(base);
    expect(list.map((c) => c.id)).toEqual(['work', 'spend', 'claim']);
    const work = list[0];
    expect(work.patch.retireAge1).toBe(Number(base.retireAge1) + 2);
    const spend = list[1];
    expect(spend.patch.lifestyleExpense % 500).toBe(0);
    expect(spend.patch.lifestyleExpense).toBeLessThan(base.lifestyleExpense);
    expect(list[2].patch).toEqual({ claimingAge1: 70, claimMonth1: 0 });
    const ending = (p) => runProjection(sanitizeForProjection({ ...base, ...p })).endingBalance;
    const before = ending({});
    for (const c of list) expect(ending(c.patch), c.id).toBeGreaterThan(before);
  });
  it('leaves out a change that does not apply', () => {
    const planYear = Number(base.planYear);
    const retired = { ...base, birthYear1: planYear - 72, retireAge1: 65, claimingAge1: 70, lifeExpectancy1: 95 };
    expect(threeChanges(retired).map((c) => c.id)).toEqual(['spend']);
    const atCap = { ...base, retireAge1: MAX_RETIRE_AGE };
    expect(threeChanges(atCap).map((c) => c.id)).not.toContain('work');
  });
  it('a couple moves each person still working, and names them', () => {
    const couple = { ...base, spouse2Enabled: true, spouse2Name: 'Ann', retireAge2: 65, claimingAge2: 67 };
    const work = threeChanges(couple).find((c) => c.id === 'work');
    expect(work.patch).toEqual({ retireAge1: Number(base.retireAge1) + 2, retireAge2: 67 });
    expect(work.detail).toMatch(/Ann at 67/);
  });
  it('a spending breakdown is not overwritten', () => {
    const spend = threeChanges({ ...base, lifestyleExpenseInputMode: 'categories' }).find((c) => c.id === 'spend');
    expect(spend.tryable).toBe(false);
    expect(spend.note).toMatch(/lower it there/);
  });
  it('the Dashboard shows the card', () => {
    expect(read('components/tabs/DashboardTab.jsx')).toMatch(/<ThreeChangesCard \/>/);
    expect(read('components/ThreeChangesCard.jsx')).toMatch(/All three/);
  });
});

describe('calmer Plan Feedback', () => {
  it('names what the setting does, and a flat return is a note, not a warning', () => {
    const fb = getPlanFeedback({ ...DEFAULT_INPUTS, spendingGuardrails: false, rebalancingEnabled: false }, runProjection(DEFAULT_INPUTS), null, () => 73);
    const titles = fb.map((f) => f.title);
    expect(titles).toContain('Spending Stays the Same in Bad Years');
    const flat = fb.find((f) => f.title === 'The Same Return Every Year');
    expect(flat.type).toBe('info');
    expect(titles).not.toContain('Static Return Assumption Risk');
  });
});

describe('an Action Plan you can act on', () => {
  it('names the heirs plainly and says when the names are placeholders', () => {
    const plan = buildActionPlan({ ...DEFAULT_INPUTS, heirs: [{ name: 'Heir 1', splitPct: 100 }] }, runProjection(DEFAULT_INPUTS), (v) => `$${Math.round(v)}`);
    const item = plan.sections.flatMap((s) => s.items).find((i) => /^Name who inherits your accounts/.test(i.label));
    expect(item).toBeTruthy();
    expect(item.detail).toMatch(/placeholder names/);
  });
  it('comparisons fold under For the curious on screen', () => {
    expect(read('utils/actionPlan.js')).toMatch(/curious: true/);
    expect(read('components/ActionPlanCard.jsx')).toMatch(/For the curious/);
    expect(read('utils/actionPlan.js')).not.toMatch(/\},, where/);
  });
});
