// @vitest-environment jsdom
//
// Phase 2, target #1 (see UI_TEST_COVERAGE_PLAN.md): PlanYearPanel.jsx was
// picked first because it's small, new, has zero coverage of any kind today,
// and drives a real multi-step async flow (showConfirm -> showPrompt ->
// handleSaveScenario -> updateInput -> showAlert) through the app's custom
// AppDialog system -- a good proof that renderWithSimulation() + user-event
// can exercise that flow at the component level, not just via Playwright.
//
// TAX_YEAR (calculator.js) is a hardcoded constant, currently 2026. These
// tests lean on the fact that "today" is 2026 too (so realYear === TAX_YEAR
// and both gap banners are naturally absent at baseline) and use
// vi.setSystemTime to move "today" forward for the one test that needs
// taxGap > 0 in isolation from planGap.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanYearPanel from '../../components/tabs/PlanYearPanel';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, TAX_YEAR } from '../../calculator';

describe('PlanYearPanel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the three year figures and the advance button with no gap warnings when plan/tax/real years all match', () => {
    renderWithSimulation(<PlanYearPanel />);

    expect(screen.getByText("This plan thinks it's")).toBeInTheDocument();
    // TAX_YEAR and the plan year are both 2026 by default, so the figure
    // appears twice (once per stat card) -- getAllByText rather than
    // asserting a single unique match.
    expect(screen.getAllByText(String(TAX_YEAR)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: `Advance Plan Year to ${TAX_YEAR + 1}` })).toBeInTheDocument();

    expect(screen.queryByText(/behind the real calendar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/out of date/)).not.toBeInTheDocument();
  });

  it('shows only the plan-year-behind warning when planYear lags but TAX_YEAR still matches the real year', () => {
    renderWithSimulation(<PlanYearPanel />, {
      inputs: { ...DEFAULT_INPUTS, planYear: TAX_YEAR - 2 },
    });

    expect(screen.getByText(/behind the real calendar/)).toBeInTheDocument();
    expect(screen.queryByText(/out of date/)).not.toBeInTheDocument();
  });

  it('shows only the tax-figures-out-of-date warning when the real calendar has moved past TAX_YEAR but planYear was advanced to match it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TAX_YEAR + 2, 0, 1));

    renderWithSimulation(<PlanYearPanel />, {
      inputs: { ...DEFAULT_INPUTS, planYear: TAX_YEAR + 2 },
    });

    expect(screen.queryByText(/behind the real calendar/)).not.toBeInTheDocument();
    expect(screen.getByText(/out of date/)).toBeInTheDocument();
  });

  it('canceling the initial confirm dialog does nothing further', async () => {
    const user = userEvent.setup({ delay: null });
    const showConfirm = vi.fn().mockResolvedValue(false);
    const showPrompt = vi.fn();
    const updateInput = vi.fn();
    const showAlert = vi.fn();
    const handleSaveScenario = vi.fn();

    renderWithSimulation(<PlanYearPanel />, { showConfirm, showPrompt, updateInput, showAlert, handleSaveScenario });

    await user.click(screen.getByRole('button', { name: `Advance Plan Year to ${TAX_YEAR + 1}` }));

    expect(showConfirm).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: `Advance Plan Year to ${TAX_YEAR + 1}?` })
    );
    expect(showPrompt).not.toHaveBeenCalled();
    expect(updateInput).not.toHaveBeenCalled();
    expect(showAlert).not.toHaveBeenCalled();
    expect(handleSaveScenario).not.toHaveBeenCalled();
  });

  it('confirming and providing a backup name saves a tagged backup, advances planYear, and shows the success alert', async () => {
    const user = userEvent.setup({ delay: null });
    const showConfirm = vi.fn().mockResolvedValue(true);
    const showPrompt = vi.fn().mockResolvedValue('My Rollback Point');
    const updateInput = vi.fn();
    const showAlert = vi.fn().mockResolvedValue(undefined);
    const handleSaveScenario = vi.fn();

    renderWithSimulation(<PlanYearPanel />, { showConfirm, showPrompt, updateInput, showAlert, handleSaveScenario });

    await user.click(screen.getByRole('button', { name: `Advance Plan Year to ${TAX_YEAR + 1}` }));

    expect(handleSaveScenario).toHaveBeenCalledWith('My Rollback Point', { tag: 'year-advance-backup' });
    expect(updateInput).toHaveBeenCalledWith('planYear', TAX_YEAR + 1);
    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining(String(TAX_YEAR + 1)), 'Plan Year Advanced');
  });

  it('confirming but leaving the backup name blank still advances planYear without saving a backup', async () => {
    const user = userEvent.setup({ delay: null });
    const showConfirm = vi.fn().mockResolvedValue(true);
    const showPrompt = vi.fn().mockResolvedValue('');
    const updateInput = vi.fn();
    const showAlert = vi.fn().mockResolvedValue(undefined);
    const handleSaveScenario = vi.fn();

    renderWithSimulation(<PlanYearPanel />, { showConfirm, showPrompt, updateInput, showAlert, handleSaveScenario });

    await user.click(screen.getByRole('button', { name: `Advance Plan Year to ${TAX_YEAR + 1}` }));

    expect(handleSaveScenario).not.toHaveBeenCalled();
    expect(updateInput).toHaveBeenCalledWith('planYear', TAX_YEAR + 1);
    expect(showAlert).toHaveBeenCalled();
  });

  it('canceling the backup prompt (null) still advances planYear without saving a backup', async () => {
    const user = userEvent.setup({ delay: null });
    const showConfirm = vi.fn().mockResolvedValue(true);
    const showPrompt = vi.fn().mockResolvedValue(null);
    const updateInput = vi.fn();
    const showAlert = vi.fn().mockResolvedValue(undefined);
    const handleSaveScenario = vi.fn();

    renderWithSimulation(<PlanYearPanel />, { showConfirm, showPrompt, updateInput, showAlert, handleSaveScenario });

    await user.click(screen.getByRole('button', { name: `Advance Plan Year to ${TAX_YEAR + 1}` }));

    expect(handleSaveScenario).not.toHaveBeenCalled();
    expect(updateInput).toHaveBeenCalledWith('planYear', TAX_YEAR + 1);
  });

  it('clicking the Scenarios link navigates there via setActiveTab', async () => {
    const user = userEvent.setup({ delay: null });
    const setActiveTab = vi.fn();
    renderWithSimulation(<PlanYearPanel />, { setActiveTab });

    // Was 'ledger' until 2026-08-19, when that one tab was split into
    // Scenarios and Year by Year. This link has always meant "go see your
    // saved rollback", so it points at the scenarios half specifically --
    // asserting the exact id here is what keeps it from silently drifting
    // back to the deprecated alias.
    await user.click(screen.getByRole('button', { name: /Scenarios/ }));
    expect(setActiveTab).toHaveBeenCalledWith('scenarios');
  });
});
