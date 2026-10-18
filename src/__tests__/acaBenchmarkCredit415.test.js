// Changelog 415: the premium tax credit is computed as IRC 36B does it --
// the benchmark premium less the applicable percentage of ACA MAGI, capped
// at the premium paid -- estimated before the year and reconciled on the
// settled MAGI, instead of a figure the user types and loses whole over
// the cliff. The typed figure survives as 'manual'.
import { describe, it, expect } from 'vitest';
import {
  runProjection, sanitizeInputs, DEFAULT_INPUTS,
  acaApplicablePercent, acaAgeFactor, acaBenchmarkPremiumAnnual, acaPremiumTaxCredit,
  ACA_BENCHMARK_40_MONTHLY_2026, getFederalPovertyLevel,
} from '../calculator';
import { buildDemoInputs } from '../config/demoPlan';
import { buildParkersInputs } from '../config/demoPlanParkers';

const START = DEFAULT_INPUTS.planYear;

describe('the pieces', () => {
  it('applicable percentage: 2.1% at the floor, 9.96% from 300%, nothing outside 100-400%', () => {
    expect(acaApplicablePercent(1.0)).toBe(2.1);
    expect(acaApplicablePercent(1.32)).toBe(2.1);
    expect(acaApplicablePercent(1.33)).toBeCloseTo(3.14, 9);
    expect(acaApplicablePercent(1.75)).toBeCloseTo(4.19 + (6.60 - 4.19) / 2, 9);
    expect(acaApplicablePercent(2.0)).toBeCloseTo(6.60, 9);
    expect(acaApplicablePercent(3.0)).toBeCloseTo(9.96, 9);
    expect(acaApplicablePercent(4.0)).toBeCloseTo(9.96, 9);
    expect(acaApplicablePercent(4.0001)).toBeNull();
    expect(acaApplicablePercent(0.99)).toBeNull();
    expect(acaApplicablePercent(NaN)).toBeNull();
  });

  it('the age curve: 40 is 1.278, 64 is 3.0, community-rated states are flat, Massachusetts is half', () => {
    expect(acaAgeFactor(40, 'TX')).toBe(1.278);
    expect(acaAgeFactor(64, 'TX')).toBe(3.0);
    expect(acaAgeFactor(70, 'TX')).toBe(3.0);
    expect(acaAgeFactor(18, 'TX')).toBe(1.0);
    expect(acaAgeFactor(60, 'NY')).toBe(1);
    expect(acaAgeFactor(60, 'VT')).toBe(1);
    expect(acaAgeFactor(64, 'MA')).toBe(2.0);
  });

  it('the household benchmark: one per covered adult at the state rate, scaled from 40, medically inflated', () => {
    // Texas $661 at 40; a 60-year-old is 2.714 / 1.278 of that.
    expect(acaBenchmarkPremiumAnnual('TX', [60])).toBeCloseTo(661 * (2.714 / 1.278) * 12, 6);
    expect(acaBenchmarkPremiumAnnual('TX', [60, 58])).toBeCloseTo(661 * ((2.714 + 2.548) / 1.278) * 12, 6);
    expect(acaBenchmarkPremiumAnnual('NY', [60, 58])).toBeCloseTo(817 * 2 * 12, 6);
    expect(acaBenchmarkPremiumAnnual('ZZ', [40])).toBeCloseTo(ACA_BENCHMARK_40_MONTHLY_2026.US * 12, 6);
    expect(acaBenchmarkPremiumAnnual('TX', [40], 1.5)).toBeCloseTo(661 * 12 * 1.5, 6);
    expect(acaBenchmarkPremiumAnnual('TX', [])).toBe(0);
    expect(Object.keys(ACA_BENCHMARK_40_MONTHLY_2026)).toHaveLength(52); // 50 states + DC + US
  });

  it('the credit: benchmark less the contribution, never more than the premium, nothing over the cliff', () => {
    const fpl = 21150; // a couple, 2026 coverage
    // 200% of FPL: 6.60% of $42,300 = $2,791.80 expected; benchmark $30,000.
    const r = acaPremiumTaxCredit({ benchmark: 30000, magi: 42300, fpl, premiumPaid: 20000 });
    expect(r.fplRatio).toBeCloseTo(2, 9);
    expect(r.applicablePct).toBeCloseTo(6.60, 9);
    expect(r.contribution).toBeCloseTo(2791.8, 6);
    expect(r.credit).toBe(20000); // capped at the premium
    expect(acaPremiumTaxCredit({ benchmark: 30000, magi: 42300, fpl, premiumPaid: 40000 }).credit).toBeCloseTo(27208.2, 6);
    // Just over 400%: nothing.
    expect(acaPremiumTaxCredit({ benchmark: 30000, magi: fpl * 4 + 1, fpl, premiumPaid: 20000 }).credit).toBe(0);
    // Benchmark below the contribution: nothing, never negative.
    expect(acaPremiumTaxCredit({ benchmark: 5000, magi: 80000, fpl, premiumPaid: 20000 }).credit).toBe(0);
  });
});

// A Texas couple retired at 60 and 58, living mostly on a basis-heavy
// brokerage account with a $30,000 pension: low MAGI, five marketplace years
// for one spouse and seven for the other.
const couple = {
  ...DEFAULT_INPUTS, birthYear1: START - 60, birthYear2: START - 58, spouse2Enabled: true, filingStatus: 'MFJ',
  retireAge1: 60, retireAge2: 58, salary1: 0, salary2: 0, ss1: 0, ss2: 0, claimingAge1: 70, claimingAge2: 70,
  preTaxInit: 800000, taxableInit: 600000, taxableBasisInit: 500000, rothInit: 200000, lifestyleExpense: 60000,
  stateOfResidence: 'TX', stateTaxState: 'tx', pension1: 30000, healthcareBridgeCost: 12000, healthcareBridgePremiumPct: 70,
};

describe('the computed credit in a plan', () => {
  it('is the default, and a demo household keeps the typed mode its story was written with', () => {
    expect(DEFAULT_INPUTS.acaCreditSource).toBe('formula');
    expect(buildDemoInputs().acaCreditSource).toBe('manual');
    expect(buildParkersInputs().acaCreditSource).toBe('manual');
  });

  it('a plan saved before 415 keeps a credit it typed and gets the formula otherwise', () => {
    const { acaCreditSource: _a, ...typed } = { ...DEFAULT_INPUTS, acaSubsidyAnnualValue: 6000 };
    expect(sanitizeInputs(typed).acaCreditSource).toBe('manual');
    const { acaCreditSource: _b, ...untyped } = { ...DEFAULT_INPUTS };
    expect(sanitizeInputs(untyped).acaCreditSource).toBe('formula');
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, acaCreditSource: 'manual' }).acaCreditSource).toBe('manual');
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, acaBenchmarkPremiumSource: 'bogus' }).acaBenchmarkPremiumSource).toBe('state');
  });

  it('estimates the credit from last year\'s settled income and reconciles it: the steady state has no true-up', () => {
    const years = runProjection(couple).years;
    const y1 = years[1];
    expect(y1.acaBenchmarkPremium).toBeGreaterThan(30000);
    expect(y1.acaApplicablePct).toBeCloseTo(2.1, 9); // MAGI under 133% of FPL
    // The credit is capped at the premium share of the bridge: 70% of two
    // $12,000 costs, medically inflated one year.
    const premium = 24000 * 0.7 * (1 + DEFAULT_INPUTS.medicalInflationRate / 100);
    expect(y1.acaSubsidyApplied).toBeCloseTo(premium, 0);
    expect(y1.acaCreditSettled).toBeCloseTo(y1.acaSubsidyApplied, 6);
    expect(y1.acaSubsidyClawback).toBe(0);
    expect(y1.acaSubsidyRefund).toBe(0);
    // The bridge the year paid is net of the advance.
    expect(y1.healthcareBridge).toBeCloseTo(24000 * (1 + DEFAULT_INPUTS.medicalInflationRate / 100) - y1.acaSubsidyApplied, 0);
  });

  it('the first marketplace year, with nothing to project from and income under the floor, is settled at filing as a refund', () => {
    const y0 = runProjection(couple).years[0];
    expect(y0.acaSubsidyApplied).toBe(0);
    expect(y0.acaApplicablePct).toBeNull();
    expect(y0.acaMagi).toBeGreaterThan(getFederalPovertyLevel(2, START));
    expect(y0.acaCreditSettled).toBeGreaterThan(0);
    expect(y0.acaSubsidyRefund).toBeCloseTo(y0.acaCreditSettled, 6);
    expect(y0.acaSubsidyClawback).toBe(0);
  });

  it('a conversion that raises the settled income is reconciled as tax; one that crosses the cliff loses it all', () => {
    const base = { ...couple, rothConversionStrategy: 'fixed', rothConversionAmount: 30000 };
    const y1 = runProjection(base).years[1];
    // Conversion is known before the year: in the estimate, so no true-up.
    expect(y1.acaSubsidyClawback).toBeCloseTo(0, 6);
    expect(y1.acaApplicablePct).toBeGreaterThan(2.1);
    // Over the cliff: MFJ 400% line is $84,600 for 2026 coverage.
    const over = runProjection({ ...couple, rothConversionStrategy: 'fixed', rothConversionAmount: 200000 }).years[1];
    expect(over.acaCliffBreached).toBe(true);
    expect(over.acaSubsidyApplied).toBe(0);
    expect(over.acaCreditSettled).toBe(0);
    expect(over.healthcareBridge).toBeCloseTo(24000 * (1 + DEFAULT_INPUTS.medicalInflationRate / 100), 0);
  });

  it('a draw the solver adds after the estimate is repaid on the return', () => {
    // Pre-tax first: every year's living costs come out of the IRA, so the
    // settled MAGI is well above the pension-only picture of year one.
    const preTaxFirst = { ...couple, withdrawalStrategy: 'PreTaxFirst', taxableInit: 50000, taxableBasisInit: 50000, lifestyleExpense: 40000, pensionStartAge1: 60, healthcareBridgeCost: 30000 };
    const years = runProjection(preTaxFirst).years;
    // Year one is estimated on the $30,000 pension (paid from 60) alone; the IRA draw
    // that funds the year lands in the settled MAGI, inside the band but
    // well above the estimate, so part of the advance is repaid.
    const y0 = years[0];
    expect(y0.acaSubsidyApplied).toBeGreaterThan(0);
    expect(y0.acaMagi).toBeGreaterThan(45000);
    expect(y0.acaCliffBreached).toBe(false);
    expect(y0.acaCreditSettled).toBeLessThan(y0.acaSubsidyApplied);
    expect(y0.acaSubsidyClawback).toBeCloseTo(y0.acaSubsidyApplied - y0.acaCreditSettled, 6);
    expect(y0.acaSubsidyRefund).toBe(0);
    // Year two projects from year one's settled MAGI, which already holds
    // the draw: little to true up.
    const y1 = years[1];
    expect(y1.acaApplicablePct).toBeGreaterThan(8);
    expect(Math.abs(y1.acaSubsidyClawback - y1.acaSubsidyRefund)).toBeLessThan(y1.acaSubsidyApplied * 0.25);
  });

  it('a typed benchmark replaces the state figure; a typed credit replaces the formula', () => {
    const own = runProjection({ ...couple, acaBenchmarkPremiumSource: 'manual', acaBenchmarkPremiumAnnual: 20000 }).years[1];
    expect(own.acaBenchmarkPremium).toBeCloseTo(20000 * (1 + DEFAULT_INPUTS.medicalInflationRate / 100), 6);
    const typed = runProjection({ ...couple, acaCreditSource: 'manual', acaSubsidyAnnualValue: 5000 }).years[1];
    expect(typed.acaBenchmarkPremium).toBe(0);
    expect(typed.acaSubsidyApplied).toBeCloseTo(5000 * (1 + DEFAULT_INPUTS.medicalInflationRate / 100), 6);
    expect(typed.acaCreditSettled).toBe(0);
  });

  it('nothing off the marketplace: at 65, married filing separately, or with no bridge cost', () => {
    const years = runProjection(couple).years;
    const both65 = years.find((y) => y.age2 === 65);
    expect(both65.acaSubsidyApplied).toBe(0);
    expect(both65.acaBenchmarkPremium).toBe(0);
    const mfs = runProjection({ ...couple, filingStatus: 'MFS' }).years[1];
    expect(mfs.acaSubsidyApplied).toBe(0);
    const noBridge = runProjection({ ...couple, healthcareBridgeCost: 0 }).years[1];
    expect(noBridge.acaSubsidyApplied).toBe(0);
    expect(noBridge.acaSubsidyRefund).toBe(0);
  });
});
