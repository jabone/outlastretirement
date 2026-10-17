// Text alternatives for the charts (WCAG 1.1.1). The summaries are built
// from the same rows each chart draws; these tests pin the wording rules
// and make sure every wired chart actually carries one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spokenDollars, growthSummary, monteCarloSummary, stressSummary, STRESS_SERIES, taxBracketSummary, estateSummary, scenarioSummary, fundingSummary } from '../utils/chartSummaries';

const SRC = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

describe('spokenDollars', () => {
  it('writes millions as a word a screen reader can say', () => {
    expect(spokenDollars(4455064)).toBe('$4.46 million');
    expect(spokenDollars(3000000)).toBe('$3 million');
    expect(spokenDollars(1250000)).toBe('$1.25 million');
  });
  it('rounds smaller amounts to the thousand', () => {
    expect(spokenDollars(751400)).toBe('$751,000');
    expect(spokenDollars(412)).toBe('$412');
    expect(spokenDollars(0)).toBe('$0');
    expect(spokenDollars(undefined)).toBe('$0');
  });
});

const yr = (year, total, shortfall = 0) => ({ year, totalPortfolioEnding: total, shortfall });

describe('growthSummary', () => {
  it('names the start, the peak and the end, and says spending is covered', () => {
    const s = growthSummary([yr(2026, 1.9e6), yr(2044, 4.8e6), yr(2063, 4.46e6)]);
    expect(s).toBe('Your savings grow from $1.9 million at the end of 2026 to a peak of $4.8 million in 2044, then are $4.46 million in 2063. Every year\'s spending is covered through 2063.');
  });
  it('drops the peak when savings only rise or only fall', () => {
    expect(growthSummary([yr(2026, 1e6), yr(2030, 2e6)])).toMatch(/^Your savings grow from \$1 million at the end of 2026 to \$2 million in 2030\./);
    expect(growthSummary([yr(2026, 2e6), yr(2030, 5e5)])).toMatch(/^Your savings are \$2 million at the end of 2026 and are \$500,000 by 2030\./);
  });
  it('reports the first year spending is not covered', () => {
    const s = growthSummary([yr(2026, 1e6), yr(2050, 1e5, 0), yr(2051, 0, 20000), yr(2052, 0, 30000)]);
    expect(s).toMatch(/Starting in 2051, the plan cannot fully cover your spending\.$/);
  });
  it('is empty with no data', () => {
    expect(growthSummary([])).toBe('');
    expect(growthSummary(undefined)).toBe('');
  });
});

describe('monteCarloSummary', () => {
  const curves = [
    { year: 2026, p10: 1.9e6, p50: 1.9e6, p90: 1.9e6 },
    { year: 2063, p10: 1.2e6, p50: 4.1e6, p90: 9.8e6 },
  ];
  it('gives the success rate and the three ending values', () => {
    expect(monteCarloSummary(curves, 91.4)).toBe(
      'In 91% of the simulated markets the money lasts through 2063. By 2063, a typical market (the median) leaves $4.1 million, a strong one (best 10%) $9.8 million, and a weak one (worst 10%) $1.2 million.'
    );
  });
  it('says when a weak market runs out', () => {
    const s = monteCarloSummary([{ year: 2026, p10: 1e6, p50: 1e6, p90: 1e6 }, { year: 2055, p10: 0, p50: 2e6, p90: 5e6 }], 72);
    expect(s).toMatch(/In a weak market, savings run out around 2055\.$/);
  });
  it('omits the rate when there is none', () => {
    expect(monteCarloSummary(curves)).toMatch(/^By 2063/);
  });
});

describe('stressSummary', () => {
  const rows = [
    { year: 2026, none: 2e6, 1929: 2e6, 1966: 2e6, 1973: 2e6, 2000: 2e6, 2008: 2e6 },
    { year: 2050, none: 4e6, 1929: 1e6, 1966: 0, 1973: 2e6, 2000: 3e6, 2008: 3.5e6 },
    { year: 2063, none: 4.46e6, 1929: 1.2e6, 1966: 0, 1973: 2.1e6, 2000: 3.3e6, 2008: 3.9e6 },
  ];
  it('lists every historical market and names the hardest one', () => {
    expect(stressSummary(rows)).toBe(
      'Without a historical crash, savings end at $4.46 million in 2063. Replaying each historical market: 1929 Great Depression, $1.2 million; 1966 Lost Decade, run out in 2050; 1973 Stagflation, $2.1 million; 2000 Dot-Com Crash, $3.3 million; 2008 Financial Crisis, $3.9 million. The hardest for this plan is the 1966 Lost Decade.'
    );
  });
  it('is empty while the comparison is still computing', () => {
    expect(stressSummary([])).toBe('');
  });
  it('uses the same series names as the chart legend', () => {
    const charts = read('components/LazyCharts.jsx');
    for (const { key, name } of STRESS_SERIES) {
      expect(charts, `${key} -> ${name}`).toContain(`name="${name}" dataKey="${key}"`);
    }
  });
});

describe('every first-group chart carries its summary', () => {
  it('the Dashboard portfolio chart', () => {
    expect(read("components/tabs/DashboardTab.jsx")).toMatch(/<ChartFigure summary=\{growthSummary\(projection\.years(, growthBand)?\)\}/);
  });
  it('the Risk tab stress chart and Monte Carlo chart', () => {
    const risk = read('components/tabs/RiskTab.jsx');
    expect(risk).toMatch(/stressSummary\(stressComparisonData[,)]/);
    expect(risk).toMatch(/<ChartFigure summary=\{monteCarloSummary\(monteCarlo\.growthCurves, monteCarlo\.successProbability\)\}/);
  });
  it('the maximized views', () => {
    const app = read('App.jsx');
    expect(app).toMatch(/className="chart-summary">\{growthSummary\(projection\.years(, growthRange\(monteCarloShown, mcRange, inputs\))?\)\}/);
    expect(app).toMatch(/className="chart-summary">\{monteCarloSummary\(/);
  });
});

describe('second group (changelog 315)', () => {
  it('tax brackets: the peak year and bracket, retirement brackets, conversions', () => {
    const rows = [
      { year: 2026, totalOrdinaryGross: 400000, marginalBracket: 0.32, isRetired: false, convertAmount: 0 },
      { year: 2031, totalOrdinaryGross: 150000, marginalBracket: 0.22, isRetired: true, convertAmount: 60000 },
      { year: 2032, totalOrdinaryGross: 160000, marginalBracket: 0.22, isRetired: true, convertAmount: 60000 },
      { year: 2040, totalOrdinaryGross: 260000, marginalBracket: 0.24, isRetired: true, convertAmount: 0 },
    ];
    expect(taxBracketSummary(rows)).toBe('Income subject to ordinary tax peaks at $400,000 in 2026, in the 32% bracket. In retirement, most years sit in the 22% bracket; the highest is 24%, first in 2040. Roth conversions add $120,000 of income from 2031 to 2032.');
    expect(taxBracketSummary([])).toBe('');
  });

  it('estate: gross, net, cents on the dollar, and where the tax falls', () => {
    const rows = [
      { name: 'Pre-Tax IRA', Gross: 1000000, Net: 700000, TaxDrag: 300000 },
      { name: 'Roth IRA', Gross: 500000, Net: 500000, TaxDrag: 0 },
      { name: 'Total Portfolio', Gross: 2000000, Net: 1700000, TaxDrag: 300000 },
    ];
    expect(estateSummary(rows)).toBe('Your heirs would inherit $2 million and keep about $1.7 million after taxes, roughly 85 cents of every dollar. The largest share of the tax falls on the Pre-Tax IRA, which heirs pay income tax on as they withdraw it.');
    expect(estateSummary([{ name: 'Total Portfolio', Gross: 1e6, Net: 1e6, TaxDrag: 0 }])).toMatch(/No tax is due on what they inherit\.$/);
    expect(estateSummary([{ name: 'Total Portfolio', Gross: 0, Net: 0, TaxDrag: 0 }])).toBe('');
  });

  it('scenarios: two lines get the difference; a run-out is named', () => {
    const data = [{ year: 2026, 'Keep doing this': 1e6, 'With one change': 1e6 }, { year: 2063, 'Keep doing this': 4.46e6, 'With one change': 3.1e6 }];
    expect(scenarioSummary(data, ['Keep doing this', 'With one change'])).toBe('Keep doing this ends with $4.46 million in 2063; With one change ends with $3.1 million in 2063. The difference is $1.36 million, in favor of Keep doing this.');
    const out = [{ year: 2026, A: 1e6, B: 1e6 }, { year: 2050, A: 2e6, B: 0 }, { year: 2063, A: 3e6, B: 0 }];
    expect(scenarioSummary(out, ['A', 'B'])).toBe('A ends with $3 million in 2063; B runs out in 2050.');
    const many = [{ year: 2063, a: 1, b: 2e6, c: 3e6, d: 4e6, e: 5e6, f: 6e6 }];
    expect(scenarioSummary(many, ['a', 'b', 'c', 'd', 'e', 'f'])).toBe('Of 6 scenarios, the strongest is f, at $6 million in 2063; the weakest is a, at $1 in 2063.');
  });

  it('funding: first-year mix, later coverage, and whether spending is covered', () => {
    const rows = [
      { year: 2031, spending: 100000, guaranteedPct: 20, dividendsAsCash: 10000, shareSalesPct: 70, deficit: 0 },
      { year: 2063, spending: 150000, guaranteedPct: 55, dividendsAsCash: 0, shareSalesPct: 45, deficit: 0 },
    ];
    expect(fundingSummary(rows)).toBe('In 2031, guaranteed income covers 20% of spending (taxes included), dividends taken as cash 10%, and selling investments 70%. By 2063, guaranteed income covers 55%. Spending is covered in every retired year.');
    expect(fundingSummary([{ ...rows[0], deficit: 5000 }])).toMatch(/From 2031, spending is not fully covered\.$/);
  });

  it('every second-group chart carries its summary', () => {
    expect(read('components/tabs/TaxEstateTab.jsx')).toMatch(/<ChartFigure summary=\{taxBracketSummary\(taxVisualizerData\)\}/);
    expect(read('components/tabs/TaxEstateTab.jsx')).toMatch(/<ChartFigure summary=\{estateSummary\(estateChartData\)\}/);
    expect(read('components/tabs/ScenariosTab.jsx')).toMatch(/scenarioSummary\(scenarioChartData, selectedScenarios\.map/);
    expect(read('components/OneLeverCompare.jsx')).toMatch(/scenarioSummary\(chartData, \[BASE_SERIES, CHANGE_SERIES\]\)/);
    const app = read('App.jsx');
    expect(app).toMatch(/className="chart-summary">\{taxBracketSummary\(taxVisualizerData\)\}/);
    expect(app).toMatch(/className="chart-summary">\{estateSummary\(estateChartData\)\}/);
  });
});

