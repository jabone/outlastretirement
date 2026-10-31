// @vitest-environment jsdom
//
// Phase 2, target #6 (see UI_TEST_COVERAGE_PLAN.md): RiskTab.jsx -- the 4
// sub-tabs (Historical Stress Tests, Monte Carlo Probability, Sensitivity
// Analysis, Guardrails vs Fixed Withdrawals). `riskSubTab`/`setRiskSubTab`
// are shared SimulationContext state (unlike every other tab's own local
// sub-tab useState), so switching sub-tabs here is tested by asserting the
// nav buttons call `setRiskSubTab` with the right key, and by rendering
// each sub-tab's content directly via a `riskSubTab` override -- clicking a
// nav button in this test harness can't itself change what's on screen,
// since the real switch happens one level up in App.jsx. Per this doc's own
// "explicitly out of scope" section, this file doesn't attempt to click
// into AssetGrowthChart/MonteCarloChart's own chart-library internals
// (recharts needs real layout dimensions jsdom doesn't provide) -- coverage
// here is RiskTab's OWN wiring around those charts.
//
// A real, currently-live bug was found and fixed while writing these tests
// (src/components/tabs/RiskTab.jsx): the Historical Stress Tests chart's
// `onYearSelect` callback called `setWaterfallYear`/`setWaterfallPlaying`,
// neither of which exist anywhere in this file's scope (they're
// DashboardTab.jsx's own local `useState`, not shared context or anything
// RiskTab itself defines -- this file has no Cash Flow Waterfall panel to
// react to a selected year at all). Clicking any point on that chart threw
// a ReferenceError and crashed the whole Risk tab, the same failure class
// as the DashboardTab Plan Feedback bug fixed earlier this session. Fixed
// by removing the dead callback entirely rather than wiring up unused local
// state. Logged as changelog id 24.
import { describe, it, expect, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RiskTab from '../../components/tabs/RiskTab.jsx';
import { renderWithSimulation } from '../testUtils.jsx';
import { DEFAULT_INPUTS } from '../../calculator.js';

describe('RiskTab — sub-tab navigation', () => {
  it('defaults to the Historical Stress Tests sub-tab', () => {
    renderWithSimulation(<RiskTab />);
    // Queried as a heading specifically: the panel heading now matches
    // its sub-tab button's label exactly (one name per destination --
    // see IA_REVIEW.md), so a bare getByText would match both.
    expect(screen.getByRole('heading', { name: /Historical Stress Tests/ })).toBeInTheDocument();
  });

  it('clicking each nav button calls setRiskSubTab with the right key', async () => {
    const user = userEvent.setup();
    const setRiskSubTab = vi.fn();
    renderWithSimulation(<RiskTab />, { setRiskSubTab });

    await user.click(screen.getByRole('button', { name: 'Monte Carlo Probability' }));
    expect(setRiskSubTab).toHaveBeenCalledWith('montecarlo');
    await user.click(screen.getByRole('button', { name: 'Sensitivity Analysis' }));
    expect(setRiskSubTab).toHaveBeenCalledWith('sensitivity');
    await user.click(screen.getByRole('button', { name: 'Guardrails vs Fixed Withdrawals' }));
    expect(setRiskSubTab).toHaveBeenCalledWith('guardrails');
  });
});

describe('RiskTab — Historical Stress Tests', () => {
  it('clicking a stress scenario card updates stressType', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, { updateInput });

    await user.click(screen.getByText('2008 Global Fin. Crisis'));
    expect(updateInput).toHaveBeenCalledWith('stressType', '2008');
  });

  it('hides the Recession Start Year Configuration panel when stressType is none (default)', () => {
    renderWithSimulation(<RiskTab />);
    expect(screen.queryByText('Recession Start Year Configuration')).not.toBeInTheDocument();
  });

  it('shows the Recession Start Year Configuration panel once a stress scenario is active', () => {
    renderWithSimulation(<RiskTab />, { inputs: { ...DEFAULT_INPUTS, stressType: '2008' } });
    expect(screen.getByText('Recession Start Year Configuration')).toBeInTheDocument();
  });

  it('moving the Specific Year slider keeps stressStartYear and stressCrashYear in sync', () => {
    const updateInput = vi.fn();
    const inputs = { ...DEFAULT_INPUTS, stressType: '2008', stressStartMode: 'specific', stressStartYear: 2028 };
    renderWithSimulation(<RiskTab />, { inputs, updateInput });

    const slider = screen.getByText('Selected Start Year:').parentElement.parentElement.querySelector('input[type="range"]');
    fireEvent.change(slider, { target: { value: '2032' } });

    expect(updateInput).toHaveBeenCalledWith('stressStartYear', 2032);
    expect(updateInput).toHaveBeenCalledWith('stressCrashYear', 2032);
  });

  it('selecting Random Year mode picks a random start year (mode + stressStartYear only, not stressCrashYear)', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    renderWithSimulation(<RiskTab />, { inputs: { ...DEFAULT_INPUTS, stressType: '2008' }, updateInput });

    await user.click(screen.getByText('Random Year'));

    expect(updateInput).toHaveBeenCalledWith('stressStartMode', 'random');
    expect(updateInput).toHaveBeenCalledWith('stressStartYear', expect.any(Number));
    expect(updateInput).not.toHaveBeenCalledWith('stressCrashYear', expect.anything());
    vi.restoreAllMocks();
  });

  it('the Reshuffle Start Year button updates both stressStartYear and stressCrashYear together', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    renderWithSimulation(<RiskTab />, {
      inputs: { ...DEFAULT_INPUTS, stressType: '2008', stressStartMode: 'random', stressStartYear: 2028 },
      updateInput,
    });

    await user.click(screen.getByText('Reshuffle Start Year'));

    const calls = Object.fromEntries(updateInput.mock.calls.map(([k, v]) => [k, v]));
    expect(calls.stressStartYear).toBe(calls.stressCrashYear);
    expect(typeof calls.stressStartYear).toBe('number');
    vi.restoreAllMocks();
  });

  it('changing the Stress Inflation Strategy select updates the input', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, { inputs: { ...DEFAULT_INPUTS, stressType: '2008' }, updateInput });

    const select = screen.getByText('Stress Inflation Strategy').closest('div').querySelector('select');
    await user.selectOptions(select, 'delta');

    expect(updateInput).toHaveBeenCalledWith('stressInflationStrategy', 'delta');
  });

  it('shows the correct historical return/inflation detail list for the selected scenario', () => {
    renderWithSimulation(<RiskTab />, { inputs: { ...DEFAULT_INPUTS, stressType: '2008', stockAllocationPost: 60 } });
    // 2008 at 60/40: 0.6 x -36.55 + 0.4 x 20.10 = -13.9%, CPI 3.8%.
    expect(screen.getByText(/-13\.9% Return \/ 3\.8% Inflation/)).toBeInTheDocument();
  });

  it('toggling Activate Spending Guardrails calls updateInput', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, { updateInput });

    // The heading text ("Activate Spending Guardrails") is now paired with
    // the checkbox via aria-labelledby (fixed a11y issue) -- getByLabelText
    // resolves aria-labelledby the same as htmlFor, so this is reachable
    // directly instead of climbing the DOM.
    fireEvent.click(screen.getByLabelText('Activate Spending Guardrails'));
    expect(updateInput).toHaveBeenCalledWith('spendingGuardrails', true);
  });

  // Changelog 216: the withdrawal-rate guardrail, a separate opt-in that
  // can raise spending as well as cut it.
  it('toggling Withdrawal-Rate Guardrails calls updateInput, and its settings only appear when it is on', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, { updateInput });
    expect(screen.queryByText('Trigger band')).toBeNull();
    fireEvent.click(screen.getByLabelText('Withdrawal-Rate Guardrails'));
    expect(updateInput).toHaveBeenCalledWith('withdrawalGuardrailsEnabled', true);
  });

  it('edits each of the five bands when the rule is on', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, { inputs: { ...DEFAULT_INPUTS, withdrawalGuardrailsEnabled: true }, updateInput });
    for (const label of ['Trigger band', 'Cut step', 'Raise step', 'Most you would ever cut', 'Most you would ever raise']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText(/Trigger band/), { target: { value: '15' } });
    expect(updateInput).toHaveBeenCalledWith('wrGuardrailBandPct', 15);
  });

  it('the Compare All button switches the chart view (via context, not local state)', async () => {
    const user = userEvent.setup();
    const setStressChartView = vi.fn();
    renderWithSimulation(<RiskTab />, { setStressChartView });
    // "Overlay Taxes:" is now a real <label htmlFor> paired with the
    // checkbox's id (fixed a11y issue), so it's reachable via
    // getByLabelText, not just getByText.
    expect(screen.getByLabelText('Overlay Taxes')).toBeInTheDocument();

    await user.click(screen.getByText('Compare All'));
    expect(setStressChartView).toHaveBeenCalledWith('comparison');
  });

  it('hides Overlay Taxes and shows the comparison description in Compare All view', () => {
    renderWithSimulation(<RiskTab />, { stressChartView: 'comparison' });
    expect(screen.queryByText('Overlay Taxes')).not.toBeInTheDocument();
    expect(screen.getByText(/Comparison of portfolio decay curves/)).toBeInTheDocument();
  });
});

describe('RiskTab — Monte Carlo Probability', () => {
  it('shows the placeholder prompt before any trial has been run', () => {
    renderWithSimulation(<RiskTab />, { activeTab: 'risk', riskSubTab: 'montecarlo' });
    expect(screen.getByText(/Click "Run 1,000 Trials" to compute probability curves/)).toBeInTheDocument();
  });

  it('Run 1,000 Trials calls handleRunMonteCarlo', async () => {
    const user = userEvent.setup();
    const handleRunMonteCarlo = vi.fn();
    renderWithSimulation(<RiskTab />, { riskSubTab: 'montecarlo', handleRunMonteCarlo });

    await user.click(screen.getByRole('button', { name: 'Run 1,000 Trials' }));
    expect(handleRunMonteCarlo).toHaveBeenCalled();
  });

  it('disables the run button and shows "Simulating..." while mcLoading', () => {
    renderWithSimulation(<RiskTab />, { riskSubTab: 'montecarlo', mcLoading: true });
    expect(screen.getByRole('button', { name: 'Simulating...' })).toBeDisabled();
  });

  it('shows the results cards once monteCarlo results are available', () => {
    const monteCarlo = {
      successProbability: 87.3,
      endingP90: 2500000,
      endingP50: 1200000,
      endingP10: 300000,
      growthCurves: [],
    };
    renderWithSimulation(<RiskTab />, { riskSubTab: 'montecarlo', monteCarlo });

    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByText('$2,500,000')).toBeInTheDocument();
    expect(screen.getByText('$1,200,000')).toBeInTheDocument();
    expect(screen.getByText('$300,000')).toBeInTheDocument();
  });

  it('renders the Minimum Required Rate of Return panel for the default plan without crashing', () => {
    renderWithSimulation(<RiskTab />, { riskSubTab: 'montecarlo' });
    expect(screen.getByText('Your Assumed Return')).toBeInTheDocument();
    expect(screen.getByText('Cushion')).toBeInTheDocument();
  });
});

describe('RiskTab — Sensitivity Analysis', () => {
  it('shows a loading state while sensitivity results are still being calculated (default)', () => {
    renderWithSimulation(<RiskTab />, { riskSubTab: 'sensitivity' });
    expect(screen.getByText(/Calculating sensitivity scenarios/)).toBeInTheDocument();
  });

  it('renders the baseline figure and a tornado bar once results are available', () => {
    const sensitivityResults = {
      baseline: { endingBalance: 500000, isSuccessful: true },
      results: [
        {
          key: 'preRetireReturn',
          label: 'Pre-Retirement Return',
          unitLabel: '±1% pts',
          impact: 50000,
          low: { delta: -50000, scenarioLabel: '-1%' },
          high: { delta: 50000, scenarioLabel: '+1%' },
        },
      ],
    };
    renderWithSimulation(<RiskTab />, { riskSubTab: 'sensitivity', heavyResultsLoading: false, sensitivityResults });

    expect(screen.getByText('$500,000')).toBeInTheDocument();
    expect(screen.getByText('Pre-Retirement Return')).toBeInTheDocument();
  });
});

describe('RiskTab — Guardrails vs Fixed Withdrawals', () => {
  const guardrailsComparisonData = [
    { stressType: 'none', guardrailsOn: true, endingBalance: 1000000, worstYearBalance: 900000, isSuccessful: true },
    { stressType: 'none', guardrailsOn: false, endingBalance: 1000000, worstYearBalance: 900000, isSuccessful: true },
    { stressType: '1929', guardrailsOn: true, endingBalance: 600000, worstYearBalance: 400000, isSuccessful: true },
    { stressType: '1929', guardrailsOn: false, endingBalance: 500000, worstYearBalance: 350000, isSuccessful: true },
  ];

  it('shows a loading state while guardrails results are still being calculated (default)', () => {
    renderWithSimulation(<RiskTab />, { riskSubTab: 'guardrails' });
    expect(screen.getByText(/Calculating stress scenarios/)).toBeInTheDocument();
  });

  it('renders the grid and the "improved in X of Y" summary once results are available', () => {
    renderWithSimulation(<RiskTab />, {
      riskSubTab: 'guardrails',
      heavyResultsLoading: false,
      guardrailsComparisonData,
    });

    expect(screen.getByText('No Crash (Baseline)')).toBeInTheDocument();
    expect(screen.getByText('1929 Great Depression')).toBeInTheDocument();
    expect(screen.getByText(/Guardrails improved the ending balance in/)).toBeInTheDocument();
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
  });

  it('defaults the inspector to the plan\'s own stressType (none) showing "No difference"', () => {
    renderWithSimulation(<RiskTab />, {
      riskSubTab: 'guardrails',
      heavyResultsLoading: false,
      guardrailsComparisonData,
    });

    expect(screen.getByText('Inspecting: No Crash (Baseline)')).toBeInTheDocument();
    expect(screen.getAllByText('No difference').length).toBeGreaterThan(0);
  });

  it('clicking a grid cell switches the inspector to that scenario', async () => {
    const user = userEvent.setup();
    renderWithSimulation(<RiskTab />, {
      riskSubTab: 'guardrails',
      heavyResultsLoading: false,
      guardrailsComparisonData,
    });

    const row = screen.getByText('1929 Great Depression').closest('div').parentElement;
    await user.click(within(row).getAllByRole('button')[0]);

    expect(screen.getByText('Inspecting: 1929 Great Depression')).toBeInTheDocument();
    expect(screen.getByText('+$100,000')).toBeInTheDocument();
  });

  it('the inspector\'s Apply buttons call updateInput with the inspected scenario', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, {
      riskSubTab: 'guardrails',
      heavyResultsLoading: false,
      guardrailsComparisonData,
      inputs: { ...DEFAULT_INPUTS, stressType: '1929' },
      updateInput,
    });

    await user.click(screen.getByRole('button', { name: /Apply: Guardrails On/ }));
    expect(updateInput).toHaveBeenCalledWith('spendingGuardrails', true);
    expect(updateInput).toHaveBeenCalledWith('stressType', '1929');

    await user.click(screen.getByRole('button', { name: /Apply: Fixed Withdrawals/ }));
    expect(updateInput).toHaveBeenCalledWith('spendingGuardrails', false);
  });
});

// Changelog 336: replay one real start year.
describe('RiskTab — a real start year', () => {
  it('picking a year selects the history scenario at that year', () => {
    const updateInput = vi.fn();
    renderWithSimulation(<RiskTab />, { updateInput });
    fireEvent.change(screen.getByRole('combobox', { name: 'Real start year to replay' }), { target: { value: '1973' } });
    expect(updateInput).toHaveBeenCalledWith('stressHistoryStartYear', 1973);
    expect(updateInput).toHaveBeenCalledWith('stressType', 'history');
  });

  it('lists the replayed years with the engine’s own figures', () => {
    const inputs = { ...DEFAULT_INPUTS, stressType: 'history', stressHistoryStartYear: 1973 };
    renderWithSimulation(<RiskTab />, { inputs });
    // 1973 at the default mix, from the same table and formula the engine uses.
    expect(screen.getByText(/Year 1 \(1973\):/)).toBeInTheDocument();
    expect(screen.getByText(/Year 4 \(1976\):/)).toBeInTheDocument();
    expect(screen.getByText(/Then every later year on record/)).toBeInTheDocument();
  });

  it('a Replay in the every-start section puts that start on the chart', async () => {
    const user = userEvent.setup();
    const updateInput = vi.fn();
    const historicalStartsData = {
      retirementYear: 2031, horizonYears: 33, firstStart: 1928, lastStart: 1993, count: 66, inPlan: 'fixed',
      rules: [{ key: 'fixed', inPlan: true, lasted: 60, count: 66, worstStart: 1966, worstRunsOutYear: null, medianLifetimeShare: 1, deepestCut: 0, deepestCutStart: null, medianCutYears: 0, essentialsTouchedStarts: null }],
      starts: [],
    };
    renderWithSimulation(<RiskTab />, { updateInput, historicalStartsData });
    await user.click(screen.getByRole('button', { name: 'Replay it on the chart' }));
    expect(updateInput).toHaveBeenCalledWith('stressHistoryStartYear', 1966);
    expect(updateInput).toHaveBeenCalledWith('stressStartMode', 'retirement');
    expect(updateInput).toHaveBeenCalledWith('stressType', 'history');
  });
});

// The named crises replay the historical table at the plan's stock/bond mix
// (NAMED_STRESS_SCENARIOS), so the listed years come from that table too,
// never a hand-kept list.
describe('RiskTab — named crisis years come from the engine\'s table', () => {
  it('lists 1929-1932 at a 60/40 mix, with the table\'s inflation', () => {
    renderWithSimulation(<RiskTab />, {
      riskSubTab: 'stress',
      inputs: { ...DEFAULT_INPUTS, stressType: '1929', stockAllocationPost: 60 },
    });
    // 1931: 0.6 x -43.84 + 0.4 x -2.56 = -27.3%, CPI -8.9%.
    expect(screen.getByText(/Year 3 \(1931\):/).textContent).toMatch(/-27\.3% Return \/ -8\.9% Deflation/);
    expect(screen.getByText(/Year 1 \(1929\):/).textContent).toMatch(/0\.0% Inflation/);
    expect(screen.getByText(/Year 4 \(1932\):/)).toBeInTheDocument();
    expect(screen.queryByText(/Year 5/)).toBeNull();
    expect(screen.queryByText(/-43\.3% Return/)).toBeNull();
  });

  it('lists three years for 2008', () => {
    renderWithSimulation(<RiskTab />, {
      riskSubTab: 'stress',
      inputs: { ...DEFAULT_INPUTS, stressType: '2008', stockAllocationPost: 60 },
    });
    expect(screen.getByText(/Year 3 \(2010\):/)).toBeInTheDocument();
    expect(screen.queryByText(/Year 4/)).toBeNull();
  });
});
