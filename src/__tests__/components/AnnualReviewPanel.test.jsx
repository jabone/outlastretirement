// @vitest-environment jsdom
// AnnualReviewPanel (changelog 256): the checklist's buttons do what they
// say, and ticks survive a remount for the same plan year.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import AnnualReviewPanel from '../../components/plan/AnnualReviewPanel';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, runProjection } from '../../calculator';

beforeEach(() => { localStorage.clear(); });

const step = (id) => screen.getByTestId(`review-step-${id}`);

describe('AnnualReviewPanel', () => {
  it('lists the steps, ticks one, and remembers it across a remount', () => {
    const { unmount } = renderWithSimulation(<AnnualReviewPanel />);
    expect(screen.getByText(/Annual review for/)).toBeInTheDocument();
    const tick = step('income').querySelector('button[aria-pressed]');
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tick);
    expect(step('income').querySelector('button[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
    unmount();
    renderWithSimulation(<AnnualReviewPanel />);
    expect(step('income').querySelector('button[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Advance calls the Plan Year flow; Quick Update opens the dialog; Go there routes to the sub-tab', () => {
    const onAdvanceYear = vi.fn();
    const setShowQuickUpdate = vi.fn();
    const setActiveTab = vi.fn();
    const setSettingsSubTab = vi.fn();
    const inputs = { ...DEFAULT_INPUTS, planYear: new Date().getFullYear() - 1 };
    renderWithSimulation(<AnnualReviewPanel onAdvanceYear={onAdvanceYear} />, { inputs, setShowQuickUpdate, setActiveTab, setSettingsSubTab, projection: runProjection(inputs) });
    fireEvent.click(screen.getByRole('button', { name: /Advance to/ }));
    expect(onAdvanceYear).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open Quick Update' }));
    expect(setShowQuickUpdate).toHaveBeenCalledWith(true);
    fireEvent.click(step('income').querySelector('.btn-outline'));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
    expect(setSettingsSubTab).toHaveBeenCalledWith('income');
  });

  it('Carry forward writes the two Medicare lookback fields and ticks the step', async () => {
    const updateInput = vi.fn();
    const showAlert = vi.fn().mockResolvedValue(undefined);
    const inputs = { ...DEFAULT_INPUTS, irmaaPriorYearMagi: 150000, irmaaTwoYearsPriorMagi: 140000 };
    renderWithSimulation(<AnnualReviewPanel />, { inputs, updateInput, showAlert, projection: runProjection(inputs) });
    fireEvent.click(screen.getByRole('button', { name: 'Carry forward' }));
    expect(updateInput).toHaveBeenCalledWith('irmaaTwoYearsPriorMagi', 150000);
    const prior = updateInput.mock.calls.find((c) => c[0] === 'irmaaPriorYearMagi');
    expect(prior[1]).toBeGreaterThan(0);
    expect(step('magi').querySelector('button[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Save snapshot saves a scenario named for the plan year', async () => {
    const handleSaveScenario = vi.fn().mockResolvedValue(undefined);
    renderWithSimulation(<AnnualReviewPanel />, { handleSaveScenario });
    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }));
    expect(handleSaveScenario).toHaveBeenCalledWith(`Annual review ${DEFAULT_INPUTS.planYear}`, { tag: 'annual-review' });
  });

  it('the complete button unlocks only when every step is ticked', () => {
    renderWithSimulation(<AnnualReviewPanel />);
    const complete = screen.getByRole('button', { name: /Mark the .* review complete/ });
    expect(complete).toBeDisabled();
    screen.getAllByRole('button', { name: /^Tick:/ }).forEach((b) => fireEvent.click(b));
    expect(screen.getByRole('button', { name: /Mark the .* review complete/ })).not.toBeDisabled();
  });
});
