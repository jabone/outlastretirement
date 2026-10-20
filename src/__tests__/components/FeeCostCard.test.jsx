// @vitest-environment jsdom
// Risk -> What fees cost you (changelog 447), and the Investment Fees
// fields at the top of Assumptions & Risk.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import FeeCostCard from '../../components/FeeCostCard';
import { feeCardLabels } from '../../utils/feeCardLabels';
import ReturnAssumptionsSection from '../../components/plan/sections/ReturnAssumptionsSection';
import { computeFeeComparison, DEFAULT_INPUTS } from '../../calculator';
import { renderWithSimulation } from '../testUtils';

afterEach(cleanup);

const side = (over) => ({
  fundExpenseRatioPct: 0.1, advisorFeePct: 0, lifetimeFees: 12000, lifetimeFundExpenses: 12000, lifetimeAdvisorFees: 0,
  endingBalance: 400000, runsOutYear: null, isSuccessful: true,
  historical: { lasted: 60, count: 64, firstStart: 1928 }, safeMax: 52000, ...over,
});

describe('<FeeCostCard />', () => {
  it('a do-it-yourself plan sees what a 1% advisor fee would cost, in its own numbers', () => {
    const data = {
      kind: 'withAdvisor',
      mine: side(),
      other: side({ advisorFeePct: 1, lifetimeFees: 160000, lifetimeAdvisorFees: 148000, endingBalance: 0, runsOutYear: 2061, historical: { lasted: 51, count: 64, firstStart: 1928 }, safeMax: 46500 }),
    };
    render(<FeeCostCard data={data} loading={false} />);
    expect(screen.getByRole('heading', { name: 'What fees cost you' })).toBeInTheDocument();
    expect(screen.getByText(/no advisor fee\. Here is the same plan with a 1% advisor fee added/)).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'With a 1% advisor fee' })).toBeInTheDocument();
    const fees = within(table).getByRole('row', { name: /Fees paid over the plan/ });
    expect(fees.textContent).toContain('$12,000');
    expect(fees.textContent).toContain('$160,000');
    expect(fees.textContent).toContain('$148,000');
    expect(within(table).getByRole('row', { name: /Left at the end/ }).textContent).toContain('Runs out in 2061');
    expect(within(table).getByRole('row', { name: /Historical starts lasted \(since 1928\)/ }).textContent).toMatch(/60 of 64.*51 of 64.*9/);
    expect(within(table).getByRole('row', { name: /Most you could spend/ }).textContent).toContain('$5,500');
    expect(screen.getByRole('region', { name: /What fees cost you, compared/ })).toHaveAttribute('tabindex', '0');
  });

  it('a plan that pays an advisor sees the same plan without the fee', () => {
    const data = { kind: 'withoutAdvisor', mine: side({ advisorFeePct: 0.85 }), other: side() };
    expect(feeCardLabels(data).otherHeading).toBe('Without the advisor fee');
    render(<FeeCostCard data={data} loading={false} />);
    expect(screen.getByText(/and a 0\.85% advisor fee\. Here is the same plan without the advisor fee/)).toBeInTheDocument();
  });

  it('says it is working while the worker runs, and links back to the fees', () => {
    const { rerender } = render(<FeeCostCard data={null} loading />);
    expect(screen.getByText(/Working out what fees cost your plan/)).toBeInTheDocument();
    const onChangeFees = vi.fn();
    rerender(<FeeCostCard data={computeFeeComparison(DEFAULT_INPUTS)} loading={false} onChangeFees={onChangeFees} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change your fees' }));
    expect(onChangeFees).toHaveBeenCalled();
  });
});

describe('the Investment Fees fields', () => {
  it('sit first in Assumptions, with the total and a link to the comparison', () => {
    const setActiveTab = vi.fn();
    const setRiskSubTab = vi.fn();
    const { container } = renderWithSimulation(<ReturnAssumptionsSection />, { setActiveTab, setRiskSubTab });
    const first = container.querySelector('h3');
    expect(first.textContent).toBe('Investment Fees');
    expect(screen.getByLabelText('Fund Expenses (%/yr)')).toHaveValue('0.1');
    expect(screen.getByLabelText('Advisor Fee (%/yr)')).toHaveValue('0');
    expect(screen.getByTestId('investment-fees').textContent).toMatch(/Total: 0\.10% a year/);
    fireEvent.click(screen.getByRole('button', { name: /what a 1% advisor fee would cost your plan/ }));
    expect(setRiskSubTab).toHaveBeenCalledWith('stress');
    expect(setActiveTab).toHaveBeenCalledWith('risk');
  });
});
