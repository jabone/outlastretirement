// The first safe year to retire (changelog 284): the earliest year the
// household could stop work and the plan still lasts. Pure over the
// engine; the test drives it with a fake runner so the search itself is
// what is checked, then once with the real engine.
import { describe, it, expect } from 'vitest';
import { firstSafeRetirementYear, retireInYearPatch, plannedRetirementYear } from '../utils/retirementReadiness';
import { DEFAULT_INPUTS, runProjection } from '../calculator';

const START = DEFAULT_INPUTS.planYear;
const couple = { ...DEFAULT_INPUTS, spouse2Enabled: true, birthYear1: START - 55, retireAge1: 62, birthYear2: START - 52, retireAge2: 60 };

describe('retireInYearPatch', () => {
  it('moves both spouses to their age in that year', () => {
    expect(retireInYearPatch(couple, START + 3)).toEqual({ retireAge1: 58, retireAge2: 55 });
  });
  it('leaves someone already retired where they are', () => {
    const one = { ...couple, retireAge2: 50 }; // spouse 2 is 52 and retired
    expect(retireInYearPatch(one, START + 3)).toEqual({ retireAge1: 58, retireAge2: 50 });
  });
  it('single household patches only spouse 1', () => {
    expect(retireInYearPatch({ ...couple, spouse2Enabled: false }, START)).toEqual({ retireAge1: 55 });
  });
});

describe('plannedRetirementYear', () => {
  it('is the year the later spouse stops', () => {
    // spouse 1: 55 -> 62 is START+7; spouse 2: 52 -> 60 is START+8
    expect(plannedRetirementYear(couple)).toBe(START + 8);
    expect(plannedRetirementYear({ ...couple, spouse2Enabled: false })).toBe(START + 7);
  });
  it('never sits before the plan year', () => {
    expect(plannedRetirementYear({ ...couple, retireAge1: 40, retireAge2: 40 })).toBe(START);
  });
});

describe('firstSafeRetirementYear', () => {
  it('returns the first candidate year the runner calls successful, with ages and the gap to the plan', () => {
    const okFrom = START + 4;
    const run = (inputs) => ({ isSuccessful: (inputs.birthYear1 + inputs.retireAge1) >= okFrom });
    const r = firstSafeRetirementYear(couple, { run });
    expect(r.found).toBe(true);
    expect(r.year).toBe(okFrom);
    expect(r.age1).toBe(59);
    expect(r.age2).toBe(56);
    expect(r.today).toBe(false);
    expect(r.plannedYear).toBe(START + 8);
    expect(r.yearsBeforePlan).toBe(4);
    expect(r.runs).toBe(5);
  });
  it('says Today when stopping this year already lasts', () => {
    const r = firstSafeRetirementYear(couple, { run: () => ({ isSuccessful: true }) });
    expect(r.today).toBe(true);
    expect(r.year).toBe(START);
    expect(r.runs).toBe(1);
  });
  it('gives up at the horizon and says how far it looked', () => {
    const r = firstSafeRetirementYear(couple, { run: () => ({ isSuccessful: false }), maxYearsOut: 6 });
    expect(r.found).toBe(false);
    expect(r.year).toBeNull();
    expect(r.searchedTo).toBe(START + 6);
    expect(r.runs).toBe(7);
  });
  it('stops at life expectancy when that comes first', () => {
    const short = { ...couple, lifeExpectancy1: 60 }; // 55 now, last year START+4
    const r = firstSafeRetirementYear(short, { run: () => ({ isSuccessful: false }) });
    expect(r.searchedTo).toBe(START + 4);
  });
  it('with the real engine, agrees with the plan\'s own outcome at the planned year', () => {
    const r = firstSafeRetirementYear(DEFAULT_INPUTS);
    const planned = runProjection(DEFAULT_INPUTS);
    // A plan that succeeds as entered has a first safe year no later than
    // its own retirement year; one that fails has it later, or none.
    expect(r.found && r.year <= r.plannedYear).toBe(planned.isSuccessful);
  });
});
