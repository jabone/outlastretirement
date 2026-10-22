// @vitest-environment jsdom
//
// Was LedgerTab.test.jsx's "Scenario Profile Manager" half, split on
// 2026-08-19 with the component (see IA_REVIEW.md).
//
// This is where the one known "crashed the tab" bug already happened: a
// locally-defined save-scenario function didn't attach a `metrics` field
// the results table expects, so saving a scenario threw the moment the tab
// tried to render it. The current `handleSaveScenario` here is a thin
// wrapper (name validation only) that forwards to the real context
// implementation -- the third test below is a direct regression guard for
// that class of bug: it would fail if this wrapper ever went back to
// building its own scenario object instead of delegating.
//
// Every test that used to start with `await goToScenarioManager(user)` no
// longer needs to: scenarios are their own nav destination now, so the
// component renders its real content on mount.
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScenariosTab from '../../components/tabs/ScenariosTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';
import { ODDS_VERSION } from '../../utils/scenarioOdds';

const makeScenario = (overrides = {}) => ({
  id: 's1',
  name: 'Retire at 60',
  inputs: { ...DEFAULT_INPUTS, retireAge1: 60 },
  metrics: { endingBalance: 500000, isSuccessful: true, successProbability: 85, peakPortfolioWorth: 800000, oddsVersion: ODDS_VERSION },
  ...overrides,
});

// A saved scenario's name can legitimately appear twice once it's been
// auto-selected into the side-by-side comparison table (its own column
// header repeats the name) -- so a page-wide getByText(name) is ambiguous.
// Scoping to the "Saved Scenarios List" panel specifically disambiguates.
function getScenarioRow(name) {
  const panel = screen.getByText('Saved Scenarios List').closest('.glass-panel');
  return within(panel).getByText(name).closest('tr');
}

describe('ScenariosTab — Scenario Profile Manager', () => {
  it('does not show odds saved under an earlier release; says Calculating instead', () => {
    const old = makeScenario({ metrics: { endingBalance: 500000, isSuccessful: true, successProbability: 85, peakPortfolioWorth: 800000, oddsVersion: ODDS_VERSION - 1 } });
    renderWithSimulation(<ScenariosTab />, { scenarios: [old] });
    const row = getScenarioRow('Retire at 60');
    expect(row.textContent).not.toMatch(/85%/);
    expect(row.textContent).toMatch(/Calculating/);
  });

  it('shows the empty state when there are no saved scenarios', () => {
    renderWithSimulation(<ScenariosTab />, { scenarios: [] });
    expect(screen.getByText('No Saved Scenarios')).toBeInTheDocument();
  });

  it('blocks saving with an empty name and does not call the context save handler', async () => {
    const user = userEvent.setup({ delay: null });
    const showAlert = vi.fn();
    const handleSaveScenario = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [], showAlert, handleSaveScenario });

    await user.click(screen.getByText('Save'));
    expect(showAlert).toHaveBeenCalledWith('Please enter a name for the scenario', 'Missing Name');
    expect(handleSaveScenario).not.toHaveBeenCalled();
  });

  // Regression guard for the "crashed the tab" bug described at the top of
  // this file: this tab must forward to the context's real
  // handleSaveScenario (which attaches metrics) rather than building its
  // own scenario object.
  it('saving with a valid name forwards the trimmed name to the context handleSaveScenario', async () => {
    const user = userEvent.setup({ delay: null });
    const handleSaveScenario = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [], handleSaveScenario });

    await user.type(screen.getByPlaceholderText('e.g. Retire at 62 (Early)'), '  My Plan  ');
    await user.click(screen.getByText('Save'));

    expect(handleSaveScenario).toHaveBeenCalledWith('My Plan');
  });

  // changelog 133: saving runs a 1,000-lifetime Monte Carlo, which used to
  // run on the main thread and freeze the page. It is async now, and the
  // button has to say so and refuse a second click while it works --
  // otherwise a user hammers a dead-looking button and queues duplicate
  // simulations.
  it('shows a busy Save button and blocks a second click while a save is running', async () => {
    const user = userEvent.setup({ delay: null });
    const handleSaveScenario = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [], handleSaveScenario, isSavingScenario: true });

    const button = screen.getByText('Saving…').closest('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await user.click(button);
    expect(handleSaveScenario).not.toHaveBeenCalled();
  });

  it('shows an idle Save button when no save is in flight', () => {
    renderWithSimulation(<ScenariosTab />, { scenarios: [], isSavingScenario: false });
    const button = screen.getByText('Save').closest('button');
    expect(button).not.toBeDisabled();
  });

  it('renders a saved scenario row with its metrics, the Year Advance Backup badge, and the plan-year-at-save note', () => {
    const scenario = makeScenario({ tag: 'year-advance-backup', planYearAtSave: 2026 });
    renderWithSimulation(<ScenariosTab />, { scenarios: [scenario] });

    const row = getScenarioRow('Retire at 60');
    expect(within(row).getByText('Year Advance Backup')).toBeInTheDocument();
    expect(within(row).getByText('Plan year 2026 at save')).toBeInTheDocument();
    expect(within(row).getByText('$500,000')).toBeInTheDocument();
    expect(within(row).getByText('85%')).toBeInTheDocument();
  });

  it('Load Plan merges the scenario into inputs (over DEFAULT_INPUTS) and confirms via alert', async () => {
    const user = userEvent.setup({ delay: null });
    const scenario = makeScenario();
    const setInputs = vi.fn();
    const showAlert = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [scenario], setInputs, showAlert });

    await user.click(screen.getByText('Load Plan'));

    expect(setInputs).toHaveBeenCalledWith(expect.objectContaining({ ...DEFAULT_INPUTS, retireAge1: 60 }));
    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Retire at 60'), 'Plan Loaded');
  });

  it('deleting a scenario removes it from state only after the confirm dialog resolves true', async () => {
    const user = userEvent.setup({ delay: null });
    const scenario = makeScenario();
    const showConfirm = vi.fn().mockResolvedValue(true);
    const setScenarios = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [scenario], showConfirm, setScenarios });

    // The delete button is icon-only (Trash2, no accessible name) -- scope
    // to the scenario's own row and pick the button with no text content
    // (Load Plan, the other button in the row, has one) rather than a
    // page-wide empty-name match that could collide with other unnamed
    // buttons elsewhere in the tab.
    const row = getScenarioRow('Retire at 60');
    const deleteButton = within(row).getAllByRole('button').find(btn => btn.textContent.trim() === '');
    await user.click(deleteButton);
    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('Retire at 60'), expect.objectContaining({ danger: true }));

    // setScenarios receives a functional updater; invoke it to confirm it
    // actually filters the deleted scenario out rather than e.g. clearing everything.
    const updater = setScenarios.mock.calls[0][0];
    expect(updater([{ id: 's1' }, { id: 's2' }])).toEqual([{ id: 's2' }]);
  });

  it('canceling the delete confirm dialog leaves scenarios untouched', async () => {
    const user = userEvent.setup({ delay: null });
    const scenario = makeScenario();
    const showConfirm = vi.fn().mockResolvedValue(false);
    const setScenarios = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [scenario], showConfirm, setScenarios });

    const row = getScenarioRow('Retire at 60');
    const deleteButton = within(row).getAllByRole('button').find(btn => btn.textContent.trim() === '');
    await user.click(deleteButton);
    expect(setScenarios).not.toHaveBeenCalled();
  });

  it('shows the side-by-side comparison table once 2+ items are selected, and crowns no winner', async () => {
    // A freshly-saved scenario is auto-selected for comparison (see the
    // component's useEffect syncing selectedScenarioIds with `scenarios`),
    // and "Include Current Plan" defaults to true -- so one saved scenario
    // plus the current plan already clears the >= 2 threshold with no
    // extra clicks needed.
    //
    // This test used to assert EXACTLY ONE trophy on the highest ending
    // balance. Changelog 177 removed it deliberately: ending balance is one
    // number out of a life, and the scenario holding the biggest one may
    // have bought it with a decade of lower spending or a claiming age
    // nobody wanted. The assertion is inverted rather than deleted, so a
    // future change that reintroduces a winner marker has to come past it.
    renderWithSimulation(<ScenariosTab />, { scenarios: [makeScenario()] });

    expect(await screen.findByText('Side-by-Side Comparison')).toBeInTheDocument();
    expect(screen.queryByText(/need 2 or more to compare/)).not.toBeInTheDocument();
    expect(screen.queryAllByText('🏆', { exact: false })).toHaveLength(0);
    // Nor any other ranking language in the comparison table.
    expect(screen.queryByText(/\bBest\b|\bWinner\b|\bRecommended\b/)).not.toBeInTheDocument();
  });

  it('lists what differs between the compared plans, one row per input (changelog 270)', async () => {
    renderWithSimulation(<ScenariosTab />, { scenarios: [makeScenario({ inputs: { ...DEFAULT_INPUTS, retireAge1: 60, lifestyleExpense: 66000 } })], inputs: DEFAULT_INPUTS });
    await screen.findByText('Side-by-Side Comparison');
    const diff = screen.getByTestId('scenario-diff');
    expect(screen.getByText('2 inputs differ; everything else is the same in every column.')).toBeInTheDocument();
    const rows = within(diff).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Retire age (you)', 'Lifestyle expense']);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Retire age (you)', String(DEFAULT_INPUTS.retireAge1), '60']);
  });

  it('says so when compared plans have identical inputs', async () => {
    // Two saved copies of the same plan. (The current plan no longer adds a
    // column of its own when it matches a saved one -- changelog 328.)
    renderWithSimulation(<ScenariosTab />, { scenarios: [makeScenario({ inputs: { ...DEFAULT_INPUTS } }), makeScenario({ id: 's2', name: 'Copy', inputs: { ...DEFAULT_INPUTS } })], inputs: DEFAULT_INPUTS });
    await screen.findByText('Side-by-Side Comparison');
    expect(screen.getByText('Nothing: these plans have identical inputs.')).toBeInTheDocument();
  });

  it('unchecking "Include Current Plan" with only one scenario drops back below the 2-item threshold', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<ScenariosTab />, { scenarios: [makeScenario()] });

    await screen.findByText('Side-by-Side Comparison');
    // The "Include Current (Unsaved) Plan" text is now a real <label
    // htmlFor> paired with the checkbox's id (fixed a11y issue), so it's
    // reachable via getByLabelText and clicking the visible text itself
    // toggles the checkbox, not just the switch element.
    await user.click(screen.getByLabelText('Include Current (Unsaved) Plan'));

    expect(screen.getByText(/need 2 or more to compare/)).toBeInTheDocument();
  });

  // Mirror of YearLedgerTab's guard: the year table is a separate
  // destination now, and this tab should not render it.
  it('renders no year-by-year ledger table -- that moved to YearLedgerTab', () => {
    renderWithSimulation(<ScenariosTab />, { scenarios: [] });
    expect(screen.queryByText('Lifestyle Exp')).not.toBeInTheDocument();
    expect(screen.queryByText('Ending Portfolio')).not.toBeInTheDocument();
  });

  it('the three answers fold: closed and showing the summary, open to edit', async () => {
    localStorage.removeItem('retire_plan_folds_v1');
    const setPlanAnswers = vi.fn();
    renderWithSimulation(<ScenariosTab />, { scenarios: [], planAnswers: { protect: 'The house' }, setPlanAnswers });
    const header = screen.getByRole('button', { name: /Your three answers/ });
    // Answers exist, so it opens by default.
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('What are you unwilling to risk?')).toHaveValue('The house');
    await userEvent.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('What are you unwilling to risk?')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-answers-summary').textContent).toBe('Won’t risk: The house');
  });

  it('with no answers yet the fold starts closed', () => {
    localStorage.removeItem('retire_plan_folds_v1');
    renderWithSimulation(<ScenariosTab />, { scenarios: [], planAnswers: {}, setPlanAnswers: vi.fn() });
    expect(screen.getByRole('button', { name: /Your three answers/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
