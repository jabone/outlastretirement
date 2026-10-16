// One verdict for the whole app (outside review, 2026-09-28): the
// average-returns projection and the Monte Carlo, stated together, and
// never a made-up success rate while the simulation is still running.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { planVerdict, verdictColor, verdictClass, VERDICT_THRESHOLDS, verdictBand, verdictPct, scenarioVerdict } from '../utils/planVerdict';
import { getPlanFeedback } from '../utils/planFeedback';
import { DEFAULT_INPUTS, runProjection } from '../calculator';

const fresh = (p) => ({ status: 'fresh', successProbability: p, trials: 1000, longevitySampled: false });
const years = [{ year: 2026, shortfall: 0 }, { year: 2050, shortfall: 0 }, { year: 2051, shortfall: 12000 }];

describe('planVerdict', () => {
  it('the reviewer\'s case: lasts on average, 50% of markets -> At risk, not a success', () => {
    const v = planVerdict({ isSuccessful: true, years, mc: fresh(50) });
    expect(v).toEqual({ tone: 'risk', label: 'At risk', detail: 'Lasts with average returns, but only 50% of 1,000 simulated markets last to the end of the plan.' });
  });
  it('bands follow the thresholds', () => {
    expect(planVerdict({ isSuccessful: true, mc: fresh(VERDICT_THRESHOLDS.good) }).label).toBe('On track');
    expect(planVerdict({ isSuccessful: true, mc: fresh(VERDICT_THRESHOLDS.good - 1) }).label).toBe('Mostly on track');
    expect(planVerdict({ isSuccessful: true, mc: fresh(VERDICT_THRESHOLDS.caution) }).tone).toBe('caution');
    expect(planVerdict({ isSuccessful: true, mc: fresh(VERDICT_THRESHOLDS.caution - 1) }).tone).toBe('risk');
  });
  it('a shortfall on average returns is Runs short whatever the Monte Carlo says, with the year', () => {
    const v = planVerdict({ isSuccessful: false, years, mc: fresh(95) });
    expect(v.label).toBe('Runs short');
    expect(v.detail).toBe('Even with average returns, spending is not fully covered starting in 2051. 95% of 1,000 simulated markets last to the end of the plan.');
  });
  it('never shows a percentage before the simulation for this plan is in', () => {
    const pending = planVerdict({ isSuccessful: true, mc: { status: 'stale' }, mcPending: true });
    expect(pending.tone).toBe('pending');
    expect(pending.detail).not.toMatch(/%/);
    const none = planVerdict({ isSuccessful: true, mc: { status: 'none' } });
    expect(none.label).toBe('Lasts on average');
    expect(none.detail).not.toMatch(/%/);
  });
  it('says "as long as you do" when lifespans were sampled', () => {
    expect(planVerdict({ isSuccessful: true, mc: { ...fresh(92), longevitySampled: true } }).detail).toMatch(/last as long as you do\.$/);
  });
  it('maps tones to colors and badge classes', () => {
    expect(verdictColor('good')).toBe('var(--success)');
    expect(verdictColor('pending')).toBe('var(--text-secondary)');
    expect(verdictClass('risk')).toBe('danger');
    expect(verdictClass('neutral')).toBe('neutral');
  });
});

describe('Plan Feedback agrees with the verdict', () => {
  const proj = runProjection(DEFAULT_INPUTS);
  const first = (mc) => getPlanFeedback(DEFAULT_INPUTS, proj, mc, () => 73).find((r) => /Track|Risk|Returns/.test(r.title));
  it('with no Monte Carlo it states the average-returns result, with no percentage', () => {
    const card = first(null);
    expect(card.title).toBe(proj.isSuccessful ? 'Lasts With Average Returns' : 'Shortfall Even With Average Returns');
    expect(card.desc).not.toMatch(/\d+%/);
  });
  it('uses the same bands and names as the badge', () => {
    if (!proj.isSuccessful) return;
    expect(first({ successProbability: 50 }).title).toBe('At Risk in Weak Markets');
    expect(first({ successProbability: 80 }).title).toBe('Mostly On Track');
    expect(first({ successProbability: 95 }).title).toBe('On Track');
  });
  it('a plan that runs short on average returns never gets a reassuring card', () => {
    const shortProj = { ...proj, isSuccessful: false };
    expect(getPlanFeedback(DEFAULT_INPUTS, shortProj, { successProbability: 95 }, () => 73)[0].title).toBe('Shortfall Even With Average Returns');
  });
});

describe('every verdict surface reads the shared verdict', () => {
  const SRC = path.resolve(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
  it('no surface derives its own success/shortfall wording any more', () => {
    for (const f of ['App.jsx', 'components/layout/Sidebar.jsx', 'components/tabs/InterviewTab.jsx', 'components/QuickUpdate.jsx']) {
      const s = read(f);
      expect(s, f).not.toMatch(/PLAN SUCCESSFUL|SHORTFALL DETECTED|'Fully Funded'|'Shortfall Risk'|Shortfall Detected'/);
      expect(s, f).toMatch(/verdict/);
    }
  });
});

// E23: the badge, the Plan Feedback card and the Scenarios table used to band
// the raw rate while printing it rounded, so 89.5-89.9 printed "90%" beside
// "Mostly On Track" on one card and "On track" on the badge.
describe('one threshold and one rounding rule on every surface (0..100 in 0.1 steps)', () => {
  const proj = { ...runProjection(DEFAULT_INPUTS), isSuccessful: true };
  const FEEDBACK_BAND = { 'On Track': 'good', 'Mostly On Track': 'caution', 'At Risk in Weak Markets': 'risk' };
  const LABEL_BAND = { 'On track': 'good', 'Mostly on track': 'caution', 'At risk': 'risk' };
  it('badge, feedback card, scenario status and the printed percentage agree', () => {
    let checked = 0;
    for (let i = 0; i <= 1000; i++) {
      const p = i / 10;
      const shown = verdictPct(p);
      const band = verdictBand(p);
      const expected = shown >= VERDICT_THRESHOLDS.good ? 'good' : shown >= VERDICT_THRESHOLDS.caution ? 'caution' : 'risk';
      expect(band, `p=${p}`).toBe(expected);
      const badge = planVerdict({ isSuccessful: true, years: [], mc: fresh(p) });
      expect(badge.tone, `p=${p}`).toBe(band);
      expect(badge.detail, `p=${p}`).toContain(`${shown}% of`);
      const card = getPlanFeedback(DEFAULT_INPUTS, proj, { successProbability: p }, () => 73).find((r) => r.title in FEEDBACK_BAND);
      expect(FEEDBACK_BAND[card.title], `p=${p}`).toBe(band);
      expect(card.desc, `p=${p}`).toContain(`${shown}% of simulated`);
      const sc = scenarioVerdict({ isSuccessful: true, successProbability: p });
      expect(LABEL_BAND[sc.label], `p=${p}`).toBe(band);
      checked++;
    }
    expect(checked).toBe(1001);
  });
  it('89.5 prints 90% and is On track everywhere', () => {
    expect(planVerdict({ isSuccessful: true, mc: fresh(89.5) }).label).toBe('On track');
    expect(getPlanFeedback(DEFAULT_INPUTS, proj, { successProbability: 89.5 }, () => 73).some((r) => r.title === 'On Track')).toBe(true);
  });
});

// U15: Scenarios' side-by-side Plan Status used its own words and an 80%
// threshold ("On Track" beside a 49% Monte Carlo).
describe('Scenarios side-by-side states the shared verdict', () => {
  it('a 49% scenario that lasts on average reads At risk, not On Track', () => {
    expect(scenarioVerdict({ isSuccessful: true, successProbability: 49 }).label).toBe('At risk');
    expect(scenarioVerdict({ isSuccessful: false, successProbability: 49 }).label).toBe('Runs short');
    expect(scenarioVerdict({ isSuccessful: true, successProbability: null }).label).toBe('Lasts on average');
  });
  it('ScenariosTab has no private wording or 80% threshold', () => {
    const s = fs.readFileSync(path.resolve(__dirname, '../components/tabs/ScenariosTab.jsx'), 'utf8');
    expect(s).not.toMatch(/'On Track'|'Shortfall'|>= 80/);
    expect(s).toMatch(/scenarioVerdict\(/);
  });
});
