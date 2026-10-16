// @vitest-environment jsdom
//
// Phase 2, target #7 (see UI_TEST_COVERAGE_PLAN.md) -- StrategyTab.jsx, the
// last unstarted item from the plan's tab list. This closes out Phase 2.
// 3 sub-tabs, all controlled by this file's OWN local `strategySubTab`
// useState (unlike RiskTab.jsx's context-controlled `riskSubTab`), so
// clicking a nav button in these tests genuinely changes what's rendered.
// Per this doc's own "explicitly out of scope" section, this file doesn't
// click into AgeFinderChart/DieWithZeroChart's own chart-library internals.
//
// A real, currently-live testUtils.jsx bug (same class as the
// `taxVisualizerData: null` one found while testing TaxEstateTab.jsx) was
// found and fixed while writing these tests: `dieWithZeroResults` and
// `targetPortfolioResults` were defaulted to `null` alongside the genuine
// Web-Worker-backed tier-3 results (optimizerResults, ageFinderResults,
// etc.), but in the real App.jsx both are plain synchronous `useMemo`s over
// calculator.js's `findDieWithZeroSpending`/`findTargetPortfolioSize` --
// never null in practice, no loading guard anywhere that reads them. This
// tab's default sub-tab ("Tax Optimizer Hub") reads
// `dieWithZeroResults.spending` and `targetPortfolioResults.targetPortfolio
// .total` unconditionally on first render, so the stale `null` default
// would have crashed every test that rendered this tab's default view
// without an override. Fixed in testUtils.jsx by computing real values
// from those two calculator.js functions once, the same way
// baseProjection/baseKpis already were.
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StrategyTab from '../../components/tabs/StrategyTab.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { DEFAULT_INPUTS } from '../../calculator.js';

describe('StrategyTab — sub-tab navigation', () => {
  it('defaults to the Tax Optimizer Hub sub-tab', () => {
    renderWithSimulation(<StrategyTab />);
    expect(screen.getByText('Lifetime Tax Strategy Optimizer')).toBeInTheDocument();
  });

  it('switches to SS Claiming Heatmap on click', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<StrategyTab />);
    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));
    expect(screen.getByText('Social Security Claiming Strategy Heatmap')).toBeInTheDocument();
  });

  it('switches to Roth Ladder Optimizer on click', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<StrategyTab />);
    await user.click(screen.getByRole('button', { name: 'Roth Ladder Optimizer' }));
    expect(screen.getByText('Roth Conversion Ladder Optimizer')).toBeInTheDocument();
  });
});

describe('StrategyTab — Tax Optimizer Hub', () => {
  const optimizerResults = [
    {
      id: 'taxableFirst',
      name: 'Taxable First (Active Plan)',
      ranking: 'Best',
      description: 'Draws from taxable brokerage first.',
      endingBalance: 1500000,
      totalTaxes: 200000,
      totalRMDs: 50000,
      totalIRMAA: 5000,
      survivorPhaseTaxes: 0,
      config: { withdrawalStrategy: DEFAULT_INPUTS.withdrawalStrategy },
    },
    {
      id: 'rothFirst',
      name: 'Roth First',
      ranking: 'Worst',
      description: 'Draws from Roth first.',
      endingBalance: 900000,
      totalTaxes: 400000,
      totalRMDs: 80000,
      totalIRMAA: 9000,
      survivorPhaseTaxes: 0,
      config: { withdrawalStrategy: 'RothFirst' },
    },
  ];

  it('marks the strategy matching the plan\'s current inputs as Selected/Active, and not the other', () => {
    renderWithSimulation(<StrategyTab />, { optimizerResults });

    const activeCard = screen.getByText('Taxable First (Active Plan)').closest('.glass-panel');
    expect(within(activeCard).getByText('Selected')).toBeInTheDocument();
    expect(within(activeCard).getByRole('button', { name: 'Active Strategy' })).toBeDisabled();

    const otherCard = screen.getByText('Roth First').closest('.glass-panel');
    expect(within(otherCard).queryByText('Selected')).not.toBeInTheDocument();
    expect(within(otherCard).getByRole('button', { name: 'Apply Strategy' })).toBeInTheDocument();
  });

  it('Apply Strategy merges that strategy\'s config into inputs via setInputs', async () => {
    const user = userEvent.setup();
    const setInputs = vi.fn();
    renderWithSimulation(<StrategyTab />, { optimizerResults, setInputs });

    const otherCard = screen.getByText('Roth First').closest('.glass-panel');
    await user.click(within(otherCard).getByRole('button', { name: 'Apply Strategy' }));

    expect(setInputs).toHaveBeenCalledWith(expect.any(Function));
    const updater = setInputs.mock.calls[0][0];
    expect(updater({ withdrawalStrategy: 'TaxableFirst', otherField: 1 })).toEqual({
      withdrawalStrategy: 'RothFirst',
      otherField: 1,
    });
  });

  it('shows the "calculating strategy comparisons" note while results are still loading', () => {
    renderWithSimulation(<StrategyTab />, { optimizerResults: [], heavyResultsLoading: true });
    expect(screen.getByText(/Calculating strategy comparisons/)).toBeInTheDocument();
  });

  it('no longer carries the Age Finder, Die with Zero or the What-If Solver (they are Readiness cards since changelog 285)', () => {
    renderWithSimulation(<StrategyTab />);
    expect(screen.queryByText('Optimal Retirement Age Finder')).toBeNull();
    expect(screen.queryByText(/Die with Zero/)).toBeNull();
    expect(screen.queryByText(/What-If.*Solver/)).toBeNull();
    expect(screen.queryByLabelText('What-If Retirement Age (You)')).toBeNull();
  });

  it('offers an Apply Best Mix button and writes the winning split into the plan', async () => {
    // Every other optimizer on this tab has an Apply button. This one didn't,
    // so finding the better answer left the user to re-key four dollar
    // amounts by hand into Plan Settings.
    const user = userEvent.setup();
    const setInputs = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(true);
    // A split that is NOT already optimal, so the button is offered at all.
    const inputs = { ...DEFAULT_INPUTS, preTaxContribution1: 20000, rothContribution1: 3500 };
    renderWithSimulation(<StrategyTab />, { inputs, setInputs, showConfirm });

    const apply = screen.getByRole('button', { name: /Apply Best Mix/ });
    await user.click(apply);

    // It confirms first, naming the before/after amounts -- unlike the other
    // Apply buttons this rewrites four fields at once.
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(showConfirm.mock.calls[0][0]).toMatch(/Pre-Tax/);
    expect(setInputs).toHaveBeenCalledTimes(1);

    // setInputs is called with an updater; run it to see what it writes.
    const written = setInputs.mock.calls[0][0](inputs);
    expect(written.preTaxContribution1 + written.rothContribution1)
      .toBeCloseTo(inputs.preTaxContribution1 + inputs.rothContribution1, 6);
    expect(written.rothContribution1).not.toBe(inputs.rothContribution1);
  });

  it('does not write anything when the Apply Best Mix confirmation is declined', async () => {
    const user = userEvent.setup();
    const setInputs = vi.fn();
    const showConfirm = vi.fn().mockResolvedValue(false);
    const inputs = { ...DEFAULT_INPUTS, preTaxContribution1: 20000, rothContribution1: 3500 };
    renderWithSimulation(<StrategyTab />, { inputs, setInputs, showConfirm });

    await user.click(screen.getByRole('button', { name: /Apply Best Mix/ }));
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(setInputs).not.toHaveBeenCalled();
  });

  it('labels the split optimizer figures as today\'s or future dollars', () => {
    // The regression that started this: the section reported raw nominal
    // dollars beside a Plan Status chip reporting today's dollars, with
    // nothing on screen to say the two were different currencies.
    const inputs = { ...DEFAULT_INPUTS, preTaxContribution1: 20000, rothContribution1: 3500 };
    const { unmount } = renderWithSimulation(<StrategyTab />, { inputs, useRealDollars: true });
    expect(screen.getByText(/Shown in today.s dollars/)).toBeInTheDocument();
    unmount();

    renderWithSimulation(<StrategyTab />, { inputs, useRealDollars: false });
    expect(screen.getByText(/Shown in future \(nominal\) dollars/)).toBeInTheDocument();
  });
});

describe('StrategyTab — SS Claiming Heatmap', () => {
  it('shows the "calculating claiming-age combinations" note while loading', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<StrategyTab />, { ssClaimingHeatmapData: [], heavyResultsLoading: true });
    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));
    expect(screen.getByText(/Calculating claiming-age combinations/)).toBeInTheDocument();
  });

  it('renders a 1D single-user list when spouse 2 is not enabled (default)', async () => {
    const user = userEvent.setup();
    const ssClaimingHeatmapData = [62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => ({
      claimingAge1: age1, totalSS: 500000 + age1 * 1000, endingBalance: 1000000 + age1 * 1000, isSuccessful: true,
    }));
    renderWithSimulation(<StrategyTab />, { ssClaimingHeatmapData });

    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));
    expect(screen.getByText('Click any claiming age cell to inspect and apply.')).toBeInTheDocument();
    expect(screen.getAllByText(/^Age \d+$/).length).toBe(9);
  });

  it('renders a 2D grid with row/column headers when spouse 2 is enabled', async () => {
    const user = userEvent.setup();
    const ssClaimingHeatmapData = [];
    for (const a1 of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
      for (const a2 of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
        ssClaimingHeatmapData.push({ claimingAge1: a1, claimingAge2: a2, totalSS: 500000, endingBalance: 1000000, isSuccessful: true });
      }
    }
    renderWithSimulation(<StrategyTab />, {
      inputs: { ...DEFAULT_INPUTS, spouse2Enabled: true },
      ssClaimingHeatmapData,
    });

    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));
    expect(screen.getByText(/Rows represent/)).toBeInTheDocument();
  });

  it('the corner names each axis on its own line, in that axis\'s header color', async () => {
    const user = userEvent.setup();
    const ssClaimingHeatmapData = [];
    for (const a1 of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
      for (const a2 of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
        ssClaimingHeatmapData.push({ claimingAge1: a1, claimingAge2: a2, totalSS: 500000, endingBalance: 1000000, isSuccessful: true });
      }
    }
    renderWithSimulation(<StrategyTab />, {
      inputs: { ...DEFAULT_INPUTS, spouse2Enabled: true, spouse1Name: 'Partner A', spouse2Name: 'Partner B' },
      ssClaimingHeatmapData,
    });
    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));

    const corner = screen.getByTestId('claiming-grid-corner');
    const [columnLine, rowLine] = corner.children;
    // Columns (Spouse 2) are gold like the column headers; rows (Spouse 1)
    // are green like the row headers. Each name has a line of its own, so
    // a long pair is never cut off at the start.
    expect(columnLine.textContent).toContain('Partner B');
    expect(columnLine.style.color).toBe('var(--series-2-text)');
    expect(columnLine.style.display).toBe('flex');
    expect(rowLine.textContent).toContain('Partner A');
    expect(rowLine.style.color).toBe('var(--accent-text)');
    expect(rowLine.style.display).toBe('flex');
    // The row header cells use the same green, the column headers the same gold.
    expect(screen.getAllByText('Age 62').map((el) => el.style.color)).toEqual(expect.arrayContaining(['var(--accent-text)', 'var(--series-2-text)']));
    // The sentence above the grid colors the names the same way.
    expect(screen.getByText('Partner A (Spouse 1)').style.color).toBe('var(--accent-text)');
    expect(screen.getByText('Partner B (Spouse 2)').style.color).toBe('var(--series-2-text)');
  });

  it('the Strategy Inspector defaults to the plan\'s current claiming cell and lets you apply a different one', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    const ssClaimingHeatmapData = [62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => ({
      claimingAge1: age1, totalSS: 400000 + age1 * 10000, endingBalance: 1000000, isSuccessful: true,
    }));
    renderWithSimulation(<StrategyTab />, { ssClaimingHeatmapData, updateInput });
    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));

    // DEFAULT_INPUTS.claimingAge1 is 67 -- that cell is the "current" one,
    // so no Apply button should show for it by default.
    expect(screen.getByText(/Analyze claiming at age 67/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply Claiming Strategy' })).not.toBeInTheDocument();

    await user.click(screen.getByText('Age 70'));
    expect(screen.getByText(/Analyze claiming at age 70/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply Claiming Strategy' }));
    expect(updateInput).toHaveBeenCalledWith('claimingAge1', 70);
  });

  it('running the Monte Carlo preview falls back to a synchronous calculation (no real Worker in jsdom)', async () => {
    const user = userEvent.setup();
    const ssClaimingHeatmapData = [62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => ({
      claimingAge1: age1, totalSS: 400000, endingBalance: 1000000, isSuccessful: true,
    }));
    renderWithSimulation(<StrategyTab />, { ssClaimingHeatmapData });
    await user.click(screen.getByRole('button', { name: 'SS Claiming Heatmap' }));

    // "Monte Carlo Success Rate" sits inside its own label div, inside a
    // flex header row, inside the actual panel that also holds the button
    // as a later sibling -- two parentElement climbs, not one.
    const mcPanel = screen.getByText('Monte Carlo Success Rate').closest('div').parentElement.parentElement;
    await user.click(within(mcPanel).getByRole('button'));
    // jsdom has no Worker implementation, so the component's own try/catch
    // fallback runs calculator.js's runMonteCarlo() synchronously instead --
    // this just needs to resolve to *some* percentage inside this specific
    // panel without crashing (the page has other unrelated "%" text, e.g.
    // the Claiming Multipliers FRA-benefit percentages, so the search is
    // scoped to this panel rather than the whole page).
    expect(await within(mcPanel).findByText(/%$/, {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('StrategyTab — the plain-words claiming summary under the heatmap (changelog 286)', () => {
  it('re-runs the plan at 62 / 65 / 67 / 70 beneath the grid, marks the plan\'s age and gives a break-even', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<StrategyTab />, { strategySubTab: 'ssheatmap', ssClaimingHeatmapData: [] });
    const panel = screen.getByTestId('ss-claiming-summary');
    expect(within(panel).getByText('62 (earliest)')).toBeInTheDocument();
    expect(within(panel).getByText('70 (latest)')).toBeInTheDocument();
    expect(within(panel).getByText('YOUR PLAN')).toBeInTheDocument();
    expect(within(panel).getByText('Can you afford to wait until 70?')).toBeInTheDocument();
    expect(within(panel).getByText(/Break-even:/)).toBeInTheDocument();
    expect(user).toBeTruthy();
  });

  it('is absent from the other Optimizers sub-tabs', () => {
    renderWithSimulation(<StrategyTab />, { strategySubTab: 'optimizer' });
    expect(screen.queryByTestId('ss-claiming-summary')).toBeNull();
  });

  it('the annuity purchase fields are no longer on Optimizers', () => {
    renderWithSimulation(<StrategyTab />, { strategySubTab: 'optimizer' });
    expect(screen.queryByText('Guaranteed Income Annuity Simulator')).toBeNull();
    expect(screen.queryByLabelText('Annuity Purchase Amount ($)')).toBeNull();
  });
});

describe('StrategyTab — Roth Ladder Optimizer', () => {
  it('shows the "calculating ladder combinations" note while loading', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<StrategyTab />, { rothBracketHeatmapData: [], heavyResultsLoading: true });
    await user.click(screen.getByRole('button', { name: 'Roth Ladder Optimizer' }));
    expect(screen.getByText(/Calculating ladder combinations/)).toBeInTheDocument();
  });

  it('renders the bracket x withdrawal-order grid by default', async () => {
    const user = userEvent.setup();
    const rothBracketHeatmapData = [0.12, 0.22, 0.24, 0.32].flatMap(bracket =>
      ['TaxableFirst', 'PreTaxFirst', 'RothFirst', 'ProRata'].map(withdrawalStrategy => ({
        bracket, withdrawalStrategy, endingBalance: 1000000, totalTaxesPaid: 100000, isSuccessful: true,
      }))
    );
    renderWithSimulation(<StrategyTab />, { rothBracketHeatmapData });
    await user.click(screen.getByRole('button', { name: 'Roth Ladder Optimizer' }));

    expect(screen.getByText('Bracket x Withdrawal Order Grid')).toBeInTheDocument();
    expect(screen.getByText('Taxable First')).toBeInTheDocument();
  });

  it('switching Ladder Type to Fixed Amount x Duration renders the schedule grid instead', async () => {
    const user = userEvent.setup();
    const rothLadderScheduleHeatmapData = [0.05, 0.1].flatMap(pct =>
      [5, 10].map(durationYears => ({
        pct, durationYears, annualAmount: 50000, endingBalance: 900000, totalTaxesPaid: 80000, isSuccessful: true,
      }))
    );
    renderWithSimulation(<StrategyTab />, { rothLadderScheduleHeatmapData });
    await user.click(screen.getByRole('button', { name: 'Roth Ladder Optimizer' }));
    await user.selectOptions(screen.getByText('Ladder Type').parentElement.querySelector('select'), 'schedule');

    expect(screen.getByText('Fixed Amount x Duration Grid')).toBeInTheDocument();
    expect(screen.getByText('5 yrs')).toBeInTheDocument();
  });

  it('clicking a grid cell then Apply This Ladder updates the roth conversion inputs (bracket mode)', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    const rothBracketHeatmapData = [
      { bracket: 0.12, withdrawalStrategy: 'TaxableFirst', endingBalance: 800000, totalTaxesPaid: 150000, isSuccessful: true },
      { bracket: 0.22, withdrawalStrategy: 'RothFirst', endingBalance: 1200000, totalTaxesPaid: 90000, isSuccessful: true },
    ];
    renderWithSimulation(<StrategyTab />, { rothBracketHeatmapData, updateInput });
    await user.click(screen.getByRole('button', { name: 'Roth Ladder Optimizer' }));

    const row = screen.getByText('22%').closest('div').parentElement;
    await user.click(within(row).getByRole('button'));

    await user.click(screen.getByRole('button', { name: /Apply This Ladder/ }));
    expect(updateInput).toHaveBeenCalledWith('rothConversionStrategy', 'maxBracket');
    expect(updateInput).toHaveBeenCalledWith('rothConversionBracket', 0.22);
    expect(updateInput).toHaveBeenCalledWith('withdrawalStrategy', 'RothFirst');
  });
});

describe('StrategyTab — tools relocated from Plan Settings (IA Phase 3)', () => {
  // Both of these used to live inside Plan Settings > Initial Balances --
  // full optimizers sitting ~800 lines below the fold on a data-entry page,
  // while the tab actually named "Optimizers" had neither. Moved verbatim
  // 2026-08-19; these guard that they render in their new home.
  it('renders the Pre-Tax vs. Roth Contribution Split Optimizer', () => {
    renderWithSimulation(<StrategyTab />);
    expect(screen.getByText('Pre-Tax vs. Roth Contribution Split Optimizer')).toBeInTheDocument();
  });

});
