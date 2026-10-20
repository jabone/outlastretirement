// Exports (changelog 450): the preamble every CSV starts with, the Monte
// Carlo range CSV, and the quartiles behind it.
import { describe, it, expect } from 'vitest';
import { csvPreamble, csvPreambleLines, scenarioLabel } from '../utils/csvPreamble';
import { buildMonteCarloCsv, monteCarloPreambleLines, MONTE_CARLO_CSV_HEADERS } from '../utils/monteCarloCsv';
import { runMonteCarlo, runProjection, DEFAULT_INPUTS } from '../calculator';
import { monteCarloForDisplay } from '../utils/displayDollars';
import { APP_VERSION } from '../config/buildInfo';

const day = new Date('2026-10-20T12:00:00Z');

describe('the CSV preamble', () => {
  it('says what the file is, when, which version, which dollars and which assumptions', () => {
    const lines = csvPreambleLines({ title: 'Year by Year ledger', inputs: DEFAULT_INPUTS, useRealDollars: true, date: day });
    expect(lines[0]).toBe('OutlastRetirement export: Year by Year ledger');
    expect(lines[1]).toBe(`Exported 2026-10-20 from version ${APP_VERSION} of the app`);
    expect(lines[2]).toBe(`Dollars: today's dollars (${DEFAULT_INPUTS.planYear} prices)`);
    expect(lines).toContain('Your plan as set (no stress test)');
    expect(lines.some((l) => /^Returns before fees: /.test(l))).toBe(true);
    expect(lines).toContain('Investment fees: fund expenses 0.10%, advisor fee 0% a year');
    expect(lines.at(-1)).toMatch(/not tax, legal or financial advice/);
    // No Keep at Least line without a floor.
    expect(lines.some((l) => /Keep at least/.test(l))).toBe(false);
  });

  it('names future dollars, a replayed start and a floor when they apply', () => {
    const lines = csvPreambleLines({
      title: 'x', useRealDollars: false, date: day,
      inputs: { ...DEFAULT_INPUTS, stressType: 'history', stressHistoryStartYear: 1966, portfolioFloorReal: 200000 },
    });
    expect(lines).toContain('Dollars: future dollars (each year at its own prices)');
    expect(lines).toContain('Stress test: a real 1966 start (actual returns and inflation)');
    expect(lines).toContain("Keep at least: $200,000 in today's dollars");
    expect(scenarioLabel({ stressType: '2008' })).toBe('Stress test: 2008 Financial Crisis');
  });

  it('carries nothing that names the household', () => {
    const inputs = { ...DEFAULT_INPUTS, spouse1Name: 'Ray', spouse2Name: 'Angie' };
    const text = csvPreamble({ title: 'x', inputs, useRealDollars: true, date: day });
    expect(text).not.toMatch(/Ray|Angie/);
  });

  it('is one quoted "#" cell per line, then a blank line before the table', () => {
    const text = csvPreamble({ title: 'Has "quotes", and commas', inputs: DEFAULT_INPUTS, useRealDollars: true, date: day });
    const rows = text.split('\n');
    expect(rows[0]).toBe('"# OutlastRetirement export: Has ""quotes"", and commas"');
    for (const r of rows.filter(Boolean)) expect(r).toMatch(/^"# .*"$/);
    expect(text.endsWith('\n\n')).toBe(true);
  });
});

describe('the Monte Carlo range CSV', () => {
  const mc = runMonteCarlo(DEFAULT_INPUTS);

  it('every year has P10 <= P25 <= P50 <= P75 <= P90, and the share of markets with money left', () => {
    for (const c of mc.growthCurves) {
      expect(c.p10).toBeLessThanOrEqual(c.p25);
      expect(c.p25).toBeLessThanOrEqual(c.p50);
      expect(c.p50).toBeLessThanOrEqual(c.p75);
      expect(c.p75).toBeLessThanOrEqual(c.p90);
      expect(c.fundedPct).toBeGreaterThanOrEqual(0);
      expect(c.fundedPct).toBeLessThanOrEqual(100);
    }
  }, 120000);

  it('one row a year under the header, in the dollars shown', () => {
    const shown = monteCarloForDisplay(mc, runProjection(DEFAULT_INPUTS), true);
    const csv = buildMonteCarloCsv(shown).trim().split('\n');
    expect(csv[0]).toBe(MONTE_CARLO_CSV_HEADERS.join(','));
    expect(csv).toHaveLength(shown.growthCurves.length + 1);
    const first = csv[1].split(',').map(Number);
    const c = shown.growthCurves[0];
    expect(first.slice(0, 6)).toEqual([c.year, c.p10, c.p25, c.p50, c.p75, c.p90]);
    // Today's dollars convert the quartiles too.
    const raw = mc.growthCurves.at(-1);
    expect(shown.growthCurves.at(-1).p25).toBeLessThanOrEqual(raw.p25);
  }, 120000);

  it('its preamble lines give the trials, the success rate and the seed', () => {
    const lines = monteCarloPreambleLines(mc);
    expect(lines[0]).toMatch(/^Trials: 1,000; success rate \d+\.\d%$/);
    expect(lines.some((l) => /^Seed /.test(l))).toBe(true);
  }, 120000);
});
