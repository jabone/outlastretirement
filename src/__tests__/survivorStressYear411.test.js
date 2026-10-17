// Changelog 411: the survivor stress age reads like Life Expectancy -- the
// spouse is alive through the year they reach it, that year is a joint
// return (IRC s 6013(a)(3)), and the survivor files alone from the next.
// Until then the stress path ended the marriage a year earlier than the
// same age entered as Life Expectancy, and filed the death year Single.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS } from '../calculator';

const couple = {
  ...DEFAULT_INPUTS, planYear: 2026, spouse2Enabled: true, filingStatus: 'MFJ',
  birthYear1: 1960, birthYear2: 1962, retireAge1: 65, retireAge2: 65, lifeExpectancy1: 90, lifeExpectancy2: 90,
  claimingAge1: 67, claimingAge2: 67, ss1: 30000, ss2: 20000,
};

describe('the survivor stress age', () => {
  it('matches the same age entered as Life Expectancy, year for year', () => {
    const viaStress = runProjection({ ...couple, survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 75, survivorExpenseDropPct: 0 }).years;
    const viaLe = runProjection({ ...couple, lifeExpectancy1: 75 }).years;
    const s75 = viaStress.find((y) => y.year === 2035), l75 = viaLe.find((y) => y.year === 2035);
    expect(s75.age1).toBe(75); expect(l75.age1).toBe(75);
    expect(s75.householdStatus).toBe('MFJ'); expect(l75.householdStatus).toBe('MFJ');
    const s76 = viaStress.find((y) => y.year === 2036), l76 = viaLe.find((y) => y.year === 2036);
    expect(s76.age1).toBeNull(); expect(l76.age1).toBeNull();
    expect(s76.householdStatus).toBe('Single'); expect(l76.householdStatus).toBe('Single');
    // And the survivor's Social Security is the same under both.
    expect(s76.ssIncome).toBeCloseTo(l76.ssIncome, 2);
  });
  it('the year of death is a joint return with both incomes, the next year the survivor alone', () => {
    const years = runProjection({ ...couple, survivorStressEnabled: true, survivorStressSpouse: 2, survivorStressAge: 70, survivorExpenseDropPct: 0 }).years;
    const death = years.find((y) => y.age2 === 70);
    const after = years.find((y) => y.year === death.year + 1);
    expect(death.householdStatus).toBe('MFJ');
    expect(death.age1).toBe(72);
    expect(after.age2).toBeNull();
    expect(after.householdStatus).toBe('Single');
    expect(after.ssIncome).toBeLessThan(death.ssIncome);
  });
});
