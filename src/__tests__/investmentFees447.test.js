// Investment fees (changelog 447): fund expenses and an advisor fee, charged
// on the four invested accounts after each year's return, and the
// comparison behind Risk -> What fees cost you.
import { describe, it, expect } from 'vitest';
import {
  runProjection, sanitizeInputs, migrateInputs, DEFAULT_INPUTS, totalFeeFraction, netReturnPct,
  computeFeeComparison, feeComparisonVariant, FEE_COMPARE_ADVISOR_PCT,
} from '../calculator';

// A retired single person with no income, no spending, no tax and flat
// prices: each account just grows, so a year's change is growth and fees.
const still = (over = {}) => ({
  ...DEFAULT_INPUTS,
  planYear: 2026, birthYear1: 1956, retireAge1: 65, lifeExpectancy1: 90, claimingAge1: 70,
  spouse2Enabled: false, filingStatus: 'Single',
  preTaxInit: 100000, rothInit: 50000, taxableInit: 40000, taxableBasisInit: 40000, hsaInit: 0,
  preRetireReturn: 5, postRetireReturn: 5, inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0,
  housingInflationRate: 0, salary1: 0, ss1: 0, pension1: 0, lifestyleExpense: 0, healthcareBridgeCost: 0,
  taxableDividendYield: 0, stateTaxState: 'none', rmdEnabled: false,
  ...over,
});

describe('the fee settings', () => {
  it('default to 0.10% fund expenses and no advisor fee', () => {
    expect(DEFAULT_INPUTS.fundExpenseRatioPct).toBe(0.1);
    expect(DEFAULT_INPUTS.advisorFeePct).toBe(0);
    expect(totalFeeFraction(DEFAULT_INPUTS)).toBeCloseTo(0.001, 12);
  });

  it('are clamped to 0-5% each, and a plan saved before them gets the defaults', () => {
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, fundExpenseRatioPct: 9, advisorFeePct: -1 })).toMatchObject({ fundExpenseRatioPct: 5, advisorFeePct: 0 });
    // A saved plan from before changelog 447 is loaded over the defaults.
    const old = { ...DEFAULT_INPUTS };
    delete old.fundExpenseRatioPct;
    delete old.advisorFeePct;
    expect(migrateInputs(old)).toMatchObject({ fundExpenseRatioPct: 0.1, advisorFeePct: 0 });
  });

  it('netReturnPct is the before-fee return after them: (1 + r)(1 - f) - 1', () => {
    expect(netReturnPct(6, { fundExpenseRatioPct: 0.1, advisorFeePct: 1 })).toBeCloseTo((1.06 * (1 - 0.011) - 1) * 100, 10);
    expect(netReturnPct(6, { fundExpenseRatioPct: 0, advisorFeePct: 0 })).toBeCloseTo(6, 12);
  });
});

describe('the engine', () => {
  it('with no fees, a still account grows by exactly the return', () => {
    const y = runProjection(still({ fundExpenseRatioPct: 0, advisorFeePct: 0 })).years[0];
    expect(y.preTaxEnd).toBeCloseTo(100000 * 1.05, 6);
    expect(y.rothEnd).toBeCloseTo(50000 * 1.05, 6);
    expect(y.feesPaid).toBe(0);
  });

  it('takes the fee off each invested account after the return, and records it', () => {
    const f = 0.0025 + 0.01;
    const y = runProjection(still({ fundExpenseRatioPct: 0.25, advisorFeePct: 1 })).years[0];
    expect(y.preTaxEnd).toBeCloseTo(100000 * 1.05 * (1 - f), 6);
    expect(y.rothEnd).toBeCloseTo(50000 * 1.05 * (1 - f), 6);
    // Taxable pays the year's Medicare premiums, so check it through the
    // identity instead: the fee is f of each grown balance, so it is
    // f / (1 - f) of what is left.
    const left = y.preTaxEnd + y.rothEnd + y.taxableEnd + y.hsaEnd;
    expect(y.feesPaid).toBeCloseTo(left * f / (1 - f), 6);
    // Split in proportion to the two rates.
    expect(y.advisorFeesPaid).toBeCloseTo(y.feesPaid * (0.01 / f), 6);
    expect(y.fundExpensesPaid + y.advisorFeesPaid).toBeCloseTo(y.feesPaid, 6);
    expect(y.feeRatePct).toBeCloseTo(1.25, 10);
    // growthRate is the market's, before fees.
    expect(y.growthRate).toBe(5);
  });

  it('does not charge the cash reserve', () => {
    const base = still({ cashFloorEnabled: true, cashFloorInit: 20000, cashFloorReturnRate: 3 });
    const a = runProjection({ ...base, fundExpenseRatioPct: 0, advisorFeePct: 0 }).years[0];
    const b = runProjection({ ...base, fundExpenseRatioPct: 1, advisorFeePct: 1 }).years[0];
    expect(b.cashReserveBalance).toBeCloseTo(a.cashReserveBalance, 6);
  });

  it('keeps a running total that matches the year-by-year fees', () => {
    const p = runProjection(still({ advisorFeePct: 1 }));
    const sum = p.years.reduce((t, y) => t + y.feesPaid, 0);
    expect(p.years.at(-1).feesPaidCumulative).toBeCloseTo(sum, 4);
  });

  it('applies on a historical start and a stress year too (the fee sits after every override)', () => {
    const hist = { ...still(), stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1966 };
    const a = runProjection({ ...hist, fundExpenseRatioPct: 0, advisorFeePct: 0 });
    const b = runProjection({ ...hist, fundExpenseRatioPct: 0, advisorFeePct: 1 });
    expect(b.years[0].growthRate).toBe(a.years[0].growthRate);
    expect(b.years[0].preTaxEnd).toBeCloseTo(a.years[0].preTaxEnd * 0.99, 4);
    expect(b.endingBalance).toBeLessThan(a.endingBalance);
  });

  it('a higher fee never leaves more money', () => {
    const end = (adv) => runProjection({ ...DEFAULT_INPUTS, advisorFeePct: adv }).endingBalance;
    expect(end(0)).toBeGreaterThanOrEqual(end(0.5));
    expect(end(0.5)).toBeGreaterThanOrEqual(end(1));
  });
});

describe('What fees cost you', () => {
  it('a do-it-yourself plan is compared with a 1% advisor fee added', () => {
    expect(feeComparisonVariant({ advisorFeePct: 0 })).toEqual({ kind: 'withAdvisor', advisorFeePct: FEE_COMPARE_ADVISOR_PCT });
    const c = computeFeeComparison(DEFAULT_INPUTS);
    expect(c.kind).toBe('withAdvisor');
    expect(c.mine.advisorFeePct).toBe(0);
    expect(c.other.advisorFeePct).toBe(1);
    expect(c.mine.lifetimeAdvisorFees).toBe(0);
    expect(c.other.lifetimeAdvisorFees).toBeGreaterThan(0);
    expect(c.other.lifetimeFees).toBeGreaterThan(c.mine.lifetimeFees);
    expect(c.other.endingBalance).toBeLessThanOrEqual(c.mine.endingBalance);
    // Fund expenses are the same setting on both sides.
    expect(c.other.fundExpenseRatioPct).toBe(c.mine.fundExpenseRatioPct);
  });

  it('a plan that pays an advisor is compared without the fee', () => {
    const c = computeFeeComparison({ ...DEFAULT_INPUTS, advisorFeePct: 0.75 });
    expect(c.kind).toBe('withoutAdvisor');
    expect(c.other.advisorFeePct).toBe(0);
    expect(c.mine.lifetimeAdvisorFees).toBeGreaterThan(0);
  });

  it('lifetime fees are today\'s dollars: with no inflation they equal the plain sum', () => {
    const inputs = still({ advisorFeePct: 1 });
    const c = computeFeeComparison(inputs);
    const sum = runProjection(inputs).years.reduce((t, y) => t + y.feesPaid, 0);
    expect(c.mine.lifetimeFees).toBeCloseTo(sum, 4);
  });

  it('with history on, counts starts lasted and finds the every-start spending on both sides', () => {
    const c = computeFeeComparison(DEFAULT_INPUTS, { historical: true });
    expect(c.mine.historical.count).toBe(c.other.historical.count);
    expect(c.other.historical.lasted).toBeLessThanOrEqual(c.mine.historical.lasted);
    if (Number.isFinite(c.mine.safeMax) && Number.isFinite(c.other.safeMax)) {
      expect(c.other.safeMax).toBeLessThanOrEqual(c.mine.safeMax);
    }
  }, 120000);
});
