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

describe('the survivors’ full retirement age (review panel, 2026-11-04)', () => {
  it('runs two birth years behind the retirement table', async () => {
    const { getSurvivorFullRetirementAge, getFullRetirementAge } = await import('../calculator');
    expect(getSurvivorFullRetirementAge(1956)).toBe(66);
    expect(getSurvivorFullRetirementAge(1957)).toBeCloseTo(66 + 2 / 12, 9);
    expect(getSurvivorFullRetirementAge(1959)).toBeCloseTo(66.5, 9);
    expect(getSurvivorFullRetirementAge(1961)).toBeCloseTo(66 + 10 / 12, 9);
    expect(getSurvivorFullRetirementAge(1962)).toBe(67);
    expect(getSurvivorFullRetirementAge(1944)).toBeCloseTo(65 + 10 / 12, 9);
    // Earlier than the retirement age for 1957-1961.
    expect(getSurvivorFullRetirementAge(1959)).toBeLessThan(getFullRetirementAge(1959));
  });
});

describe('one benefit first, then the other', () => {
  it('compares starting the own benefit early and switching to the survivor benefit at full retirement age', () => {
    // Angie has a real record of her own here, claimed (in the plan) at 67.
    const r = survivorStartComparison({ ...ray, ss2: 22000 });
    expect(r.status).toBe('compare');
    const own = r.strategies.find((s) => s.id === 'ownFirst');
    expect(own.ownAge).toBe(62);
    // Ray claimed early, so the widow's limit stops the check growing at
    // r.topAge: the switch comes then, not at full retirement age.
    expect(own.survivorStartAge).toBe(r.topAge);
    expect(r.topAge).toBeLessThan(67);
    for (const s of r.strategies) expect(Number.isFinite(s.endBalance)).toBe(true);
    // A better one, when there is one, beats the best single start age.
    if (r.betterStrategy) expect(r.betterStrategy.endBalance).toBeGreaterThan(r.rows[r.best].endBalance);
  });

  it('does not offer the survivor benefit first when the own benefit at 70 never beats it', () => {
    const r = survivorStartComparison(ray);
    expect(r.status).toBe('compare');
    expect(r.strategies.find((s) => s.id === 'survivorFirst')).toBeUndefined();
  });

  it('past full retirement age, still offers the survivor benefit now and the own benefit at 70', () => {
    const r = survivorStartComparison({ ...ray, birthYear1: 1960, birthYear2: 1960, ss1: 26000, ss2: 25000, claimingAge1: 67, claimingAge2: 69, survivorStressAge: 67, retireAge2: 60 });
    expect(r.status).toBe('past-fra');
    const surv = r.strategies.find((s) => s.id === 'survivorFirst');
    expect(surv).toBeTruthy();
    expect(surv.ownAge).toBe(70);
  });

  it('is not offered once the survivor has already claimed their own benefit', () => {
    const r = survivorStartComparison({ ...ray, ss2: 22000, claimingAge2: 60 });
    if (r.status === 'compare') expect(r.strategies).toEqual([]);
  });
});
