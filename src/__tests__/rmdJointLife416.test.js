// Changelog 416: an owner whose sole-beneficiary spouse is more than 10
// years younger takes RMDs on Publication 590-B Table II (Joint and Last
// Survivor), not Table III (Uniform Lifetime).
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, getRMDDivisor } from '../calculator';
import { JOINT_LIFE_TABLE_II, JOINT_LIFE_TABLE_II_SPOUSE_MIN_AGE } from '../config/rmdJointLifeTable';

const START = DEFAULT_INPUTS.planYear;

describe('the table', () => {
  it('covers owner ages 73-120, spouse ages 20 up to owner - 11', () => {
    expect(JOINT_LIFE_TABLE_II_SPOUSE_MIN_AGE).toBe(20);
    for (let o = 73; o <= 120; o += 1) {
      expect(JOINT_LIFE_TABLE_II[o], `owner ${o}`).toHaveLength(o - 11 - 20 + 1);
      // Monotone: a younger spouse stretches, an older one shortens.
      const row = JOINT_LIFE_TABLE_II[o];
      for (let i = 1; i < row.length; i += 1) expect(row[i]).toBeLessThanOrEqual(row[i - 1]);
    }
    expect(JOINT_LIFE_TABLE_II[72]).toBeUndefined();
  });

  it('matches the publication at spot-checked cells', () => {
    const cell = (o, s) => JOINT_LIFE_TABLE_II[o][s - 20];
    expect(cell(73, 60)).toBe(28.6);
    expect(cell(74, 60)).toBe(28.4);
    expect(cell(75, 60)).toBe(28.3);
    expect(cell(73, 51)).toBe(36.0);
    expect(cell(73, 45)).toBe(41.4);
    expect(cell(73, 20)).toBe(65.1);
    expect(cell(80, 69)).toBe(20.9);
    expect(cell(120, 109)).toBe(2.0);
  });

  it('continues the Uniform Lifetime table: a spouse exactly 11 years younger stretches it only a little', () => {
    // Table III is the joint table at a 10-year gap; the 11-year column sits
    // just above it, never below.
    for (let o = 73; o <= 119; o += 1) {
      const eleven = JOINT_LIFE_TABLE_II[o][o - 11 - 20];
      expect(eleven).toBeGreaterThanOrEqual(getRMDDivisor(o));
      expect(eleven - getRMDDivisor(o)).toBeLessThan(1.0);
    }
  });
});

describe('getRMDDivisor', () => {
  it('reads Table II only for a spouse more than 10 years younger', () => {
    expect(getRMDDivisor(75)).toBe(24.6);
    expect(getRMDDivisor(75, null)).toBe(24.6);
    expect(getRMDDivisor(75, 65)).toBe(24.6);   // exactly 10 years: Table III
    expect(getRMDDivisor(75, 64)).toBe(25.3);   // 11 years: Table II
    expect(getRMDDivisor(75, 60)).toBe(28.3);
    expect(getRMDDivisor(75, 80)).toBe(24.6);   // older spouse
    expect(getRMDDivisor(72, 50)).toBe(0);      // no RMD yet
    expect(getRMDDivisor(73, 10)).toBe(JOINT_LIFE_TABLE_II[73][0]); // under 20 reads as 20
    expect(getRMDDivisor(125, 60)).toBe(JOINT_LIFE_TABLE_II[120][40]); // past the table's end
  });
});

describe('in a plan', () => {
  // Spouse 1 is 74 and owns a $1m pooled Pre-Tax balance; Spouse 2 is 60.
  const couple = {
    ...DEFAULT_INPUTS, birthYear1: START - 74, birthYear2: START - 60, spouse2Enabled: true, filingStatus: 'MFJ',
    retireAge1: 65, retireAge2: 55, salary1: 0, salary2: 0, preTaxInit: 1000000, taxableInit: 500000, rothInit: 0,
    lifeExpectancy1: 90, lifeExpectancy2: 95,
  };

  it('is on by default and uses the joint-life divisor year by year', () => {
    expect(DEFAULT_INPUTS.rmdSpouseSoleBeneficiary).toBe(true);
    const years = runProjection(couple).years;
    expect(years[0].rmdJointLifeTable).toBe(true);
    expect(years[0].rmdDivisor).toBe(28.4);
    expect(years[0].rmdAmount).toBeCloseTo(1000000 / 28.4, 0);
    expect(years[1].rmdDivisor).toBe(27.5); // 75 / 61
  });

  it('lowers the RMD against the uniform table, and the switch restores it', () => {
    const joint = runProjection(couple).years[0];
    const uniform = runProjection({ ...couple, rmdSpouseSoleBeneficiary: false }).years[0];
    expect(uniform.rmdJointLifeTable).toBe(false);
    expect(uniform.rmdDivisor).toBe(25.5);
    expect(uniform.rmdAmount).toBeCloseTo(1000000 / 25.5, 0);
    expect(joint.rmdAmount).toBeLessThan(uniform.rmdAmount);
    expect(joint.federalTax).toBeLessThan(uniform.federalTax);
  });

  it('falls back to the uniform table within 10 years, for an older spouse, and once Spouse 1 has died', () => {
    const close = runProjection({ ...couple, birthYear2: START - 66 }).years[0];
    expect(close.rmdJointLifeTable).toBe(false);
    expect(close.rmdDivisor).toBe(25.5);
    const older = runProjection({ ...couple, birthYear2: START - 80 }).years[0];
    expect(older.rmdJointLifeTable).toBe(false);
    // Spouse 1 dies at 80; the 66-year-old survivor rolls the IRA over and
    // takes RMDs on her own age and the uniform table from 75 (born 1966).
    const widow = runProjection({ ...couple, lifeExpectancy1: 80 }).years;
    const afterDeath = widow.find((y) => y.age1 === null && y.age2 === 75);
    expect(afterDeath.rmdJointLifeTable).toBe(false);
    expect(afterDeath.rmdDivisor).toBe(24.6);
    expect(widow.find((y) => y.age1 === null && y.age2 === 73).rmdDivisor).toBe(0);
    const beforeDeath = widow.find((y) => y.age1 === 80);
    expect(beforeDeath.rmdJointLifeTable).toBe(true);
  });

  it('leaves a single filer and a plan with no RMD yet alone', () => {
    const single = runProjection({ ...couple, spouse2Enabled: false }).years[0];
    expect(single.rmdJointLifeTable).toBe(false);
    expect(single.rmdDivisor).toBe(25.5);
    const young = runProjection({ ...couple, birthYear1: START - 70 }).years[0];
    expect(young.rmdDivisor).toBe(0);
    expect(young.rmdJointLifeTable).toBe(false);
  });
});
