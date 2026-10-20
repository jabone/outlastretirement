import React, { useState, useMemo } from 'react';
import { gridCompactDollars } from '../../utils/compactDollars';
import { basisLabel } from '../../utils/displayDollars';
import { heatCellBg } from '../../utils/heatCell';
import { useSimulation } from '../../context/useSimulation';
import FeeCostCard from '../FeeCostCard';
import HistoricalStartsPanel from '../HistoricalStartsPanel';
import { HISTORICAL_RETURNS, HISTORY_FIRST_YEAR, HISTORY_LAST_YEAR } from '../../config/historicalReturns';
import { HISTORICAL_RETURNS_PRE1928, PRE1928_FIRST_YEAR } from '../../config/historicalReturnsPre1928';
import { historicalPortfolioReturn } from '../../utils/bootstrap';

// Changelog 336: the 'A real start year' card.
// Changelog 449: from 1871 when the plan uses Robert Shiller's longer record.
const historyYears = (from) => Array.from({ length: HISTORY_LAST_YEAR - from + 1 }, (_, i) => from + i);
const ALL_HISTORY_ROWS = [...HISTORICAL_RETURNS_PRE1928, ...HISTORICAL_RETURNS];
// The replayed years, as the engine will apply them (same table, same
// stock share): the first four of a real start year, or a named crisis's
// whole window (NAMED_STRESS_SCENARIOS).
function historyPreview(inputs, start = Number(inputs.stressHistoryStartYear) || 1966, count = 4) {
  return ALL_HISTORY_ROWS.filter((r) => r[0] >= start).slice(0, count)
    .map((r) => ({ year: r[0], ret: historicalPortfolioReturn(r, inputs.stockAllocationPost), infl: r[3] }));
}
import { getMinimumRequiredReturn, NAMED_STRESS_SCENARIOS } from '../../calculator';
import { ShieldAlert, CheckCircle, Scale, Loader2, Wind, Trophy, Lightbulb, Download } from 'lucide-react';
import { csvPreamble, downloadCsv } from '../../utils/csvPreamble';
import { buildMonteCarloCsv, monteCarloPreambleLines } from '../../utils/monteCarloCsv';
import HoverTooltip from '../HoverTooltip';
import Tooltip from '../Tooltip';
import MaximizeButton from '../MaximizeButton';
import ChartFigure from '../ChartFigure';
import { growthSummary, monteCarloSummary, stressSummary } from '../../utils/chartSummaries';
const AssetGrowthChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.AssetGrowthChart })));

const StressComparisonChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.StressComparisonChart })));
const MonteCarloChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.MonteCarloChart })));
const ChartFallback = () => (
  <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', color: 'var(--accent-text)' }} />
    <span>Loading visualization engine...</span>
  </div>
);


const RiskTab = () => {
  const { inputs, updateInput, formatCurrency, useRealDollars, projection, maximizedComponent, setMaximizedComponent, handleRunMonteCarlo, mcLoading, monteCarlo, mcRange, riskSubTab, setRiskSubTab, stressChartView, setStressChartView, stressComparisonData, heavyResultsLoading, sensitivityResults, guardrailsComparisonData, historicalStartsData, feeComparisonData, setSettingsSubTab, setActiveTab } = useSimulation();
  const [taxesOverlay, setTaxesOverlay] = useState(false);
  // KNOWN_ISSUES.md issue #1 fix: pairs each custom-switch's visible label
  // text with its checkbox via htmlFor/id (Overlay Taxes) or
  // aria-labelledby (Activate Spending Guardrails, whose label text lives
  // inside an <h3><span> alongside an icon -- not something that should
  // become a <label> element itself).
  const taxesOverlayId = React.useId();
  const spendingGuardrailsLabelId = React.useId();
  const withdrawalGuardrailsLabelId = React.useId();
  const [selectedGuardrailsCell, setSelectedGuardrailsCell] = useState(null);
  const [guardrailsMetric, setGuardrailsMetric] = useState('endingBalance');
  // stressComparisonData now arrives asynchronously from a background worker
  // (see heavyComputeWorker.js) — only flag it before the first result has
  // ever arrived, not on every subsequent recompute.
  const stressStillLoading = heavyResultsLoading && stressComparisonData.length === 0;
  const guardrailsStillLoading = heavyResultsLoading && guardrailsComparisonData.length === 0;
  // Cheap (~40 projection reruns via bisection) but not free -- memoize so
  // it only recomputes when the plan's inputs actually change, not on every
  // unrelated local-state re-render of this tab (e.g. selecting a
  // Guardrails cell).
  const minimumRequiredReturn = useMemo(() => getMinimumRequiredReturn(inputs), [inputs]);

  return (
    <>
          <div className="sub-tab-container">
            <button className={`sub-tab-button ${riskSubTab === 'stress' ? 'active' : ''}`} onClick={() => setRiskSubTab('stress')}>Historical Stress Tests</button>
            <button className={`sub-tab-button ${riskSubTab === 'montecarlo' ? 'active' : ''}`} onClick={() => setRiskSubTab('montecarlo')}>Monte Carlo Probability</button>
            <button className={`sub-tab-button ${riskSubTab === 'sensitivity' ? 'active' : ''}`} onClick={() => setRiskSubTab('sensitivity')}>Sensitivity Analysis</button>
            <button className={`sub-tab-button ${riskSubTab === 'guardrails' ? 'active' : ''}`} onClick={() => setRiskSubTab('guardrails')}>Guardrails vs Fixed Withdrawals</button>
          </div>
          {riskSubTab === 'stress' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert className="text-red-500" style={{ color: 'var(--error)' }} size={24} />
                <span>Historical Stress Tests</span>
              </h2>
              <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                Stress test your retirement plan against actual historical return sequences and inflation rates. Market crashes that occur in early retirement are highly damaging due to <Tooltip text="The order of returns matters, not just the average: a crash in the first retirement years does far more damage than the same crash a decade later." more="sequence-of-returns">sequence-of-returns risk</Tooltip>.
              </p>
            </div>

            {/* Lifetime Milestones chart panel */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '600' }}>Lifetime Milestones (Under Stress)</h2>
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                    {stressChartView === 'active'
                      ? 'Stacked asset growth under selected recession scenario and timing parameters'
                      : 'Comparison of portfolio decay curves under all major historical market crises'}
                  </p>
                  {stressChartView === 'comparison' && stressStillLoading && (
                    <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <Loader2 className="animate-spin" size={14} /> Calculating historical scenarios&hellip;
                    </p>
                  )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* Chart View Toggle Segmented Control */}
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', padding: '3px', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                    <button 
                      onClick={() => setStressChartView('active')}
                      style={{ 
                        margin: 0, 
                        padding: '4px 10px', 
                        fontSize: 'var(--fs-xs)', 
                        fontWeight: '600', 
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: stressChartView === 'active' ? 'var(--or-paper)' : 'transparent',
                        color: stressChartView === 'active' ? 'var(--or-navy)' : 'var(--text-secondary)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Active Scenario
                    </button>
                    <button 
                      onClick={() => setStressChartView('comparison')}
                      style={{ 
                        margin: 0, 
                        padding: '4px 10px', 
                        fontSize: 'var(--fs-xs)', 
                        fontWeight: '600', 
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: stressChartView === 'comparison' ? 'var(--accent-primary)' : 'transparent',
                        color: stressChartView === 'comparison' ? 'var(--text-primary)' : 'var(--text-secondary)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Compare All
                    </button>
                  </div>

                  {stressChartView === 'active' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor={taxesOverlayId} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Overlay Taxes</label>
                      <span className="custom-switch">
                        <input id={taxesOverlayId} type="checkbox" checked={taxesOverlay} onChange={(e) => setTaxesOverlay(e.target.checked)} />
                        <span className="slider-round"></span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* minHeight, not height (changelog 271): AssetGrowthChart draws
                  its event-marker legend below its 400px chart, and a fixed
                  height here let that legend spill over the panel's bottom
                  edge into the next card (the Dashboard learned the same
                  lesson earlier). */}
              <ChartFigure
                summary={stressChartView === 'active' ? growthSummary(projection.years) : stressSummary(stressComparisonData, inputs.stressType === 'history' ? `real ${inputs.stressHistoryStartYear} start` : null)}
                testId="stress-figure"
              >
              <div style={{ width: '100%', minHeight: '400px' }}>
                <React.Suspense fallback={<ChartFallback />}>
                  {stressChartView === 'active' ? (
                    <AssetGrowthChart
                      data={projection.years}
                      inputs={inputs}
                      taxesOverlay={taxesOverlay}
                      formatCurrency={formatCurrency}
                    />
                  ) : (
                    <StressComparisonChart 
                      data={stressComparisonData}
                      formatCurrency={formatCurrency}
                      historyLabel={inputs.stressType === 'history' ? `Real ${inputs.stressHistoryStartYear} start` : null}
                    />
                  )}
                </React.Suspense>
              </div>
              </ChartFigure>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600' }}>Select Stress Scenario Model</h3>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Choose a historical market scenario to apply to the projections</p>
              </div>

              {/* Stress type options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '30px' }}>
                <div 
                  className="glass-panel glass-panel-hover" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    borderColor: inputs.stressType === 'none' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === 'none' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', 'none')}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>No stress scenario</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>Uses standard return assumptions</p>
                </div>
                
                <div 
                  className="glass-panel glass-panel-hover" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    borderColor: inputs.stressType === '1929' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === '1929' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', '1929')}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>1929 Great Depr.</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>Severe 4-year cumulative deflationary crash</p>
                </div>

                <div 
                  className="glass-panel glass-panel-hover" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    borderColor: inputs.stressType === '1966' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === '1966' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', '1966')}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>1966 Lost Decade</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>Flat stock market with persistent inflation</p>
                </div>

                <div 
                  className="glass-panel glass-panel-hover" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    borderColor: inputs.stressType === '1973' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === '1973' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', '1973')}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>1973 Stagflation</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>4-yr crash with double digit inflation</p>
                </div>

                <div 
                  className="glass-panel glass-panel-hover" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    borderColor: inputs.stressType === '2000' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === '2000' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', '2000')}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>2000 Dot-Com Crash</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>Multi-year tech stock market crash</p>
                </div>

                <div 
                  className="glass-panel glass-panel-hover" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    borderColor: inputs.stressType === '2008' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === '2008' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', '2008')}
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>2008 Global Fin. Crisis</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>Severe 37% drop in first retirement year</p>
                </div>

                <div
                  className="glass-panel glass-panel-hover"
                  style={{
                    padding: '20px',
                    cursor: 'pointer',
                    borderColor: inputs.stressType === 'history' ? 'var(--accent-primary)' : 'var(--card-border)',
                    backgroundColor: inputs.stressType === 'history' ? 'rgba(42, 127, 122, 0.05)' : 'var(--card-bg)'
                  }}
                  onClick={() => updateInput('stressType', 'history')}
                  data-testid="stress-card-history"
                >
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>A real start year</h3>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px' }}>Every year&rsquo;s actual returns and inflation from then on</p>
                  <select
                    className="form-input form-input-select"
                    aria-label="Real start year to replay"
                    value={inputs.stressHistoryStartYear}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { updateInput('stressHistoryStartYear', Number(e.target.value)); updateInput('stressType', 'history'); }}
                    style={{ marginTop: '8px', marginBottom: 0 }}
                  >
                    {historyYears(Number(inputs.historyFromYear) === PRE1928_FIRST_YEAR || Number(inputs.stressHistoryStartYear) < HISTORY_FIRST_YEAR ? PRE1928_FIRST_YEAR : HISTORY_FIRST_YEAR).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  {Number(inputs.stressHistoryStartYear) < HISTORY_FIRST_YEAR && (
                    <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
                      Years before 1928: Robert J. Shiller&rsquo;s data, Yale University.
                    </p>
                  )}
                </div>
              </div>

              {/* Recess Timing Control Panel */}
              {inputs.stressType !== 'none' && (
                <div className="glass-panel" style={{ padding: '16px', marginBottom: '20px', border: '1px solid var(--card-border)' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Recession Start Year Configuration</h4>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'var(--fs-body)' }}>
                      <input 
                        type="radio" 
                        name="stressStartMode" 
                        value="retirement" 
                        checked={inputs.stressStartMode === 'retirement'} 
                        onChange={() => updateInput('stressStartMode', 'retirement')} 
                      />
                      <span>Year 1 of Retirement ({projection.householdRetirementYear || 2030})</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'var(--fs-body)' }}>
                      <input 
                        type="radio" 
                        name="stressStartMode" 
                        value="specific" 
                        checked={inputs.stressStartMode === 'specific'} 
                        onChange={() => updateInput('stressStartMode', 'specific')} 
                      />
                      <span>Specific Year</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: 'var(--fs-body)' }}>
                      <input 
                        type="radio" 
                        name="stressStartMode" 
                        value="random" 
                        checked={inputs.stressStartMode === 'random'} 
                        onChange={() => {
                          updateInput('stressStartMode', 'random');
                          const minYear = inputs.planYear;
                          const maxYear = inputs.planYear + projection.years.length - 5;
                          const randYear = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
                          updateInput('stressStartYear', randYear);
                        }}
                      />
                      <span>Random Year</span>
                    </label>
                  </div>

                  {inputs.stressStartMode === 'specific' && (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Selected Start Year:</span>
                        <span style={{ fontWeight: '600', color: 'var(--accent-text)' }}>{inputs.stressStartYear}</span>
                      </div>
                      <input
                        type="range"
                        min={inputs.planYear}
                        max={inputs.planYear + projection.years.length - 5}
                        value={inputs.stressStartYear}
                        onChange={(e) => {
                          const val = (e.target.value === '' ? '' : parseInt(e.target.value));
                          updateInput('stressStartYear', val);
                          updateInput('stressCrashYear', val);
                        }}
                        className="custom-slider"
                        aria-label="Year the market crash starts"
                        aria-valuetext={String(inputs.stressStartYear)}
                      />
                    </div>
                  )}

                  {inputs.stressStartMode === 'random' && (
                    <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                        Current Random Start Year: <strong>{inputs.stressStartYear}</strong>
                      </span>
                      <button 
                        className="btn-outline" 
                        onClick={() => {
                          const minYear = inputs.planYear;
                          const maxYear = inputs.planYear + projection.years.length - 5;
                          const randYear = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
                          updateInput('stressStartYear', randYear);
                          updateInput('stressCrashYear', randYear);
                        }}
                        style={{ padding: '6px 12px', fontSize: 'var(--fs-sm)' }}
                      >
                        Reshuffle Start Year
                      </button>
                    </div>
                  )}
                </div>
              )}

              {inputs.stressType !== 'none' && (
                <div className="glass-panel" style={{ padding: '16px', marginBottom: '20px', border: '1px solid var(--card-border)' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>Stress Inflation Strategy</h4>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    Historical crash sequences override your baseline inflation rate. How should this affect your granular custom rates?
                  </p>
                  <select 
                    aria-label="Stress inflation strategy"
                    className="form-input form-input-select" 
                    value={inputs.stressInflationStrategy !== undefined ? inputs.stressInflationStrategy : 'partial'} 
                    onChange={(e) => updateInput('stressInflationStrategy', e.target.value)}
                  >
                    <option value="partial">Partial Override: Apply historical inflation to General/Housing only.</option>
                    <option value="delta">Delta Shift: Apply the difference to ALL custom rates (Medical, SS).</option>
                    <option value="custom">Strict Custom: Ignore historical overrides; use custom granular rates.</option>
                  </select>
                </div>
              )}

              {/* Stress Details Info */}
              {inputs.stressType !== 'none' && (
                <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                    Active Stress Testing Parameters (Starting in {inputs.stressStartMode === 'retirement' ? `Year 1 of Retirement: ${projection.householdRetirementYear || 2030}` : inputs.stressStartYear})
                  </h4>
                  <ul style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {NAMED_STRESS_SCENARIOS[inputs.stressType] && (
                      historyPreview(inputs, NAMED_STRESS_SCENARIOS[inputs.stressType].start, NAMED_STRESS_SCENARIOS[inputs.stressType].years).map((r, i) => (
                        <li key={r.year}>Year {i + 1} ({r.year}): <strong>{r.ret >= 0 ? '+' : ''}{r.ret.toFixed(1)}% Return / {r.infl.toFixed(1)}% {r.infl < 0 ? 'Deflation' : 'Inflation'}</strong></li>
                      ))
                    )}
                    {inputs.stressType === 'history' && (
                      <>
                        {historyPreview(inputs).map((r, i) => (
                          <li key={r.year}>Year {i + 1} ({r.year}): <strong>{r.ret >= 0 ? '+' : ''}{r.ret.toFixed(1)}% Return / {r.infl.toFixed(1)}% {r.infl < 0 ? 'Deflation' : 'Inflation'}</strong></li>
                        ))}
                        <li>Then every later year on record through {HISTORY_LAST_YEAR}, at your stock/bond mix; after that, your own assumptions.</li>
                      </>
                    )}
                  </ul>
                </div>
              )}

              {/* Spending Guardrails Panel */}
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ maxWidth: '600px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                      <span id={spendingGuardrailsLabelId}>Activate Spending Guardrails</span>
                    </h3>
                    <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      If enabled, lifestyle spending skips its inflation raise after a year with a negative return, and a crash in the first retirement year cuts it by 10%. Once the portfolio is back on your plan&rsquo;s own path, the skipped raises are restored and the cut is lifted.
                    </p>
                  </div>
                  <label className="custom-switch">
                    <input type="checkbox" checked={inputs.spendingGuardrails} onChange={(e) => updateInput('spendingGuardrails', e.target.checked)} aria-labelledby={spendingGuardrailsLabelId} />
                    <span className="slider-round"></span>
                  </label>
                </div>
              </div>

              {/* Withdrawal-Rate Guardrails (changelog 216) -- the dynamic
                  spending rule, separate from the crash guardrail above
                  because it watches the withdrawal RATE every year rather
                  than one bad first year, and because it can raise
                  spending as well as cut it. */}
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '24px', marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ maxWidth: '600px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                      <span id={withdrawalGuardrailsLabelId}>Withdrawal-Rate Guardrails</span>
                    </h3>
                    <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Spend dynamically instead of on autopilot. Each year the plan compares your spending rate going in
                      (last year&rsquo;s lifestyle spending divided by the portfolio you start the year with) with the rate your plan expected:
                      drift too far above it and lifestyle spending steps down, fall far enough below it and it steps up.
                      Scheduled changes such as Social Security starting or a planned expense never trigger it; only the
                      markets and inflation do. Both directions are capped.
                    </p>
                  </div>
                  <label className="custom-switch">
                    <input type="checkbox" checked={inputs.withdrawalGuardrailsEnabled} onChange={(e) => updateInput('withdrawalGuardrailsEnabled', e.target.checked)} aria-labelledby={withdrawalGuardrailsLabelId} />
                    <span className="slider-round"></span>
                  </label>
                </div>
                {inputs.withdrawalGuardrailsEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginTop: '18px' }}>
                    {[
                      { key: 'wrGuardrailBandPct', label: 'Trigger band', help: 'How far the spending rate may drift from the rate your plan expected that year, as a share of it. 20% means an expected 4.0% acts above 4.8% and below 3.2%.' },
                      { key: 'wrGuardrailCutPct', label: 'Cut step', help: 'How much lifestyle spending steps down when the upper rail is crossed.' },
                      { key: 'wrGuardrailRaisePct', label: 'Raise step', help: 'How much it steps up when the lower rail is crossed.' },
                      { key: 'wrGuardrailMaxCutPct', label: 'Most you would ever cut', help: 'Spending never settles further than this below the plan, however many times the rule fires.' },
                      { key: 'wrGuardrailMaxRaisePct', label: 'Most you would ever raise', help: 'And never further above it.' },
                    ].map((f) => (
                      <label key={f.key} style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>
                        <Tooltip text={f.help}>{f.label}</Tooltip>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={inputs[f.key]}
                            onChange={(e) => updateInput(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                            style={{ width: '90px' }}
                          />
                          <span style={{ color: 'var(--text-secondary)' }}>%</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <FeeCostCard
              data={feeComparisonData}
              loading={heavyResultsLoading}
              onChangeFees={() => {
                if (setSettingsSubTab) setSettingsSubTab('assumptions');
                setActiveTab('settings');
                setTimeout(() => {
                  const el = typeof document !== 'undefined' ? document.getElementById('field-fundExpenseRatioPct') : null;
                  if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
                }, 50);
              }}
            />

            <HistoricalStartsPanel
              data={historicalStartsData}
              loading={heavyResultsLoading}
              onOpenPremium={() => setActiveTab('premium')}
              replayingStart={inputs.stressType === 'history' && inputs.stressStartMode === 'retirement' ? inputs.stressHistoryStartYear : null}
              onReplayInLedger={(start) => {
                updateInput('stressHistoryStartYear', start);
                updateInput('stressStartMode', 'retirement');
                updateInput('stressType', 'history');
                setActiveTab('yearledger');
                if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0 });
              }}
              csvPreamble={(title, extra) => csvPreamble({ title, inputs, useRealDollars: true, extra })}
              historyFrom={Number(inputs.historyFromYear) || 1928}
              onHistoryFrom={(y) => updateInput('historyFromYear', y)}
              onReplay={(start) => {
                updateInput('stressHistoryStartYear', start);
                updateInput('stressStartMode', 'retirement');
                updateInput('stressType', 'history');
                if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
          )}
          {riskSubTab === 'montecarlo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '600' }}><Tooltip text="Reruns your plan 1,000 times with different randomized market conditions, giving a range of outcomes instead of one best guess." more="Monte Carlo">Monte Carlo</Tooltip> Probability Simulator</h2>
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                    Runs 1,000 randomized stock market trials to model probability curves and calculate plan success likelihood.
                  </p>
                  {/* Changelog 247: the run is reproducible for its seed.
                      The seed is a plan input (it travels with backups and
                      scenarios) but a run control rather than an assumption,
                      so it lives here beside the button, not in Settings. */}
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <Tooltip text="The same plan and seed always give the same trials. Reshuffle draws a new seed; a result that moves more than a point or two between seeds sits near the edge." more="Reshuffle">
                      <span>Trial seed <strong>{inputs.monteCarloSeed}</strong></span>
                    </Tooltip>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => updateInput('monteCarloSeed', Math.floor(Math.random() * 999999) + 1)}
                      disabled={mcLoading}
                      style={{ padding: '2px 10px', fontSize: 'var(--fs-xs)', minWidth: 'auto' }}
                    >
                      Reshuffle
                    </button>
                    <span>&middot; {inputs.mcReturnModel === 'bootstrap'
                      ? `returns bootstrapped from ${(inputs.mcBootstrapBlockYears ?? 5)}-year blocks of real years, each with its own inflation${inputs.mcBootstrapCenter === 'history' ? ', as history' : ', re-centered on your assumptions'}`
                      : `returns drawn lognormal around your stated compound rate${inputs.mcInflationEnabled ? ', inflation sampled with them' : ''}`}{inputs.mcLongevityEnabled ? ', lifespans drawn from the SSA life table' : ''}{inputs.mcLtcEnabled ? ', long-term care drawn as a risk' : ''}</span>
                  </p>
                </div>
                <button 
                  className="btn-primary" 
                  onClick={handleRunMonteCarlo} 
                  disabled={mcLoading}
                  style={{ minWidth: '160px' }}
                >
                  {mcLoading ? 'Simulating...' : 'Run 1,000 Trials'}
                </button>
              </div>

              {monteCarlo === null ? (
                <div style={{ height: '300px', display: 'flex', flexDir: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--card-border)', borderRadius: '12px' }}>
                  <Scale size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Click "Run 1,000 Trials" to compute probability curves</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                  {/* Results cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Success Probability</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--success)', marginTop: '8px' }}>
                        {monteCarlo.successProbability.toFixed(1)}%
                      </div>
                      {monteCarlo.seed !== undefined && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                          seed {monteCarlo.seed}{monteCarlo.seed !== inputs.monteCarloSeed ? ' (run again for the current seed)' : ''}
                        </div>
                      )}
                      {Number(inputs.portfolioFloorReal) > 0 && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: '4px' }} data-testid="mc-floor-note">
                          Lasting means keeping at least ${Math.round(Number(inputs.portfolioFloorReal)).toLocaleString('en-US')} (Keep at Least)
                        </div>
                      )}
                      {mcRange && mcRange.status === 'stale' && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--warning)', marginTop: '4px' }}>
                          The plan has changed since this ran &mdash; run again
                        </div>
                      )}
                      {monteCarlo.longevitySampled && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                          <Tooltip text="With longevity sampling on, each trial ran to a drawn age at death. This is the share of trials in which someone outlived the planned horizon." more="Longevity Uncertainty">
                            <span>{monteCarlo.beyondHorizonPct.toFixed(0)}% of trials outlived the planned horizon</span>
                          </Tooltip>
                        </div>
                      )}
                      {monteCarlo.spendingCost && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-secondary)', marginTop: '4px' }} data-testid="mc-spending-cost">
                          Guardrails cut spending in {monteCarlo.spendingCost.trialsWithCutPct.toFixed(0)}% of trials; one trial in ten cut it {Math.round(monteCarlo.spendingCost.p90DeepestCut * 100)}% or more
                        </div>
                      )}
                      {monteCarlo.ltcSampled && (
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                          <Tooltip text="With long-term care sampling on, each trial drew whether, when and how long each person needed paid care. This is the share of trials in which at least one of you did." more="Long-Term Care Uncertainty">
                            <span>{(monteCarlo.ltcTrialsPct || 0).toFixed(0)}% of trials included a long-term care episode</span>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>p90 Legacy (Top 10%)</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '12px' }}>
                        {formatCurrency(monteCarlo.endingP90)}
                      </div>
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>{basisLabel(useRealDollars)}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>p50 Legacy (Median)</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '12px' }}>
                        {formatCurrency(monteCarlo.endingP50)}
                      </div>
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>{basisLabel(useRealDollars)}</div>
                    </div>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>p10 Legacy (Worst 10%)</div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--error)', marginTop: '12px' }}>
                        {formatCurrency(monteCarlo.endingP10)}
                      </div>
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>{basisLabel(useRealDollars)}</div>
                    </div>
                  </div>

                  {/* Chart of curves */}
                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Percentile Horizon Curves <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{basisLabel(useRealDollars)}</span></h3>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Changelog 450: the numbers behind this chart. */}
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '6px 10px', fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          onClick={() => downloadCsv(
                            `monte_carlo_range_${new Date().toISOString().slice(0, 10)}.csv`,
                            csvPreamble({ title: 'Monte Carlo range by year', inputs, useRealDollars, extra: monteCarloPreambleLines(monteCarlo) }) + buildMonteCarloCsv(monteCarlo),
                          )}
                        >
                          <Download size={14} /> Download the range (CSV)
                        </button>
                        <MaximizeButton target="monteCarlo" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} label="Maximize chart" />
                      </div>
                    </div>
                    <ChartFigure summary={monteCarloSummary(monteCarlo.growthCurves, monteCarlo.successProbability)} testId="montecarlo-figure">
                    <div style={{ width: '100%', height: '350px' }}>
                      <React.Suspense fallback={<ChartFallback />}>
                        <MonteCarloChart 
                          data={monteCarlo.growthCurves}
                          formatCurrency={formatCurrency}
                        />
                      </React.Suspense>
                    </div>
                    </ChartFigure>
                  </div>
                </div>
              )}
            </div>

            {/* Minimum Required Rate of Return -- the mirror question to
                Monte Carlo's "how likely am I to succeed at my assumed
                return": "what flat return, at minimum, would I actually
                need?" Cheap enough (~40 projection reruns via bisection) to
                compute synchronously on every input change, unlike Monte
                Carlo's 1,000-trial simulation above. */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                <Tooltip text="The lowest flat yearly return, before and after retirement, that still keeps the plan from running out of money. Ignores allocation, glide path and stress settings so the answer is one number." more="Minimum Required">
                  Minimum Required Rate of Return
                </Tooltip>
              </h2>
              <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                Answers "what's the least my investments could earn, on average every year, and still not run out of money?" &mdash; useful as a sanity check against your actual assumed return above: the bigger the cushion, the more room your plan has to underperform and still work.
              </p>
              {(() => {
                const mrr = minimumRequiredReturn;
                if (!mrr.feasible) {
                  return (
                    <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <div style={{ fontWeight: '600', color: 'var(--danger)', marginBottom: '4px' }}>No feasible rate of return found</div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                        Even a very optimistic 30%/yr average return doesn't keep this plan solvent &mdash; investment performance alone can't fix it. Consider reducing planned spending, retiring later, or saving more instead.
                      </div>
                    </div>
                  );
                }
                const cushion = mrr.currentAssumedReturn - mrr.requiredReturn;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Minimum Required Return</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '8px' }}>
                        {mrr.belowSearchFloor ? '< -10%' : `${mrr.requiredReturn.toFixed(1)}%`}
                      </div>
                    </div>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Your Assumed Return</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '8px' }}>
                        {mrr.currentAssumedReturn.toFixed(1)}%
                      </div>
                    </div>
                    <div className="glass-panel" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Cushion</div>
                      <div style={{ fontSize: '28px', fontWeight: '700', color: cushion >= 0 ? 'var(--success)' : 'var(--error)', marginTop: '8px' }}>
                        {cushion >= 0 ? '+' : ''}{cushion.toFixed(1)} pts
                      </div>
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {cushion >= 0
                          ? 'Your assumed return exceeds what\'s required.'
                          : 'Your assumed return falls short of what\'s required.'}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          )}
          {riskSubTab === 'sensitivity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wind style={{ color: 'var(--accent-text)' }} size={24} />
                <span>Sensitivity / Tornado Analysis</span>
              </h2>
              <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                Tests how sensitive your plan's ending balance is to each core assumption, one at a time &mdash; nudging a single input up and down (while holding every other input at its current value) and measuring the resulting swing in your ending balance. Bars are sorted with the assumption your plan is most sensitive to at the top, sized on a shared scale so the widest bar is genuinely the biggest risk (or opportunity) to your plan.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              {heavyResultsLoading && (!sensitivityResults || sensitivityResults.results.length === 0) ? (
                <div style={{ height: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 className="animate-spin" size={28} style={{ marginBottom: '12px', color: 'var(--accent-text)' }} />
                  <span>Calculating sensitivity scenarios&hellip;</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
                    <div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>Baseline Ending Balance</div>
                      <div style={{ fontSize: '22px', fontWeight: '700' }}>{formatCurrency(sensitivityResults.baseline.endingBalance)}</div>
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>{basisLabel(useRealDollars)}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--success)', display: 'inline-block' }} />
                        Improves ending balance
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--error)', display: 'inline-block' }} />
                        Reduces ending balance
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const maxImpact = Math.max(1, ...sensitivityResults.results.map(r => r.impact));
                    return sensitivityResults.results.map(r => {
                      const minVal = Math.min(r.low.delta, r.high.delta);
                      const maxVal = Math.max(r.low.delta, r.high.delta);
                      const negWidthPct = (Math.max(0, -minVal) / maxImpact) * 50;
                      const posWidthPct = (Math.max(0, maxVal) / maxImpact) * 50;
                      const negVariant = r.low.delta <= r.high.delta ? r.low : r.high;
                      const posVariant = r.low.delta <= r.high.delta ? r.high : r.low;
                      return (
                        <div key={r.key} style={{ marginBottom: '26px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                            <strong style={{ fontSize: 'var(--fs-body)' }}>{r.label}</strong>
                            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-xs)' }}>{r.unitLabel}</span>
                          </div>
                          <div style={{ position: 'relative', height: '30px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--card-border)' }}>
                            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: 'var(--card-border)' }} />
                            {negWidthPct > 0 && (
                              <div style={{ position: 'absolute', top: '4px', bottom: '4px', right: '50%', width: `${negWidthPct}%`, background: 'var(--error)', borderRadius: '4px 0 0 4px', opacity: 0.85 }} />
                            )}
                            {posWidthPct > 0 && (
                              <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: '50%', width: `${posWidthPct}%`, background: 'var(--success)', borderRadius: '0 4px 4px 0', opacity: 0.85 }} />
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                            <span>{negVariant.scenarioLabel}: {formatCurrency(negVariant.delta)}</span>
                            <span>{posVariant.scenarioLabel}: {posVariant.delta >= 0 ? '+' : ''}{formatCurrency(posVariant.delta)}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}

                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                    Note: this is a simplified one-at-a-time (OAT) sensitivity test &mdash; each bar changes only the one assumption shown, leaving everything else (including any active stress scenario or guardrails) at its current setting. Real-world risk usually involves several assumptions moving together (e.g. a market crash often arrives alongside higher inflation), so treat this as a guide to which single assumptions matter most, not a worst-case combined scenario. For combined-shock testing, see Historical Stress Tests and Monte Carlo Probability above.
                  </p>
                </>
              )}
            </div>
          </div>
          )}
          {riskSubTab === 'guardrails' && (() => {
            // Same combinatorial-solver pattern as the SS Claiming Heatmap and
            // Roth Ladder Optimizer: sanitize once, grid over every
            // combination (here: historical stress scenario x guardrails
            // on/off), run a full projection per cell. spendingGuardrails
            // only ever changes anything in a year with a negative return,
            // so 'none' (no crash at all) always ties -- it's shown anyway as
            // a baseline/sanity-check row, but the comparison summary below
            // excludes it since a tie says nothing about which setting is
            // better.
            const STRESS_LABELS = { none: 'No Crash (Baseline)', '1929': '1929 Great Depression', '1966': '1966 Lost Decade', '1973': '1973 Stagflation', '2000': '2000 Dot-Com Crash', '2008': '2008 Financial Crisis' };
            const rowOrder = ['none', '1929', '1966', '1973', '2000', '2008'];
            const findCell = (stressType, guardrailsOn) => guardrailsComparisonData.find(c => c.stressType === stressType && c.guardrailsOn === guardrailsOn);
            const cellValue = (cell) => guardrailsMetric === 'endingBalance' ? cell.endingBalance
              : guardrailsMetric === 'lifetimeShare' ? (cell.lifetimeShare ?? 1) : cell.worstYearBalance;
            const gridDollars = gridCompactDollars(guardrailsComparisonData.map(cellValue));
            const cellLabel = (val) => (guardrailsMetric === 'lifetimeShare' ? `${Math.round(val * 100)}%` : gridDollars(val));
            const cellHover = (val) => (guardrailsMetric === 'lifetimeShare' ? `${Math.round(val * 100)}% of fixed spending over the retirement` : formatCurrency(val));

            const crashRows = rowOrder.filter(t => t !== 'none');
            const comparisons = crashRows.map(stressType => {
              const withOn = findCell(stressType, true);
              const withOff = findCell(stressType, false);
              return { stressType, withOn, withOff, improvement: (withOn && withOff) ? withOn.endingBalance - withOff.endingBalance : 0 };
            }).filter(c => c.withOn && c.withOff);
            const helpedCount = comparisons.filter(c => c.improvement > 0).length;
            // Changelog 335: what guardrails cost in spending in the same
            // scenarios. A balance comparison alone makes any cut look free.
            const spendShares = comparisons.map(c => c.withOn.lifetimeShare).filter(v => typeof v === 'number');
            const lowestShare = spendShares.length ? Math.min(...spendShares) : null;
            const deepestCut = comparisons.reduce((m, c) => Math.max(m, c.withOn.deepestCut || 0), 0);

            let minVal = Infinity, maxVal = -Infinity;
            guardrailsComparisonData.forEach(c => {
              const v = cellValue(c);
              if (v < minVal) minVal = v;
              if (v > maxVal) maxVal = v;
            });

            const inspectedType = selectedGuardrailsCell || inputs.stressType || '1929';

            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Scale style={{ color: 'var(--accent-text)' }} size={24} />
                  <span>Guardrails vs Fixed Withdrawals</span>
                </h2>
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                  Spending guardrails only change anything in a year with a negative return, so comparing them on vs. off only means something under an actual market crash. This grids every historical stress scenario above against both settings so you can see, scenario by scenario, whether the rule — skip the inflation raise after a down year, cut 10% after a crash in the first retired year, and restore both once the portfolio is back on your plan&rsquo;s path — actually helps <em>your</em> plan. It isn't a universal win in every kind of crash, and when it leaves more money it usually does so by spending less: switch the Metric to see how much spending it kept.
                </p>
                {guardrailsStillLoading && (
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <Loader2 className="animate-spin" size={14} /> Calculating stress scenarios&hellip;
                  </p>
                )}
                {comparisons.length > 0 && (
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '12px', borderTop: '1px solid var(--card-border)', paddingTop: '12px' }}>
                    Guardrails improved the ending balance in <strong style={{ color: 'var(--text-primary)' }}>{helpedCount} of {comparisons.length}</strong> historical crash scenarios tested.
                    {lowestShare !== null && lowestShare < 0.999 && (
                      <> That balance is paid for in spending: in the hardest of them, spending fell as far as <strong style={{ color: 'var(--text-primary)' }}>{Math.round(deepestCut * 100)}%</strong> below fixed withdrawals, and lifetime spending came to <strong style={{ color: 'var(--text-primary)' }}>{Math.round(lowestShare * 100)}%</strong> of it.</>
                    )}
                  </p>
                )}
              </div>

              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Stress Scenario x Guardrails Grid <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 400, color: 'var(--text-muted)' }}>{basisLabel(useRealDollars)}</span></h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>Rows are historical crash scenarios; columns compare guardrails on vs. a fixed inflation-adjusted withdrawal. Click any row to inspect.</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px' }}>
                    <label htmlFor="guardrails-metric" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Metric</label>
                    <select
                      id="guardrails-metric"
                      className="form-input form-input-select"
                      value={guardrailsMetric}
                      onChange={(e) => setGuardrailsMetric(e.target.value)}
                      style={{ margin: 0 }}
                    >
                      <option value="endingBalance">Ending Portfolio Balance</option>
                      <option value="worstYearBalance">Worst Single-Year Balance</option>
                      <option value="lifetimeShare">Lifetime Spending</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(2, 1fr)', gap: '6px', textAlign: 'center', minWidth: '460px' }}>
                    <div />
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', padding: '6px 0', borderBottom: '2.5px solid var(--accent-secondary)', color: 'var(--accent-text)' }}>Guardrails On</div>
                    <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', padding: '6px 0', borderBottom: '2.5px solid var(--accent-secondary)', color: 'var(--accent-text)' }}>Fixed Withdrawals</div>
                  </div>

                  {rowOrder.map(stressType => {
                    const onCell = findCell(stressType, true);
                    const offCell = findCell(stressType, false);
                    if (!onCell || !offCell) return null;
                    return (
                      <div key={stressType} style={{ display: 'grid', gridTemplateColumns: '160px repeat(2, 1fr)', gap: '6px', minWidth: '460px', alignItems: 'center' }}>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textAlign: 'right', paddingRight: '10px', borderRight: '2.5px solid var(--accent-primary)', color: 'var(--accent-text)' }}>
                          {STRESS_LABELS[stressType] || stressType}
                        </div>
                        {[onCell, offCell].map((cell, idx) => {
                          const val = cellValue(cell);
                          const range = maxVal - minVal;
                          const ratio = range > 0 ? (val - minVal) / range : 1.0;
                          const isCurrent = (idx === 0 ? !!inputs.spendingGuardrails : !inputs.spendingGuardrails) && stressType === inputs.stressType;
                          return (
                            <HoverTooltip key={idx} text={`${cellHover(val)}${!cell.isSuccessful ? ' (shortfall)' : ''}`}>
                              <div
                                onClick={() => setSelectedGuardrailsCell(stressType)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedGuardrailsCell(stressType); } }}
                                style={{
                                  height: '48px', backgroundColor: heatCellBg('16, 185, 129', ratio),
                                  border: isCurrent ? '2.5px solid var(--text-primary)' : '1px solid var(--card-border)', borderRadius: '6px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', transition: 'all 0.15s ease', userSelect: 'none',
                                }}
                                className="heatmap-cell"
                              >
                                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: cell.isSuccessful ? 'var(--text-primary)' : 'var(--error)' }}>
                                  {cellLabel(val)}
                                </span>
                              </div>
                            </HoverTooltip>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inspector Card */}
              {(() => {
                const onCell = findCell(inspectedType, true);
                const offCell = findCell(inspectedType, false);
                if (!onCell || !offCell) return null;
                const improvement = onCell.endingBalance - offCell.endingBalance;
                const dipImprovement = onCell.worstYearBalance - offCell.worstYearBalance;
                const guardrailsWin = improvement > 0;
                return (
                  <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Trophy size={18} style={{ color: 'var(--accent-text)' }} />
                        <span>Inspecting: {STRESS_LABELS[inspectedType] || inspectedType}</span>
                      </h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ending Balance Difference</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: improvement === 0 ? 'var(--text-primary)' : (improvement > 0 ? 'var(--success)' : 'var(--error)') }}>
                          {improvement === 0 ? 'No difference' : `${improvement > 0 ? '+' : ''}${formatCurrency(improvement)}`}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>with Guardrails On vs. Fixed Withdrawals</div>
                      </div>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Worst-Year Dip Difference</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: dipImprovement === 0 ? 'var(--text-primary)' : (dipImprovement > 0 ? 'var(--success)' : 'var(--error)') }}>
                          {dipImprovement === 0 ? 'No difference' : `${dipImprovement > 0 ? '+' : ''}${formatCurrency(dipImprovement)}`}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>lowest single-year portfolio value, Guardrails On vs. Fixed</div>
                      </div>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spending Given Up</div>
                        <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: (onCell.deepestCut || 0) > 0.001 ? 'var(--error)' : 'var(--text-primary)' }}>
                          {(onCell.deepestCut || 0) > 0.001 ? `Up to ${Math.round(onCell.deepestCut * 100)}% a year` : 'None'}
                        </div>
                        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          lifetime spending {Math.round((onCell.lifetimeShare ?? 1) * 100)}% of Fixed Withdrawals
                        </div>
                      </div>
                    </div>

                    {inspectedType === '1929' && guardrailsWin === false && (
                      <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(42, 127, 122, 0.2)', backgroundColor: 'rgba(42, 127, 122, 0.03)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> In this scenario the guardrails left less at the end than fixed spending. Skipped raises and the 10% cut are restored once the portfolio is back on your plan&rsquo;s path, so a long slump with false recoveries can bring spending back before the market has really recovered. Switch the Metric to compare how much spending each kept.
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        className="btn-primary"
                        onClick={() => { updateInput('spendingGuardrails', true); updateInput('stressType', inspectedType); }}
                        style={{ padding: '10px 16px', fontSize: 'var(--fs-body)', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <CheckCircle size={16} />
                        <span>Apply: Guardrails On</span>
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => { updateInput('spendingGuardrails', false); updateInput('stressType', inspectedType); }}
                        style={{ padding: '10px 16px', fontSize: 'var(--fs-body)', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <CheckCircle size={16} />
                        <span>Apply: Fixed Withdrawals</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
            );
          })()}
    </>
  );
};

export default RiskTab;
