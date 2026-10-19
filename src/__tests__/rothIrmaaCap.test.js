// Changelog 250 -- Roth conversions held under an IRMAA tier.
//
// The cap is a ceiling on this year's MAGI in any year whose return will
// price someone's Medicare two years later. Mutations watched go red:
//   - cap applied in every year regardless of Medicare in year+2
//     ('inert when nobody will be on Medicare' fails)
//   - thresholds not moved forward two years ('lands under the year+2
//     threshold' fails, since the ceiling would be 2 years too low... it
//     converts LESS -- so the assertion is on the exact ceiling the row
//     reports)
//   - tier index ignored ('a higher tier allows more' fails)
//   - employer coverage ignored ('deferred Medicare' fails)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS, runProjection, sanitizeInputs, IRMAA_THRESHOLDS_MFJ,
} from '../calculator';

const USED_KEYS = [
  'rothConversionIrmaaCapEnabled', 'rothConversionIrmaaTier', 'rothConversionStrategy', 'rothConversionBracket',
  'rothConversionBuffer', 'rothConversionAmount', 'planYear', 'birthYear1', 'birthYear2', 'retireAge1', 'retireAge2',
  'lifeExpectancy1', 'lifeExpectancy2', 'spouse2Enabled', 'filingStatus', 'preTaxInit', 'taxableInit', 'rothInit',
  'salary1', 'salary2', 'ss1', 'ss2', 'lifestyleExpense', 'taxBracketInflationRate', 'medicareEmployerCoverage1',
  'irmaaFreezeEnabled', 'stateTaxState', 'taxableBasisInit', 'rothConversionDelayUntilRetire', 'claimingAge1', 'claimingAge2',
];

describe('vacuity guard', () => {
  it('every input key this file sets exists in DEFAULT_INPUTS', () => {
    expect(USED_KEYS.filter((k) => !(k in DEFAULT_INPUTS))).toEqual([]);
  });
});

// A retired couple, both 63 in the plan year, so year 1's return prices
// Medicare in year 3 (age 65). Large Pre-Tax, a 32% bracket target, so the
// bracket alone would convert far past the first IRMAA threshold.
const couple = {
  ...DEFAULT_INPUTS,
  acaCliffProtectionEnabled: false, // tests another mechanism; Cliff Protection is on by default since 443
  // Changelog 414 made the brokerage yield's bond share ordinary income;
  // this file is about something else, so the yield stays all-qualified.
  taxableQualifiedDividendFollowsAllocation: false,
  spouse2Enabled: true,
  filingStatus: 'MFJ',
  planYear: 2026, birthYear1: 1963, birthYear2: 1963,
  retireAge1: 60, retireAge2: 60, lifeExpectancy1: 90, lifeExpectancy2: 90,
  // Full basis on the taxable account, so living costs realize no gains
  // and the year's settled IRMAA MAGI is the conversion plus dividends.
  preTaxInit: 3000000, taxableInit: 1500000, taxableBasisInit: 1500000, rothInit: 0,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0,
  lifestyleExpense: 80000,
  rothConversionStrategy: 'maxBracket', rothConversionBracket: 0.32, rothConversionBuffer: 1000,
  taxBracketInflationRate: 2.5,
  stateTaxState: 'tx',
};

describe('IRMAA tier cap on Roth conversions', () => {
  it('is off by default and changes nothing when off', () => {
    expect(DEFAULT_INPUTS.rothConversionIrmaaCapEnabled).toBe(false);
    const a = runProjection(couple);
    const b = runProjection({ ...couple, rothConversionIrmaaTier: 3 });
    expect(b.years[0].convertAmount).toBe(a.years[0].convertAmount);
    expect(a.years[0].irmaaCappedConversion).toBe(0);
    expect(a.years[0].irmaaCapCeiling).toBe(0);
  });

  it('the uncapped plan really does convert past the first threshold', () => {
    const row = runProjection(couple).years[0];
    expect(row.convertAmount).toBeGreaterThan(IRMAA_THRESHOLDS_MFJ[0] * 1.2);
  });

  it('on, year 1 lands under the year-3 first threshold, and reports the ceiling it used', () => {
    const on = runProjection({ ...couple, rothConversionIrmaaCapEnabled: true, rothConversionIrmaaTier: 0 });
    const row = on.years[0];
    // Thresholds two years on: 2026 table indexed two years, minus buffer.
    const expectedCeiling = IRMAA_THRESHOLDS_MFJ[0] * Math.pow(1.025, 2) - 1000;
    expect(row.irmaaCapCeiling).toBeCloseTo(expectedCeiling, 4);
    expect(row.irmaaCappedConversion).toBeGreaterThan(0);
    // The MAGI the cap could see (ordinary + SS + dividends + conversion)
    // is at the ceiling to within the bisection's tolerance.
    const seen = row.convertAmount + row.taxableDividends + (row.ordinaryDividends || 0);
    expect(seen).toBeLessThanOrEqual(expectedCeiling + 1);
    expect(seen).toBeGreaterThan(expectedCeiling - 100);
    // And the row's own IRMAA MAGI (settled after the solver) confirms
    // the year priced under the tier -- this fixture has taxable money to
    // live on, so the solver adds no Pre-Tax draw.
    expect(row.irmaaMagi).toBeLessThanOrEqual(expectedCeiling + 1);
  });

  it('counts the Social Security the conversion makes taxable', () => {
    // Both claimed at 62, so benefits are in payment; the conversion drags
    // up to 85% of them into MAGI (the torpedo) and the cap has to size
    // against that re-solved figure, not the pre-conversion one.
    const withSs = { ...couple, ss1: 36000, ss2: 30000, claimingAge1: 62, claimingAge2: 62, rothConversionIrmaaCapEnabled: true };
    const row = runProjection(withSs).years[0];
    expect(row.taxableSS).toBeGreaterThan(0);
    expect(row.irmaaCappedConversion).toBeGreaterThan(0);
    expect(row.irmaaMagi).toBeLessThanOrEqual(row.irmaaCapCeiling + 1);
    expect(row.irmaaMagi).toBeGreaterThan(row.irmaaCapCeiling - 100);
  });

  it('a higher tier allows more conversion', () => {
    const t0 = runProjection({ ...couple, rothConversionIrmaaCapEnabled: true, rothConversionIrmaaTier: 0 }).years[0];
    const t1 = runProjection({ ...couple, rothConversionIrmaaCapEnabled: true, rothConversionIrmaaTier: 1 }).years[0];
    expect(t1.convertAmount).toBeGreaterThan(t0.convertAmount);
    expect(t1.irmaaCapCeiling).toBeCloseTo(IRMAA_THRESHOLDS_MFJ[1] * Math.pow(1.025, 2) - 1000, 4);
  });

  it('is inert in a year when nobody will be on Medicare two years later', () => {
    // Both 60: year+2 is 62. Same plan otherwise, so the conversion must be
    // identical to the uncapped one.
    const young = { ...couple, birthYear1: 1966, birthYear2: 1966 };
    const off = runProjection(young).years[0];
    const on = runProjection({ ...young, rothConversionIrmaaCapEnabled: true }).years[0];
    expect(on.convertAmount).toBe(off.convertAmount);
    expect(on.irmaaCapCeiling).toBe(0);
  });

  it('honors deferred Medicare on an employer plan', () => {
    // Spouse 1 works to 70 on their own employer plan; spouse 2 is on it too.
    // At 65 (year+2) neither is on Part B, so no cap.
    const working = {
      ...couple,
      retireAge1: 70, retireAge2: 60, salary1: 150000,
      medicareEmployerCoverage1: 'own', medicareEmployerCoverage2: 'spouse',
      rothConversionDelayUntilRetire: false,
    };
    const off = runProjection(working).years[0];
    const on = runProjection({ ...working, rothConversionIrmaaCapEnabled: true }).years[0];
    expect(off.convertAmount).toBeGreaterThan(0);
    expect(on.convertAmount).toBe(off.convertAmount);
    expect(on.irmaaCapCeiling).toBe(0);
  });

  it('with the IRMAA freeze stress test on, the ceiling is the flat 2026 threshold', () => {
    const row = runProjection({ ...couple, rothConversionIrmaaCapEnabled: true, irmaaFreezeEnabled: true }).years[0];
    expect(row.irmaaCapCeiling).toBeCloseTo(IRMAA_THRESHOLDS_MFJ[0] - 1000, 6);
  });

  it('caps a fixed-dollar strategy too', () => {
    const fixed = { ...couple, rothConversionStrategy: 'fixed', rothConversionAmount: 400000 };
    const off = runProjection(fixed).years[0];
    const on = runProjection({ ...fixed, rothConversionIrmaaCapEnabled: true }).years[0];
    expect(off.convertAmount).toBe(400000);
    expect(on.convertAmount).toBeLessThan(off.convertAmount);
    expect(on.irmaaCappedConversion).toBeCloseTo(off.convertAmount - on.convertAmount, 6);
  });

  it('sanitizes the tier to an integer 0-4', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, rothConversionIrmaaTier: 7 }).rothConversionIrmaaTier).toBe(4);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, rothConversionIrmaaTier: -1 }).rothConversionIrmaaTier).toBe(0);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, rothConversionIrmaaTier: 2.9 }).rothConversionIrmaaTier).toBe(2);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS }).rothConversionIrmaaTier).toBe(0);
  });
});
