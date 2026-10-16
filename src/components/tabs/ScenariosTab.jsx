// Saving, comparing and loading alternate versions of the plan.
//
// Split out of LedgerTab.jsx on 2026-08-19 (see IA_REVIEW.md), which paired
// this with the year-by-year data table under one vague "Tools" heading.
// The two share no state and answer different questions, so nothing about
// the pairing helped anyone find either.
import React, { useState, useEffect } from 'react';
import { scenarioNeedsOdds, shownScenarioOdds } from '../../utils/scenarioOdds';
import { useSimulation } from '../../context/useSimulation';
import { Download, Trash2, Copy, Plus, Loader2, FlaskConical } from 'lucide-react';
import { isDemoModeActive } from '../../utils/demoMode';
import { useDemoEntry } from '../../context/useDemoEntry';
import { DEFAULT_INPUTS } from '../../calculator';
import Tooltip from '../Tooltip';
import OneLeverCompare from '../OneLeverCompare';
import { diffPlans, diffCells, samePlan } from '../../utils/planDiff';
import ChartFigure from '../ChartFigure';
import { scenarioSummary } from '../../utils/chartSummaries';
import { scenarioVerdict, verdictBand, verdictPct, verdictColor } from '../../utils/planVerdict';

// Monte Carlo cell color on the same whole-percent bands as the verdict.
function successColor(p) {
  const band = verdictBand(p);
  return band ? verdictColor(band) : 'var(--text-secondary)';
}


const ChartFallback = () => (
  <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', color: 'var(--accent-text)' }} />
    <span>Loading visualization engine...</span>
  </div>
);

const ScenarioComparisonChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.ScenarioComparisonChart })));

const ScenariosTab = () => {
  const {
    inputs, setInputs, formatCurrency, projection, scenarios, setScenarios, showAlert, showConfirm,
    scenarioChartData, scenarioProjections, handleSaveScenario: contextSaveScenario, isSavingScenario,
    mcRange, setActiveTab,
  } = useSimulation();


  // Side-by-side scenario comparison: which saved scenarios (by id) are
  // checked in the comparison chart/table below, plus whether to include
  // the currently-active (possibly unsaved) plan as its own column so users
  // can compare what they're editing right now against saved alternatives
  // without having to save it first.
  const [selectedScenarioIds, setSelectedScenarioIds] = useState([]);
  const [includeCurrentPlan, setIncludeCurrentPlan] = useState(true);
  // KNOWN_ISSUES.md issue #1 fix: pairs the "Include Current (Unsaved)
  // Plan" text label with its custom-switch checkbox via htmlFor/id --
  // previously two disconnected siblings, so clicking the text did nothing.
  const includeCurrentPlanId = React.useId();

  // Keep the selection in sync as scenarios are saved/deleted: newly saved
  // scenarios default to selected (so they show up immediately), deleted
  // ones are dropped, and an explicit deselection during this session is
  // preserved rather than reset every render.
  useEffect(() => {
    setSelectedScenarioIds(prev => {
      const stillValid = prev.filter(id => scenarios.some(sc => sc.id === id));
      const newlyAdded = scenarios.filter(sc => !prev.includes(sc.id)).map(sc => sc.id);
      return [...stillValid, ...newlyAdded];
    });
  }, [scenarios]);

  const toggleScenarioSelected = (id) => {
    setSelectedScenarioIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedScenarios = scenarios.filter(sc => selectedScenarioIds.includes(sc.id));

  // Unified list of comparison "columns" — the current active plan (if
  // included) plus every checked saved scenario, each normalized to the
  // same shape so the KPI table below can render them identically.
  // Saved scenarios carry a `metrics` object written when they were saved:
  // nominal dollars, and frozen at that moment. Everything else on screen is
  // in today's dollars by default, so rendering those raw put two different
  // units in the same column (changelog 187 -- the same mistake changelog
  // 184 fixed in the Change one thing panel).
  //
  // scenarioProjections re-runs each scenario and converts it the same way
  // the headline figures are converted, so prefer its numbers and keep the
  // saved ones only for successProbability (a Monte Carlo result, unitless)
  // and as a fallback if a projection is somehow missing.
  const displayMetrics = (sc) => {
    const sp = scenarioProjections?.find(p => p.id === sc.id);
    const saved = sc.metrics || {};
    // Odds saved under an earlier release are not shown (App recomputes them
    // in the background; the cell says Calculating… meanwhile).
    const odds = { successProbability: shownScenarioOdds(sc) };
    if (!sp) return { ...saved, ...odds };
    return {
      ...saved,
      ...odds,
      endingBalance: sp.endingBalance ?? saved.endingBalance,
      peakPortfolioWorth: sp.peakPortfolioWorth ?? saved.peakPortfolioWorth,
      isSuccessful: sp.isSuccessful ?? saved.isSuccessful,
    };
  };

  // The current plan only earns its own column when it has changes that
  // are not saved (changelog 328). Right after a save it is identical to
  // that scenario, and a second column of the same numbers labeled
  // "Unsaved" was simply wrong. When the saved copy is among the checked
  // scenarios, its column is marked as the current plan instead.
  const savedAs = scenarios.find((sc) => samePlan(inputs, sc.inputs)) || null;
  const savedAsShown = !!savedAs && selectedScenarioIds.includes(savedAs.id);
  const showCurrentColumn = includeCurrentPlan && !savedAsShown;

  const comparisonItems = [
    ...(showCurrentColumn ? [{
      id: '__current__',
      name: savedAs ? `Current Plan (saved as ${savedAs.name})` : 'Current Plan (Unsaved)',
      isCurrent: true,
      retireAge1: inputs.retireAge1,
      retireAge2: inputs.retireAge2,
      spouse2Enabled: inputs.spouse2Enabled,
      yearsSimulated: projection?.years?.length || 0,
      metrics: {
        endingBalance: projection?.endingBalance,
        isSuccessful: projection?.isSuccessful,
        peakPortfolioWorth: projection?.peakPortfolioWorth,
        // Only a run for the plan as it stands now; a stale one would
        // describe the plan before the last edit.
        successProbability: mcRange?.status === 'fresh' ? mcRange.successProbability : null,
      },
    }] : []),
    ...selectedScenarios.map(sc => {
      const sp = scenarioProjections?.find(p => p.id === sc.id);
      return {
        id: sc.id,
        name: savedAs && savedAs.id === sc.id ? `${sc.name} (current plan)` : sc.name,
        tag: sc.tag,
        isCurrent: false,
        isCurrentSaved: !!savedAs && savedAs.id === sc.id,
        retireAge1: sc.inputs.retireAge1,
        retireAge2: sc.inputs.retireAge2,
        spouse2Enabled: sc.inputs.spouse2Enabled,
        yearsSimulated: sp?.years?.length || 0,
        metrics: displayMetrics(sc),
        oddsPending: scenarioNeedsOdds(sc),
      };
    }),
  ];

  // The highest ending balance used to be marked with a trophy and bold
  // weight (changelog 176 removed it). Ending balance is one number out of a
  // life: the scenario with the biggest one may have bought it with a decade
  // of lower spending or a claim date the household did not want. Crowning
  // it made a value judgment the projection is not entitled to make, and the
  // table already shows every figure needed to make that judgment yourself.
  // Deliberately no replacement marker -- see "Change one thing" above,
  // which reports differences and likewise names no winner.
  // Only show the Debt Balance column when the plan actually has a mortgage
  // or other debt configured — most plans don't, and this table is already
  // dense, so this avoids cluttering it with an always-zero column.

  // This used to be a locally-defined function that built a scenario object
  // WITHOUT a `metrics` field, while the "Saved Scenarios List" table below
  // (and the new comparison view) reads sc.metrics.endingBalance/
  // isSuccessful/successProbability/peakPortfolioWorth — so saving any
  // scenario via this button crashed the tab the moment it tried to render
  // that row. App.jsx's `handleSaveScenario` (exposed via context as
  // contextSaveScenario) is the real implementation: it runs both
  // runProjection and runMonteCarlo and attaches the resulting metrics.
  // This wrapper just adds the "please enter a name" validation this UI
  // needs and forwards to that context version instead of duplicating it.
  const handleSaveScenario = (name) => {
    if (!name || !name.trim()) return;
    contextSaveScenario(name.trim());
  };

  // Entering the demo simulates every scenario first; the button reports
  // progress rather than freezing (changelog 129).
  const { startDemo, isEntering, label: demoLabel } = useDemoEntry();


  return (
    <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <h1 style={{ fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Copy size={24} style={{ color: 'var(--accent-text)' }} />
                    <span>Scenario Profile Manager</span>
                  </h1>
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Compare multiple retirement scenario configurations side-by-side or export a report.
                  </p>
                </div>
                {/* "Print / PDF Report" is in the Sidebar, reachable from
                    every tab — it renders the whole plan, not just this
                    one. Duplicating it in the Scenarios header put a
                    whole-plan action behind a scenario-shaped door. */}
                {/* Try the Demo: loads the fictional Carter household after
                    snapshotting the user's real plan (utils/demoMode.js).
                    Hidden while already in demo — the top banner owns Exit. */}
                {!isDemoModeActive() && (
                  <Tooltip text="Load a complete fictional household (Sam & Riley Carter) to explore every feature with realistic data. Your own plan is snapshotted first and restored exactly when you exit.">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => startDemo()}
                      disabled={isEntering}
                      aria-busy={isEntering}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', minHeight: 'auto', whiteSpace: 'nowrap', opacity: isEntering ? 0.7 : 1 }}
                    >
                      {isEntering
                        ? <><Loader2 className="animate-spin" size={15} /> {demoLabel}</>
                        : <><FlaskConical size={15} /> Try the Demo Plan</>}
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>

            <div className="form-grid">
              {/* Save Scenario Form */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>Save Current Active Plan</h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Save your active settings (e.g., retirement age, return rates) to compare it with other plans.
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input 
                    type="text" 
                    id="new-scenario-name"
                    aria-label="Name for the saved plan"
                    placeholder="e.g. Retire at 62 (Early)" 
                    className="form-input"
                    style={{ flex: 1 }}
                  />
                  <button 
                    className="btn-primary"
                    disabled={isSavingScenario}
                    aria-busy={isSavingScenario}
                    onClick={() => {
                      const inputEl = document.getElementById('new-scenario-name');
                      const name = inputEl?.value?.trim();
                      if (!name) {
                        showAlert('Please enter a name for the scenario', 'Missing Name');
                        return;
                      }
                      handleSaveScenario(name);
                      if (inputEl) inputEl.value = '';
                    }}
                  >
                    <Plus size={16} style={{ marginRight: '6px' }} />
                    {isSavingScenario ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Backup/restore used to be duplicated here as "Export JSON" /
                  "Import JSON". Removed 2026-08-19: the same two actions
                  existed in three places (Sidebar, Preferences > Your Data,
                  and here), and the copies had already drifted — one of
                  them produced a backup file missing the projection summary
                  the other two included. They now share one implementation
                  (useFullBackupActions) and two entry points: the Sidebar,
                  for reach-from-anywhere, and Preferences, as the findable
                  home. The clear-text/credential security warning that used
                  to live here moved to Preferences alongside the buttons it
                  actually warns about. */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>Backing up your scenarios</h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Saved scenarios are included in the app-wide backup, along with your active plan, Detailed Holdings,
                  Live Pricing connection and Full Interview progress. Everything lives only in this browser, so a
                  downloaded backup is the only durable copy.
                </p>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setActiveTab('preferences')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Download size={15} />
                  Backup &amp; Restore in Preferences
                </button>
              </div>
            </div>

            {/* One-lever compare (CFE-COMPARE-01, changelog 174).
                Placed ABOVE the saved-scenario comparison on purpose: it
                needs nothing saved, so it is the first thing that works on
                a first visit, and it answers the narrower question people
                usually came with. The scenario manager below is still the
                tool for weighing several whole plans at once. */}
            <OneLeverCompare />

            {/* Comparison charts & details */}
            {scenarios.length > 0 ? (
              <>
                {/* Comparison chart — filtered to the scenarios checked in
                    the "Compare" column below, so a long scenario list
                    doesn't turn the chart into an unreadable rainbow. */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Scenario Comparison Chart</h3>
                  <ChartFigure summary={selectedScenarios.length > 0 ? scenarioSummary(scenarioChartData, selectedScenarios.map((s) => s.name)) : ''} testId="scenario-figure">
                  <div style={{ width: '100%', height: 350 }}>
                    {scenarioChartData.length > 0 && selectedScenarios.length > 0 ? (
                      <React.Suspense fallback={<ChartFallback />}>
                        <ScenarioComparisonChart
                          data={scenarioChartData}
                          scenarios={selectedScenarios}
                          formatCurrency={formatCurrency}
                        />
                      </React.Suspense>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                        Check at least one scenario below to plot it here.
                      </div>
                    )}
                  </div>
                  </ChartFigure>
                </div>

                {/* Scenario details list */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Saved Scenarios List</h3>
                  <div className="scroll-region" tabIndex={0} role="region" aria-label="Saved scenarios list" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>
                            <Tooltip text="Checked scenarios appear in the comparison chart above and the side-by-side KPI table below.">Compare</Tooltip>
                          </th>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Scenario Name</th>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Retirement Ages</th>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Ending Balance</th>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Success Probability</th>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Peak Portfolio Worth</th>
                          <th style={{ padding: '12px 10px', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scenarios.map((sc) => {
                          const metrics = displayMetrics(sc);
                          return (
                          <tr key={sc.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '12px 10px' }}>
                              <label className="touch-hit"><input type="checkbox" aria-label={`Select scenario ${sc.name}`} checked={selectedScenarioIds.includes(sc.id)} onChange={() => toggleScenarioSelected(sc.id)} /></label>
                            </td>
                            <td style={{ padding: '12px 10px', fontWeight: '600', color: 'var(--text-primary)' }}>
                              {sc.name}
                              {sc.tag === 'year-advance-backup' && (
                                <span style={{ marginLeft: '8px', padding: '2px 7px', borderRadius: '999px', fontSize: 'var(--fs-xs)', fontWeight: '600', background: 'rgba(234,179,8,0.12)', color: 'var(--warning)', border: '1px solid rgba(234,179,8,0.3)' }}>
                                  Year Advance Backup
                                </span>
                              )}
                              {sc.planYearAtSave && (
                                <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '400', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  Plan year {sc.planYearAtSave} at save
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>
                              Age {sc.inputs.retireAge1} {sc.inputs.spouse2Enabled ? `/ ${sc.inputs.retireAge2}` : ''}
                            </td>
                            <td style={{ padding: '12px 10px', color: metrics.isSuccessful ? 'var(--success)' : 'var(--danger)' }}>
                              {formatCurrency(metrics.endingBalance)}
                            </td>
                            <td style={{ padding: '12px 10px', fontWeight: '500', color: successColor(metrics.successProbability) }}>
                              {metrics.successProbability !== null && metrics.successProbability !== undefined ? `${verdictPct(metrics.successProbability)}%` : (scenarioNeedsOdds(sc) ? 'Calculating…' : 'Not Simulated')}
                            </td>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>{formatCurrency(metrics.peakPortfolioWorth)}</td>
                            <td style={{ padding: '12px 10px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <button
                                className="btn-outline"
                                style={{ padding: '4px 10px', fontSize: 'var(--fs-sm)', whiteSpace: 'nowrap' }}
                                onClick={() => {
                                  // Merge with DEFAULT_INPUTS in case this scenario was saved under an
                                  // older schema and is missing fields added since (see INPUTS_SCHEMA_VERSION).
                                  setInputs({ ...DEFAULT_INPUTS, ...sc.inputs });
                                  showAlert(`Plan "${sc.name}" successfully loaded into active inputs!`, 'Plan Loaded');
                                }}
                              >
                                Load Plan
                              </button>
                              <button
                                className="btn-outline"
                                style={{ padding: '4px 10px', fontSize: 'var(--fs-sm)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                                aria-label={`Delete scenario ${sc.name}`}
                                onClick={() => {
                                  showConfirm(`Are you sure you want to delete scenario "${sc.name}"?`, {
                                    title: 'Delete Scenario',
                                    danger: true,
                                    confirmLabel: 'Delete',
                                  }).then((ok) => {
                                    if (ok) {
                                      setScenarios(prev => prev.filter(p => p.id !== sc.id));
                                    }
                                  });
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Side-by-side KPI comparison table — the current active
                    plan (optional) plus every checked scenario, laid out as
                    columns so they can be read across a row rather than
                    hunting through the list above. */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Side-by-Side Comparison</h3>
                    {savedAs ? (
                      <span data-testid="current-saved-note" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                        Your current plan is saved as {savedAs.name}.
                      </span>
                    ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor={includeCurrentPlanId} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Include Current (Unsaved) Plan</label>
                      <span className="custom-switch">
                        <input id={includeCurrentPlanId} type="checkbox" checked={includeCurrentPlan} onChange={(e) => setIncludeCurrentPlan(e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                    )}
                  </div>

                  {comparisonItems.length >= 2 ? (
                    <div className="scroll-region" tabIndex={0} role="region" aria-label="Scenario comparison" style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left' }}>
                            <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Metric</th>
                            {comparisonItems.map(item => (
                              <th key={item.id} style={{ padding: '12px 10px', color: (item.isCurrent || item.isCurrentSaved) ? 'var(--accent-text)' : 'var(--text-primary)', fontWeight: '600' }}>
                                {item.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Retirement Age(s)</td>
                            {comparisonItems.map(item => (
                              <td key={item.id} style={{ padding: '12px 10px' }}>
                                Age {item.retireAge1}{item.spouse2Enabled ? ` / ${item.retireAge2}` : ''}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Ending Balance</td>
                            {comparisonItems.map(item => (
                              <td key={item.id} style={{
                                padding: '12px 10px',
                                fontWeight: '400',
                                color: item.metrics.isSuccessful ? 'var(--success)' : 'var(--danger)',
                              }}>
                                {formatCurrency(item.metrics.endingBalance || 0)}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Plan Status</td>
                            {comparisonItems.map(item => (
                              <td key={item.id} style={{ padding: '12px 10px', color: verdictColor(scenarioVerdict(item.metrics).tone), fontWeight: '500' }}>
                                {scenarioVerdict(item.metrics).label}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Monte Carlo Success Probability</td>
                            {comparisonItems.map(item => (
                              <td key={item.id} style={{ padding: '12px 10px', fontWeight: '500', color: successColor(item.metrics.successProbability) }}>
                                {item.metrics.successProbability !== null && item.metrics.successProbability !== undefined ? `${verdictPct(item.metrics.successProbability)}%` : (item.oddsPending ? 'Calculating…' : 'Not Simulated')}
                              </td>
                            ))}
                          </tr>
                          <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Peak Portfolio Worth</td>
                            {comparisonItems.map(item => (
                              <td key={item.id} style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>{formatCurrency(item.metrics.peakPortfolioWorth || 0)}</td>
                            ))}
                          </tr>
                          <tr>
                            <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Years Simulated</td>
                            {comparisonItems.map(item => (
                              <td key={item.id} style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>{item.yearsSimulated}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>

                      {/* What differs (changelog 270): the inputs behind the
                          outcomes above. Only the keys whose values are not
                          all the same, one row each, one column per plan. */}
                      {(() => {
                        const plans = comparisonItems.map((item) => ({ id: item.id, name: item.name, inputs: item.isCurrent ? inputs : (selectedScenarios.find((sc) => sc.id === item.id) || {}).inputs }));
                        const rows = diffPlans(plans);
                        return (
                          <div style={{ marginTop: '18px' }}>
                            <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '600', margin: '0 0 6px' }}>What differs between these plans</h4>
                            {rows.length === 0 ? (
                              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', margin: 0 }}>Nothing: these plans have identical inputs.</p>
                            ) : (
                              <>
                                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                                  {rows.length} input{rows.length === 1 ? '' : 's'} differ{rows.length === 1 ? 's' : ''}; everything else is the same in every column.
                                </p>
                                <table data-testid="scenario-diff" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                                      <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 500 }}>Input</th>
                                      {comparisonItems.map((item) => (
                                        <th key={item.id} style={{ textAlign: 'left', padding: '6px 10px', color: (item.isCurrent || item.isCurrentSaved) ? 'var(--accent-text)' : 'var(--text-primary)', fontWeight: 600 }}>{item.name}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((r) => {
                                      const cells = diffCells(r, comparisonItems.map((item) => item.id));
                                      return (
                                      <tr key={r.key} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }} title={r.key}>{r.label}</td>
                                        {comparisonItems.map((item, i) => (
                                          <td key={item.id} style={{ padding: '6px 10px' }}>{cells[i]}</td>
                                        ))}
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                      Check at least one saved scenario above (or enable "Include Current Plan") alongside another to see a side-by-side comparison — you need 2 or more to compare.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', opacity: 0.8 }}>
                <Copy size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px auto' }} />
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No Saved Scenarios</h3>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                  Save your current inputs as a scenario above to overlay different retirement options and compare their results on the same chart.
                </p>
              </div>
            )}
          </div>
    </>
  );
};

export default ScenariosTab;
