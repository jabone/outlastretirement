// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RetirementFundingTooltip } from '../../components/LazyCharts.jsx';

// The year the owner hovered on 2026-09-19: the default Recharts tooltip listed
// sources in declaration order (not the stack's), showed "Other income: $0"
// and "RMDs: $0", and folded Social Security into "Guaranteed income".
const ROW = {
  year: 2034, age1: 66, spending: 212191,
  socialSecurity: 29924, pensions: 0, otherIncome: 0,
  dividendsAsCash: 87117, shareSales: 95150, forcedSurplus: 0,
  incomePct: ((29924 + 87117) / 212191) * 100,
};
const fmt = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const show = (row) => render(<RetirementFundingTooltip active payload={[{ payload: row }]} format={fmt} />).container.textContent;

describe('How Retirement Is Funded tooltip', () => {
  it('lists the sources top-down in the stack\'s order, by name, with their share of spending', () => {
    const text = show(ROW);
    const order = ['Shares sold', 'Dividends taken as cash', 'Social Security'].map((n) => text.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('Spending need (incl. taxes)$212,191');
    expect(text).toContain('Social Security$29,92414%');
    expect(text).toContain('55% paid without selling shares');
  });

  it('leaves out sources that are $0 that year', () => {
    const text = show(ROW);
    expect(text).not.toContain('Pensions');
    expect(text).not.toContain('Other income');
    expect(text).not.toContain('RMD');
  });

  it('mentions an unspent RMD only when there is one', () => {
    expect(show({ ...ROW, forcedSurplus: 4000 })).toContain('Plus $4,000 of required minimum distributions');
  });
});
