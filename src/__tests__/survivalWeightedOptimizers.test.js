// Changelog 255 -- the SS claiming grid's survival-weighted lifetime
// benefit, and Die with Zero at three longevity odds.
//
// Mutations watched go red: survival probabilities ignored (formula test
// and 'differs from the plain total'); sex ignored ('a woman expects
// more'); the extended-horizon run replaced by the planned one ('sees past
// the planned horizon'); levels solved at the planned age instead of the
// table's ('longer horizon, lower spending' collapses to equal).
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS, runProjection, sanitizeInputs, expectedLifetimeSS, getSSClaimingHeatmap, dieWithZeroByLongevity,
  findDieWithZeroSpending, DWZ_LONGEVITY_LEVELS,
} from '../calculator';
import { survivalCurve } from '../utils/mortality';
import { LIFE_TABLE_MAX_AGE } from '../config/lifeTable';

const USED_KEYS = ['retireAge1', 'salary1', 'sex1', 'sex2', 'spouse2Enabled', 'lifeExpectancy1', 'lifeExpectancy2', 'claimingAge1', 'claimingAge2', 'ss1', 'ss2', 'birthYear1', 'birthYear2', 'planYear', 'ssSpousalEnabled1', 'ssSpousalEnabled2', 'partTimeIncome1'];

describe('vacuity guard', () => {
  it('every input key this file sets exists in DEFAULT_INPUTS', () => {
    expect(USED_KEYS.filter((k) => !(k in DEFAULT_INPUTS))).toEqual([]);
  });
});

describe('row fields ssIfBoth / ssIfOnly1 / ssIfOnly2', () => {
  it('match ssIncome in a year both are alive, and the survivor amount after a death', () => {
    const plan = { ...DEFAULT_INPUTS, spouse2Enabled: true, lifeExpectancy1: 80, lifeExpectancy2: 90, ss1: 30000, ss2: 20000, claimingAge1: 67, claimingAge2: 67, partTimeIncome1: 0 };
    const proj = runProjection(plan);
    const both = proj.years.filter((y) => y.age1 >= 68 && y.age1 <= 79 && y.age2 >= 67 && y.ssIncome > 0);
    expect(both.length).toBeGreaterThan(3);
    for (const y of both) expect(y.ssIfBoth).toBeCloseTo(y.ssIncome, 2);
    // After spouse 1's death at 80 the row carries spouse 2's age only.
    const after = proj.years.filter((y) => y.age2 > 78 && y.ssIncome > 0);
    expect(after.length).toBeGreaterThan(3);
    for (const y of after) expect(y.ssIfOnly2).toBeCloseTo(y.ssIncome, 2);
    // Only-1 is the survivor step-up: the greater of the two.
    for (const y of both) expect(y.ssIfOnly1).toBeCloseTo(Math.max(y.ssIfOnly1, y.ssIfOnly2), 2);
  });

  it('a single person has no both/only-2 amounts, and only-1 is their own benefit', () => {
    const plan = { ...DEFAULT_INPUTS, spouse2Enabled: false, ss1: 30000, claimingAge1: 70, partTimeIncome1: 0 };
    const proj = runProjection(plan);
    const paid = proj.years.filter((y) => y.ssIncome > 0);
    expect(paid.length).toBeGreaterThan(3);
    for (const y of paid) {
      expect(y.ssIfBoth).toBe(0);
      expect(y.ssIfOnly2).toBe(0);
      expect(y.ssIfOnly1).toBeCloseTo(y.ssIncome, 2);
    }
  });
});

describe('expectedLifetimeSS', () => {
  const plan = sanitizeInputs({ ...DEFAULT_INPUTS, spouse2Enabled: true, sex1: 'male', sex2: 'female', ss1: 30000, ss2: 20000, claimingAge1: 67, claimingAge2: 67, partTimeIncome1: 0 });
  const extended = runProjection({ ...plan, lifeExpectancy1: LIFE_TABLE_MAX_AGE, lifeExpectancy2: LIFE_TABLE_MAX_AGE });

  it('is the survival-weighted sum of the three alive-state amounts', () => {
    const p1 = survivalCurve('male', plan.planYear - plan.birthYear1);
    const p2 = survivalCurve('female', plan.planYear - plan.birthYear2);
    let byHand = 0;
    extended.years.forEach((y, k) => {
      const a = p1[k] ?? 0, b = p2[k] ?? 0;
      byHand += a * b * y.ssIfBoth + a * (1 - b) * y.ssIfOnly1 + (1 - a) * b * y.ssIfOnly2;
    });
    expect(expectedLifetimeSS(plan, extended)).toBeCloseTo(byHand, 4);
    expect(byHand).toBeGreaterThan(0);
  });

  it('is below the undiscounted total to the table’s end and depends on sex', () => {
    const undiscounted = extended.years.reduce((t, y) => t + (y.ssIfBoth || 0), 0);
    const e = expectedLifetimeSS(plan, extended);
    expect(e).toBeLessThan(undiscounted);
    const swapped = expectedLifetimeSS({ ...plan, sex1: 'female', sex2: 'male' }, extended);
    expect(swapped).not.toBeCloseTo(e, 0);
  });
});

describe('getSSClaimingHeatmap expectedSS', () => {
  // Retired at 62 so no earnings test confounds the claiming ages.
  const single = { ...DEFAULT_INPUTS, spouse2Enabled: false, sex1: 'female', ss1: 30000, lifeExpectancy1: 78, partTimeIncome1: 0, retireAge1: 62 };
  const grid = getSSClaimingHeatmap(single);

  it('an early claim while still working is not credited with withheld benefits', () => {
    // Working to 65 on a salary: a claim at 62 is withheld by the earnings
    // test and recredited at FRA, so the expected value at 62 must not
    // exceed the expected value at 65 by the three withheld years.
    const working = { ...single, retireAge1: 65, salary1: 120000 };
    const g = getSSClaimingHeatmap(working);
    const at62 = g.find((c) => c.claimingAge1 === 62), at65 = g.find((c) => c.claimingAge1 === 65);
    expect(at62.expectedSS).toBeLessThanOrEqual(at65.expectedSS * 1.02);
  });

  it('every cell carries expectedSS, and it sees past the planned horizon', () => {
    expect(grid.length).toBe(9);
    for (const c of grid) expect(c.expectedSS).toBeGreaterThan(0);
    // Planning to 78 truncates the plain total hard; the expected value
    // counts the years past 78 at their odds, so for a woman claiming at 70
    // it must exceed what a plan ending at 78 can pay.
    const at70 = grid.find((c) => c.claimingAge1 === 70);
    expect(at70.expectedSS).toBeGreaterThan(at70.totalSS);
  });

  it('the survival-weighted winner need not be the fixed-horizon winner', () => {
    const bestTotal = grid.reduce((b, c) => (c.totalSS > b.totalSS ? c : b));
    const bestExpected = grid.reduce((b, c) => (c.expectedSS > b.expectedSS ? c : b));
    // A plan cut off at 78 says claim early; the odds say wait longer.
    expect(bestExpected.claimingAge1).toBeGreaterThan(bestTotal.claimingAge1);
  });
});

describe('dieWithZeroByLongevity', () => {
  const plan = { ...DEFAULT_INPUTS, spouse2Enabled: true, sex1: 'male', sex2: 'female', lifeExpectancy1: 90, lifeExpectancy2: 90 };
  const res = dieWithZeroByLongevity(plan);

  it('returns the three levels in order, each later than the last and cheaper to sustain', () => {
    expect(res.levels.map((l) => l.id)).toEqual(DWZ_LONGEVITY_LEVELS.map((l) => l.id));
    for (let i = 1; i < res.levels.length; i++) {
      expect(res.levels[i].endYear).toBeGreaterThan(res.levels[i - 1].endYear);
      expect(res.levels[i].spending).toBeLessThan(res.levels[i - 1].spending);
    }
  });

  it('the planned figure is the ordinary Die with Zero solve', () => {
    expect(res.planned.spending).toBeCloseTo(findDieWithZeroSpending(plan).dieWithZeroSpending, 6);
  });

  it('each level really is solved at its own horizon', () => {
    const lv = res.levels[1];
    const direct = findDieWithZeroSpending({ ...plan, lifeExpectancy1: lv.age1, lifeExpectancy2: lv.age2 });
    expect(lv.spending).toBeCloseTo(direct.dieWithZeroSpending, 6);
  });
});
