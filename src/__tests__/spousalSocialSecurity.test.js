// Spousal Social Security benefit (changelog 102). Pins the 42 U.S.C.
// 402(b) mechanics: 50% of the worker's PIA less the spouse's own PIA,
// reduced on the spousal schedule for early claiming, payable only once
// the worker has filed, and off by default so existing plans don't move.
import { describe, it, expect } from 'vitest';
import {
  runProjection,
  DEFAULT_INPUTS,
  getSSMultiplier,
  getSpousalSSMultiplier,
  spousalSSTopUp,
} from '../calculator';

// Retired couple, same age, flat everything, only SS as income.
const COUPLE = {
  ...DEFAULT_INPUTS,
  spouse2Enabled: true,
  birthYear1: 1959, birthYear2: 1959, // both 67 in 2026
  planYear: 2026,
  retireAge1: 60, retireAge2: 60,
  lifeExpectancy1: 90, lifeExpectancy2: 90,
  claimingAge1: 66 + 10 / 12, claimingAge2: 66 + 10 / 12, // born 1959: FRA 66y10m (Q-7)
  ss1: 36000, ss2: 6000,
  pension1: 0, pension2: 0, pension1COLA: 0,
  annuityIncome: 0, rentalIncome: 0,
  inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  ssDepletionEnabled: false,
  preTaxInit: 500000, rothInit: 500000, taxableInit: 500000,
  lifestyleExpense: 60000,
  rothConversionStrategy: 'none',
  stateTaxState: 'none',
};

describe('getSpousalSSMultiplier', () => {
  it('is 1.0 at and after FRA (no delayed credits on a spousal benefit)', () => {
    expect(getSpousalSSMultiplier(67)).toBe(1);
    expect(getSpousalSSMultiplier(70)).toBe(1);
  });
  it('reduces 25/36 of 1% per month for 36 months, then 5/12 of 1%', () => {
    expect(getSpousalSSMultiplier(64)).toBeCloseTo(0.75, 10);        // 36 × 25/36% = 25%
    expect(getSpousalSSMultiplier(62)).toBeCloseTo(0.65, 10);        // 25% + 24 × 5/12% = 35%
    expect(getSpousalSSMultiplier(65)).toBeCloseTo(1 - 24 * 25 / 36 / 100, 10);
  });
  it('is steeper than the worker\'s own early-claiming schedule', () => {
    expect(getSpousalSSMultiplier(62)).toBeLessThan(getSSMultiplier(62));
  });
});

describe('spousalSSTopUp', () => {
  it('is zero when the own benefit is already at least half of the other\'s', () => {
    expect(spousalSSTopUp(20000, 36000, 67, 67, 0, 70)).toBe(0);
    expect(spousalSSTopUp(18000, 36000, 67, 67, 0, 70)).toBe(0);
  });
  it('pays the excess at FRA in full', () => {
    expect(spousalSSTopUp(6000, 36000, 67, 67, 0, 67)).toBe(12000);
  });
  it('waits until the worker has filed, then reduces at the age it became payable', () => {
    // Spouse claims own at 62; worker (same age) files at 67 -> top-up
    // starts at 67, unreduced (deemed filing fixes reduction at start age).
    expect(spousalSSTopUp(6000, 36000, 62, 67, 0, 65)).toBe(0);
    expect(spousalSSTopUp(6000, 36000, 62, 67, 0, 67)).toBe(12000);
    // Worker files at 62 too -> top-up starts at 62, 65% of the excess.
    expect(spousalSSTopUp(6000, 36000, 62, 62, 0, 62)).toBeCloseTo(7800, 6);
  });
  it('accounts for an age gap when the worker files', () => {
    // Spouse is 3 years OLDER than the worker; worker files at 67 when the
    // spouse is 70 -> top-up starts at 70, no reduction.
    expect(spousalSSTopUp(6000, 36000, 67, 67, 3, 69)).toBe(0);
    expect(spousalSSTopUp(6000, 36000, 67, 67, 3, 70)).toBe(12000);
    // Spouse is 3 years YOUNGER: worker files at 67 when spouse is 64; the
    // spouse claims own at 64 -> top-up starts at 64, 75% factor.
    expect(spousalSSTopUp(6000, 36000, 64, 67, -3, 64)).toBeCloseTo(9000, 6);
  });
});

describe('runProjection with the spousal toggle', () => {
  it('is unchanged when both toggles are off (default)', () => {
    const y = runProjection(COUPLE).years[0];
    expect(y.ssIncome).toBeCloseTo(42000, 6);
    expect(DEFAULT_INPUTS.ssSpousalEnabled1).toBe(false);
    expect(DEFAULT_INPUTS.ssSpousalEnabled2).toBe(false);
  });
  it('tops the lower earner up to 50% of the higher earner\'s FRA benefit', () => {
    const y = runProjection({ ...COUPLE, ssSpousalEnabled2: true }).years[0];
    expect(y.ssIncome).toBeCloseTo(36000 + 18000, 6);
  });
  it('does nothing for the higher earner\'s toggle', () => {
    const y = runProjection({ ...COUPLE, ssSpousalEnabled1: true }).years[0];
    expect(y.ssIncome).toBeCloseTo(42000, 6);
  });
  it('defers the top-up until the worker files', () => {
    // Spouse 2 claims at 62 (own 70%); Spouse 1 delays to 70. Same ages.
    const p = runProjection({ ...COUPLE, birthYear1: 1964, birthYear2: 1964, claimingAge1: 70, claimingAge2: 62, ssSpousalEnabled2: true });
    const at62 = p.years.find((r) => r.age2 === 62);
    const at69 = p.years.find((r) => r.age2 === 69);
    const at70 = p.years.find((r) => r.age2 === 70);
    expect(at62.ssIncome).toBeCloseTo(6000 * 0.70, 6);
    expect(at69.ssIncome).toBeCloseTo(6000 * 0.70, 6);
    // At 70 both are paid: 36000 × 1.24 + own 4200 + 12000 top-up (unreduced:
    // it first became payable at 70, past FRA).
    expect(at70.ssIncome).toBeCloseTo(36000 * 1.24 + 4200 + 12000, 6);
  });
  it('applies the trust-fund depletion cut to the top-up too', () => {
    const p = runProjection({ ...COUPLE, ssSpousalEnabled2: true, ssDepletionEnabled: true, ssDepletionYear: 2026, ssCutPercent: 20 });
    expect(p.years[0].ssIncome).toBeCloseTo(54000 * 0.8, 6);
  });
  it('drops the top-up at the worker\'s death and pays the survivor the greater own benefit', () => {
    const p = runProjection({ ...COUPLE, ssSpousalEnabled2: true, lifeExpectancy1: 75 });
    const before = p.years.find((r) => r.age1 === 75);
    const after = p.years.find((r) => r.age2 === 76);
    expect(before.ssIncome).toBeCloseTo(54000, 6);
    expect(after.ssIncome).toBeCloseTo(36000, 6);
  });
});
