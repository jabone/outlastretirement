// @vitest-environment jsdom
// The Tax Bracket chart's bars, legend and hover card share one series list
// (changelog 276). Before this the bars said "W-2 Wages (Taxable)", the
// legend "Wages (Taxable)" and the hover card "Taxable Salary" for the same
// figure. TAX_INCOME_SERIES is the single source; this pins that each of
// the three reads it and that the hover card carries a swatch per row.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { TAX_INCOME_SERIES } from '../config/taxIncomeSeries';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf-8');

describe('TAX_INCOME_SERIES', () => {
  it('names the income layers once, in stack order, with a color each', () => {
    expect(TAX_INCOME_SERIES.map((s) => s.key)).toEqual(['taxableSalary', 'stockVesting', 'deferredComp', 'pension', 'taxableSS', 'rmdAmount', 'discretionaryDrawPreTax', 'convertAmount', 'otherOrdinary']);
    expect(TAX_INCOME_SERIES.map((s) => s.name)).toEqual(['Wages (Taxable)', 'Stock vesting (RSUs)', 'Deferred comp payouts', 'Pension', 'Taxable SS', 'Forced RMDs', 'Pre-Tax Draws', 'Roth Conversions', 'Other ordinary income']);
    TAX_INCOME_SERIES.forEach((s) => expect(s.color).toMatch(/^var\(--/));
    // One color per layer.
    expect(new Set(TAX_INCOME_SERIES.map((s) => s.color)).size).toBe(TAX_INCOME_SERIES.length);
    expect(TAX_INCOME_SERIES.filter((s) => s.always).map((s) => s.key)).toEqual(['taxableSalary']);
  });

  it('the bars, the legend and the hover card all read the list; none carries its own words', () => {
    const charts = read('components/LazyCharts.jsx');
    const tab = read('components/tabs/TaxEstateTab.jsx');
    expect(charts).toMatch(/TAX_INCOME_SERIES\.map\(\(s\) => <Bar key=\{s\.key\} dataKey=\{s\.key\} stackId="income" fill=\{s\.color\} name=\{s\.name\}/);
    expect(charts).toMatch(/const rows = TAX_INCOME_SERIES\.filter\(\(s\) => s\.always \|\| d\[s\.key\] > 0\)/);
    expect(tab).toMatch(/\{TAX_INCOME_SERIES\.map\(\(s\) => \(/);
    for (const stale of ['Std. Deduction', 'Taxable Salary:', 'W-2 Wages', 'Discretionary Pre-Tax Draws', 'name="Taxable Social Security"']) {
      expect(charts).not.toContain(stale);
      expect(tab).not.toContain(stale);
    }
    // The hover card's rows carry a swatch in the series color.
    expect(charts).toMatch(/backgroundColor: s\.color, border: '1px solid var\(--card-border\)', marginRight: '6px'/);
  });

  it('the Optimizers grid star is white in the cell, and white on a chip in the legend', () => {
    const src = read('components/tabs/StrategyTab.jsx');
    const stars = src.match(/<Star\b[^>]*>/g) || [];
    expect(stars.length).toBe(5);
    expect(stars.filter((s) => s.includes("color: '#fff'")).length).toBe(4);
    expect(stars.every((s) => s.includes('fill="currentColor"'))).toBe(true);
    expect(src).not.toMatch(/<Star[^>]*var\(--warning\)/);
    // The legend chip wears the grid's own strongest cell color, not the
    // brand teal: purple for the Social Security dollar metrics, green for
    // the rest and for the Roth ladder.
    expect(src).toMatch(/backgroundColor: \(ssHeatmapMetric === 'totalSS' \|\| ssHeatmapMetric === 'expectedSS'\) \? 'rgb\(168, 85, 247\)' : 'rgb\(16, 185, 129\)' \}\}><Star/);
    expect(src).toMatch(/backgroundColor: 'rgb\(16, 185, 129\)' \}\}><Star/);
    expect(src).not.toMatch(/backgroundColor: 'var\(--accent-primary\)' \}\}><Star/);
  });
});
