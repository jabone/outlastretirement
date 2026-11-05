// What's New 500-502: falling death rates, a 30% survivor drop for a new
// plan, and a survivor benefit that can start at a full retirement age with
// months.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, migrateInputs } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
import { ageReachedWithProbability, probAliveAt, mortalityBasis, coupleHorizonOdds } from '../utils/mortality';
import { survivorStartComparison, ageLabel } from '../utils/survivorStart';

describe('falling death rates (500)', () => {
  it('is on for a new plan and off for one saved earlier', () => {
    expect(DEFAULT_INPUTS.mortalityImprovement).toBe(true);
    expect(migrateInputs({ schemaVersion: 4, inputs: { ...DEFAULT_INPUTS, mortalityImprovement: undefined } }).mortalityImprovement).toBe(false);
  });

  it('lengthens the odds a little, more for younger people', () => {
    const on = (by) => ({ birthYear: by, improvement: 0.007 });
    const at65 = probAliveAt('female', 65, 90);
    expect(probAliveAt('female', 65, 90, on(1961))).toBeGreaterThan(at65);
    expect(probAliveAt('female', 65, 90, on(1961))).toBeLessThan(at65 + 0.08);
    const plain = ageReachedWithProbability('male', 65, 0.25);
    expect(ageReachedWithProbability('male', 65, 0.25, on(1961))).toBeGreaterThanOrEqual(plain + 1);
    // A 45-year-old's later years are further from 2023, so gain more.
    const gain = (age, by) => probAliveAt('male', age, 90, on(by)) - probAliveAt('male', age, 90);
    expect(gain(45, 1981)).toBeGreaterThan(gain(65, 1961));
    expect(mortalityBasis({ birthYear1: 1960, mortalityImprovement: false }, 1).improvement).toBe(0);
    const c = { planYear: 2026, sex1: 'male', birthYear1: 1961, lifeExpectancy1: 85, sex2: 'female', birthYear2: 1961, lifeExpectancy2: 88 };
    expect(coupleHorizonOdds({ ...c, improvement: 0.007 }).oneInFour.year).toBeGreaterThanOrEqual(coupleHorizonOdds(c).oneInFour.year);
  });
});

describe('the survivor drop default (501)', () => {
  it('is 30% for a new plan and 20% for one saved earlier', () => {
    expect(DEFAULT_INPUTS.survivorExpenseDropPct).toBe(30);
    expect(migrateInputs({ schemaVersion: 4, inputs: { ...DEFAULT_INPUTS, survivorExpenseDropPct: undefined } }).survivorExpenseDropPct).toBe(20);
  });
});

describe('a survivor start age with months (502)', () => {
  // Angie, born 1961: survivors' full retirement age 66 and 10 months.
  const ray = {
    ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, planYear: 2026, stateTaxState: 'none',
    spouse2Enabled: true, spouse1Name: 'Ray', spouse2Name: 'Angie',
    birthYear1: 1958, birthYear2: 1961, retireAge1: 62, retireAge2: 60, salary1: 0, salary2: 0,
    claimingAge1: 67, claimingAge2: 70, ss1: 36000, ss2: 8000, lifeExpectancy1: 90, lifeExpectancy2: 92,
    survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 68,
    preTaxInit: 900000, rothInit: 100000, taxableInit: 100000, lifestyleExpense: 55000,
  };
  const at = (inputs, age) => runProjection(inputs).years.find((y) => y.age2 === age);

  it('labels ages with months', () => {
    expect(ageLabel(66 + 8 / 12)).toBe('66 and 8 months');
    expect(ageLabel(67)).toBe('67');
    expect(ageLabel(66 + 1 / 12)).toBe('66 and 1 month');
  });

  it('pays the survivor benefit from that month, unreduced', () => {
    const months = { ...ray, survivorStartAge2: 66 + 10 / 12 };
    const y66 = at(months, 66);
    const y67 = at(months, 67);
    const full = at({ ...ray, survivorStartAge2: 67 }, 67);
    expect(y67.survivorBenefit2).toBeCloseTo(full.survivorBenefit2, 0);
    expect(y66.survivorBenefit2).toBeCloseTo(full.survivorBenefit2 / y67.inflFactor * y66.inflFactor * (2 / 12), -2);
    expect(y66.survivorStartedAt2).toBeCloseTo(66 + 10 / 12, 5);
  });

  it('the comparison offers full retirement age to the month', () => {
    const r = survivorStartComparison(ray);
    expect(r.status).toBe('compare');
    const ages = r.rows.map((x) => x.effectiveAge);
    expect(ages.some((a) => Math.abs(a - (66 + 10 / 12)) < 0.01)).toBe(true);
    expect(ages).not.toContain(67);
  });
});

describe('Pennsylvania and death benefits', () => {
  it('leaves a taxed employer survivor benefit off the Pennsylvania return', () => {
    const START = DEFAULT_INPUTS.planYear;
    const c = (state, o = {}) => ({ ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, stateTaxState: state, spouse2Enabled: true, birthYear1: START - 50, retireAge1: 62, salary1: 200000, lifeExpectancy1: 90, birthYear2: START - 50, retireAge2: 62, lifeExpectancy2: 92, survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 50, ...o });
    const b = { id: 'g', whose: 1, kind: 'yearly', amount: 100000, years: 10, whileWorking: true, taxed: true };
    const st = (p) => p.years[2].stateTax;
    const pa = st(runProjection(c('pa', { survivorBenefits: [b] }))) - st(runProjection(c('pa')));
    const il = st(runProjection(c('il', { survivorBenefits: [b] }))) - st(runProjection(c('il')));
    expect(il).toBeGreaterThan(3000);
    expect(Math.abs(pa)).toBeLessThan(800);
  });
});
