// A28 (2026-09-30 review): the HSA is the last source of spending money.
// A plan used to report a shortfall and fail while a large HSA sat
// untouched, because the withdrawal solver draws only Pre-Tax, Roth and
// Taxable and the HSA paid only qualified medical costs.
import { describe, it, expect } from 'vitest';
import { DEFAULT_INPUTS, runProjection } from '../calculator';
import { YEAR_LEDGER_CSV_HEADERS, buildYearLedgerCsvRows } from '../utils/yearLedgerCsv';
import { cashFlowSankeyFlows } from '../utils/cashFlowSankeyFlows';

// A quiet single retiree: no Social Security, no growth, no inflation, no
// health costs before 65 (so the HSA pays nothing medical before then and
// every HSA dollar that moves is a general-spending draw).
const base = (o = {}) => ({
  planYear: 2026, birthYear1: 1960, retireAge1: 50, lifeExpectancy1: 95, claimingAge1: 70,
  spouse2Enabled: false, filingStatus: 'Single',
  preTaxInit: 0, rothInit: 0, taxableInit: 0, hsaInit: 0,
  preRetireReturn: 0, postRetireReturn: 0, inflationRate: 0, taxBracketInflationRate: 0, ssCOLA: 0,
  medicalInflationRate: 0, medicarePartBInflationRate: 0, medicarePartDInflationRate: 0, ltcInflationRate: 0, housingInflationRate: 0,
  salary1: 0, salary2: 0, ss1: 0, ss2: 0, pension1: 0, pension2: 0,
  preTaxContribution1: 0, preTaxContribution2: 0, rothContribution1: 0, rothContribution2: 0, taxableContribution: 0,
  hsaContribution: 0, lifestyleExpense: 60000, healthcareBridgeCost: 0, taxableDividendYield: 0,
  stateTaxState: 'none', stateOfResidence: 'TX',
  ...o,
});
const run = (o) => runProjection({ ...DEFAULT_INPUTS, ...base(o) });
const sum = (years, k) => years.reduce((s, y) => s + (y[k] || 0), 0);

describe('A28: the HSA pays a shortfall once everything else is spent', () => {
  it('every input key used here is a real input', () => {
    const unknown = Object.keys(base({ birthYear1: 1970 })).filter((k) => !(k in DEFAULT_INPUTS));
    expect(unknown).toEqual([]);
  });

  it('a plan short of money draws the HSA before declaring a shortfall', () => {
    const withHsa = run({ birthYear1: 1970, preTaxInit: 150000, hsaInit: 150000 });
    const noHsa = run({ birthYear1: 1970, preTaxInit: 150000, hsaInit: 0 });
    // No year runs short while the HSA still has money at its end.
    const shortWithMoneyLeft = withHsa.years.filter((y) => y.shortfall > 0.01 && y.hsaEnd > 1);
    expect(shortWithMoneyLeft).toEqual([]);
    expect(sum(withHsa.years, 'hsaGeneralDraw')).toBeCloseTo(150000, 0);
    // The first shortfall comes later and the total is smaller.
    const firstShort = (p) => p.years.find((y) => y.shortfall > 0.01).year;
    expect(firstShort(withHsa)).toBeGreaterThan(firstShort(noHsa));
    expect(sum(withHsa.years, 'shortfall')).toBeLessThan(sum(noHsa.years, 'shortfall') - 50000);
  });

  it('the draw is grossed up so the year is fully paid, tax included', () => {
    const p = run({ birthYear1: 1960, hsaInit: 300000 });
    const y = p.years[0];
    expect(y.shortfall).toBeLessThan(0.01);
    expect(y.hsaGeneralDraw).toBeGreaterThan(60000);
    // What is left after its own tax is exactly the year's spending.
    expect(y.hsaGeneralDraw - y.hsaGeneralDrawTax).toBeCloseTo(60000, 0);
    expect(y.totalTaxesPaid).toBeCloseTo(y.hsaGeneralDrawTax, 2);
    expect(y.federalTax + y.stateTax + y.ficaTax).toBeCloseTo(y.totalTaxesPaid, 2);
    expect(y.hsaEnd).toBeCloseTo(300000 - y.hsaMedicalDraw - y.hsaGeneralDraw, 2);
    // It is income: it shows in taxable income and in the MAGI Medicare reads.
    expect(y.irmaaMagi).toBeCloseTo(y.hsaGeneralDraw, 2);
  });

  it('carries the 20% additional tax before 65 and not at 65', () => {
    const young = run({ birthYear1: 1970, hsaInit: 300000 }).years[0]; // 56
    const old = run({ birthYear1: 1961, hsaInit: 300000 }).years[0]; // 65
    expect(young.age1).toBe(56);
    expect(old.age1).toBe(65);
    expect(young.hsaGeneralDrawPenalty).toBeCloseTo(young.hsaGeneralDraw * 0.2, 2);
    expect(old.hsaGeneralDraw).toBeGreaterThan(0);
    expect(old.hsaGeneralDrawPenalty).toBe(0);
    expect(young.hsaGeneralDrawTax).toBeGreaterThan(old.hsaGeneralDrawTax + 0.2 * 60000);
  });

  it('is not California income (the state already taxed it each year), but is New York income', () => {
    const ca = run({ birthYear1: 1960, hsaInit: 300000, pension1: 30000, stateOfResidence: 'CA', stateTaxState: 'ca' }).years[0];
    const ny = run({ birthYear1: 1960, hsaInit: 300000, pension1: 30000, stateOfResidence: 'NY', stateTaxState: 'ny' }).years[0];
    expect(ca.hsaGeneralDraw).toBeGreaterThan(0);
    expect(ny.hsaGeneralDraw).toBeGreaterThan(0);
    expect(ca.baseStateTax).toBeGreaterThan(0);
    expect(ca.extraTaxState).toBeCloseTo(0, 6);
    expect(ny.extraTaxState).toBeGreaterThan(100);
  });

  it('changes nothing in a plan that never runs short', () => {
    const p = run({ birthYear1: 1960, preTaxInit: 3000000, hsaInit: 100000, lifestyleExpense: 40000 });
    expect(p.years.every((y) => y.shortfall < 0.01)).toBe(true);
    expect(sum(p.years, 'hsaGeneralDraw')).toBe(0);
    expect(sum(p.years, 'hsaGeneralDrawTax')).toBe(0);
  });

  it('shows in the ledger CSV and the cash flow map', () => {
    const p = run({ birthYear1: 1960, hsaInit: 300000 });
    const y = p.years[0];
    const row = buildYearLedgerCsvRows(p)[0];
    expect(row[YEAR_LEDGER_CSV_HEADERS.indexOf('HSA for general spending')]).toBe(Math.round(y.hsaGeneralDraw));
    expect(row[YEAR_LEDGER_CSV_HEADERS.indexOf('HSA general spending tax')]).toBe(Math.round(y.hsaGeneralDrawTax));
    const node = cashFlowSankeyFlows(y).inflows.find((n) => n.name === 'HSA for general spending');
    expect(node.value).toBeCloseTo(y.hsaGeneralDraw, 6);
  });
});
