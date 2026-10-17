// Changelog 410: the figures SSA announced on 2026-10-14 for 2027 (COLA
// 3.6%, wage base $192,300, earnings test $25,560 / $67,920) are used for
// 2027; later years index forward from them. A COLA the user set keeps
// governing every year.
import { describe, it, expect } from 'vitest';
import { runProjection, DEFAULT_INPUTS, SS_ANNOUNCED, ssWageBaseFor, ssColaFactorFor, calculateFICATaxes, ssEarningsTestWithholding } from '../calculator';

describe('announced SSA figures', () => {
  it('the wage base is the announced one in 2027 and indexes from it after', () => {
    expect(ssWageBaseFor(2026, 2.5)).toBe(184500);
    expect(ssWageBaseFor(2027, 2.5)).toBe(192300);
    expect(ssWageBaseFor(2028, 2.5)).toBeCloseTo(192300 * 1.025, 6);
    expect(ssWageBaseFor(undefined, 2.5, 1.1)).toBeCloseTo(184500 * 1.1, 6); // no year: the old path
    // $300,000 of wages: SS tax stops at the base; 2027's is $7,800 higher.
    expect(calculateFICATaxes(300000, 0, 'Single', 1, 2027) - calculateFICATaxes(300000, 0, 'Single', 1, 2026)).toBeCloseTo((192300 - 184500) * 0.062, 6);
  });
  it('the COLA factor uses 3.6% for the 2027 step and the plan rate elsewhere', () => {
    expect(ssColaFactorFor(2026, 2026, 2.5)).toBe(1);
    expect(ssColaFactorFor(2026, 2027, 2.5)).toBeCloseTo(1.036, 9);
    expect(ssColaFactorFor(2026, 2028, 2.5)).toBeCloseTo(1.036 * 1.025, 9);
    expect(SS_ANNOUNCED[2027].cola).toBe(3.6);
  });
  it('the earnings test uses the announced amounts in 2027', () => {
    // Under FRA, $40,000 earned: $1 withheld per $2 over the exempt amount.
    const t26 = ssEarningsTestWithholding(40000, 30000, 63, 67, 1, 2026, 2.5);
    const t27 = ssEarningsTestWithholding(40000, 30000, 63, 67, 1, 2027, 2.5);
    expect(t26.withheld).toBeCloseTo((40000 - 24480) / 2, 6);
    expect(t27.withheld).toBeCloseTo((40000 - 25560) / 2, 6);
  });
  it('a plan on the default COLA gets 3.6% for 2027; a plan with its own COLA keeps it', () => {
    const base = { ...DEFAULT_INPUTS, ss1: 30000, ss2: 0, claimingAge1: 62, birthYear1: 1964, retireAge1: 62 };
    const dflt = runProjection(base).years;
    const own = runProjection({ ...base, ssCOLA: 2.5000001 }).years;
    const y27 = dflt.find((y) => y.year === 2027), y26 = dflt.find((y) => y.year === 2026);
    const o27 = own.find((y) => y.year === 2027), o26 = own.find((y) => y.year === 2026);
    expect(y27.ssIncome / y26.ssIncome).toBeCloseTo(1.036, 6);
    expect(o27.ssIncome / o26.ssIncome).toBeCloseTo(1.025, 5);
  });
});
