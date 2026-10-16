// Changelog 130.
//
// Two separate bugs/features, both about the Action Plan telling the truth:
//
// 1. With Auto-Max on, the engine THROWS AWAY inputs.preTaxContribution1 /
//    rothContribution1 / hsaContribution and substitutes the statutory
//    limits, adding an IRA as a backdoor Roth. The Action Plan used to read
//    those (ignored) input fields, so a maxed-out saver was told they were
//    saving a few thousand a year while the projection had them saving
//    nearly fifty. These tests pin the card to the projection's own numbers.
//
// 2. Form SSA-44. The engine now reports irmaaAppealSavings on every year
//    where filing the form would lower the premium, whether or not the
//    appeal toggle is on -- which is what lets the plan tell you the form is
//    worth filing while still showing the (higher) premiums you pay if you
//    never file it.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator.js';
import { buildActionPlan } from '../utils/actionPlan.js';
import { assertKnownInputKeys } from './knownInputKeys.js';

const findSection = (plan, id) => plan.sections.find((s) => s.id === id);
const findItem = (section, needle) =>
  section.items.find((i) => i.label.toLowerCase().includes(needle.toLowerCase()));

// A high earner still working: salary big enough that Auto-Max's limits and
// the manual fields cannot be confused for each other.
const MAXER = assertKnownInputKeys({
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: 1968,
  retireAge1: 62,
  lifeExpectancy1: 90,
  salary1: 400000,
  // A 50% match on deferrals up to the full IRS limit. (This used to read
  // employerMatchPct / employerMatchLimitPct, which are not inputs.)
  employerMatchMode1: 'percent',
  employerMatchRateA1: 50,
  employerMatchCapAPct1: 100,
  preTaxContribution1: 5000,   // deliberately small and deliberately ignored
  rothContribution1: 2000,
  // There is no HSA on/off input: a contribution above $0 (or Auto-Max)
  // is what turns it on.
  hsaContribution: 1000,       // also ignored under 'max'
  autoMaxContribution1: 'max',
});

describe('Action Plan reports what the plan actually contributes (changelog 130)', () => {
  it('describes Auto-Max by mode, and quotes the projection figures rather than the input fields', () => {
    const projection = runProjection(MAXER);
    const first = projection.years[0];
    const plan = buildActionPlan(MAXER, projection);
    const working = findSection(plan, 'working');

    const savings = findItem(working, 'contribute the maximum allowed');
    expect(savings).toBeTruthy();
    // The label names the mode, not a frozen dollar amount, because the
    // limits move every year.
    expect(savings.label).not.toMatch(/\$/);
    // ...but the detail has to carry the real first-year number.
    const actual = (first.preTaxContribution1 || 0) + (first.rothContribution1 || 0);
    expect(actual).toBeGreaterThan(20000);          // a real 401(k) max
    // The detail spells out the Pre-Tax / Roth split the engine chose.
    expect(savings.detail).toContain(`$${Math.round(first.preTaxContribution1).toLocaleString()}/yr Pre-Tax`);
    expect(savings.detail).toContain(`$${Math.round(first.rothContribution1).toLocaleString()}/yr Roth`);
    // And it must NOT be quoting the input boxes the engine discarded.
    expect(savings.detail).not.toContain('$5,000');
    expect(savings.detail).not.toContain('$2,000');
  });

  it('names the employer match, which the card never mentioned at all before', () => {
    const projection = runProjection(MAXER);
    const first = projection.years[0];
    const plan = buildActionPlan(MAXER, projection);
    const match = findItem(findSection(plan, 'working'), 'employer match');

    expect(first.employerMatchAmount).toBeGreaterThan(0);
    expect(match).toBeTruthy();
    expect(match.label).toContain(`$${Math.round(first.employerMatchAmount).toLocaleString()}`);
  });

  it('names the backdoor Roth that Auto-Max adds, and explains the pro-rata catch', () => {
    const projection = runProjection(MAXER);
    const first = projection.years[0];
    const plan = buildActionPlan(MAXER, projection);
    const backdoor = findItem(findSection(plan, 'working'), 'backdoor roth');

    expect(first.backdoorRothContribution).toBeGreaterThan(0);
    expect(backdoor).toBeTruthy();
    expect(backdoor.label).toContain(`$${Math.round(first.backdoorRothContribution).toLocaleString()}`);
    expect(backdoor.detail).toMatch(/pro-rata/i);
  });

  it('reports the Auto-Max HSA amount, not the ignored input', () => {
    const projection = runProjection(MAXER);
    const first = projection.years[0];
    const plan = buildActionPlan(MAXER, projection);
    const hsa = findItem(findSection(plan, 'working'), 'to your HSA');

    expect(first.hsaContribution).toBeGreaterThan(1000);
    expect(hsa.label).toContain(`$${Math.round(first.hsaContribution).toLocaleString()}`);
    expect(hsa.detail).toMatch(/Auto-Max/);
  });

  it('leaves a manually-configured saver described by their own numbers', () => {
    const manual = { ...MAXER, autoMaxContribution1: 'off' };
    const projection = runProjection(manual);
    const plan = buildActionPlan(manual, projection);
    const savings = findItem(findSection(plan, 'working'), 'save ');

    expect(savings.label).toContain('$5,000/yr Pre-Tax');
    expect(savings.label).toContain('$2,000/yr Roth');
    expect(savings.detail).not.toMatch(/Auto-Max/);
    // No backdoor Roth item when the engine isn't making one.
    expect(findItem(findSection(plan, 'working'), 'backdoor roth')).toBeUndefined();
  });
});

// A household that retires straight into Medicare age: the two-year lookback
// then prices the first Medicare years off full salary, which is exactly the
// situation Form SSA-44 exists for.
const SSA44_PLAN = {
  ...DEFAULT_INPUTS,
  spouse2Enabled: false,
  birthYear1: 1961,
  retireAge1: 68,
  lifeExpectancy1: 90,
  salary1: 400000,
  preTaxInit: 1500000,
  rothInit: 300000,
  taxableInit: 800000,
  lifestyleExpense: 90000,
  irmaaLifeChangeAppealEnabled: false,
};

describe('Form SSA-44 (changelog 130)', () => {
  it('reports a saving on the years priced off pre-retirement income', () => {
    const projection = runProjection(SSA44_PLAN);
    const appealYears = projection.years.filter((y) => (y.irmaaAppealSavings || 0) > 0);

    expect(appealYears.length).toBeGreaterThan(0);
    // The lookback is two years, so an appeal can only ever help the event
    // year and the two after it.
    expect(appealYears.length).toBeLessThanOrEqual(3);
    for (const y of appealYears) expect(y.irmaaAppealSavings).toBeGreaterThan(0);
  });

  it('reports the same saving whether or not the appeal toggle is on', () => {
    const off = runProjection(SSA44_PLAN);
    const on = runProjection({ ...SSA44_PLAN, irmaaLifeChangeAppealEnabled: true });
    const sum = (p) => p.years.reduce((s, y) => s + (y.irmaaAppealSavings || 0), 0);

    // The saving is a property of the plan, not of the toggle -- that is what
    // lets the card advertise a form you have not told it you will file.
    expect(sum(on)).toBeCloseTo(sum(off), 2);
    // But the toggle does have to actually change the premiums charged.
    const irmaa = (p) => p.years.reduce((s, y) => s + (y.irmaaCost || y.irmaa || 0), 0);
    expect(irmaa(on)).toBeLessThan(irmaa(off));
  });

  it('adds a one-sentence SSA-44 item to the retirement section, with the years and the total', () => {
    const projection = runProjection(SSA44_PLAN);
    const plan = buildActionPlan(SSA44_PLAN, projection);
    const item = findItem(findSection(plan, 'retirement'), 'SSA-44');

    expect(item).toBeTruthy();
    expect(item.label).toMatch(/Filing Form SSA-44 with Social Security could lower your Medicare premiums/);
    // The official form title, verbatim.
    expect(item.detail).toContain('Medicare Income-Related Monthly Adjustment Amount - Life-Changing Event');
    expect(item.detail).toMatch(/two years earlier/);
    // The other seven qualifying events are named so nobody assumes retiring
    // is the only one.
    for (const ev of ['marriage', 'divorce', 'death of a spouse', 'work reduction',
      'loss of income-producing property', 'loss of pension income', 'employer settlement payment']) {
      expect(item.detail.toLowerCase()).toContain(ev);
    }
    const total = projection.years.reduce((s, y) => s + (y.irmaaAppealSavings || 0), 0);
    expect(item.detail).toContain(`$${Math.round(total).toLocaleString()}`);
  });

  it('rewords, rather than hides, the item when the plan already assumes the appeal', () => {
    const inputs = { ...SSA44_PLAN, irmaaLifeChangeAppealEnabled: true };
    const projection = runProjection(inputs);
    const item = findItem(findSection(buildActionPlan(inputs, projection), 'retirement'), 'SSA-44');

    // Still there: the projected saving evaporates if the form is never
    // actually filed, so this stays an action.
    expect(item).toBeTruthy();
    expect(item.label).toMatch(/already assumes you file it/);
    expect(item.detail).toMatch(/if the form is never filed/);
  });

  it('says nothing about SSA-44 in a plan where an appeal would save nothing', () => {
    // Never worked, no salary to look back at, so no premium to appeal.
    const inputs = {
      ...DEFAULT_INPUTS, spouse2Enabled: false, birthYear1: 1961, retireAge1: 62,
      lifeExpectancy1: 90, salary1: 0, preTaxInit: 200000, rothInit: 0,
      taxableInit: 100000, lifestyleExpense: 40000,
    };
    const projection = runProjection(inputs);
    expect(projection.years.every((y) => (y.irmaaAppealSavings || 0) === 0)).toBe(true);
    expect(findItem(findSection(buildActionPlan(inputs, projection), 'retirement'), 'SSA-44')).toBeUndefined();
  });
});
