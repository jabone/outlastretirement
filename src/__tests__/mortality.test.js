// utils/mortality.js (changelog 248): the survival maths over the SSA
// table. Each expectation is derived from the table's own published
// figures where one exists, and otherwise from a property that must hold.
import { describe, it, expect } from 'vitest';
import {
  survivalCurve, probAliveAt, ageReachedWithProbability, probAnyAlive, sampleDeathAge, horizonOdds, SEX_OPTIONS,
} from '../utils/mortality';
import { PUBLISHED_CHECKPOINTS } from '../config/lifeTable';

describe('survivalCurve / probAliveAt', () => {
  it('starts at 1, never rises, and ends at 0', () => {
    for (const sex of ['male', 'female', 'unstated']) {
      const p = survivalCurve(sex, 60);
      expect(p[0]).toBe(1);
      for (let i = 1; i < p.length; i++) expect(p[i]).toBeLessThanOrEqual(p[i - 1]);
      expect(p[p.length - 1]).toBe(0);
    }
  });

  it('matches the published lives: P(65 reaches 80) = l80 / l65', () => {
    for (const sex of ['male', 'female']) {
      const c = PUBLISHED_CHECKPOINTS[sex];
      expect(probAliveAt(sex, 65, 80)).toBeCloseTo(c[80].lx / c[65].lx, 4);
    }
  });

  it('unstated is the average of the two curves', () => {
    const m = probAliveAt('male', 60, 90), f = probAliveAt('female', 60, 90);
    expect(probAliveAt('unstated', 60, 90)).toBeCloseTo((m + f) / 2, 12);
    expect(f).toBeGreaterThan(m);
  });

  it('is 1 at or before the current age and 0 past the table', () => {
    expect(probAliveAt('male', 60, 60)).toBe(1);
    expect(probAliveAt('male', 60, 55)).toBe(1);
    expect(probAliveAt('male', 60, 125)).toBe(0);
  });
});

describe('ageReachedWithProbability', () => {
  it('is the last age at which survival is still at least the probability', () => {
    const age = ageReachedWithProbability('female', 65, 0.25);
    expect(probAliveAt('female', 65, age)).toBeGreaterThanOrEqual(0.25);
    expect(probAliveAt('female', 65, age + 1)).toBeLessThan(0.25);
  });

  it('orders as it must: half > one in four > one in ten', () => {
    const o = horizonOdds({ sex: 'male', currentAge: 60, planToAge: 90 });
    expect(o.median).toBeLessThan(o.oneInFour);
    expect(o.oneInFour).toBeLessThan(o.oneInTen);
    expect(o.reachPlanTo).toBeCloseTo(probAliveAt('male', 60, 90), 12);
  });
});

describe('probAnyAlive', () => {
  it('is 1 - (1-a)(1-b)', () => {
    expect(probAnyAlive(0.5, 0.5)).toBeCloseTo(0.75, 12);
    expect(probAnyAlive(1, 0)).toBe(1);
    expect(probAnyAlive(0, 0)).toBe(0);
  });
});

describe('sampleDeathAge', () => {
  it('is pure, never before the current age, never past the table', () => {
    expect(sampleDeathAge('male', 60, 0.3)).toBe(sampleDeathAge('male', 60, 0.3));
    expect(sampleDeathAge('male', 60, 0.999999)).toBeGreaterThanOrEqual(60);
    expect(sampleDeathAge('female', 60, 0)).toBeLessThanOrEqual(119);
    expect(sampleDeathAge('female', 118, 0.5)).toBeGreaterThanOrEqual(118);
  });

  it('inverts the survival curve: u = survival(age) gives back that age', () => {
    // The last age alive for a uniform u is the last age whose survival is
    // still above u. So u just under P(alive at 85) must return 85-ish and
    // u just above it must return 84.
    const p85 = probAliveAt('male', 60, 85);
    expect(sampleDeathAge('male', 60, p85 - 1e-9)).toBe(85);
    expect(sampleDeathAge('male', 60, p85 + 1e-9)).toBe(84);
  });

  it('a stratified sweep of u reproduces the table’s survival at 90 within a point', () => {
    let alive90 = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) if (sampleDeathAge('female', 60, (i + 0.5) / n) >= 90) alive90++;
    expect(Math.abs(alive90 / n - probAliveAt('female', 60, 90))).toBeLessThan(0.01);
  });
});

describe('SEX_OPTIONS', () => {
  it('offers exactly the three values sanitizeInputs accepts', () => {
    expect(SEX_OPTIONS.map((o) => o.value).sort()).toEqual(['female', 'male', 'unstated']);
  });
});
