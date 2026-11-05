// What's New 499: a survivor with a dependent child files as a Qualifying
// Surviving Spouse -- joint brackets and standard deduction -- for the two
// years after the year of death.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { REFERENCE_INPUTS } from './referenceHousehold';

const START = DEFAULT_INPUTS.planYear;
const couple = (over = {}) => ({
  ...DEFAULT_INPUTS, ...REFERENCE_INPUTS, stateTaxState: 'CA',
  spouse2Enabled: true, filingStatus: 'MFJ',
  birthYear1: START - 45, retireAge1: 60, lifeExpectancy1: 90, salary1: 150000,
  birthYear2: START - 45, retireAge2: 60, lifeExpectancy2: 92, salary2: 120000,
  survivorStressEnabled: true, survivorStressSpouse: 1, survivorStressAge: 46,
  ...over,
});

describe('Qualifying Surviving Spouse', () => {
  const withChild = runProjection(couple({ dependentChildLastYear: START + 15 }));
  const none = runProjection(couple());
  const alone = (p) => p.years.filter((y) => !y.spouse1Alive && y.spouse2Alive);

  it('has no dependent child by default', () => {
    expect(DEFAULT_INPUTS.dependentChildLastYear).toBe('');
    expect(none.years.every((y) => !y.qualifyingSurvivingSpouse)).toBe(true);
  });

  it('gives the two years after the year of death joint brackets, federal only', () => {
    const [y1, y2, y3] = alone(withChild);
    expect([y1.qualifyingSurvivingSpouse, y2.qualifyingSurvivingSpouse, y3.qualifyingSurvivingSpouse]).toEqual([true, true, false]);
    expect(y1.householdStatus).toBe('Single');
    const same = (y) => none.years.find((r) => r.year === y.year);
    expect(y1.federalTax).toBeLessThan(same(y1).federalTax - 3000);
    expect(y2.federalTax).toBeLessThan(same(y2).federalTax - 3000);
    // The state return stays Single.
    expect(y1.stateTax).toBeCloseTo(same(y1).stateTax, -2);
  });

  it('needs the child to be a dependent that year', () => {
    const p = runProjection(couple({ dependentChildLastYear: START + 2 }));
    const [y1, y2] = alone(p);
    expect(y1.year).toBe(START + 2);
    expect(y1.qualifyingSurvivingSpouse).toBe(true);
    expect(y2.qualifyingSurvivingSpouse).toBe(false);
  });
});
