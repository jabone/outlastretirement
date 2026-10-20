// @vitest-environment jsdom
// The historical panel's market-record choice and Shiller's credit
// (changelog 449).
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, cleanup, fireEvent } from '@testing-library/react';
import { renderWithSimulation } from '../testUtils.jsx';

const render = (ui) => renderWithSimulation(ui, {}, { isPremium: false, portfolioPreview: false });
import HistoricalStartsPanel from '../../components/HistoricalStartsPanel';

afterEach(cleanup);

const rule = { key: 'fixed', inPlan: true, lasted: 109, count: 132, worstStart: 1965, worstRunsOutYear: 2060, medianLifetimeShare: 1, deepestCut: 0, deepestCutStart: null, medianCutYears: 0, essentialsTouchedStarts: null };
const data = (firstStart, count) => ({ retirementYear: 2031, horizonYears: 40, firstStart, lastStart: 1986, count, inPlan: 'fixed', floor: 0, rules: [{ ...rule, count }], starts: [] });

describe('<HistoricalStartsPanel /> market record', () => {
  it('titles itself by the first start and offers 1928 or 1871', () => {
    const onHistoryFrom = vi.fn();
    render(<HistoricalStartsPanel data={data(1928, 75)} historyFrom={1928} onHistoryFrom={onHistoryFrom} />);
    expect(screen.getByRole('heading', { name: 'Every retirement since 1928' })).toBeInTheDocument();
    expect(screen.queryByTestId('shiller-credit')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Market record from' }), { target: { value: '1871' } });
    expect(onHistoryFrom).toHaveBeenCalledWith(1871);
  });

  it('from 1871, credits Robert Shiller beside the results', () => {
    render(<HistoricalStartsPanel data={data(1871, 132)} historyFrom={1871} onHistoryFrom={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Every retirement since 1871' })).toBeInTheDocument();
    expect(screen.getByTestId('shiller-credit').textContent).toMatch(/Robert J\. Shiller, Yale University/);
    expect(screen.getByTestId('historical-headline').textContent).toMatch(/109 of 132/);
  });
});

describe('<HistoricalStartsPanel /> check it year by year (changelog 450)', () => {
  it('opens the hardest start in Year by Year', () => {
    const onReplayInLedger = vi.fn();
    render(<HistoricalStartsPanel data={data(1928, 75)} onReplay={vi.fn()} onReplayInLedger={onReplayInLedger} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check it year by year' }));
    expect(onReplayInLedger).toHaveBeenCalledWith(1965);
  });
});

