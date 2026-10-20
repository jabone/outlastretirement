// History from 1871 (changelog 449): Robert Shiller's record of the years
// before 1928, the splice against the 1928-on table, and the option that
// starts the historical starts in 1871.
import { describe, it, expect } from 'vitest';
import { HISTORICAL_RETURNS_PRE1928, PRE1928_FIRST_YEAR, SHILLER_DATA_SHA256 } from '../config/historicalReturnsPre1928';
import { HISTORICAL_RETURNS, HISTORY_FIRST_YEAR } from '../config/historicalReturns';
import { SHILLER_ANNUAL_OVERLAP } from './fixtures/shillerAnnualOverlap';
import {
  runHistoricalStarts, runProjection, runMonteCarlo, sanitizeInputs, historyFirstYear, historicalStartYears, DEFAULT_INPUTS,
} from '../calculator';

const geo = (xs) => (Math.exp(xs.reduce((s, x) => s + Math.log(1 + x / 100), 0) / xs.length) - 1) * 100;
const corr = (a, b) => {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let n = 0; let da = 0; let db = 0;
  a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; });
  return n / Math.sqrt(da * db);
};

describe('the pre-1928 table', () => {
  it('runs 1871 to 1927, one row a year, ending where the 1928 table begins', () => {
    expect(PRE1928_FIRST_YEAR).toBe(1871);
    expect(HISTORICAL_RETURNS_PRE1928).toHaveLength(57);
    HISTORICAL_RETURNS_PRE1928.forEach((r, i) => expect(r[0]).toBe(1871 + i));
    expect(HISTORICAL_RETURNS_PRE1928.at(-1)[0] + 1).toBe(HISTORY_FIRST_YEAR);
    expect(SHILLER_DATA_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pins its first and last rows', () => {
    expect(HISTORICAL_RETURNS_PRE1928[0]).toEqual([1871, 15.32, 5.04, 1.52]);
    expect(HISTORICAL_RETURNS_PRE1928.at(-1)[0]).toBe(1927);
  });

  it('splices onto the 1928-on table: over 1928-2022 the two average within 0.3 points a year and move together', () => {
    const dam = new Map(HISTORICAL_RETURNS.map((r) => [r[0], r]));
    const both = SHILLER_ANNUAL_OVERLAP.filter((r) => dam.has(r[0]));
    expect(both.length).toBeGreaterThanOrEqual(90);
    for (const [i, minCorr] of [[1, 0.95], [2, 0.9], [3, 0.8]]) {
      const s = both.map((r) => r[i]);
      const d = both.map((r) => dam.get(r[0])[i]);
      expect(Math.abs(geo(s) - geo(d)), `column ${i}`).toBeLessThan(0.3);
      expect(corr(s, d), `column ${i}`).toBeGreaterThan(minCorr);
    }
  });
});

describe('the 1871 option', () => {
  it('is 1928 by default and only ever 1928 or 1871', () => {
    expect(DEFAULT_INPUTS.historyFromYear).toBe(1928);
    expect(historyFirstYear(DEFAULT_INPUTS)).toBe(1928);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, historyFromYear: 1871 }).historyFromYear).toBe(1871);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, historyFromYear: 1900 }).historyFromYear).toBe(1928);
  });

  it('adds exactly the 57 earlier starts, and leaves the 1928 count alone', () => {
    const a = runHistoricalStarts(DEFAULT_INPUTS);
    const b = runHistoricalStarts({ ...DEFAULT_INPUTS, historyFromYear: 1871 });
    expect(a.firstStart).toBe(1928);
    expect(b.firstStart).toBe(1871);
    expect(b.count).toBe(a.count + 57);
    expect(historicalStartYears(a.horizonYears, 1871)).toHaveLength(b.count);
    // The 1928-on starts are the same runs either way.
    const fromB = b.starts.filter((s) => s.start >= 1928).map((s) => s.fixed.ok);
    expect(fromB).toEqual(a.starts.map((s) => s.fixed.ok));
  }, 120000);

  it('a pre-1928 start replays from the Shiller rows', () => {
    const p = runProjection({ ...DEFAULT_INPUTS, stressType: 'history', stressStartMode: 'retirement', stressHistoryStartYear: 1906 });
    const first = p.years.find((y) => y.isRetired);
    const row = HISTORICAL_RETURNS_PRE1928.find((r) => r[0] === 1906);
    expect(first.growthRate).toBeCloseTo(row[1] * (DEFAULT_INPUTS.stockAllocationPost / 100) + row[2] * (1 - DEFAULT_INPUTS.stockAllocationPost / 100), 6);
    expect(sanitizeInputs({ ...DEFAULT_INPUTS, stressHistoryStartYear: 1850 }).stressHistoryStartYear).toBe(1871);
  });

  it('leaves the Monte Carlo alone: its bootstrap stays on 1928 onward', () => {
    const base = { ...DEFAULT_INPUTS, mcReturnModel: 'bootstrap' };
    expect(runMonteCarlo({ ...base, historyFromYear: 1871 }).successProbability)
      .toBe(runMonteCarlo(base).successProbability);
  }, 120000);
});
