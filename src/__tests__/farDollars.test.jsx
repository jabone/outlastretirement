// @vitest-environment jsdom
// Far-future dollars are rounded on the headline surfaces (changelog 277).
//
// A balance thirty years out carries no more than three meaningful digits,
// so the Dashboard KPI cards, the Readiness tab's end-of-plan figures and
// the printed report's summary round to three significant figures once a
// figure sits more than ten years past the plan's first year. The ledger
// and the charts keep every digit -- that is the deliberate split.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { roundToSignificant, isFarYear, farCurrency, farFormatter, peakYearOf, FAR_HORIZON_YEARS, ROUND_FAR_DOLLARS_DEFAULT, ROUND_FAR_DOLLARS_KEY } from '../utils/farDollars';
import ReadinessTab from '../components/tabs/ReadinessTab';
import { installReadinessModule, settled, premiumIt } from './premiumTestHelpers.jsx';
import { renderWithSimulation } from './testUtils';
import { DEFAULT_INPUTS, runProjection } from '../calculator';

afterEach(cleanup);
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, '..', rel), 'utf-8');
const usd = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

describe('roundToSignificant', () => {
  it('keeps three significant figures at every magnitude', () => {
    expect(roundToSignificant(3408199)).toBe(3410000);
    expect(roundToSignificant(916432)).toBe(916000);
    expect(roundToSignificant(23456)).toBe(23500);
    expect(roundToSignificant(1332157)).toBe(1330000);
    expect(roundToSignificant(999500)).toBe(1000000);
    expect(roundToSignificant(-2030111)).toBe(-2030000);
  });
  it('leaves small, zero and non-finite values alone', () => {
    expect(roundToSignificant(0)).toBe(0);
    expect(roundToSignificant(87)).toBe(87);
    expect(roundToSignificant(NaN)).toBeNaN();
    expect(roundToSignificant(undefined)).toBeNaN();
  });
  it('honors a different figure count', () => {
    expect(roundToSignificant(3408199, 2)).toBe(3400000);
    expect(roundToSignificant(3408199, 4)).toBe(3408000);
  });
});

describe('isFarYear / farCurrency', () => {
  it('is far strictly beyond the horizon', () => {
    expect(FAR_HORIZON_YEARS).toBe(10);
    expect(isFarYear(2036, 2026)).toBe(false);
    expect(isFarYear(2037, 2026)).toBe(true);
    expect(isFarYear(undefined, 2026)).toBe(false);
    expect(isFarYear(2060, undefined)).toBe(false);
  });
  it('rounds only when far', () => {
    expect(farCurrency(usd, 3408199, 2060, 2026)).toBe('$3,410,000');
    expect(farCurrency(usd, 3408199, 2030, 2026)).toBe('$3,408,199');
    expect(farFormatter(usd, 2060, 2026)(916432)).toBe('$916,000');
    expect(farFormatter(usd, 2030, 2026)(916432)).toBe('$916,432');
    // Disabled, the formatter IS formatCurrency -- exact everywhere.
    expect(farFormatter(usd, 2060, 2026, false)).toBe(usd);
    expect(farFormatter(usd, 2060, 2026, false)(916432)).toBe('$916,432');
  });
  it('is a preference that defaults to exact figures', () => {
    expect(ROUND_FAR_DOLLARS_DEFAULT).toBe(false);
    expect(ROUND_FAR_DOLLARS_KEY).toBe('retire_plan_round_far_dollars');
    const app = read('App.jsx');
    expect(app).toContain("localStorage.getItem(ROUND_FAR_DOLLARS_KEY)");
    expect(app).toMatch(/farFormatter\(formatCurrency, kpis\.endYear, kpis\.startYear, roundFarDollars\)/);
    expect(app).toMatch(/farFormatter\(formatCurrency, kpis\.peakYear, kpis\.startYear, roundFarDollars\)/);
    expect(read('components/tabs/ReadinessTab.jsx')).toMatch(/farFormatter\([^)]*!!roundFarDollars\)/);
  });
  it('finds the year the peak lands in', () => {
    const years = [{ year: 2026, totalPortfolioEnding: 1 }, { year: 2040, totalPortfolioEnding: 9 }, { year: 2041, totalPortfolioEnding: 5 }];
    expect(peakYearOf(years, 9)).toBe(2040);
    expect(peakYearOf(years, 7)).toBeUndefined();
    expect(peakYearOf(null, 9)).toBeUndefined();
  });
});

describe('the headline surfaces round; the ledger does not', () => {
  it('App.jsx routes the KPI cards and the print summary through the far formatters', () => {
    const src = read('App.jsx');
    expect(src).toMatch(/import \{ farFormatter, peakYearOf, ROUND_FAR_DOLLARS_KEY, ROUND_FAR_DOLLARS_DEFAULT \} from '\.\/utils\/farDollars';/);
    expect(src).toMatch(/kpi-value" style=\{\{ color: 'var\(--accent-text\)' \}\}>\{formatPeak\(kpis\.peak\)\}/);
    expect(src).toMatch(/\{formatEnding\(kpis\.ending\)\}/);
    expect(src).toMatch(/Likely range \{formatEnding\(Math\.round\(mcRange\.p10\)\)\} &ndash; \{formatEnding\(Math\.round\(mcRange\.p90\)\)\}/);
    expect(src).toMatch(/<div className="val">\{formatEnding\(projection\.endingBalance\)\}<\/div>/);
    expect(src).toMatch(/<div className="val">\{formatPeak\(projection\.peakPortfolioWorth\)\}<\/div>/);
    for (const k of ['totalTaxesPaid', 'totalIRMAAPaid', 'totalRMDsForced']) expect(src).toContain(`<td>{formatEnding(projection.${k})}</td>`);
    // The formatters are built from formatCurrency, so they must be declared
    // after it: a const read before its line is a TDZ crash in the built app
    // ("Cannot access 'K' before initialization"), which no unit test
    // renders App.jsx far enough to see.
    expect(src.indexOf('const formatCurrency = useCallback')).toBeLessThan(src.indexOf('farFormatter(formatCurrency'));
    expect(src.indexOf('const kpis = useMemo')).toBeLessThan(src.indexOf('farFormatter(formatCurrency'));
    // The nest egg is today's money and stays exact.
    expect(src).toContain('<span className="kpi-value">{formatCurrency(kpis.initialNestEgg)}</span>');
  });

  it('the Year by Year ledger never imports the far formatter', () => {
    expect(read('components/tabs/YearLedgerTab.jsx')).not.toMatch(/farDollars/);
    expect(read('components/LazyCharts.jsx')).not.toMatch(/farDollars/);
  });

  premiumIt('readiness')('Readiness, with the preference on, rounds every end-of-plan balance on a long plan and leaves yearly money exact', async () => {
    await installReadinessModule();
    const START = DEFAULT_INPUTS.planYear;
    const inputs = {
      ...DEFAULT_INPUTS,
      birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
      salary1: 120000, ss1: 42000, preTaxInit: 1300000, taxableInit: 700000, rothInit: 250000,
      lifestyleExpense: 95000, stateOfResidence: 'TX', stateTaxState: 'none',
    };
    const projection = runProjection(inputs);
    expect(projection.years.length).toBeGreaterThan(FAR_HORIZON_YEARS + 1);
    const { container } = await settled(renderWithSimulation(<ReadinessTab />, { inputs, projection, setActiveTab: vi.fn(), roundFarDollars: true }, { isPremium: true }));
    const figures = [...container.textContent.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
    // Balances are the only figures above half a million on this tab; the
    // yearly budget, draws and taxes sit well below it and stay exact.
    const balances = figures.filter((v) => v >= 500000);
    const yearly = figures.filter((v) => v > 1000 && v < 500000);
    expect(balances.length).toBeGreaterThanOrEqual(6);
    expect(balances.filter((v) => roundToSignificant(v) !== v)).toEqual([]);
    expect(yearly.length).toBeGreaterThanOrEqual(6);
    expect(yearly.some((v) => roundToSignificant(v) !== v)).toBe(true);
  });

  premiumIt('readiness')('Readiness, with the preference off (the default), shows exact balances', async () => {
    await installReadinessModule();
    const START = DEFAULT_INPUTS.planYear;
    const inputs = {
      ...DEFAULT_INPUTS,
      birthYear1: START - 64, retireAge1: 65, lifeExpectancy1: 92, claimingAge1: 70,
      salary1: 120000, ss1: 42000, preTaxInit: 1300000, taxableInit: 700000, rothInit: 250000,
      lifestyleExpense: 95000, stateOfResidence: 'TX', stateTaxState: 'none',
    };
    const projection = runProjection(inputs);
    const { container } = await settled(renderWithSimulation(<ReadinessTab />, { inputs, projection, setActiveTab: vi.fn() }, { isPremium: true }));
    const balances = [...container.textContent.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter((v) => v >= 500000);
    expect(balances.length).toBeGreaterThanOrEqual(6);
    expect(balances.some((v) => roundToSignificant(v) !== v)).toBe(true);
  });
});
