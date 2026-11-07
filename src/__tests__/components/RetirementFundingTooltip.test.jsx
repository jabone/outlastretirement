// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RetirementFundingTooltip } from '../../components/LazyCharts.jsx';

// The year the owner hovered on 2026-09-19: the default Recharts tooltip listed
// sources in declaration order (not the stack's), showed "Other income: $0"
// and "RMDs: $0", and folded Social Security into "Guaranteed income".
// Since What's New 504 the sources are accounts, not dividends and share sales.
const ROW = {
  year: 2034, age: 66, age1: 66, spending: 212191,
  socialSecurity: 29924, pensions: 0, otherIncome: 0, dividendCashSpent: 0,
  taxableSpent: 87117, preTaxSpent: 95150, rothSpent: 0, otherCash: 0,
  movedToBrokerage: 0, toCharity: 0, rothConversion: 0, notCovered: 0,
  fromStockSale: 0, fromCashReserve: 0, toCashReserve: 0, oneTimeFromAccount: 0, notSpent: 0,
};
const fmt = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const show = (row) => render(<RetirementFundingTooltip active payload={[{ payload: row }]} format={fmt} />).container.textContent;

describe('How Retirement Is Funded tooltip', () => {
  it('lists the sources top-down in the stack\'s order, by name, with their share of spending', () => {
    const text = show(ROW);
    const order = ['From IRA/401(k)', 'From brokerage', 'Social Security'].map((n) => text.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('Spending need (incl. taxes)$212,191');
    expect(text).toContain('Social Security$29,92414%');
    expect(text).not.toMatch(/shares sold|without selling/i);
  });

  it('leaves out sources that are $0 that year', () => {
    const text = show(ROW);
    expect(text).not.toContain('Pensions');
    expect(text).not.toContain('Other income');
    expect(text).not.toContain('Roth');
    expect(text).not.toContain('charity');
  });

  it('notes money moved, given or not covered only when there is some', () => {
    expect(show({ ...ROW, movedToBrokerage: 4000 })).toContain('Plus $4,000 withdrawn but not needed');
    expect(show({ ...ROW, toCharity: 5000 })).toContain('$5,000 from the IRA straight to charity');
    expect(show({ ...ROW, rothConversion: 30000 })).toContain('$30,000 converted to Roth');
    expect(show({ ...ROW, notCovered: 1200 })).toContain('Not covered: $1,200');
  });
});
