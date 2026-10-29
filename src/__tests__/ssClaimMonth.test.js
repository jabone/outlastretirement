// The Social Security start month (changelog 464): a benefit can start in
// any month of the year you reach your claiming age. It is priced at the
// claiming age plus that many twelfths, and the claim year pays only the
// months from it on. January (0) is the whole-year plan, unchanged.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPUTS, runProjection, sanitizeInputs, getSSMultiplier, getSSClaimingHeatmap,
  exactClaimAge, claimYearShare,
} from '../calculator';
import { buildParkersInputs } from '../config/demoPlanParkers';
import { buildDemoInputs } from '../config/demoPlan';
import { claimAgeLabel } from '../utils/ssClaimLabel';
import { assertKnownInputKeys } from './knownInputKeys';

const single = assertKnownInputKeys({
  ...DEFAULT_INPUTS, spouse2Enabled: false, filingStatus: 'Single', birthYear1: 1960, retireAge1: 60,
  salary1: 0, ss1: 24000, ssDepletionEnabled: false, claimingAge1: 67,
});
const ssAt = (inputs, age) => runProjection(inputs).years.find((y) => y.age1 === age).ssIncome;

describe('pricing by the month', () => {
  it('B1-B2 the multiplier counts each month', () => {
    expect(getSSMultiplier(67 + 6 / 12, 67)).toBeCloseTo(1.04, 10);       // 6 x 2/3%
    expect(getSSMultiplier(62 + 6 / 12, 67)).toBeCloseTo(0.725, 10);      // 36 x 5/9% + 18 x 5/12%
    expect(exactClaimAge(67, 4)).toBeCloseTo(67 + 4 / 12, 12);
    expect(claimYearShare(4)).toBeCloseTo(8 / 12, 12);
  });

  it('B3-B4 a July start at 67: half the claim year at 104%, then 104%', () => {
    const july = { ...single, claimMonth1: 6 };
    expect(ssAt(july, 67) / ssAt(single, 67)).toBeCloseTo(0.52, 10);
    expect(ssAt(july, 68) / ssAt(single, 68)).toBeCloseTo(1.04, 10);
    const rows = runProjection(july).years;
    expect(rows.find((y) => y.age1 === 66).ssClaimMonthsPaid1).toBe(0);
    expect(rows.find((y) => y.age1 === 67).ssClaimMonthsPaid1).toBe(6);
    expect(rows.find((y) => y.age1 === 68).ssClaimMonthsPaid1).toBe(12);
  });

  it('B5-B6 a July start at 62 against January at 62', () => {
    const at62 = { ...single, birthYear1: 1964, claimingAge1: 62 };
    const july = { ...at62, claimMonth1: 6 };
    expect(ssAt(july, 62) / ssAt(at62, 62)).toBeCloseTo((0.725 * 0.5) / 0.70, 10);
    expect(ssAt(july, 63) / ssAt(at62, 63)).toBeCloseTo(0.725 / 0.70, 10);
  });

  it('B7 a claim at 70 starts in January, and the correction is listed', () => {
    const r = runProjection({ ...single, claimingAge1: 70, claimMonth1: 5 });
    expect(r.invalidInputs).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'claimMonth1', reason: 'claim-month-after-70', usedValue: 0 })]));
    expect(r.years).toEqual(runProjection({ ...single, claimingAge1: 70 }).years);
  });

  it('B8 January and a missing month are the same plan', () => {
    const { claimMonth1, claimMonth2, ...without } = single; // eslint-disable-line no-unused-vars
    expect(runProjection({ ...single, claimMonth1: 0 }).years).toEqual(runProjection(without).years);
  });

  it('out-of-range months are clamped and listed; fractions are rounded', () => {
    const r = runProjection({ ...single, claimMonth1: 14 });
    expect(r.invalidInputs).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'claimMonth1', reason: 'claim-month-range', usedValue: 11 })]));
    expect(sanitizeInputs({ ...single, claimMonth1: 3.4 }).claimMonth1).toBe(3);
    expect(sanitizeInputs({ ...single, claimMonth1: null }).claimMonth1).toBe(0);
  });
});

describe('a couple', () => {
  const couple = assertKnownInputKeys({
    ...DEFAULT_INPUTS, spouse2Enabled: true, filingStatus: 'MFJ', birthYear1: 1960, birthYear2: 1960,
    retireAge1: 60, retireAge2: 60, salary1: 0, salary2: 0, ss1: 30000, ss2: 6000, claimingAge1: 67, claimingAge2: 67,
    ssSpousalEnabled1: false, ssSpousalEnabled2: true, ssDepletionEnabled: false, lifeExpectancy1: 95, lifeExpectancy2: 95,
  });
  it('the spousal top-up starts with the own benefit, from the start month', () => {
    const april = { ...couple, claimMonth2: 3 };
    const ray = 30000; // spouse 1's own benefit at FRA, unchanged by spouse 2's month
    const y = (inputs, age) => runProjection(inputs).years.find((r) => r.age2 === age);
    const cola67 = y(couple, 67).ssIncome / (ray + 6000 + 9000);
    // Claim year: own 6,000 x 1.02 x 9/12 = 4,590, top-up 9,000 x 9/12 = 6,750.
    expect((y(april, 67).ssIncome / cola67 - ray) / 15000).toBeCloseTo(11340 / 15000, 6);
    // Next year: own 6,120, top-up 9,000 (no delayed credits on the top-up).
    const cola68 = y(couple, 68).ssIncome / (ray + 15000);
    expect(y(april, 68).ssIncome / cola68 - ray).toBeCloseTo(6120 + 9000, 4);
  });

  it('the earnings test never withholds more months than the claim year pays', () => {
    const working = assertKnownInputKeys({ ...single, birthYear1: 1963, claimingAge1: 63, claimMonth1: 6, retireAge1: 64, salary1: 80000 });
    const rows = runProjection(working).years;
    const claimYear = rows.find((r) => r.age1 === 63);
    expect(claimYear.ssClaimMonthsPaid1).toBe(6);
    expect(claimYear.ssEarningsTestCreditMonths1 ?? 0).toBeLessThanOrEqual(6 + 1e-9);
  });
});

describe('what stays in whole years', () => {
  it('the claiming grid ignores a start month', () => {
    const p = buildParkersInputs();
    expect(getSSClaimingHeatmap({ ...p, claimMonth1: 6, claimMonth2: 4 })).toEqual(getSSClaimingHeatmap(p));
    expect(getSSClaimingHeatmap({ ...single, claimMonth1: 6 })).toHaveLength(9);
  });
  it('the demo households have no start month', () => {
    expect(buildParkersInputs().claimMonth1 ?? 0).toBe(0);
    expect(buildDemoInputs().claimMonth1 ?? 0).toBe(0);
  });
  it('labels say the month only when there is one', () => {
    expect(claimAgeLabel(67, 0)).toBe('67');
    expect(claimAgeLabel(67, 4)).toBe('67, starting in May');
  });
});
