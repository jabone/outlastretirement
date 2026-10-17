// @vitest-environment jsdom
//
// Phase 2, target #4 (see UI_TEST_COVERAGE_PLAN.md): DashboardTab.jsx --
// crash-year picker, stress test controls, and the portfolio chart's
// milestone-adjacent controls (this file doesn't re-test AssetGrowthChart's
// own chart-library internals; per the plan's "explicitly out of scope"
// section, deep chart-library testing isn't worth it -- coverage here is
// DashboardTab's OWN wiring: which props/handlers feed the chart and the
// surrounding controls).
//
// Two rounds of a real bug in DashboardTab.jsx's Plan Feedback action
// links are guarded below.
//
// Round 1: every recommendation whose action pointed at 'settings',
// 'taxestate', 'strategy', or 'ledger' called setSettingsSubTab/
// setTaxestateSubTab/setStrategySubTab/setLedgerSubTab -- none of which
// were defined in this file's scope (each was a local useState owned by
// its OWN tab component; only setRiskSubTab was on SimulationContext).
// Clicking any of them threw a ReferenceError and crashed the tab. That
// was patched by dropping the sub-tab intent and calling only
// setActiveTab(rec.action.tab).
//
// Round 2 (2026-08-19): dropping the sub-tab intent was itself wrong --
// it silently sent the user to that tab's DEFAULT sub-tab. 5 of the 11
// recommendations name a non-default sub-tab, so e.g. "Adjust Retirement
// Allocations ->" (Plan Settings > Initial Balances) landed on Basic
// Parameters, ~2,400 lines from the control it named. All five sub-tab
// states are now lifted into SimulationContext (App.jsx), and this
// handler honors both halves of {tab, subTab}. The tests below assert the
// sub-tab is actually set, not just the tab.
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardTab from '../../components/tabs/DashboardTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS } from '../../calculator';

describe('DashboardTab — chart panel and stress test banner', () => {
  it('renders the chart panel with no crash-test banner when stressType is none (default)', () => {
    renderWithSimulation(<DashboardTab />);
    expect(screen.getByText('Portfolio Projection Horizon')).toBeInTheDocument();
    expect(screen.queryByText(/Crash Test Active/)).not.toBeInTheDocument();
  });

  it('shows the crash-test-active banner with the correct label for a named historical scenario', () => {
    renderWithSimulation(<DashboardTab />, { inputs: { ...DEFAULT_INPUTS, stressType: '2008' } });
    expect(screen.getByText(/2008 Financial Crisis \(Sharp Shock\)/)).toBeInTheDocument();
  });

  it('clicking the banner\'s clear (X) button turns the stress test off', async () => {
    const user = userEvent.setup({ delay: null });
    const updateInput = vi.fn();
    renderWithSimulation(<DashboardTab />, { inputs: { ...DEFAULT_INPUTS, stressType: '2008' }, updateInput });

    // The X clear button is icon-only (no accessible name) and isn't the
    // only unnamed button on the page -- scope to the banner itself. The
    // banner's own outer wrapper is also a <span> (matching the inner
    // "Crash Test Active" text's own span too), so .closest('span') alone
    // returns that inner span; climb one more level to the outer one that
    // actually contains the clear button as a sibling.
    const banner = screen.getByText(/Crash Test Active/).closest('span').parentElement;
    await user.click(within(banner).getByRole('button'));
    expect(updateInput).toHaveBeenCalledWith('stressType', 'none');
  });
});

describe('DashboardTab — chart overlay toggles (a11y regression)', () => {
  beforeEach(() => localStorage.clear());

  it('Overlay Taxes Paid and Overlay Lifestyle Spending are reachable via getByLabelText and toggle local state on click', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithSimulation(<DashboardTab />);

    const taxesToggle = screen.getByLabelText('Overlay Taxes Paid');
    const lifestyleToggle = screen.getByLabelText('Overlay Lifestyle Spending');
    // Both overlays start off (changelog 386): the chart opens on the one
    // line a newcomer came for, their savings.
    expect(taxesToggle).not.toBeChecked();
    expect(lifestyleToggle).not.toBeChecked();

    await user.click(screen.getByText('Overlay Taxes Paid'));
    await user.click(screen.getByText('Overlay Lifestyle Spending'));

    expect(taxesToggle).toBeChecked();
    expect(lifestyleToggle).toBeChecked();
  });

  // Changelog 202: the switches remember the last choice.
  it('keeps the last choice after the Dashboard is closed and reopened', async () => {
    const user = userEvent.setup({ delay: null });
    const first = renderWithSimulation(<DashboardTab />);
    await user.click(screen.getByText('Overlay Taxes Paid'));
    await user.click(screen.getByText('Overlay Lifestyle Spending'));
    first.unmount();
    renderWithSimulation(<DashboardTab />);
    expect(screen.getByLabelText('Overlay Taxes Paid')).toBeChecked();
    expect(screen.getByLabelText('Overlay Lifestyle Spending')).toBeChecked();
  });
});

describe('DashboardTab — the answers row (changelog 284)', () => {
  // The Dashboard reads the plan and does not edit it: the return sliders
  // and the Instant Stress Test are gone (Plan -> Assumptions and Risk &
  // Stress own those). In their place, two small cards.
  it('carries no plan-editing controls: no return sliders, no stress test', () => {
    renderWithSimulation(<DashboardTab />);
    expect(screen.queryByText('Investment Return (Pre-Retirement)')).toBeNull();
    expect(screen.queryByText('Investment Return (Post-Retirement)')).toBeNull();
    expect(screen.queryByText('Instant Portfolio Stress Test')).toBeNull();
    expect(screen.queryByText('Random Crash Year')).toBeNull();
    expect(screen.queryByText('Interactive Explorer Guide')).toBeNull();
  });

  it('answers "can I retire today?" with the first safe year, from the plan', () => {
    renderWithSimulation(<DashboardTab />);
    const card = screen.getByTestId('first-safe-year');
    expect(within(card).getByText('First safe year to retire')).toBeInTheDocument();
    // DEFAULT_INPUTS is a working household: the value is a year, Today or Retired.
    expect(within(card).getByText(/^(\d{4}|Today|Retired|Not found)$/)).toBeInTheDocument();
  });

  it('shows the Retirement bridge fund card only when there is a retire/claim age gap, with the correct cost', () => {
    const inputs = { ...DEFAULT_INPUTS, retireAge1: 62, claimingAge1: 65, spouse2Enabled: false };
    const projection = {
      years: [
        { year: 1, age1: 62, lifestyleExpenses: 50000, healthcareBridge: 8000 },
        { year: 2, age1: 63, lifestyleExpenses: 51000, healthcareBridge: 8200 },
        { year: 3, age1: 64, lifestyleExpenses: 52000, healthcareBridge: 8400 },
        { year: 4, age1: 65, lifestyleExpenses: 53000, healthcareBridge: 0 },
      ],
    };
    renderWithSimulation(<DashboardTab />, { inputs, projection });
    const card = screen.getByTestId('bridge-fund');
    expect(within(card).getByText(/3-year gap/)).toBeInTheDocument();
    // (50000+8000) + (51000+8200) + (52000+8400) = 177600 -- the age-65
    // year is excluded since claiming starts that same year.
    expect(within(card).getByText('$177,600')).toBeInTheDocument();
  });

  it('has no bridge fund card when retirement and claiming coincide', () => {
    renderWithSimulation(<DashboardTab />);
    expect(screen.queryByTestId('bridge-fund')).toBeNull();
  });

  it('orders the page: figures, chart, answers, Plan Feedback, then the Action Plan', () => {
    renderWithSimulation(<DashboardTab />);
    const order = [
      screen.getByText('Portfolio Projection Horizon'),
      screen.getByTestId('first-safe-year'),
      screen.getByText('Plan Feedback'),
      screen.getByText('Your Action Plan'),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('DashboardTab — Survivor Stress Test banner', () => {
  it('is hidden by default (survivorStressEnabled is false)', () => {
    renderWithSimulation(<DashboardTab />);
    expect(screen.queryByText('Survivor Stress Test Active')).not.toBeInTheDocument();
  });

  it('shows the named spouse and age once survivorStressEnabled and spouse2Enabled are both on', () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      spouse2Enabled: true,
      survivorStressEnabled: true,
      survivorStressSpouse: 2,
      survivorStressAge: 80,
      spouse2Name: 'Jamie',
    };
    renderWithSimulation(<DashboardTab />, { inputs });
    expect(screen.getByText(/premature passing of Jamie at age 80/)).toBeInTheDocument();
  });
});

describe('DashboardTab — Suggest changes', () => {
  // A proposal, never a rewrite: the button computes the changes and hands
  // them to the Suggested changes dialog. It used to overwrite the plan on
  // one click and then announce what it had done.
  const proposed = (setCalibrationResults) => {
    const r = setCalibrationResults.mock.calls[0][0];
    return { ...r, to: Object.fromEntries(r.changes.map((c) => [c.key, c.to])), from: Object.fromEntries(r.changes.map((c) => [c.key, c.from])) };
  };

  it('clicking Suggest changes proposes changes without touching the plan', async () => {
    const user = userEvent.setup({ delay: null });
    const setInputs = vi.fn();
    const updateInput = vi.fn();
    const setCalibrationResults = vi.fn();
    renderWithSimulation(<DashboardTab />, { setInputs, updateInput, setCalibrationResults });

    await user.click(screen.getByRole('button', { name: 'Suggest changes' }));

    expect(setInputs).not.toHaveBeenCalled();
    expect(updateInput).not.toHaveBeenCalled();
    expect(setCalibrationResults).toHaveBeenCalledTimes(1);
    const r = setCalibrationResults.mock.calls[0][0];
    expect(r).toEqual(expect.objectContaining({
      changes: expect.any(Array),
      patch: expect.any(Object),
      isSuccessful: expect.any(Boolean),
      totalSalary: expect.any(Number),
      nestEgg: expect.any(Number),
    }));
    // Every row is a real change, and the patch is exactly those rows.
    expect(r.changes.length).toBeGreaterThan(0);
    for (const c of r.changes) expect(Number(c.to)).not.toBe(Number(c.from));
    expect(Object.keys(r.patch).sort()).toEqual(r.changes.map((c) => c.key).sort());
    for (const k of Object.keys(r.patch)) expect(k in DEFAULT_INPUTS).toBe(true);
  });

  it('the button no longer calls itself an Easy Button', () => {
    renderWithSimulation(<DashboardTab />);
    expect(screen.queryByText(/Easy Button/)).toBeNull();
    expect(screen.queryByText(/Auto-Calibrate/)).toBeNull();
  });

  it('offers Undo on the Dashboard once suggested changes were applied', async () => {
    const user = userEvent.setup({ delay: null });
    const undoCalibration = vi.fn();
    renderWithSimulation(<DashboardTab />, { calibrationUndo: { ...DEFAULT_INPUTS }, undoCalibration });
    await user.click(screen.getByRole('button', { name: 'Undo suggested changes' }));
    expect(undoCalibration).toHaveBeenCalledTimes(1);
  });

  // Changelog 105: the calibration used to force retireAge2 to Spouse 1's
  // candidate age and claimingAge2 to claimingAge1, erasing the couple's
  // age gap and Spouse 2's own claiming choice. These pin the per-spouse
  // behavior of the proposal.
  const COUPLE_BASE = {
    ...DEFAULT_INPUTS,
    spouse2Enabled: true,
    filingStatus: 'MFJ',
    planYear: 2026,
    birthYear1: 1976, birthYear2: 1981,
    salary1: 80000, salary2: 60000,
    ss1: 30000, ss2: 24000,
    lifeExpectancy1: 88, lifeExpectancy2: 90,
    rothInit: 50000, taxableInit: 50000,
    rothConversionStrategy: 'none',
    stateTaxState: 'none',
    spouse1Name: 'Pat', spouse2Name: 'Sam',
  };

  it('delays both spouses in calendar lockstep, preserving the age gap between their own baselines', async () => {
    const user = userEvent.setup({ delay: null });
    const setInputs = vi.fn();
    const setCalibrationResults = vi.fn();
    // preTaxInit 300000 makes this plan fail at the clamped baselines
    // (62 / 64) and first succeed four years later (verified against the
    // engine while writing the test).
    const inputs = { ...COUPLE_BASE, preTaxInit: 300000, retireAge1: 55, retireAge2: 64, claimingAge1: 67, claimingAge2: 67, lifestyleExpense: 200000 };
    renderWithSimulation(<DashboardTab />, { inputs, setInputs, setCalibrationResults });

    await user.click(screen.getByRole('button', { name: 'Suggest changes' }));

    expect(setInputs).not.toHaveBeenCalled();
    const p = proposed(setCalibrationResults);
    // Baselines clamp to 62 (Spouse 1, from 55) and 64 (Spouse 2's own
    // value -- NOT Spouse 1's); the same 4-year delay lands on 66 / 68.
    expect(p.to.retireAge1).toBe(66);
    expect(p.to.retireAge2).toBe(68);
    // Claiming: each spouse's own choice, pushed to retire+2, capped at 70.
    expect(p.to.claimingAge1).toBe(68);
    expect(p.to.claimingAge2).toBe(70);
    expect(p.from).toMatchObject({ retireAge1: 55, retireAge2: 64, claimingAge2: 67 });
    // Rows name the spouse they belong to.
    expect(p.changes.find((c) => c.key === 'retireAge2').label).toBe('Retirement Age \u2014 Sam');
  });

  it('never overwrites Spouse 2\'s claiming age with Spouse 1\'s, and never lowers a deliberate delay', async () => {
    const user = userEvent.setup({ delay: null });
    const setCalibrationResults = vi.fn();
    // preTaxInit 400000 + bigger buckets: solvent at the baselines, so no
    // delay loop runs and the claiming rules are visible in isolation.
    const inputs = { ...COUPLE_BASE, preTaxInit: 400000, rothInit: 100000, taxableInit: 100000, retireAge1: 62, retireAge2: 64, claimingAge1: 70, claimingAge2: 62, lifestyleExpense: 90000 };
    renderWithSimulation(<DashboardTab />, { inputs, setInputs: vi.fn(), setCalibrationResults });

    await user.click(screen.getByRole('button', { name: 'Suggest changes' }));

    const p = proposed(setCalibrationResults);
    // Unchanged fields are not rows at all.
    expect('retireAge1' in p.to).toBe(false);
    expect('retireAge2' in p.to).toBe(false);
    // Spouse 1 chose 70: stays 70, never pulled down to retire+2 = 64.
    expect('claimingAge1' in p.to).toBe(false);
    // Spouse 2 chose 62: nudged to retire+2 = 66 -- and NOT to Spouse 1's
    // 70, which is what the old max(62, claimingAge1) assignment did.
    expect(p.to.claimingAge2).toBe(66);
  });
});

describe('DashboardTab — Plan Feedback', () => {
  it('renders the three expected recommendations for an untouched DEFAULT_INPUTS plan', () => {
    renderWithSimulation(<DashboardTab />);
    // No Monte Carlo has run in this render, so the first card states the
    // average-returns result and says the market check is pending -- it no
    // longer invents a 100% success rate (outside review, 2026-09-28).
    expect(screen.getByText('Lasts With Average Returns')).toBeInTheDocument();
    expect(screen.queryByText('Plan is Highly Secure')).not.toBeInTheDocument();
    expect(screen.getByText('Spending Guardrails Disabled')).toBeInTheDocument();
    expect(screen.getByText('Static Return Assumption Risk')).toBeInTheDocument();
  });

  // Regression guard for round 1 (no crash) AND round 2 (sub-tab honored).
  it('clicking a Plan Feedback action targeting a tab other than risk sets both the tab and its sub-tab', async () => {
    const user = userEvent.setup({ delay: null });
    const setActiveTab = vi.fn();
    const setStrategySubTab = vi.fn();
    // preTaxInit heavily dominant (>70% of the nest egg) triggers the
    // "Pre-Tax Concentration (RMD Tax Bomb)" recommendation, whose action
    // targets strategy/optimizer -- one of the four previously-broken cases.
    const inputs = { ...DEFAULT_INPUTS, preTaxInit: 800000, rothInit: 100000, taxableInit: 100000 };
    renderWithSimulation(<DashboardTab />, { inputs, setActiveTab, setStrategySubTab });

    await user.click(screen.getByText('Go to Tax Optimizer Hub →'));
    expect(setActiveTab).toHaveBeenCalledWith('strategy');
    expect(setStrategySubTab).toHaveBeenCalledWith('optimizer');
  });

  // The case round 1's patch got silently wrong: a recommendation naming a
  // NON-default sub-tab. 'balances' is not settingsSubTab's default
  // ('basic'), so before the round-2 fix this landed on the wrong panel
  // with no error to notice.
  it('honors a sub-tab that is NOT that tab\'s default (settings/balances)', async () => {
    const user = userEvent.setup({ delay: null });
    const setActiveTab = vi.fn();
    const setSettingsSubTab = vi.fn();
    // taxablePct < 10 with a non-zero preTaxInit triggers the
    // "Low Taxable Liquidity" recommendation -> settings/balances.
    const inputs = { ...DEFAULT_INPUTS, preTaxInit: 900000, rothInit: 100000, taxableInit: 10000, hsaInit: 0 };
    renderWithSimulation(<DashboardTab />, { inputs, setActiveTab, setSettingsSubTab });

    await user.click(screen.getByText('Adjust Starting Balances →'));
    expect(setActiveTab).toHaveBeenCalledWith('settings');
    expect(setSettingsSubTab).toHaveBeenCalledWith('balances');
  });

  it('the risk-targeted action (Spending Guardrails Disabled) still sets both the tab and the sub-tab', async () => {
    const user = userEvent.setup({ delay: null });
    const setActiveTab = vi.fn();
    const setRiskSubTab = vi.fn();
    renderWithSimulation(<DashboardTab />, { setActiveTab, setRiskSubTab });

    await user.click(screen.getByText('View Stress Scenarios →'));
    expect(setActiveTab).toHaveBeenCalledWith('risk');
    expect(setRiskSubTab).toHaveBeenCalledWith('stress');
  });
});
