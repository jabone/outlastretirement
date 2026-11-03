// Variable percentage withdrawal in the historical comparison (changelog
// 482): the Bogleheads VPW curve, scaled to start at the plan's own share.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection, runHistoricalStarts, vpwRate, vpwRealReturn, HISTORICAL_START_RULES } from '../calculator';
import { RULE_LABELS } from '../utils/historicalStarts';

const plan = {
  ...DEFAULT_INPUTS, planYear: 2026, stateTaxState: 'none', spouse2Enabled: false,
  birthYear1: 1961, retireAge1: 65, lifeExpectancy1: 94, salary1: 0, ss1: 0, pension1: 0,
  preTaxInit: 0, rothInit: 1000000, taxableInit: 0, rothBasisInit: 1000000, lifestyleExpense: 40000,
  preTaxContribution1: 0, rothContribution1: 0, taxableContribution: 0, hsaContribution: 0,
  fundExpenseRatioPct: 0, medicareSupplementCost: 0,
};

describe('the VPW curve', () => {
  it('matches the Bogleheads table at 60/40 (5.0% stocks, 1.9% bonds after inflation)', () => {
    const r = vpwRealReturn(60);
    expect(r).toBeCloseTo(0.0376, 6);
    expect(vpwRate(65, r)).toBeCloseTo(0.0493, 3);
    expect(vpwRate(80, r)).toBeCloseTo(0.0672, 3);
    expect(vpwRate(90, r)).toBeCloseTo(0.1086, 3);
    expect(vpwRate(100, r)).toBeCloseTo(1, 9);
  });
  it('is 1/n with no return, and rises with age', () => {
    expect(vpwRate(91, 0)).toBeCloseTo(0.1, 9);
    expect(vpwRate(70, 0.03)).toBeGreaterThan(vpwRate(69, 0.03));
  });
});

describe('the rule in a projection', () => {
  it('spends the plan\'s amount in the first retired year, then scales the share by the curve', () => {
    const p = runProjection({ ...plan, spendingRule: 'vpw', stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1966 });
    const [y0, y1] = p.years;
    expect(y0.lifestyleExpenses).toBeCloseTo(40000, 6);
    const r = vpwRealReturn(60);
    const opening1 = (y0.preTaxEnding || 0) + (y0.rothEnding || 0) + (y0.taxableEnding || 0) + (y0.hsaEnding || 0);
    if (opening1 > 0) {
      expect(y1.lifestyleExpenses).toBeCloseTo((40000 / 1000000) * opening1 * (vpwRate(66, r) / vpwRate(65, r)), 0);
    }
  });
  it('joins the comparison over every start, with a label', () => {
    expect(HISTORICAL_START_RULES.map((x) => x.key)).toContain('vpw');
    expect(RULE_LABELS.vpw).toBe('Variable percentage (VPW)');
    const h = runHistoricalStarts(plan);
    const vpw = h.rules.find((x) => x.key === 'vpw');
    expect(vpw.count).toBe(69);
    expect(vpw.lasted).toBe(69); // a share of what is left never runs out on paper
    expect(vpw.medianLifetimeShare).toBeGreaterThan(h.rules.find((x) => x.key === 'pct').medianLifetimeShare);
  });
});
