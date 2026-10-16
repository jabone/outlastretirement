// Test harness for rendering components that call useSimulation(). Every
// tab/UI component in this app reads from SimulationContext, which THROWS
// if it's null (see src/context/useSimulation.js) -- so nothing under
// src/components/ or src/App.jsx can be rendered in a test without
// something supplying all of it. This file is that something.
//
// See UI_TEST_COVERAGE_PLAN.md at the repo root for the full scoping
// rationale (Phase 0). Individual test files should import
// `renderWithSimulation` and pass only the 1-2 context keys their
// component actually reads via the `overrides` param -- the defaults below
// exist so everything else "just works" without every test having to
// reconstruct the full ~50-key context shape by hand.
//
// Fidelity notes on where these defaults come from, tier by tier:
//   1. inputs/projection/kpis/heirTaxResults -- computed via the REAL
//      calculator.js functions against DEFAULT_INPUTS, the same way
//      App.jsx computes them. These are cheap (a handful of ms) and stay
//      accurate automatically if calculator.js's output shape changes.
//   2. Simple scalar/UI state (activeTab, theme, largeTextMode, etc.) --
//      copied from App.jsx's own useState initial values, so a fresh
//      render here matches what a real first load looks like.
//   3. Heavy, Web-Worker-computed results (optimizerResults,
//      ageFinderResults, stressComparisonData, the heatmaps, etc.) --
//      defaulted to App.jsx's own pre-worker-completion initial shape
//      (empty arrays / the same placeholder objects it uses) rather than
//      actually running those optimizers here. That's a real, valid state
//      every consuming component already has to handle (the moment right
//      after mount, before the worker resolves) -- and it keeps every test
//      that doesn't care about these fast. A test that DOES care should
//      override the specific key with a real computed value.
//   4. Bespoke chart-shaping data assembled inline in App.jsx itself
//      (estateChartData, taxVisualizerData, scenarioChartData,
//      scenarioProjections) -- defaulted to empty arrays rather than
//      duplicating App.jsx's own useMemo logic here, which would just be a
//      second copy to keep in sync. Override per-test with a small fixture
//      when the component under test actually reads one of these.
import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import SimulationContext from '../context/SimulationContext';
import EntitlementContext from '../context/EntitlementContext';
import { usePortfolioHoldings } from '../context/usePortfolioHoldings';
import { DEFAULT_INPUTS, runProjection, calculateHeirEstateTax, findDieWithZeroSpending, findTargetPortfolioSize, rmdStartAge } from '../calculator';

// Guard for hand-built plan objects; see knownInputKeys.js.
export { assertKnownInputKeys, unknownInputKeys } from './knownInputKeys';

// App.jsx's getRMDAge is the engine's rmdStartAge.
const getRMDAge = rmdStartAge;

const formatCurrency = (val) => {
  if (val === undefined || val === null) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
};

// Computed once at module load (not per-render) since DEFAULT_INPUTS never
// changes between calls -- keeps every test file's setup cheap.
const baseProjection = runProjection(DEFAULT_INPUTS);
const baseKpis = {
  initialNestEgg: DEFAULT_INPUTS.preTaxInit + DEFAULT_INPUTS.rothInit + DEFAULT_INPUTS.taxableInit,
  peak: baseProjection.peakPortfolioWorth,
  ending: baseProjection.endingBalance,
  isSuccessful: baseProjection.isSuccessful,
};
// StrategyTab.jsx reads dieWithZeroResults.spending / .additionalSpend and
// targetPortfolioResults.targetPortfolio.total unconditionally on first
// render (no loading guard) -- unlike optimizerResults/ageFinderResults/
// etc., these are NOT Web-Worker results in the real App.jsx. They're
// App.jsx's own useMemo, computed synchronously via calculator.js's
// findDieWithZeroSpending/findTargetPortfolioSize every render, so they're
// never null in practice. Computed once here for the same reason
// baseProjection/baseKpis are: real, cheap-enough (~40 bisection projection
// runs each, same cost class as getMinimumRequiredReturn) function calls
// rather than a second hand-maintained copy of App.jsx's shaping logic.
const baseDieWithZeroResults = (() => {
  const res = findDieWithZeroSpending(DEFAULT_INPUTS);
  const dwzProjection = res.finalProjection;
  const comparisonData = [];
  const length = Math.max(baseProjection.years.length, dwzProjection.years.length);
  for (let i = 0; i < length; i++) {
    const year = baseProjection.years[i]?.year || dwzProjection.years[i]?.year;
    comparisonData.push({
      year,
      currentBalance: Math.round(baseProjection.years[i]?.totalPortfolioEnding || 0),
      dwzBalance: Math.round(dwzProjection.years[i]?.totalPortfolioEnding || 0),
    });
  }
  return {
    spending: res.dieWithZeroSpending,
    additionalSpend: res.additionalAnnualSpend,
    comparisonData,
  };
})();
const baseTargetPortfolioResults = findTargetPortfolioSize(
  DEFAULT_INPUTS, DEFAULT_INPUTS.retireAge1, DEFAULT_INPUTS.retireAge2, DEFAULT_INPUTS.lifestyleExpense, 'taxable'
);
const baseHeirTaxResults = (() => {
  const years = baseProjection.years;
  if (!years || years.length === 0) return calculateHeirEstateTax(DEFAULT_INPUTS, 0, 0, 0);
  const lastYear = years[years.length - 1];
  return calculateHeirEstateTax(
    DEFAULT_INPUTS,
    lastYear.preTaxEnd, lastYear.rothEnd, lastYear.taxableEnd,
    lastYear.lifeInsuranceNetDeathBenefit1 || 0, lastYear.lifeInsuranceNetDeathBenefit2 || 0,
    false,
    lastYear.hsaEnd || 0,
    {
      nqdc: (lastYear.nqdcBalance1 || 0) + (lastYear.nqdcBalance2 || 0),
      cashReserve: lastYear.cashReserveBalance || 0,
      concentratedStock: (lastYear.concentratedStockBalance || 0) + (lastYear.concentratedStock2Balance || 0),
      homeEquity: lastYear.homeEquity || 0,
    }
  );
})();

// A resolved-dialog stub: showAlert/showConfirm/showPrompt are all
// Promise-returning functions in the real app (see App.jsx's `closeDialog`)
// so a component can `await` a user's answer. Defaulting them to resolve
// immediately (confirm -> true, prompt -> '') means a component's flow runs
// straight through without a test needing to interact with a real dialog --
// override with `vi.fn().mockResolvedValueOnce(...)` in tests that need to
// assert on a specific user answer partway through a flow.
export function makeDefaultContextValue(overrides = {}) {
  return {
    // Core plan state
    inputs: DEFAULT_INPUTS,
    setInputs: vi.fn(),
    updateInput: vi.fn(),
    activeTab: 'dashboard',
    setActiveTab: vi.fn(),
    useRealDollars: true,
    setUseRealDollars: vi.fn(),

    // Derived from the real engine (tier 1 above)
    projection: baseProjection,
    formatCurrency,
    getRMDAge,
    kpis: baseKpis,
    heirTaxResults: baseHeirTaxResults,

    // Simple UI state (tier 2 -- mirrors App.jsx's real initial values)
    maximizedComponent: null,
    setMaximizedComponent: vi.fn(),
    scenarios: [],
    setScenarios: vi.fn(),
    handleRunMonteCarlo: vi.fn(),
    mcLoading: false,
    monteCarlo: null,
    // Live Pricing connection + Apps Script version tracking, lifted from
    // PortfolioTab.jsx into App.jsx 2026-08-19 (IA Phase 2) so Preferences
    // and Detailed Holdings share one copy. Same real-state treatment as
    // the sub-tabs below.
    pricingSource: { csvUrl: '', scriptUrl: '' },
    setPricingSource: vi.fn(),
    pricingScriptOutOfDate: false,
    scriptAckVersion: 1,
    acknowledgeScriptUpdate: vi.fn(),
    // Onboarding/setup modal setters -- previously passed to Sidebar as
    // props, now on context because the Preferences tab drives them too.
    setShowOnboarding: vi.fn(),
    setOnboardingStep: vi.fn(),
    setShowSetupInstructions: vi.fn(),
    // Opens the full legal disclaimer from Preferences. Missing here until
    // 2026-08-21, which made PreferencesTab's "click every button" boundary
    // test throw an uncaught TypeError on every run -- reported by Vitest as
    // an unhandled error rather than a failure, so the suite stayed green
    // while genuinely crashing. The app itself always passed this (App.jsx
    // owns the state); the harness just didn't.
    setShowDisclaimerReview: vi.fn(),
    // The dismissible sticky Plan Status bar (App.jsx), restorable from
    // Preferences -> Display.
    statusBarHidden: false,
    mcAutoRun: true,
    roundFarDollars: false,
    setRoundFarDollars: vi.fn(),
    setMcAutoRun: vi.fn(),
    setStatusBarHidden: vi.fn(),
    // These five are normally supplied as REAL state by
    // SimulationProviderWithHoldings below (see its comment) -- the static
    // values here are only the fallback for a direct
    // makeDefaultContextValue() call that bypasses that provider.
    riskSubTab: 'stress',
    setRiskSubTab: vi.fn(),
    settingsSubTab: 'household',
    setSettingsSubTab: vi.fn(),
    strategySubTab: 'optimizer',
    setStrategySubTab: vi.fn(),
    taxestateSubTab: 'brackets',
    setTaxestateSubTab: vi.fn(),
    portfolioSubTab: 'holdings',
    setPortfolioSubTab: vi.fn(),
    stressChartView: 'active',
    setStressChartView: vi.fn(),
    handleReset: vi.fn(),
    handleSaveScenario: vi.fn(),
    theme: 'dark',
    toggleTheme: vi.fn(),
    largeTextMode: false,
    setLargeTextMode: vi.fn(),
    showQuickUpdate: false,
    setShowQuickUpdate: vi.fn(),
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn().mockResolvedValue(''),
    selectedTaxYear: null,
    setSelectedTaxYear: vi.fn(),
    showIrmaa: false,
    setShowIrmaa: vi.fn(),
    enabledTaxBrackets: {
      limit10: true, limit12: true, limit22: true, limit24: true,
      limit32: true, limit35: true, limit37: true,
    },
    setEnabledTaxBrackets: vi.fn(),
    whatIfRetireAge: '',
    setWhatIfRetireAge: vi.fn(),
    whatIfSpend: '',
    setWhatIfSpend: vi.fn(),
    whatIfFundingMethod: 'taxable',
    setWhatIfFundingMethod: vi.fn(),
    calibrationResults: null,
    setCalibrationResults: vi.fn(),

    // Heavy Web-Worker results (tier 3 -- App.jsx's own pre-completion shape)
    heavyResultsLoading: true,
    stressComparisonData: [],
    ssClaimingHeatmapData: [],
    optimizerResults: [],
    ageFinderResults: { simulations: [], earliestFundedAge: null },
    sensitivityResults: { baseline: { endingBalance: 0, isSuccessful: true }, results: [] },
    rothBracketHeatmapData: [],
    rothLadderScheduleHeatmapData: [],
    guardrailsComparisonData: [],
    historicalStartsData: null,
    // Not null -- see the comment above baseDieWithZeroResults/
    // baseTargetPortfolioResults for why these two are real computed
    // values instead of tier-3 Web-Worker placeholders like their
    // neighbors above.
    dieWithZeroResults: baseDieWithZeroResults,
    targetPortfolioResults: baseTargetPortfolioResults,

    // Bespoke chart-shaping data assembled inline in App.jsx (tier 4)
    estateChartData: [],
    // App.jsx's own useMemo always resolves this to an array (falls back to
    // `[]` when there's no projection yet), never null -- TaxEstateTab.jsx
    // reads taxVisualizerData[0] unconditionally on every render, so a
    // `null` default here (this used to be null) would crash it, and any
    // future component doing the same, before a single override is even
    // applied.
    taxVisualizerData: [],
    scenarioChartData: [],
    scenarioProjections: [],

    ...overrides,
  };
}

// EntitlementContext defaults to free tier, same reasoning as
// SimulationContext above: useEntitlement() (src/context/useEntitlement.js)
// throws if it's null, and every component gating on premium status now
// needs a provider present to render at all in a test. See
// INTEGRATION_STRATEGY.md at the repo root for what this context is for.
export function makeDefaultEntitlementValue(overrides = {}) {
  return {
    tier: 'free',
    isPremium: false,
    setDevPremiumOverride: vi.fn(),
    premiumJwtToken: '',
    setPremiumJwtToken: vi.fn(),
    premiumJwtExpiresAt: null,
    licensedTo: null,
    ...overrides,
  };
}

// Calls the REAL usePortfolioHoldings() hook (same as App.jsx does since
// the 2026-08-19 lift-up -- see that file's comment on why a second,
// independently-stateful call site would silently drift) rather than
// hand-maintaining a second holdings/bucketTotals fixture here. This is
// what lets existing tests seed real data into localStorage's
// 'cfe_premium_holdings_v1' key (see PortfolioTab.dividends.test.jsx) and
// have PortfolioTab.jsx -- which now reads holdings/bucketTotals from
// useSimulation() instead of calling the hook itself -- pick it up exactly
// like it would in the real app. `overrides` is applied on top, so a test
// that wants fixed, hand-written holdings/bucketTotals values instead of
// going through localStorage can still do that per-call.
function SimulationProviderWithHoldings({ overrides, entitlementValue, children }) {
  const holdingsState = usePortfolioHoldings();
  // Real, working state for all five sub-tabs -- same reasoning as the
  // usePortfolioHoldings() call above. App.jsx owns these as genuine
  // useState (lifted there 2026-08-19 so cross-tab deep links can target a
  // specific sub-tab; previously four of the five were local to their own
  // tab component). A static value + vi.fn() setter here would render each
  // tab permanently stuck on its default sub-tab, so any test that clicks
  // a sub-tab button would silently assert against the wrong panel. Giving
  // them real state reproduces the app's actual behavior instead.
  // `overrides` still wins, so a test can pin a specific starting sub-tab.
  const [riskSubTab, setRiskSubTab] = React.useState('stress');
  const [settingsSubTab, setSettingsSubTab] = React.useState('household');
  const [strategySubTab, setStrategySubTab] = React.useState('optimizer');
  const [taxestateSubTab, setTaxestateSubTab] = React.useState('brackets');
  const [portfolioSubTab, setPortfolioSubTab] = React.useState('holdings');
  // Real state for the Live Pricing connection too, for the same reason:
  // it's now edited from Preferences and read by Detailed Holdings, so a
  // static value plus a vi.fn() setter would make any test that changes it
  // silently assert against the unchanged original.
  const [pricingSource, setPricingSource] = React.useState({ csvUrl: '', scriptUrl: '' });
  const subTabState = {
    pricingSource, setPricingSource,
    riskSubTab, setRiskSubTab,
    settingsSubTab, setSettingsSubTab,
    strategySubTab, setStrategySubTab,
    taxestateSubTab, setTaxestateSubTab,
    portfolioSubTab, setPortfolioSubTab,
  };
  const value = makeDefaultContextValue({ ...holdingsState, ...subTabState, ...overrides });
  return (
    <EntitlementContext.Provider value={entitlementValue}>
      <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>
    </EntitlementContext.Provider>
  );
}

// Wraps `ui` in EntitlementContext.Provider + SimulationContext.Provider
// carrying makeDefaultEntitlementValue(entitlementOverrides) /
// makeDefaultContextValue(overrides plus the real usePortfolioHoldings()
// state), then renders it via Testing Library's own render(). Returns
// everything render() returns, so callers can destructure
// { getByText, getByRole, ... } as usual. Existing 2-arg call sites are
// unaffected -- they get the free-tier entitlement default.
export function renderWithSimulation(ui, overrides = {}, entitlementOverrides = {}) {
  const entitlementValue = makeDefaultEntitlementValue(entitlementOverrides);
  return render(
    <SimulationProviderWithHoldings overrides={overrides} entitlementValue={entitlementValue}>
      {ui}
    </SimulationProviderWithHoldings>
  );
}
