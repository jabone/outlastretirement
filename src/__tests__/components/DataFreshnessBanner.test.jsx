// @vitest-environment jsdom
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderWithSimulation } from '../testUtils';
import DataFreshnessBanner from '../../components/DataFreshnessBanner';
import {
  FRESHNESS_KEY,
  getFreshnessState,
  recordPlanChange,
  recordPortfolioUpdate,
  computeFreshnessStatus,
} from '../../utils/dataFreshness';

const DAY = 24 * 60 * 60 * 1000;

// The banner only appears when a clock is genuinely overdue, so these
// tests manufacture overdue states by writing freshness records with old
// timestamps -- no fake timers needed, computeFreshnessStatus just reads
// dates.
describe('DataFreshnessBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const seedOverdueBackup = () => {
    const past = Date.now() - 30 * DAY;
    getFreshnessState(past);
    recordPlanChange(past + DAY);
  };

  const seedOverduePortfolio = () => {
    const past = Date.now() - 120 * DAY;
    getFreshnessState(past);
    recordPortfolioUpdate(past);
    // Keep the backup clock quiet so only the portfolio message renders.
    localStorage.setItem(FRESHNESS_KEY, JSON.stringify({
      ...getFreshnessState(),
      lastBackupAt: Date.now(),
      lastPlanChangeAt: null,
    }));
  };

  it('renders nothing when nothing is overdue', () => {
    getFreshnessState(); // fresh seed -- grace window
    const { container } = renderWithSimulation(<DataFreshnessBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the backup message with a Back up now action when backup is overdue', () => {
    seedOverdueBackup();
    renderWithSimulation(<DataFreshnessBanner />);
    expect(screen.getByText(/never been backed up/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back up now/i })).toBeInTheDocument();
  });

  it('phrases the portfolio ask around Quick Update when there are no Detailed Holdings', () => {
    seedOverduePortfolio();
    renderWithSimulation(<DataFreshnessBanner />);
    expect(screen.getByText(/balances were last refreshed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open quick update/i })).toBeInTheDocument();
  });

  it('phrases the portfolio ask around statement import when Detailed Holdings exist', () => {
    seedOverduePortfolio();
    renderWithSimulation(<DataFreshnessBanner />, {
      holdings: [{ id: 'h1', symbol: 'SPY', shares: 10 }],
    });
    expect(screen.getByText(/holdings were last reconciled/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import a statement/i })).toBeInTheDocument();
  });

  it('"Mark as current" resets the portfolio clock and removes the banner', () => {
    seedOverduePortfolio();
    renderWithSimulation(<DataFreshnessBanner />);
    // HoverTooltip sets the button's accessible name to its tooltip text
    // (no explicit aria-label on this one), so query by that.
    fireEvent.click(screen.getByRole('button', { name: /already up to date/i }));
    expect(computeFreshnessStatus().portfolioOverdue).toBe(false);
    expect(screen.queryByRole('button', { name: /already up to date/i })).toBeNull();
  });

  it('the snooze X quiets the banner for a week', () => {
    seedOverdueBackup();
    renderWithSimulation(<DataFreshnessBanner />);
    fireEvent.click(screen.getByRole('button', { name: /snooze this reminder/i }));
    expect(computeFreshnessStatus().backupOverdue).toBe(false);
    const snoozedUntil = getFreshnessState().backupSnoozedUntil;
    expect(snoozedUntil).toBeGreaterThan(Date.now());
    expect(screen.queryByText(/backed up/i)).toBeNull();
  });
});
