// Planner's review, round 5 (changelog 470): the survivor spending drop in
// the plan itself, the Monte Carlo margin line, the privacy policy's EU
// and UK section, and the Guide's problem-report recipe.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INPUTS, runProjection, migrateInputs } from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';
import { REFERENCE_INPUTS } from './referenceHousehold';

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('spending drops once one spouse has reached their life expectancy (changelog 470)', () => {
  const couple = { ...DEFAULT_INPUTS, spouse2Enabled: true, lifeExpectancy1: 85, lifeExpectancy2: 90 };
  const yearOfAge1 = (p, age) => p.years.find((y) => y.year === couple.planYear + age - (couple.planYear - couple.birthYear1));
  it('a new plan has the switch on and cuts lifestyle spending by the stress test share from the first alone year', () => {
    expect(DEFAULT_INPUTS.survivorExpenseDropInPlan).toBe(true);
    const on = runProjection(couple);
    const off = runProjection({ ...couple, survivorExpenseDropInPlan: false });
    expect(yearOfAge1(on, 85).lifestyleExpenses).toBeCloseTo(yearOfAge1(off, 85).lifestyleExpenses, 6);
    const ratio = yearOfAge1(on, 86).lifestyleExpenses / yearOfAge1(off, 86).lifestyleExpenses;
    expect(ratio).toBeCloseTo(1 - DEFAULT_INPUTS.survivorExpenseDropPct / 100, 6);
    expect(yearOfAge1(on, 86).householdStatus || yearOfAge1(on, 86).filingStatusThisYear || 'Single').toMatch(/Single/i);
  });
  it('a single person, and a couple with the switch off, are unchanged; a saved plan keeps the full budget', () => {
    const single = runProjection(DEFAULT_INPUTS);
    expect(single.endingBalance).toBe(runProjection({ ...DEFAULT_INPUTS, survivorExpenseDropInPlan: false }).endingBalance);
    const saved = { ...REFERENCE_INPUTS };
    delete saved.survivorExpenseDropInPlan;
    expect(migrateInputs({ schemaVersion: 4, inputs: saved }).survivorExpenseDropInPlan).toBe(false);
    for (const inputs of [buildDemoInputs(), buildParkersInputs()]) expect(inputs.survivorExpenseDropInPlan).toBe(false);
  });
});

describe('the pages and the Guide (changelog 470)', () => {
  it('the privacy policy has the EU and UK section and a moved effective date', () => {
    const p = read('public/privacy.html');
    expect(p).toMatch(/<h2 id="eu-uk">If You Are in the EU, the UK or Switzerland<\/h2>/);
    expect(p).toMatch(/OutlastRetirement LLC, a company in Texas, United States, is the controller/);
    expect(p).toMatch(/Effective Date: October 31, 2026/);
    expect(p).toMatch(/Update, October 31, 2026: Added "If You Are in the EU, the UK or Switzerland"/);
  });
  it('the accessibility page carries this review date', () => {
    expect(read('public/accessibility.html')).toMatch(/Last reviewed: October 31, 2026/);
  });
  it('the Guide tells a reader what a problem report needs', () => {
    const g = read('src/components/tabs/GuideTab.jsx');
    expect(g).toMatch(/title="Found a problem\?"/);
    for (const item of ['The version.', 'Where.', 'What you expected instead,', 'How to get there.', 'Your browser and device,']) expect(g).toContain(item);
  });
  it('the Monte Carlo results carry a margin line', () => {
    const r = read('src/components/tabs/RiskTab.jsx');
    expect(r).toMatch(/data-testid="mc-margin"/);
    expect(r).toMatch(/2 \* Math\.sqrt\(p \* \(1 - p\) \/ n\)/);
  });
});
