// @vitest-environment jsdom
// The cash-flow explorer, moved from the Dashboard to Year by Year
// (changelog 284). These are the Dashboard's old waterfall tests, now
// against the component itself, plus the new home.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CashFlowExplorer from '../../components/CashFlowExplorer';
import YearLedgerTab from '../../components/tabs/YearLedgerTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, runProjection } from '../../calculator';

afterEach(cleanup);
const projection = runProjection(DEFAULT_INPUTS);
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

describe('CashFlowExplorer', () => {
  it('shows the default explorer guide text with no node hovered', () => {
    renderWithSimulation(<CashFlowExplorer projection={projection} inputs={DEFAULT_INPUTS} formatCurrency={usd} setMaximizedComponent={vi.fn()} />);
    expect(screen.getByText('Interactive Explorer Guide')).toBeInTheDocument();
  });

  it('the year range slider updates the displayed year', () => {
    renderWithSimulation(<CashFlowExplorer projection={projection} inputs={DEFAULT_INPUTS} formatCurrency={usd} setMaximizedComponent={vi.fn()} />);
    const startLabel = screen.getByText(/^Start \(/);
    const yearSlider = startLabel.closest('div').parentElement.querySelector('input[type="range"]');
    const targetYear = Number(yearSlider.max) - 1;
    fireEvent.change(yearSlider, { target: { value: String(targetYear) } });
    expect(screen.getByText(`Year ${targetYear}`)).toBeInTheDocument();
  });

  it('the Autoplay button toggles its own label between play and pause', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<CashFlowExplorer projection={projection} inputs={DEFAULT_INPUTS} formatCurrency={usd} setMaximizedComponent={vi.fn()} />);
    await user.click(screen.getByText('Autoplay Projections'));
    expect(screen.getByText('Pause Autoplay')).toBeInTheDocument();
  });

  it('renders nothing without a projection', () => {
    const { container } = renderWithSimulation(<CashFlowExplorer projection={{ years: [] }} inputs={DEFAULT_INPUTS} formatCurrency={usd} />);
    expect(container.textContent).toBe('');
  });
});

describe('Year by Year — Cash flow view', () => {
  it('is the ledger\'s third view and shows the explorer when chosen', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<YearLedgerTab />, { projection });
    const pill = screen.getByRole('button', { name: 'Cash flow' });
    expect(screen.queryByText('Interactive Explorer Guide')).toBeNull();
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Interactive Explorer Guide')).toBeInTheDocument();
  });

  it('reads the view from shared state when the app provides it (#/yearledger/cashflow)', () => {
    renderWithSimulation(<YearLedgerTab />, { projection, yearledgerSubTab: 'cashflow', setYearledgerSubTab: vi.fn() });
    expect(screen.getByText('Interactive Explorer Guide')).toBeInTheDocument();
  });
});
