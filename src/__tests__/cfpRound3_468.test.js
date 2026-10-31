// Planner's review, round 3 (changelog 468): a couple's horizon odds and
// the Plan Feedback finding on them, the long-term care default, the
// standing trust-fund line, and the Action Plan read as assumptions.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { coupleHorizonOdds, probAliveAt, probAnyAlive } from '../utils/mortality';
import { getPlanFeedback } from '../utils/planFeedback';
import { trustFundLine, countsOnSocialSecurity } from '../utils/trustFundLine';
import { untestedRisks } from '../utils/untestedRisks';
import { buildActionPlan } from '../utils/actionPlan';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';

const couple = { ...DEFAULT_INPUTS, spouse2Enabled: true, sex1: 'male', sex2: 'female', birthYear1: 1980, birthYear2: 1982, lifeExpectancy1: 90, lifeExpectancy2: 90 };

describe('a couple\'s horizon (item 14)', () => {
  it('two coin-flip ages leave a good chance someone is alive when the plan ends', () => {
    const odds = coupleHorizonOdds({ planYear: 2026, ...couple });
    expect(odds.endYear).toBe(2072);
    const p1 = probAliveAt('male', 46, 92);
    const p2 = probAliveAt('female', 44, 90);
    expect(odds.reachEnd).toBeCloseTo(probAnyAlive(p1, p2), 10);
    expect(odds.reachEnd).toBeGreaterThan(0.25);
    // The later years run in order and the odds fall through them.
    expect(odds.half.year).toBeLessThanOrEqual(odds.oneInFour.year);
    expect(odds.oneInFour.year).toBeLessThan(odds.oneInTen.year);
    expect(odds.oneInTen.age1 - odds.oneInTen.age2).toBe(2);
  });
  it('returns null without the figures it needs', () => {
    expect(coupleHorizonOdds({ planYear: 2026, ...couple, birthYear2: '' })).toBeNull();
    expect(coupleHorizonOdds({ planYear: 2026, ...couple, lifeExpectancy1: 40, lifeExpectancy2: 40 })).toBeNull();
  });
  it('Plan Feedback flags a couple at one in four or better, with a fix to the one-in-ten year, and leaves a single plan and the demo households alone', () => {
    const proj = runProjection(couple);
    const card = getPlanFeedback(couple, proj, null, () => 73).find((r) => r.title === 'The Plan May End While One of You Is Alive');
    expect(card).toBeTruthy();
    const odds = coupleHorizonOdds({ planYear: couple.planYear, ...couple });
    expect(card.quickApply.config).toEqual({ lifeExpectancy1: odds.oneInTen.age1, lifeExpectancy2: odds.oneInTen.age2 });
    expect(card.desc).toContain(`${Math.round(odds.reachEnd * 100)}%`);
    // Applying the fix clears the card.
    const fixed = { ...couple, ...card.quickApply.config };
    expect(getPlanFeedback(fixed, runProjection(fixed), null, () => 73).some((r) => r.title === card.title)).toBe(false);
    // Sampled lifespans answer the question another way.
    const sampled = { ...couple, mcLongevityEnabled: true };
    expect(getPlanFeedback(sampled, runProjection(sampled), null, () => 73).some((r) => r.title === card.title)).toBe(false);
    for (const inputs of [DEFAULT_INPUTS, buildParkersInputs()]) {
      expect(getPlanFeedback(inputs, runProjection(inputs), null, () => 73).some((r) => r.title === card.title)).toBe(false);
    }
    // The Carters (92 and 94, sexes not stated) sit at 28%, so their demo
    // shows the card: a fair example of what it is for.
    const carters = buildDemoInputs();
    expect(getPlanFeedback(carters, runProjection(carters), null, () => 73).some((r) => r.title === card.title)).toBe(true);
  });
});

describe('long-term care default (item 16)', () => {
  it('is $75,000 a person for a new plan and still off', () => {
    expect(DEFAULT_INPUTS.ltcCost1).toBe(75000);
    expect(DEFAULT_INPUTS.ltcCost2).toBe(75000);
    expect(DEFAULT_INPUTS.ltcActive1).toBe(false);
    expect(DEFAULT_INPUTS.ltcActive2).toBe(false);
  });
});

describe('the trust-fund line (item 17)', () => {
  it('states the depletion case for a plan that counts on Social Security and has the stress off', () => {
    const base = runProjection(DEFAULT_INPUTS);
    const line = trustFundLine(DEFAULT_INPUTS, base);
    expect(line).toBeTruthy();
    expect(line.year).toBe(DEFAULT_INPUTS.ssDepletionYear);
    expect(line.cutPct).toBe(DEFAULT_INPUTS.ssCutPercent);
    expect(line.sentence).toMatch(/^If the Social Security trust fund runs out and benefits are cut 22% from 2032: /);
    expect(line.endingBalance).toBe(runProjection({ ...DEFAULT_INPUTS, ssDepletionEnabled: true }).endingBalance);
    expect(line.endingBalance).toBeLessThan(base.endingBalance);
    if (line.runsShort) expect(line.sentence).toContain(`starting in ${line.firstShortYear}`);
    else expect(line.sentence).toContain('still lasts with average returns');
  });
  it('is absent when the stress is already on, or when no Social Security is expected', () => {
    expect(trustFundLine({ ...DEFAULT_INPUTS, ssDepletionEnabled: true }, null)).toBeNull();
    expect(countsOnSocialSecurity({ ...DEFAULT_INPUTS, ss1: 0 })).toBe(false);
    expect(trustFundLine({ ...DEFAULT_INPUTS, ss1: 0 }, null)).toBeNull();
    expect(countsOnSocialSecurity({ ...DEFAULT_INPUTS, ss1: 0, spouse2Enabled: true, ss2: 12000 })).toBe(true);
  });
  it('a Social Security cut no longer counts as untested, since the line states it', () => {
    expect(untestedRisks(DEFAULT_INPUTS).join(' ')).not.toMatch(/Social Security/);
    expect(untestedRisks({ ...DEFAULT_INPUTS, spouse2Enabled: true })).toContain('a spouse dying early');
  });
});

describe('the Action Plan reads as assumptions (item 25)', () => {
  it('has no imperatives in its working and retirement lines', () => {
    const plan = buildActionPlan(buildDemoInputs(), runProjection(buildDemoInputs()), (v) => `$${Math.round(v)}`);
    const labels = plan.sections.flatMap((s) => s.items.map((i) => i.label));
    for (const l of labels) expect(l, l).not.toMatch(/^(Work until|Claim |Save |Contribute |Keep |Collect |Draw down|Follow )/);
    expect(labels.some((l) => /^Work continues until age/.test(l))).toBe(true);
    expect(labels.some((l) => /^Social Security starts at age/.test(l))).toBe(true);
  });
});
