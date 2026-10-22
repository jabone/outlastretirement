// Two more spending rules in the historical comparison (changelog 451):
// percent of portfolio, and Bob Clyatt's 95% rule.
import { describe, it, expect } from 'vitest';
import { runProjection, runHistoricalStarts, HISTORICAL_START_RULES, DEFAULT_INPUTS } from '../calculator';
import { RULE_LABELS } from '../utils/historicalStarts';

const invested = (y) => (y.preTaxEnd || 0) + (y.rothEnd || 0) + (y.taxableEnd || 0) + (y.hsaEnd || 0);
const hist = (rule) => runProjection({ ...DEFAULT_INPUTS, goGoBumpEnabled: false, spendingRule: rule, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1966 });

describe('the rules in the engine', () => {
  it('none is the plan unchanged, and an unknown rule is none', () => {
    const plain = runProjection(DEFAULT_INPUTS).endingBalance;
    expect(runProjection({ ...DEFAULT_INPUTS, spendingRule: 'none' }).endingBalance).toBe(plain);
    expect(runProjection({ ...DEFAULT_INPUTS, spendingRule: 'bogus' }).endingBalance).toBe(plain);
  });

  it('percent of portfolio: the first retired year spends the plan, then the same share of each opening portfolio', () => {
    const plan = hist('none');
    const p = hist('pctPortfolio');
    const i = p.years.findIndex((y) => y.isRetired);
    expect(p.years[i].lifestyleExpenses).toBeCloseTo(plan.years[i].lifestyleExpenses, 6);
    const opening0 = invested(p.years[i - 1]);
    const r = p.years[i].lifestyleExpenses / opening0;
    for (let k = i + 1; k < i + 8; k += 1) {
      expect(p.years[k].lifestyleExpenses).toBeCloseTo(r * invested(p.years[k - 1]), 4);
    }
  });

  it('the 95% rule: the larger of that share and 95% of last year', () => {
    const p = hist('clyatt95');
    const i = p.years.findIndex((y) => y.isRetired);
    const r = p.years[i].lifestyleExpenses / invested(p.years[i - 1]);
    let held = 0;
    for (let k = i + 1; k < p.years.length; k += 1) {
      const want = Math.max(r * invested(p.years[k - 1]), 0.95 * p.years[k - 1].lifestyleExpenses);
      expect(p.years[k].lifestyleExpenses).toBeCloseTo(want, 4);
      if (0.95 * p.years[k - 1].lifestyleExpenses > r * invested(p.years[k - 1])) held += 1;
    }
    // In the 1966 start the 95% floor binds at least once.
    expect(held).toBeGreaterThan(0);
  });
});

describe('in the historical comparison', () => {
  it('both rules run over the same starts, are never the plan, and are priced against fixed spending', () => {
    expect(HISTORICAL_START_RULES.map((r) => r.key)).toEqual(['fixed', 'crash', 'wr', 'both', 'pct', 'clyatt']);
    const h = runHistoricalStarts(DEFAULT_INPUTS);
    const pct = h.rules.find((r) => r.key === 'pct');
    const clyatt = h.rules.find((r) => r.key === 'clyatt');
    for (const r of [pct, clyatt]) {
      expect(r.inPlan).toBe(false);
      expect(r.count).toBe(h.count);
      expect(r.deepestCut).toBeGreaterThan(0);
      expect(Number.isFinite(r.medianLifetimeShare)).toBe(true);
    }
    expect(h.starts[0].pct).toBeTruthy();
    expect(RULE_LABELS.pct).toBe('Percent of portfolio');
    expect(RULE_LABELS.clyatt).toBe('The 95% rule (Clyatt)');
  }, 120000);
});

// Changelog 452: the same starts at several stock shares.
import { historicalByStockShare, STOCK_SHARE_STEPS } from '../calculator';
describe('success by stock share', () => {
  it('runs every step plus the plan’s own share, under the plan’s rule and floor', () => {
    const r = historicalByStockShare({ ...DEFAULT_INPUTS, stockAllocationPost: 65 });
    expect(r.planShare).toBe(65);
    expect(r.rows.map((x) => x.share)).toEqual([...STOCK_SHARE_STEPS, 65].sort((a, b) => a - b));
    expect(r.rows.filter((x) => x.isPlan).map((x) => x.share)).toEqual([65]);
    for (const x of r.rows) {
      expect(x.count).toBe(r.count);
      expect(x.lasted).toBeLessThanOrEqual(x.count);
      expect(Number.isFinite(x.medianRealEnd)).toBe(true);
    }
    // A floor counts here too.
    const floored = historicalByStockShare({ ...DEFAULT_INPUTS, portfolioFloorReal: 400000 });
    const plain = historicalByStockShare(DEFAULT_INPUTS);
    floored.rows.forEach((x, i) => expect(x.lasted).toBeLessThanOrEqual(plain.rows[i].lasted));
  }, 120000);

  it('the plan’s own row matches the historical starts count for a fixed-spending plan with no glide', () => {
    const h = runHistoricalStarts(DEFAULT_INPUTS);
    const r = historicalByStockShare(DEFAULT_INPUTS);
    expect(r.rows.find((x) => x.isPlan).lasted).toBe(h.rules.find((x) => x.inPlan).lasted);
  }, 120000);
});
