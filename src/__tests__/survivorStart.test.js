// When a widow or widower starts the survivor benefit (benefits-specialist
// review, 2026-11-02): the engine's survivorStartAge1/2 and the comparison
// in utils/survivorStart.js that runs the plan at each start age.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';
import { survivorStartComparison } from '../utils/survivorStart';

// Ray claimed early at 62 on a $30,000 full benefit and dies at 62; Angie
// is 61 in her first year alone, with a small record of her own.
const ray = {
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, planYear: 2026, stateTaxState: 'none',
  spouse2Enabled: true, spouse1Name: 'Ray', spouse2Name: 'Angie',
  birthYear1: 1964, birthYear2: 1966, retireAge1: 62, retireAge2: 60, salary1: 0, salary2: 0,
  claimingAge1: 62, claimingAge2: 67, ss1: 30000, ss2: 8000, lifeExpectancy1: 90, lifeExpectancy2: 92,
  survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 62,
  preTaxInit: 900000, rothInit: 100000, taxableInit: 100000, lifestyleExpense: 55000,
};
const angieAt = (inputs, age) => runProjection(inputs).years.find((y) => y.age2 === age);

describe('survivor start age in the engine', () => {
  it('as soon as possible (the default) starts in the first year alone', () => {
    expect(DEFAULT_INPUTS.survivorStartAge1).toBe(0);
    expect(DEFAULT_INPUTS.survivorStartAge2).toBe(0);
    const y = angieAt(ray, 61);
    expect(y.spouse1Alive).toBe(false);
    expect(y.survivorBenefit2).toBeGreaterThan(0);
    expect(y.survivorStartedAt2).toBe(61);
  });

  it('a later start age waits, and pays a bigger check once it starts', () => {
    const later = { ...ray, survivorStartAge2: 63 };
    expect(angieAt(later, 61).survivorBenefit2).toBe(0);
    expect(angieAt(later, 62).survivorBenefit2).toBe(0);
    const y63 = angieAt(later, 63);
    expect(y63.survivorStartedAt2).toBe(63);
    const early = angieAt(ray, 63);
    expect(y63.survivorBenefit2).toBeGreaterThan(early.survivorBenefit2 * 1.05);
  });

  it('an age already past at the death starts at once, the same as as soon as possible', () => {
    const past = runProjection({ ...ray, survivorStartAge2: 60 });
    expect(past.endingBalance).toBeCloseTo(runProjection(ray).endingBalance, 2);
  });

  it('a plan with no survivor year is unchanged by the setting', () => {
    const noStress = { ...ray, survivorStressEnabled: false };
    expect(runProjection({ ...noStress, survivorStartAge1: 66, survivorStartAge2: 66 }).endingBalance)
      .toBeCloseTo(runProjection(noStress).endingBalance, 2);
  });
});

describe('survivorStartComparison', () => {
  it('compares each start age up to the widow\'s limit and drops the ages past it', () => {
    const r = survivorStartComparison(ray);
    expect(r.status).toBe('compare');
    expect(r.survivor).toBe(2);
    expect(r.survivorAge).toBe(61);
    expect(r.rows.map((x) => x.effectiveAge)).toEqual([61, 62, 63]);
    expect(r.cappedEarly).toBe(true);
    expect(r.topAge).toBe(63);
    // Each later start pays a bigger check...
    expect(r.rows[1].check).toBeGreaterThan(r.rows[0].check);
    expect(r.rows[2].check).toBeGreaterThan(r.rows[1].check);
    // ...and takes years to make up for the checks skipped.
    expect(r.rows[1].breakEven).toBeGreaterThan(75);
    expect(r.rows[2].breakEven).toBeGreaterThan(r.rows[1].breakEven);
    expect(r.current).toBe(0);
  });

  it('picks the start age that leaves the most when none runs short', () => {
    const r = survivorStartComparison(ray);
    const ends = r.rows.map((x) => x.endBalance);
    expect(r.rows.every((x) => x.shortYears === 0)).toBe(true);
    expect(ends[r.best]).toBe(Math.max(...ends));
  });

  it('marks the plan\'s own choice', () => {
    expect(survivorStartComparison({ ...ray, survivorStartAge2: 62 }).current).toBe(1);
  });

  it('says when waiting would make the money run short', () => {
    const tight = { ...ray, preTaxInit: 150000, rothInit: 0, taxableInit: 0, lifestyleExpense: 30000 };
    const r = survivorStartComparison(tight);
    expect(r.status).toBe('compare');
    expect(r.cannotWait).toBe(true);
    const shortRow = r.rows.find((x) => x.effectiveAge === r.shortFromAge);
    expect(shortRow.shortYears).toBeGreaterThan(0);
    expect(r.rows[r.best].shortYears).toBe(0);
  });

  it('a survivor past full retirement age has nothing to choose', () => {
    const r = survivorStartComparison({ ...ray, survivorStressEnabled: false });
    expect(r.status).toBe('past-fra');
    expect(r.survivorAge).toBeGreaterThanOrEqual(67);
  });

  it('a survivor whose own claimed benefit is larger never uses the survivor benefit', () => {
    const r = survivorStartComparison({ ...ray, survivorStressAge: 64, ss2: 40000, claimingAge2: 62 });
    expect(r.status).toBe('own-larger');
  });

  it('notes when the survivor\'s own benefit takes over later', () => {
    const r = survivorStartComparison({ ...ray, ss2: 40000, claimingAge2: 70 });
    expect(r.status).toBe('compare');
    expect(r.rows[0].ownTakesOverAt).toBe(70);
  });

  it('has nothing to compare in a one-person plan', () => {
    expect(survivorStartComparison({ ...ray, spouse2Enabled: false }).status).toBe('no-spouse');
  });
});
