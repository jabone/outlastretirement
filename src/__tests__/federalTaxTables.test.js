// Federal tax tables keyed by tax year (FEDERAL_TAX_TABLES): a projection
// year reads the newest published table at or before it, carried from that
// table's year by the bracket inflation; every helper still takes a bare
// factor, which means the TAX_YEAR table.
import { describe, it, expect } from 'vitest';
import {
  TAX_YEAR,
  DEFAULT_INPUTS,
  FEDERAL_TAX_TABLES,
  FEDERAL_TAX_TABLE_YEARS,
  BRACKETS_MFJ,
  BRACKETS_SINGLE,
  BRACKETS_HOH,
  DEDUCTION_MFJ,
  DEDUCTION_SINGLE,
  DEDUCTION_HOH,
  ADDITIONAL_DEDUCTION_AGED_MARRIED_2026,
  ADDITIONAL_DEDUCTION_AGED_SINGLE_2026,
  AMT_EXEMPTION_MFJ_2026,
  FEDERAL_ESTATE_EXEMPTION_2026,
  GST_EXEMPTION_2026,
  federalTaxTableYear,
  federalTaxContext,
  federalTaxContextAtRate,
  calculateTaxes,
  calculateCapitalGainsTaxes,
  calculateAMT,
  getTaxBracketLimit,
  additionalStandardDeductionAged,
  getBracketFilling,
  runProjection,
  bracketsFor as bracketsForImport,
} from '../calculator';

const STATUSES = ['MFJ', 'Single', 'MFS', 'HOH'];

describe('the table registry', () => {
  it('has a table for TAX_YEAR, and its 2026 table is the exported 2026 figures', () => {
    expect(FEDERAL_TAX_TABLES[TAX_YEAR]).toBeDefined();
    const t = FEDERAL_TAX_TABLES[2026];
    expect(t.brackets.MFJ).toBe(BRACKETS_MFJ);
    expect(t.brackets.Single).toBe(BRACKETS_SINGLE);
    expect(t.brackets.HOH).toBe(BRACKETS_HOH);
    expect(t.standardDeduction).toMatchObject({ MFJ: DEDUCTION_MFJ, Single: DEDUCTION_SINGLE, HOH: DEDUCTION_HOH });
    expect(t.agedAddOn).toEqual({ married: ADDITIONAL_DEDUCTION_AGED_MARRIED_2026, unmarried: ADDITIONAL_DEDUCTION_AGED_SINGLE_2026 });
    expect(t.amt.exemption.MFJ).toBe(AMT_EXEMPTION_MFJ_2026);
    expect(t.estate.basicExclusion).toBe(FEDERAL_ESTATE_EXEMPTION_2026);
    expect(t.estate.gstExemption).toBe(GST_EXEMPTION_2026);
  });

  it('every table is complete for every status', () => {
    for (const y of FEDERAL_TAX_TABLE_YEARS) {
      const t = FEDERAL_TAX_TABLES[y];
      for (const st of STATUSES) {
        expect(t.brackets[st].length, `${y} ${st}`).toBe(7);
        expect(t.brackets[st][6].limit).toBe(Infinity);
        expect(t.standardDeduction[st]).toBeGreaterThan(0);
        expect(t.capGains.zeroTop[st]).toBeGreaterThan(0);
        expect(t.capGains.fifteenTop[st]).toBeGreaterThan(t.capGains.zeroTop[st]);
        expect(t.preTcjaDeduction[st]).toBe(t.standardDeduction[st] / 2);
      }
      for (const st of ['MFJ', 'Single', 'MFS']) {
        expect(t.amt.exemption[st]).toBeGreaterThan(0);
        expect(t.amt.phaseout[st]).toBeGreaterThan(0);
      }
      expect(t.amt.breakpoint.MFS).toBe(t.amt.breakpoint.joint / 2);
    }
  });

  it('a year reads the newest table at or before it, and the oldest before them all', () => {
    const first = FEDERAL_TAX_TABLE_YEARS[0];
    expect(federalTaxTableYear(first - 5)).toBe(first);
    for (const y of FEDERAL_TAX_TABLE_YEARS) {
      expect(federalTaxTableYear(y)).toBe(y);
      expect(federalTaxTableYear(y + 40) >= y).toBe(true);
    }
  });
});

describe('the context', () => {
  it('passes the factor through untouched for a year that reads the TAX_YEAR table', () => {
    const ctx = federalTaxContext(TAX_YEAR, 1.0123456789, () => { throw new Error('not called'); });
    expect(ctx.tableYear).toBe(TAX_YEAR);
    expect(ctx.factor).toBe(1.0123456789);
  });

  it('a published year is exact: its factor from its own table is 1', () => {
    for (const y of FEDERAL_TAX_TABLE_YEARS) {
      const ctx = federalTaxContextAtRate(y, 2.5, Math.pow(1.025, y - TAX_YEAR));
      expect(ctx.tableYear).toBe(y);
      expect(ctx.factor).toBe(y === TAX_YEAR ? Math.pow(1.025, y - TAX_YEAR) : 1);
    }
  });

  it('without a way to carry a later table, it falls back to the TAX_YEAR table and the factor', () => {
    const ctx = federalTaxContext(TAX_YEAR + 30, 2.1);
    expect(ctx.tableYear).toBe(TAX_YEAR);
    expect(ctx.factor).toBe(2.1);
  });

  it('every helper prices a bare factor exactly as the TAX_YEAR context with that factor', () => {
    const f = 1.3374;
    const ctx = { table: FEDERAL_TAX_TABLES[TAX_YEAR], factor: f };
    for (const st of STATUSES) {
      expect(calculateTaxes(250000, st, ctx)).toBe(calculateTaxes(250000, st, f));
      expect(calculateTaxes(250000, st, ctx, true)).toBe(calculateTaxes(250000, st, f, true));
      expect(calculateCapitalGainsTaxes(80000, 120000, st, ctx, 30000, 0, 5000)).toBe(calculateCapitalGainsTaxes(80000, 120000, st, f, 30000, 0, 5000));
      expect(calculateAMT(900000, st, ctx)).toBe(calculateAMT(900000, st, f));
      expect(getTaxBracketLimit(st, 0.22, ctx)).toBe(getTaxBracketLimit(st, 0.22, f));
      expect(additionalStandardDeductionAged(st, 2, ctx)).toBe(additionalStandardDeductionAged(st, 2, f));
      expect(getBracketFilling(150000, st, ctx)).toEqual(getBracketFilling(150000, st, f));
    }
  });
});

describe('the projection', () => {
  it('records the table each year read, and a TAX_YEAR-table year carries the bracket factor itself', () => {
    const r = runProjection({ ...DEFAULT_INPUTS });
    for (const row of r.years) {
      expect(row.federalTaxYear).toBe(federalTaxTableYear(row.year));
      if (row.federalTaxYear === TAX_YEAR) expect(row.federalTaxFactor).toBe(row.taxBracketInflationFactor);
    }
  });
});

describe('the 2027 table (Rev. Proc. 2026-35)', () => {
  // Pinned to the Revenue Procedure. Changing a figure here means restating
  // where it came from.
  const t = FEDERAL_TAX_TABLES[2027];
  const tops = (rows) => rows.slice(0, 6).map((b) => b.limit);
  it('has the published brackets, deductions, bands and AMT figures', () => {
    expect(tops(t.brackets.MFJ)).toEqual([25600, 104050, 218250, 416650, 529100, 793650]);
    expect(tops(t.brackets.Single)).toEqual([12800, 52025, 109125, 208325, 264550, 661375]);
    expect(tops(t.brackets.MFS)).toEqual([12800, 52025, 109125, 208325, 264550, 396825]);
    expect(tops(t.brackets.HOH)).toEqual([18250, 69650, 109100, 208300, 264550, 661350]);
    expect(t.standardDeduction).toEqual({ MFJ: 33200, Single: 16600, MFS: 16600, HOH: 24925 });
    expect(t.agedAddOn).toEqual({ married: 1700, unmarried: 2100 });
    expect(t.capGains.zeroTop).toEqual({ MFJ: 102100, Single: 51050, MFS: 51050, HOH: 68350 });
    expect(t.capGains.fifteenTop).toEqual({ MFJ: 633600, Single: 563200, MFS: 316800, HOH: 598400 });
    expect(t.amt.exemption).toEqual({ MFJ: 144700, Single: 93000, MFS: 72350 });
    expect(t.amt.phaseout).toEqual({ MFJ: 1031900, Single: 515950, MFS: 515950 });
    expect(t.amt.breakpoint).toEqual({ joint: 252500, MFS: 126250 });
    expect(t.estate).toEqual({ basicExclusion: 15480000, gstExemption: 15480000 });
  });

  it('a 2026 plan prices 2026 on the 2026 table and 2027 on the 2027 table, exactly', () => {
    const r = runProjection({ ...DEFAULT_INPUTS, planYear: 2026 });
    const y26 = r.years.find((y) => y.year === 2026);
    const y27 = r.years.find((y) => y.year === 2027);
    const y28 = r.years.find((y) => y.year === 2028);
    expect(y26.federalTaxYear).toBe(2026);
    expect(y27.federalTaxYear).toBe(2027);
    expect(y27.federalTaxFactor).toBe(1);
    expect(y28.federalTaxYear).toBe(2027);
    expect(y28.federalTaxFactor).toBeCloseTo(1 + DEFAULT_INPUTS.taxBracketInflationRate / 100, 12);
    // The default plan is one filer under 65.
    expect(y27.stdDeduction).toBe(16600);
  });

  it('a plan starting in 2029 carries the 2027 table two years, not the 2026 table three', () => {
    const r = runProjection({ ...DEFAULT_INPUTS, planYear: 2029 });
    const g = 1 + DEFAULT_INPUTS.taxBracketInflationRate / 100;
    expect(r.years[0].federalTaxYear).toBe(2027);
    expect(r.years[0].stdDeduction).toBeCloseTo(16600 * g * g, 6);
  });

  it('a Monte Carlo trial that samples inflation keeps the published year exact and then follows its own path', () => {
    const infl = {};
    const ret = {};
    for (let y = 2026; y < 2100; y++) { infl[y] = 6; ret[y] = 5; }
    const r = runProjection({ ...DEFAULT_INPUTS, planYear: 2026 }, ret, infl);
    const y27 = r.years.find((y) => y.year === 2027);
    const y29 = r.years.find((y) => y.year === 2029);
    expect(y27.stdDeduction).toBe(16600);
    expect(y29.federalTaxFactor).toBeCloseTo(y29.taxBracketInflationFactor / y27.taxBracketInflationFactor, 12);
    expect(y29.federalTaxFactor).toBeGreaterThan(Math.pow(1 + DEFAULT_INPUTS.taxBracketInflationRate / 100, 2));
  });

  it('a history replay keeps 2027 exact and indexes 2028 by the replayed year', () => {
    const r = runProjection({ ...DEFAULT_INPUTS, planYear: 2026, stressType: 'history', stressStartMode: 'specific', stressStartYear: 2026, stressHistoryStartYear: 1973 });
    const y27 = r.years.find((y) => y.year === 2027);
    const y28 = r.years.find((y) => y.year === 2028);
    expect(y27.stdDeduction).toBe(16600);
    expect(y28.federalTaxFactor).toBeCloseTo(y28.taxBracketInflationFactor / y27.taxBracketInflationFactor, 12);
  });

  it('a bare factor still means the TAX_YEAR table', () => {
    expect(getTaxBracketLimit('MFJ', 0.12, 1)).toBe(FEDERAL_TAX_TABLES[TAX_YEAR].brackets.MFJ[1].limit);
    expect(getTaxBracketLimit('MFJ', 0.12, federalTaxContextAtRate(2027, 2.5, 1.025))).toBe(104050);
  });
});

describe('the ACA poverty line defaults to TAX_YEAR coverage', () => {
  it('a call with the household size alone is TAX_YEAR coverage', async () => {
    const { getFederalPovertyLevel } = await import('../calculator');
    for (const n of [1, 2, 3]) expect(getFederalPovertyLevel(n)).toBe(getFederalPovertyLevel(n, TAX_YEAR));
    // 2026 coverage reads the 2025 guideline; 2027 coverage the 2026 one.
    expect(getFederalPovertyLevel(2, 2026)).toBe(15650 + 5500);
    expect(getFederalPovertyLevel(2, 2027)).toBe(15960 + 5680);
  });
});

describe('review fixes: every published year exact in every mode', () => {
  // A plan starting the year before TAX_YEAR is the case every saved plan
  // becomes on January 1, when TAX_YEAR moves on: its first year sits
  // before the TAX_YEAR table, so the bracket factor carries a vintage step.
  const plan = {
    ...DEFAULT_INPUTS, planYear: TAX_YEAR - 1, birthYear1: TAX_YEAR - 56, birthYear2: TAX_YEAR - 56,
    spouse2Enabled: true, filingStatus: 'MFJ', itemizeDeductions: 'never',
    inflationRate: 2.5, taxBracketInflationRate: 2.5,
  };
  const rowFor = (rows, y) => rows.find((r) => r.year === y);
  const mfj = (y) => FEDERAL_TAX_TABLES[y].standardDeduction.MFJ;

  it('deterministic: TAX_YEAR and 2027 are the published deductions', () => {
    const rows = runProjection(plan).years;
    expect(rowFor(rows, TAX_YEAR).stdDeduction).toBe(mfj(TAX_YEAR));
    expect(rowFor(rows, 2027).stdDeduction).toBe(mfj(2027));
  });

  it('a trial with 6% sampled in TAX_YEAR still prices TAX_YEAR on its table ($32,200 for 2026)', () => {
    const ret = {}; const inf = {};
    for (let y = plan.planYear; y < plan.planYear + 60; y += 1) { ret[y] = 5; inf[y] = 2.5; }
    inf[TAX_YEAR] = 6;
    const rows = runProjection(plan, ret, inf).years;
    expect(rowFor(rows, TAX_YEAR).stdDeduction).toBe(mfj(TAX_YEAR));
    if (TAX_YEAR === 2026) expect(rowFor(rows, 2026).stdDeduction).toBe(32200);
    expect(rowFor(rows, 2027).stdDeduction).toBe(mfj(2027));
  });

  it('a history replay from 1973 does too', () => {
    const rows = runProjection({ ...plan, stressType: 'history', stressStartMode: 'specific', stressStartYear: plan.planYear, stressHistoryStartYear: 1973 }).years;
    expect(rowFor(rows, TAX_YEAR).stdDeduction).toBe(mfj(TAX_YEAR));
    expect(rowFor(rows, 2027).stdDeduction).toBe(mfj(2027));
  });

  it('bracketsFor without a table is the TAX_YEAR table, as a bare factor is', () => {
    for (const st of STATUSES) {
      expect(getTaxBracketLimit(st, 0.10, 1)).toBe(bracketsForImport(st)[0].limit);
      expect(bracketsForImport(st)).toBe(FEDERAL_TAX_TABLES[TAX_YEAR].brackets[st]);
    }
  });
});
