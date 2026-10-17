// @vitest-environment jsdom
// The account summary page of the planner packet (changelog 299).
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import AccountsSummarySheet from '../../components/AccountsSummarySheet';
import { accountsSummaryModel, holdingLabel, groupSmallHoldings } from '../../components/accountsSummaryModel';
import { createHolding } from '../../utils/portfolioHoldings';
import { DEFAULT_INPUTS } from '../../calculator';

afterEach(cleanup);
const fc = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

const inputs = {
  ...DEFAULT_INPUTS, preTaxInit: 1_200_000, rothInit: 300_000, taxableInit: 150_000, hsaInit: 20_000,
  cashFloorEnabled: true, cashFloorInit: 30_000, homeOwned: true, homeValueInit: 500_000,
  mortgageBalance: 120_000, mortgageRate: 3.1, nqdcEnabled1: false, nqdcInit1: 99_999,
};
const holdings = [
  createHolding({ taxTreatment: 'preTax', account: 'Fidelity 401k x4821', institution: 'Fidelity', symbol: 'VTI', name: 'Total Stock Market', shares: 1000, currentPrice: 300, avgBuyPrice: 200 }),
  createHolding({ taxTreatment: 'preTax', account: 'Vanguard IRA 99-1234', institution: 'Vanguard', symbol: 'VTI', name: 'Total Stock Market', shares: 500, currentPrice: 300, avgBuyPrice: 250 }),
  createHolding({ taxTreatment: 'preTax', account: 'Fidelity 401k x4821', symbol: 'BND', name: 'Total Bond', shares: 2000, currentPrice: 75, securityType: 'etf', assetClass: 'bond' }),
  createHolding({ taxTreatment: 'taxable', account: 'Schwab brokerage 5555', symbol: 'SCHD', name: 'US Dividend Equity', shares: 1000, currentPrice: 80, avgBuyPrice: 60 }),
];

describe('accountsSummaryModel', () => {
  const m = accountsSummaryModel(inputs, holdings);
  it('lists balances by tax type, with extras only when switched on', () => {
    expect(m.own.map((r) => r.label)).toEqual([
      'Pre-Tax (Traditional IRA / 401k)', 'Roth (Roth IRA / 401k)', 'Taxable (brokerage and cash)', 'HSA', 'Cash reserve (emergency fund)',
    ]);
    expect(m.investable).toBe(1_700_000);
    expect(m.own.some((r) => /Deferred/.test(r.label))).toBe(false);
  });
  it('nets debts against assets for net worth', () => {
    expect(m.netWorth).toBe(1_700_000 + 500_000 - 120_000);
    expect(m.owe[0]).toMatchObject({ label: 'Mortgage', value: 120_000, note: '3.1%' });
  });
  it('combines the same fund across accounts and shows gain over cost only for taxable', () => {
    const pre = m.buckets.find((b) => b.id === 'preTax');
    const vti = pre.rows.find((r) => r.symbol === 'VTI');
    expect(vti.value).toBe(450_000);
    expect(pre.rows).toHaveLength(2);
    expect(pre.showGain).toBe(false);
    const tax = m.buckets.find((b) => b.id === 'taxable');
    expect(tax.showGain).toBe(true);
    expect(tax.rows[0].gain).toBe(20_000);
  });
  it('flags a tax type whose holdings disagree with the balance the plan uses', () => {
    expect(m.buckets.find((b) => b.id === 'preTax')).toMatchObject({ total: 600_000, planBalance: 1_200_000, differs: true });
    const matched = accountsSummaryModel({ ...inputs, preTaxInit: 600_000 }, holdings);
    expect(matched.buckets.find((b) => b.id === 'preTax').differs).toBe(false);
  });

  it('reports the stock/bond mix across all holdings', () => {
    const bond = m.assetMix.find((c) => c.label === 'Bond');
    expect(bond.value).toBe(150_000);
  });
});

describe('<AccountsSummarySheet />', () => {
  it('never prints account names, firms or account numbers', () => {
    render(<AccountsSummarySheet inputs={inputs} holdings={holdings} formatCurrency={fc} />);
    const text = screen.getByTestId('accounts-summary-sheet').textContent;
    for (const secret of ['x4821', '99-1234', '5555', 'Fidelity', 'Vanguard IRA', 'Schwab']) expect(text).not.toContain(secret);
    expect(text).toContain('VTI');
    expect(text).toContain('Net worth');
  });
  it('says so plainly when the plan has no Detailed Holdings', () => {
    render(<AccountsSummarySheet inputs={inputs} holdings={[]} formatCurrency={fc} />);
    expect(screen.getByTestId('accounts-summary-sheet').textContent).toMatch(/No Detailed Holdings/);
  });
});

describe('holdings on paper (changelog 300)', () => {
  it('shows a made-up fund code as its name, and drops placeholder names', () => {
    expect(holdingLabel('VANGUARD-TARGET-RETIREMENT-2070', 'Vanguard Target Retirement 2070 Trust')).toEqual({ ticker: '', name: 'Vanguard Target Retirement 2070 Trust' });
    expect(holdingLabel('EARNEST-PARTNERS-SMID-CAP', '')).toEqual({ ticker: '', name: 'Earnest Partners Smid Cap' });
    expect(holdingLabel('FSELX', 'FSELX Position')).toEqual({ ticker: 'FSELX', name: '' });
    expect(holdingLabel('T', 'T')).toEqual({ ticker: 'T', name: '' });
    expect(holdingLabel('SCHD', 'Schwab US Dividend Equity ETF')).toEqual({ ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF' });
  });
  it('groups a long tail of small holdings into one line', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ value: i < 5 ? 10000 : 50, pct: 0, gain: 1 }));
    const total = rows.reduce((t, r) => t + r.value, 0);
    rows.forEach((r) => { r.pct = (r.value / total) * 100; });
    const g = groupSmallHoldings(rows);
    expect(g.rows).toHaveLength(10);
    expect(g.other.count).toBe(30);
    expect(g.other.value).toBe(1500);
    expect(g.other.gain).toBe(30);
    expect(groupSmallHoldings(rows.slice(0, 12)).other).toBeNull();
  });
});
