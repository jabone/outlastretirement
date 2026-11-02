// When a replayed year's inflation reaches spending (DIY-planner review,
// 2026-11-02). Shiller's pre-1928 figures run January to January, so year
// Y's figure moves prices into Y+1; the 1928-on annual-average figures move
// them into Y itself.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, runHistoricalStarts, historyInflationInto } from '../calculator';
import { HISTORICAL_RETURNS_PRE1928 } from '../config/historicalReturnsPre1928';
import { HISTORICAL_RETURNS } from '../config/historicalReturns';

const row = (y) => [...HISTORICAL_RETURNS_PRE1928, ...HISTORICAL_RETURNS].find((r) => r[0] === y);

// $1M in Roth (no tax), 60/40, $40,000 a year, 30 years, no fees.
const plan = {
  ...DEFAULT_INPUTS, planYear: 2026, stateTaxState: 'none', spouse2Enabled: false,
  birthYear1: 1961, retireAge1: 65, lifeExpectancy1: 94, salary1: 0, ss1: 0, pension1: 0,
  preTaxInit: 0, rothInit: 1000000, taxableInit: 0, rothBasisInit: 1000000, lifestyleExpense: 40000,
  preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, hsaContribution: 0,
  fundExpenseRatioPct: 0, advisorFeePct: 0, rebalancingEnabled: true, stockAllocationPost: 60, stockAllocationPre: 60,
  medicareSupplementCost: 0, cashFloorEnabled: false, survivorExpenseDropInPlan: false,
};

describe('historyInflationInto', () => {
  it('takes the previous row before 1928 (January to January)', () => {
    expect(historyInflationInto(1910)).toBe(row(1909)[3]);
    expect(historyInflationInto(1927)).toBe(row(1926)[3]);
  });
  it('takes the year\'s own row from 1928 (annual average)', () => {
    expect(historyInflationInto(1928)).toBe(row(1928)[3]);
    expect(historyInflationInto(1974)).toBe(row(1974)[3]);
  });
});

describe('a pre-1928 replay', () => {
  it('raises 1910 spending by 1909\'s inflation, not 1910\'s', () => {
    const p = runProjection({ ...plan, historyFromYear: 1871, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1907 });
    const [y07, y08, y09, y10] = p.years;
    expect(y07.priceIndex ?? 1).toBeCloseTo(1, 9);
    expect(y08.priceIndex / (y07.priceIndex ?? 1)).toBeCloseTo(1 + row(1907)[3] / 100, 9);
    expect(y10.priceIndex / y09.priceIndex).toBeCloseTo(1 + row(1909)[3] / 100, 9);
  });

  it('matches an independent backtest: 118 of 126 starts since 1871 last', () => {
    const h = runHistoricalStarts({ ...plan, historyFromYear: 1871 });
    const fixed = h.rules.find((r) => r.key === 'fixed');
    expect(fixed.count).toBe(126);
    expect(fixed.lasted).toBe(118);
    expect(h.starts.filter((s) => !s.fixed.ok).map((s) => s.start)).toEqual([1906, 1962, 1964, 1965, 1966, 1967, 1968, 1969]);
  });

  it('leaves the 1928-on history unchanged: 62 of 69', () => {
    const h = runHistoricalStarts(plan);
    expect(h.rules.find((r) => r.key === 'fixed').lasted).toBe(62);
  });
});
