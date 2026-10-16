// Changelog 121 / audit Q-4(a): Medicare sets each year's IRMAA tier from
// the tax return filed two years earlier (2024 MAGI -> 2026 premiums). The
// engine used the current projection year's MAGI. It now carries each
// year's IRMAA MAGI forward and prices year N against year N-2, with an
// optional Form SSA-44 appeal after a spouse stops working or dies.
import { describe, it, expect } from 'vitest';
import {
  runProjection, DEFAULT_INPUTS,
  IRMAA_STANDARD_PREMIUM, IRMAA_TIER_PREMIUMS, IRMAA_THRESHOLDS_SINGLE,
} from '../calculator';
import { assertKnownInputKeys } from './knownInputKeys';

// Single, 63 in 2026, $300,000 salary until retiring at 65 (2028), then
// living on a pension small enough to sit in the standard-premium band.
// Nothing is inflated so the 2026 thresholds apply in every year.
const highEarner = {
  ...DEFAULT_INPUTS,
  planYear: 2026, spouse2Enabled: false, filingStatus: 'Single',
  birthYear1: 1963, retireAge1: 65, lifeExpectancy1: 80,
  claimingAge1: 70, ss1: 30000, ssSpousalEnabled1: false,
  salary1: 300000, partTimeIncome1: 0, rentalIncome: 0, annuityIncome: 0,
  pension1: 40000, pensionStartAge1: 65, pension1COLA: 0,
  preTaxInit: 200000, rothInit: 200000, taxableInit: 500000, hsaInit: 0, cashFloorEnabled: false,
  lifestyleExpense: 40000, healthcareBridgeCost: 0, ltcActive1: false,
  stateTaxState: 'none', taxBracketInflationRate: 0, inflationRate: 0, ssCOLA: 0,
  medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, medicalInflationRate: 0,
  rothConversionStrategy: 'none', qcdAnnualAmount: 0, backdoorRothEnabled: false, taxLossHarvestingEnabled: false,
  lifestyleThreePhaseEnabled: false, goGoBumpEnabled: false, withdrawalStrategy: 'TaxableFirst',
  taxableContribution: 0, preTaxContribution1: 0, rothContribution1: 0, hsaContribution: 0,
  nqdcEnabled1: false, // no RSU grants: rsuGrants defaults to []
};
assertKnownInputKeys(highEarner);

const rowAt = (res, age) => res.years.find(y => y.age1 === age);
const monthly = (row) => row.partBCost / 12;

describe('IRMAA two-year lookback (changelog 121, audit Q-4a)', () => {
  it('prices age 65 and 66 off the salary years, and only drops to the standard premium at 67', () => {
    const res = runProjection(highEarner);
    const at65 = rowAt(res, 65);
    const at66 = rowAt(res, 66);
    const at67 = rowAt(res, 67);
    // Age 63 and 64 MAGI = $300,000 salary -> above the $205,000 tier line.
    expect(at65.irmaaBasisSource).toBe('lookback');
    expect(at65.irmaaBasisMagi).toBeGreaterThan(IRMAA_THRESHOLDS_SINGLE[3]);
    expect(monthly(at65)).toBeCloseTo(IRMAA_TIER_PREMIUMS[3], 2);
    expect(monthly(at66)).toBeCloseTo(IRMAA_TIER_PREMIUMS[3], 2);
    // Age 65 MAGI is the $40,000 pension plus whatever the plan drew; the
    // first year priced off it is 67.
    expect(at67.irmaaBasisSource).toBe('lookback');
    expect(at67.irmaaBasisMagi).toBeLessThan(IRMAA_THRESHOLDS_SINGLE[0]);
    expect(monthly(at67)).toBeCloseTo(IRMAA_STANDARD_PREMIUM, 2);
  });

  it('records each year\'s own MAGI separately from the MAGI that set its tier', () => {
    const res = runProjection(highEarner);
    const at65 = rowAt(res, 65);
    expect(at65.irmaaMagi).toBeLessThan(at65.irmaaBasisMagi);
    // The lookback row is literally the age-63 row's own MAGI.
    expect(at65.irmaaBasisMagi).toBeCloseTo(rowAt(res, 63).irmaaMagi, 6);
  });

  it('uses the year\'s own MAGI for the first two projection years, which have no history', () => {
    const res = runProjection({ ...highEarner, birthYear1: 1961, retireAge1: 65 }); // 65 in 2026
    expect(res.years[0].irmaaBasisSource).toBe('current');
    expect(res.years[1].irmaaBasisSource).toBe('current');
    expect(res.years[2].irmaaBasisSource).toBe('lookback');
  });

  it('a Form SSA-44 appeal after stopping work charges the current-year premium instead', () => {
    const res = runProjection({ ...highEarner, irmaaLifeChangeAppealEnabled: true });
    const at65 = rowAt(res, 65);
    const at66 = rowAt(res, 66);
    expect(at65.irmaaBasisSource).toBe('appeal');
    expect(monthly(at65)).toBeCloseTo(IRMAA_STANDARD_PREMIUM, 2);
    expect(at66.irmaaBasisSource).toBe('appeal');
    // By 67 the lookback year (65) is already post-retirement, so the
    // appeal is no longer needed and the ordinary rule resumes.
    expect(rowAt(res, 67).irmaaBasisSource).toBe('lookback');
  });

  it('the appeal never raises a premium: with no life-changing event the lookback stands', () => {
    // Retired from the start: no work stoppage inside the projection.
    const retired = { ...highEarner, birthYear1: 1961, salary1: 0, retireAge1: 60, irmaaLifeChangeAppealEnabled: true };
    const res = runProjection(retired);
    expect(res.years.slice(2).every(y => y.irmaaBasisSource === 'lookback')).toBe(true);
  });

  it('the lookback is worth two years of the fourth-tier surcharge to this household', () => {
    const withLookback = runProjection(highEarner);
    const withAppeal = runProjection({ ...highEarner, irmaaLifeChangeAppealEnabled: true });
    const perYear = (IRMAA_TIER_PREMIUMS[3] - IRMAA_STANDARD_PREMIUM) * 12;
    const partBDelta = [65, 66].reduce((s, a) => s + rowAt(withLookback, a).partBCost - rowAt(withAppeal, a).partBCost, 0);
    expect(partBDelta).toBeCloseTo(perYear * 2, 2);
    expect(withLookback.totalIRMAAPaid).toBeGreaterThan(withAppeal.totalIRMAAPaid);
  });
});

// Changelog 123 / audit Q-4(b)(c): IRMAA MAGI is AGI-based -- only the
// taxable part of Social Security counts, and the solver's discretionary
// Pre-Tax draw (plus realized gains and taxable Roth earnings) counts too.
describe('IRMAA MAGI is AGI-based (changelog 123, audit Q-4b/c)', () => {
  // Retired single, 70, $37,200 of Social Security (a $30,000 FRA benefit
  // claimed at 70) and $2,000 of dividends: provisional income is about
  // $20,600, under $25,000, so no benefit is taxable.
  const ssOnly = {
    ...highEarner, birthYear1: 1956, retireAge1: 60, salary1: 0,
    claimingAge1: 70, ss1: 30000, pension1: 0,
    lifestyleExpense: 25000, preTaxInit: 0, rothInit: 0, taxableInit: 100000,
  };

  it('counts only the taxable part of Social Security, not the gross benefit', () => {
    const res = runProjection(ssOnly);
    const y0 = res.years[0];
    expect(y0.taxableSS).toBe(0);
    expect(y0.ssIncome).toBeGreaterThan(36000);
    // Gross benefits are NOT in MAGI; dividends and any realized gains are.
    expect(y0.irmaaMagi).toBeLessThan(10000);
    expect(y0.irmaaMagi).toBeGreaterThanOrEqual(2000);
  });

  it('includes the discretionary Pre-Tax draw, so a big withdrawal year sets a surcharge two years later', () => {
    // Retired single, 66, living on $180,000 a year drawn from Pre-Tax.
    const bigDraw = {
      ...highEarner, birthYear1: 1960, retireAge1: 60, salary1: 0, ss1: 0,
      pension1: 0, lifestyleExpense: 180000, preTaxInit: 3000000, rothInit: 0, taxableInit: 0,
      withdrawalStrategy: 'PreTaxFirst',
    };
    const res = runProjection(bigDraw);
    const y0 = res.years[0];
    expect(y0.drawPreTax).toBeGreaterThan(150000);
    expect(y0.irmaaMagi).toBeGreaterThan(150000);
    // Year 3 is priced off year 1's settled MAGI -> above the $109,000 line.
    const y2 = res.years[2];
    expect(y2.irmaaBasisSource).toBe('lookback');
    expect(y2.irmaaBasisMagi).toBeCloseTo(y0.irmaaMagi, 6);
    expect(y2.partBCost / 12).toBeGreaterThan(IRMAA_STANDARD_PREMIUM);
  });

  it('trues up a year priced off the pre-solver estimate once the draw is known', () => {
    const bigDraw = {
      ...highEarner, birthYear1: 1960, retireAge1: 60, salary1: 0, ss1: 0,
      pension1: 0, lifestyleExpense: 180000, preTaxInit: 3000000, rothInit: 0, taxableInit: 0,
      withdrawalStrategy: 'PreTaxFirst',
    };
    const y0 = runProjection(bigDraw).years[0];
    // No history: the estimate (no draw, ~$0 of income) priced the standard
    // premium; the settled MAGI lands in a surcharge tier, and the
    // difference is charged in the same year.
    expect(y0.irmaaBasisSource).toBe('current');
    expect(y0.irmaaTrueUp).toBeGreaterThan(0);
    expect(y0.partBCost / 12).toBeGreaterThan(IRMAA_STANDARD_PREMIUM);
    expect(y0.irmaaCost).toBeCloseTo(y0.partBCost + y0.partDCost, 2);
  });
});
