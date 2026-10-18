// The four smaller engine points left from the 2026-09-29 review.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, heirInheritanceContext } from '../calculator';
import { scenarioNeedsOdds, scenarioOddsCurrent, ODDS_VERSION } from '../utils/scenarioOdds';

const START = DEFAULT_INPUTS.planYear;

describe('after Spouse 1 dies, the survivor\'s age governs the accounts', () => {
  // Spouse 1 is 70 and dies at 70; Spouse 2 is 50. A Pre-Tax life event at
  // the survivor's age 52 is an early distribution: the survivor owns the
  // rolled-over account, and is under 59 1/2.
  const base = {
    ...DEFAULT_INPUTS,
    planYear: START,
    spouse2Enabled: true,
    filingStatus: 'MFJ',
    birthYear1: START - 70, lifeExpectancy1: 70, retireAge1: 60,
    birthYear2: START - 50, lifeExpectancy2: 90, retireAge2: 45,
    salary1: 0, salary2: 0,
    preTaxInit: 1000000, rothInit: 0, taxableInit: 0,
    preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0,
    // The survivor is under 65: the computed marketplace credit (changelog
    // 415) would differ between the two ages under test, so it is off.
    acaCreditSource: 'manual',
    milestones: [{ id: 1, name: 'Roof', type: 'outflow', amount: 50000, startAge: 72, endAge: 72, sourceAccount: 'preTax' }],
  };
  it('charges the 10% penalty on a survivor\'s early Pre-Tax life event', () => {
    // Same household with a survivor aged 62 at the event: identical income,
    // no penalty. The only difference in federal tax is the 10%.
    const older = { ...base, birthYear2: START - 60 };
    const young = runProjection(base).years.find((y) => y.year === START + 2);
    const old = runProjection(older).years.find((y) => y.year === START + 2);
    expect(young.age1 ?? null).toBeNull();
    const youngExtra = young.federalTax - runProjection({ ...base, milestones: [] }).years.find((y) => y.year === START + 2).federalTax;
    const oldExtra = old.federalTax - runProjection({ ...older, milestones: [] }).years.find((y) => y.year === START + 2).federalTax;
    // At least the 10% on the event itself (the draw that pays its tax is
    // also an early distribution, so the difference is somewhat more).
    expect(youngExtra - oldExtra).toBeGreaterThanOrEqual(50000 * 0.10);
  });
});

describe('inherited IRA past the required beginning date', () => {
  it('a death in the RMD-age year itself is before the required beginning date', () => {
    const planYear = START;
    const ctx = heirInheritanceContext({ ...DEFAULT_INPUTS, planYear, birthYear1: planYear - 71, lifeExpectancy1: 73, spouse2Enabled: false }, { age: 40 });
    expect(ctx.decedentDeathAge).toBe(73);
    expect(ctx.decedentPastRbd).toBe(false);
    const ctx2 = heirInheritanceContext({ ...DEFAULT_INPUTS, planYear, birthYear1: planYear - 71, lifeExpectancy1: 74, spouse2Enabled: false }, { age: 40 });
    expect(ctx2.decedentPastRbd).toBe(true);
  });
});

describe('a crash is acted on once it has happened', () => {
  const retired = {
    ...DEFAULT_INPUTS,
    birthYear1: START - 66, retireAge1: 65, lifeExpectancy1: 95, spouse2Enabled: false,
    salary1: 0, preTaxInit: 300000, rothInit: 300000, taxableInit: 300000,
    spendingGuardrails: true, stressType: 'crashYear', stressStartYear: START,
    stressCrashReturn: -30, stressCrashInflation: 3,
  };
  it('the first-retirement-year crash cuts spending from the next year, not the crash year', () => {
    const p = runProjection(retired);
    const y0 = p.years[0];
    const y1 = p.years[1];
    const plain = runProjection({ ...retired, spendingGuardrails: false });
    expect(y0.lifestyleExpenses).toBeCloseTo(plain.years[0].lifestyleExpenses, 2);
    expect(y1.lifestyleExpenses).toBeLessThan(plain.years[1].lifestyleExpenses);
  });
});

describe('saved scenario odds carry the release they were computed under', () => {
  it('current, earlier and missing odds', () => {
    const sc = (metrics) => ({ id: 'a', inputs: DEFAULT_INPUTS, metrics });
    expect(scenarioOddsCurrent(sc({ successProbability: 80, oddsVersion: ODDS_VERSION }))).toBe(true);
    expect(scenarioNeedsOdds(sc({ successProbability: 80, oddsVersion: ODDS_VERSION - 1 }))).toBe(true);
    expect(scenarioNeedsOdds(sc({ successProbability: 80 }))).toBe(true);
    expect(scenarioNeedsOdds(sc({ successProbability: null, oddsVersion: ODDS_VERSION }))).toBe(true);
    expect(scenarioNeedsOdds(sc({ successProbability: 80, oddsVersion: ODDS_VERSION }))).toBe(false);
  });
});
