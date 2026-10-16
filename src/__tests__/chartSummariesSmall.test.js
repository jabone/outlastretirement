// Written summaries for the smaller charts (changelog 325): Readiness,
// the Cash Flow map and the Holdings charts. Each is built from exactly the
// rows its chart draws.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  dieWithZeroSummary, ageFinderSummary, cashFlowSummary, benchmarkSummary,
  rebalanceSummary, allocationSummary, dividendMonthSummary,
} from '../utils/chartSummaries';
import { cashFlowSankeyFlows } from '../utils/cashFlowSankeyFlows';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(SRC, p), 'utf8');

describe('smaller chart summaries', () => {
  it('Die with Zero: where each path ends', () => {
    const rows = [{ year: 2030, currentBalance: 1e6, dwzBalance: 1e6 }, { year: 2060, currentBalance: 2_400_000, dwzBalance: 12_000 }];
    expect(dieWithZeroSummary(rows)).toBe('Spending as you plan to now leaves $2.4 million in 2060. The Die with Zero path spends more along the way and leaves $12,000.');
    expect(dieWithZeroSummary([])).toBe('');
  });

  it('age finder: the ends of the range and the earliest age that lasts', () => {
    const rows = [{ age: 60, endingBalance: -5000 }, { age: 62, endingBalance: 300_000 }, { age: 67, endingBalance: 1_500_000 }];
    expect(ageFinderSummary(rows, 62)).toBe('Retiring at 60 ends the plan with -$5,000; retiring at 67, with $1.5 million. The earliest age tried at which the money lasts is 62.');
    expect(ageFinderSummary(rows, null)).toMatch(/At none of the ages tried does the money last\.$/);
  });

  it('cash flow: total in, the largest sources and uses, from the same flows the map draws', () => {
    const year = { year: 2040, ssIncome: 40_000, pension: 20_000, drawTaxable: 30_000, lifestyleExpenses: 70_000, totalTaxesPaid: 15_000, totalContributions: 5_000 };
    const flows = cashFlowSankeyFlows(year);
    expect(flows.inflows.map((f) => f.name)).toEqual(['Social Security', 'Pension/Annuity', 'Discretionary Draws']);
    expect(cashFlowSummary(2040, flows)).toBe('In 2040, $90,000 comes in, the most from social security $40,000, discretionary draws $30,000 and pension/annuity $20,000. The most goes to living expenses $70,000, taxes paid $15,000 and savings/reinvested $5,000.');
    expect(cashFlowSummary(2040, cashFlowSankeyFlows(null))).toBe('');
    expect(cashFlowSummary(2026, cashFlowSankeyFlows({ year: 2026, salary: 100_000, lifestyleExpenses: 100_000 }))).toBe('In 2026, $100,000 comes in, all of it from salary. The most goes to living expenses $100,000.');
  });

  it('benchmark: what went in, what the indexes would be, and the portfolio when known', () => {
    const rows = [{ year: 2020, invested: 1, spy: 1, qqq: 1, portfolio: null }, { year: 2026, invested: 500_000, spy: 910_000, qqq: 1_200_000, portfolio: 850_000 }];
    expect(benchmarkSummary(rows)).toBe('By 2026 you had put in $500,000. The same money in the S&P 500 would be $910,000, and in the Nasdaq-100 $1.2 million. Your portfolio is $850,000.');
    expect(benchmarkSummary([{ ...rows[1], portfolio: null }])).not.toMatch(/Your portfolio/);
  });

  it('rebalance: the two largest gaps, then a count of the rest', () => {
    const rows = [
      { symbol: 'VTI', 'Current %': 52, 'Target %': 40 },
      { symbol: 'BND', 'Current %': 10, 'Target %': 20 },
      { symbol: 'VXUS', 'Current %': 18, 'Target %': 20 },
      { symbol: 'CASH', 'Current %': 20.2, 'Target %': 20 },
    ];
    expect(rebalanceSummary(rows)).toBe('The largest gaps: VTI is 52% against a target of 40%; BND is 10% against a target of 20%. 1 more holding is off target by half a percent or more.');
    expect(rebalanceSummary([{ symbol: 'A', 'Current %': 50.2, 'Target %': 50 }])).toBe('The holding is within half a percent of its target.');
  });

  it('allocation: the three largest slices and the rest together', () => {
    const slices = [{ label: 'Stocks', value: 600 }, { label: 'Bonds', value: 250 }, { label: 'Cash', value: 100 }, { label: 'REITs', value: 30 }, { label: 'Other', value: 20 }];
    expect(allocationSummary(slices, 'By asset class')).toBe('By asset class, $1,000 in all: Stocks 60%, Bonds 25%, Cash 10%, and 2 others 5%.');
    expect(allocationSummary([{ label: 'ETF', value: 0 }])).toBe('');
  });

  it('dividends: past twelve months, the months ahead, and the largest month', () => {
    const rows = [
      { settled: true, basis: 'actual', value: 1000, longLabel: 'Mar 2026' },
      { settled: true, basis: 'estimated', value: 500, longLabel: 'Apr 2026' },
      { settled: false, basis: 'estimated', value: 2000, longLabel: 'Dec 2026' },
    ];
    expect(dividendMonthSummary(rows)).toBe('Over the past 2 months, dividends total $2,000 (1 recorded, the rest estimated). The next month is estimated at $2,000. The largest month is Dec 2026 at $2,000.');
  });

  it('every chart in the app sits in a ChartFigure', () => {
    const charts = ['DieWithZeroChart', 'AgeFinderChart', 'CashFlowSankeyChart', 'BenchmarkTrajectoryChart', 'RebalanceAllocationChart', 'AllocationDonutChart', 'DividendMonthChart'];
    const files = ['components/ReadinessTools.jsx', 'components/CashFlowExplorer.jsx'];
    for (const f of files) {
      const src = read(f);
      for (const c of charts) {
        for (const m of src.matchAll(new RegExp(`<${c}\\b`, 'g'))) {
          const before = src.slice(0, m.index);
          const opened = (before.match(/<ChartFigure\b/g) || []).length;
          const closed = (before.match(/<\/ChartFigure>/g) || []).length;
          expect(opened - closed, `${c} in ${f}`).toBe(1);
        }
      }
    }
  });
});
