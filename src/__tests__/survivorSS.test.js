// Survivor Social Security (changelog 265): 42 U.S.C. 402(e)/(f).
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, survivorSSBenefit, expectedLifetimeSS } from '../calculator';
import { assertKnownInputKeys } from './knownInputKeys';

describe('survivorSSBenefit', () => {
  const full = 30000;
  it('71.5% at 60, 100% at the survivor’s FRA, straight line between', () => {
    const at = (claim) => survivorSSBenefit({ deceasedFull: full, deceasedClaimAge: 67, deceasedFra: 67, deceasedDeathAge: 68, survivorFra: 67, survivorClaimAge: claim });
    expect(at(60)).toBeCloseTo(full * 0.715, 6);
    expect(at(67)).toBeCloseTo(full, 6);
    expect(at(70)).toBeCloseTo(full, 6);
    expect(at(63.5)).toBeCloseTo(full * (1 - 0.285 * 42 / 84), 6);
    expect(at(55)).toBeCloseTo(full * 0.715, 6); // never below the age-60 floor
  });

  it('carries the deceased’s delayed credits: claimed at 70, or died at 69 before claiming', () => {
    const claimed70 = survivorSSBenefit({ deceasedFull: full, deceasedClaimAge: 70, deceasedFra: 67, deceasedDeathAge: 75, survivorFra: 67, survivorClaimAge: 67 });
    expect(claimed70).toBeCloseTo(full * 1.24, 6);
    const died69 = survivorSSBenefit({ deceasedFull: full, deceasedClaimAge: 70, deceasedFra: 67, deceasedDeathAge: 69, survivorFra: 67, survivorClaimAge: 67 });
    expect(died69).toBeCloseTo(full * 1.16, 6);
    const died75Unclaimed = survivorSSBenefit({ deceasedFull: full, deceasedClaimAge: 80, deceasedFra: 67, deceasedDeathAge: 75, survivorFra: 67, survivorClaimAge: 67 });
    expect(died75Unclaimed).toBeCloseTo(full * 1.24, 6); // credits stop at 70
  });

  it('RIB-LIM: an early claimer’s survivor gets the larger of the reduced benefit and 82.5% of PIA, capped by the survivor’s own age factor', () => {
    const args = { deceasedFull: full, deceasedClaimAge: 62, deceasedFra: 67, deceasedDeathAge: 70, survivorFra: 67 };
    expect(survivorSSBenefit({ ...args, survivorClaimAge: 67 })).toBeCloseTo(full * 0.825, 6);
    // At 60 the survivor's own factor (71.5%) is below the 82.5% cap.
    expect(survivorSSBenefit({ ...args, survivorClaimAge: 60 })).toBeCloseTo(full * 0.715, 6);
    // Claimed at 65 (86.67%) beats the 82.5% floor.
    expect(survivorSSBenefit({ ...args, deceasedClaimAge: 65, survivorClaimAge: 67 })).toBeCloseTo(full * (1 - 24 * 5 / 9 / 100), 6);
    // Died at 63 before a planned claim at 67: no early claim, so no RIB-LIM.
    expect(survivorSSBenefit({ ...args, deceasedClaimAge: 67, deceasedDeathAge: 63, survivorClaimAge: 67 })).toBeCloseTo(full, 6);
  });
});

describe('runProjection survivor branch', () => {
  const couple = {
    ...DEFAULT_INPUTS, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1964, birthYear2: 1966,
    retireAge1: 62, retireAge2: 60, salary1: 0, salary2: 0, ss1: 30000, ss2: 12000, claimingAge1: 70, claimingAge2: 67,
    lifeExpectancy1: 66, lifeExpectancy2: 95, pension1: 0, ssCOLA: 0, ssDepletionEnabled: false,
    preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0,
  };
  assertKnownInputKeys(couple);
  it('the survivor benefit starts in the first alone year at 60+ and its reduction is fixed there; own takes over when larger', () => {
    const p = runProjection(couple);
    // Spouse 1 dies after 66 without claiming (planned 70): base = 30,000 x 1.0 (died before FRA).
    const first = p.years.find((y) => !y.spouse1Alive);
    expect(first.age2).toBe(65);
    const factor = 1 - 0.285 * 24 / 84; // 65 with FRA 67
    expect(first.ssIncome).toBeCloseTo(30000 * factor, 0);
    // Still the same survivor amount at 66 (reduction fixed), and at 67 own ($12,000) is smaller.
    expect(p.years.find((y) => y.age2 === 66).ssIncome).toBeCloseTo(30000 * factor, 0);
    expect(p.years.find((y) => y.age2 === 67).ssIncome).toBeCloseTo(30000 * factor, 0);
  });

  it('a survivor under 60 draws nothing on the record until 60', () => {
    const p = runProjection({ ...couple, birthYear2: 1972, lifeExpectancy1: 66 });
    const first = p.years.find((y) => !y.spouse1Alive);
    expect(first.age2).toBe(59);
    expect(first.ssIncome).toBe(0);
    expect(p.years.find((y) => y.age2 === 60).ssIncome).toBeCloseTo(30000 * 0.715, 0);
  });

  it('the old 62-and-no-reduction rule is gone: a 62-year-old survivor gets 78.6%, not 100%, of the deceased’s benefit', () => {
    const p = runProjection({ ...couple, birthYear2: 1969, lifeExpectancy1: 66 });
    const first = p.years.find((y) => !y.spouse1Alive);
    expect(first.age2).toBe(62);
    expect(first.ssIncome).toBeCloseTo(30000 * (1 - 0.285 * 60 / 84), 0);
  });

  it('expectedLifetimeSS still runs and prices the survivor states with the new rule', () => {
    const e = expectedLifetimeSS(couple, runProjection(couple));
    expect(Number.isFinite(e)).toBe(true);
    expect(e).toBeGreaterThan(0);
  });
});
