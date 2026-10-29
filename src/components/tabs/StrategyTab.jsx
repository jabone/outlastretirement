import React, { useState, useRef, useEffect, useMemo } from 'react';
import { gridCompactDollars } from '../../utils/compactDollars';
import { heatCellBg } from '../../utils/heatCell';
import { useSimulation } from '../../context/useSimulation';
import { CheckCircle, Loader2, Layers, Trophy, Coins, Dices, AlertTriangle, CheckCircle2, Lightbulb, Star, XCircle } from 'lucide-react';
import { getSSMultiplier, getFullRetirementAge, runMonteCarlo, getContributionSplitOptimizer, runProjection, rothTargetNoun } from '../../calculator';
import { compareSsClaimingAges } from '../../utils/retirementFunding';
import HoverTooltip from '../HoverTooltip';
import Tooltip from '../Tooltip';
import SsClaimingSummary from '../SsClaimingSummary';
import MaximizeButton from '../MaximizeButton';
import { ClaimingGridCorner, AxisName } from '../ClaimingGridAxes';

// Mirrors SettingsTab.jsx's own helper -- came along with the Contribution
// Split Optimizer when it moved here (IA Phase 3). Kept as a local copy
// rather than exported/shared: it's three lines, and both files already had
// their own idea of small formatting helpers.
const getPossessive = (name) => {
  if (!name) return '';
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
};



const StrategyTab = () => {
  const {
    inputs, setInputs, updateInput, formatCurrency, maximizedComponent, setMaximizedComponent,
    optimizerResults, ssClaimingHeatmapData,
    rothBracketHeatmapData, rothLadderScheduleHeatmapData,
    heavyResultsLoading,
    strategySubTab, setStrategySubTab,
    useRealDollars, showConfirm,
  } = useSimulation();

  // Up to 26 full projections. It used to run inline in the JSX, so every
  // unrelated re-render of this tab (a keystroke in the What-If Solver, a
  // heatmap hover) recomputed all of them. Memoized on the two things it
  // actually depends on.
  // Four extra projections for the plain-words claiming summary under the
  // heatmap; only while that sub-tab is showing.
  const ssClaiming = useMemo(
    () => (strategySubTab === 'ssheatmap' ? compareSsClaimingAges(inputs, { runProjection, realDollars: useRealDollars }) : null),
    [inputs, useRealDollars, strategySubTab]
  );
  const splitOptimizer = useMemo(
    () => getContributionSplitOptimizer(inputs, { realDollars: useRealDollars }),
    [inputs, useRealDollars]
  );

  // Writes the winning split into Plan Settings. Every other optimizer on
  // this tab has an Apply button; this one was the exception, so finding the
  // better answer left the user to re-key four dollar amounts by hand. It
  // confirms first and names the exact before/after amounts, because unlike
  // "Apply Optimal Ages" (two obvious fields) this silently overwrites four
  // contribution fields at once.
  const applyBestMix = async () => {
    const opt = splitOptimizer;
    if (!opt.applicable || !opt.best) return;
    const money = (v) => formatCurrency(Math.round(v));
    const lines = [];
    if (opt.searchSpouse1) {
      lines.push(`${inputs.spouse1Name || 'Primary'}: Pre-Tax ${money(opt.current.preTax1)} → ${money(opt.best.preTax1)}, Roth ${money(opt.current.roth1)} → ${money(opt.best.roth1)}`);
    }
    if (opt.searchSpouse2) {
      lines.push(`${inputs.spouse2Name || 'Spouse'}: Pre-Tax ${money(opt.current.preTax2)} → ${money(opt.best.preTax2)}, Roth ${money(opt.current.roth2)} → ${money(opt.best.roth2)}`);
    }
    const confirmed = await showConfirm(
      `Overwrite your saved contributions with the best split found?\n\n${lines.join('\n')}\n\nEach person's TOTAL contribution is unchanged — only the Pre-Tax/Roth split moves. You can change it back on Plan Settings at any time.`,
      { title: 'Apply Best Mix', confirmLabel: 'Apply Best Mix' }
    );
    if (!confirmed) return;
    setInputs((prev) => ({
      ...prev,
      // Only the spouses actually searched are written. A spouse excluded
      // from the search (no contribution, or Auto-Max on) had their existing
      // values passed straight through, so writing them back would be a
      // no-op at best and would fight Auto-Max at worst.
      ...(opt.searchSpouse1 ? { preTaxContribution1: opt.best.preTax1, rothContribution1: opt.best.roth1 } : {}),
      ...(opt.searchSpouse2 ? { preTaxContribution2: opt.best.preTax2, rothContribution2: opt.best.roth2 } : {}),
    }));
  };
  // These results now arrive asynchronously from a background worker
  // (see heavyComputeWorker.js) — only show a "Calculating..." note before
  // the first result has ever arrived, not on every subsequent recompute
  // (stale-while-revalidate: keep showing the last good data while new data
  // is on the way, rather than flashing a loader on every keystroke).
  const heatmapStillLoading = heavyResultsLoading && ssClaimingHeatmapData.length === 0;
  const optimizerStillLoading = heavyResultsLoading && optimizerResults.length === 0;
  const rothLadderStillLoading = heavyResultsLoading && rothBracketHeatmapData.length === 0;
  // strategySubTab is lifted into SimulationContext (see App.jsx) so cross-tab
  // deep links can target a specific sub-tab, and so the choice survives
  // this component's remount-on-navigation.

  const [ssHeatmapMetric, setSsHeatmapMetric] = useState('totalSS');
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState(null);

  // On-demand Monte Carlo preview for a single inspected SS claiming-age
  // combination. The full heatmap only ever runs the cheap deterministic
  // projection per cell (81 combos x a full Monte Carlo run each would be
  // far too slow to compute eagerly) -- this lets the user request a real
  // probability-of-success number for just the one strategy they're
  // currently looking at, without touching their actual saved plan inputs.
  // Keyed by claiming ages so a stale result from a previously-inspected
  // cell is never shown against a different one.
  const [ssMcPreview, setSsMcPreview] = useState(null); // { age1, age2, loading, successProbability, error }
  const ssMcPreviewWorkerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (ssMcPreviewWorkerRef.current) {
        ssMcPreviewWorkerRef.current.terminate();
        ssMcPreviewWorkerRef.current = null;
      }
    };
  }, []);

  const runSsMonteCarloPreview = (age1, age2) => {
    if (ssMcPreviewWorkerRef.current) {
      ssMcPreviewWorkerRef.current.terminate();
      ssMcPreviewWorkerRef.current = null;
    }
    setSsMcPreview({ age1, age2, loading: true, successProbability: null, error: null });

    const testInputs = {
      ...inputs,
      claimingAge1: age1,
      claimingAge2: inputs.spouse2Enabled ? age2 : inputs.claimingAge2
    };

    const finish = (successProbability, error = null) => {
      setSsMcPreview({ age1, age2, loading: false, successProbability, error });
      ssMcPreviewWorkerRef.current = null;
    };

    try {
      const worker = new Worker(new URL('../../monteCarloWorker.js', import.meta.url), { type: 'module' });
      ssMcPreviewWorkerRef.current = worker;

      worker.onmessage = (e) => {
        if (e.data && e.data.success) {
          finish(e.data.results.successProbability);
        } else {
          console.warn('SS claiming Monte Carlo preview worker failed, running fallback simulation synchronously', e.data?.error);
          const res = runMonteCarlo(testInputs);
          finish(res.successProbability);
        }
        worker.terminate();
      };

      worker.onerror = (err) => {
        console.warn('SS claiming Monte Carlo preview worker lifecycle error, running fallback simulation synchronously', err);
        const res = runMonteCarlo(testInputs);
        finish(res.successProbability);
        worker.terminate();
      };

      worker.postMessage(testInputs);
    } catch (workerErr) {
      console.warn('Failed to initialize Monte Carlo preview worker, running fallback simulation synchronously', workerErr);
      const res = runMonteCarlo(testInputs);
      finish(res.successProbability);
    }
  };

  // Roth Conversion Ladder Optimizer -- 'bracket' mode grids target tax
  // bracket x withdrawal order (dynamic maxBracket conversions); 'schedule'
  // mode grids a literal fixed annual amount x duration ladder. Both share
  // one metric toggle: endingBalance is maximized, totalTaxesPaid minimized
  // -- rothLadderMetricDirection below drives which "optimal" means which.
  const [rothLadderMode, setRothLadderMode] = useState('bracket');
  const [rothLadderMetric, setRothLadderMetric] = useState('afterTaxLegacy');
  const [selectedRothLadderCell, setSelectedRothLadderCell] = useState(null);
  const rothLadderMetricDirection = rothLadderMetric === 'totalTaxesPaid' ? 'min' : 'max';
  const rothLadderMetricName = rothLadderMetric === 'afterTaxLegacy' ? 'net to heirs after every tax' : rothLadderMetric === 'endingBalance' ? 'ending balance' : 'lifetime taxes';

  const isApplied = (strat) => {
    return Object.keys(strat.config).every(k => inputs[k] === strat.config[k]);
  };

  return (
    <>
      <div className="sub-tab-container">
        <button className={`sub-tab-button ${strategySubTab === 'optimizer' ? 'active' : ''}`} onClick={() => setStrategySubTab('optimizer')}>Tax Optimizer Hub</button>
        <button className={`sub-tab-button ${strategySubTab === 'ssheatmap' ? 'active' : ''}`} onClick={() => setStrategySubTab('ssheatmap')}>SS Claiming Heatmap</button>
        <button className={`sub-tab-button ${strategySubTab === 'rothladder' ? 'active' : ''}`} onClick={() => setStrategySubTab('rothladder')}>Roth Ladder Optimizer</button>
      </div>

      {strategySubTab === 'optimizer' && (
          <div 
            className={maximizedComponent === 'tabOptimizer' ? 'maximized-modal' : ''} 
            style={maximizedComponent === 'tabOptimizer' ? { 
              position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000, overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)', border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '30px' 
            } : { display: 'flex', flexDirection: 'column', gap: '30px' }}
          >
            {/* Strategy Optimizer Hub */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Trophy className="text-yellow-500" style={{ color: 'var(--warning)' }} size={24} />
                    <span>Lifetime Tax Strategy Optimizer</span>
                  </h2>
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
                    A 3&times;3 matrix of drawdown strategies — each withdrawal order with no conversions, 22%-bracket conversions, and 24%-bracket conversions — and, when the{' '}
                    <button onClick={() => setStrategySubTab('rothladder')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-text)', textDecoration: 'underline', fontSize: 'inherit' }}>
                      Roth Ladder Optimizer's full grid
                    </button>
                    {' '}finds a better combination, it takes the weakest card's place. The goal: the strategy that maximizes your ending legacy while minimizing tax and IRMAA penalties.
                  </p>
                </div>
                <MaximizeButton target="tabOptimizer" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
              </div>

              {/* Grid cards representing each strategy */}
              {optimizerStillLoading && (
                <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Loader2 className="animate-spin" size={14} /> Calculating strategy comparisons&hellip;
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {optimizerResults.map((strat) => {
                  let rankingColor = 'var(--text-secondary)';
                  if (strat.ranking === 'Best') rankingColor = 'var(--success)';
                  else if (strat.ranking === 'Great') rankingColor = 'var(--success)';
                  else if (strat.ranking === 'Worst') rankingColor = 'var(--warning)';
                  else if (strat.ranking === 'Shortfall') rankingColor = 'var(--error)';

                  const active = isApplied(strat);
                  let cardBorderColor = 'var(--card-border)';
                  let cardBorderWidth = '1px';
                  if (active) {
                    cardBorderColor = 'var(--accent-primary)';
                    cardBorderWidth = '2px';
                  } else if (strat.ranking === 'Best') {
                    cardBorderColor = 'var(--success)';
                  }

                  return (
                    <div key={strat.id} className="glass-panel glass-panel-hover" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyGap: '16px', border: `${cardBorderWidth} solid ${cardBorderColor}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{strat.name}</h3>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {active && (
                            <span style={{ 
                              fontSize: 'var(--fs-2xs)', 
                              fontWeight: '800', 
                              textTransform: 'uppercase', 
                              padding: '3px 8px', 
                              borderRadius: '6px', 
                              backgroundColor: 'rgba(42, 127, 122, 0.2)', 
                              color: 'var(--accent-text)', 
                              border: '1px solid var(--accent-primary)'
                            }}>
                              Selected
                            </span>
                          )}
                          <span style={{ 
                            fontSize: 'var(--fs-xs)', 
                            fontWeight: '700', 
                            textTransform: 'uppercase', 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            backgroundColor: 'var(--bg-secondary)', 
                            color: rankingColor, 
                            border: `1px solid ${rankingColor}`
                          }}>
                            {strat.ranking === 'Best' && <Trophy size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />}{strat.ranking}
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '8px 0 16px 0', flex: '1' }}>{strat.description}</p>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: 'var(--fs-body)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}><Tooltip text="What your heirs keep after every tax: the Pre-Tax balance at death less the income tax they pay drawing it down, the Roth and taxable accounts, your other estate assets, less estate tax. The cards are ranked on this, since a Pre-Tax dollar is not worth a Roth dollar." more="Net to heirs after every tax">Net to heirs after every tax</Tooltip></span>
                          <span style={{ fontWeight: '600', color: strat.afterTaxLegacy > 0 ? 'var(--text-primary)' : 'var(--error)' }}>
                            {formatCurrency(strat.afterTaxLegacy)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Ending Balance:</span>
                          <span style={{ fontWeight: '600', color: strat.endingBalance > 0 ? 'var(--text-primary)' : 'var(--error)' }}>
                            {formatCurrency(strat.endingBalance)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Lifetime taxes paid:</span>
                          <span style={{ fontWeight: '600' }}>{formatCurrency(strat.totalTaxes)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}><Tooltip text="Required Minimum Distributions: the minimum amount you must withdraw from Pre-Tax retirement accounts each year, starting at age 73-75, whether you need the money or not.">Forced RMDs</Tooltip></span>
                          <span style={{ fontWeight: '600' }}>{formatCurrency(strat.totalRMDs)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}><Tooltip text="Your Medicare Part B and Part D premiums over the plan, including any IRMAA (Income Related Monthly Adjustment Amount), the surcharge added when income crosses set thresholds. The base premium is the same for every strategy, so the difference between cards is the IRMAA.">Lifetime Medicare premiums (incl. IRMAA)</Tooltip></span>
                          <span style={{ fontWeight: '600' }}>{formatCurrency(strat.totalIRMAA)}</span>
                        </div>
                        {inputs.spouse2Enabled && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>
                              <Tooltip text="Taxes paid after the first spouse dies, when the household files Single. Narrower brackets and a smaller deduction tax the same income harder; drawing down Pre-Tax earlier tends to lower this." more="Survivor-Phase Taxes">Survivor-Phase Taxes</Tooltip>
                            </span>
                            <span style={{ fontWeight: '600', color: strat.survivorPhaseTaxes > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{formatCurrency(strat.survivorPhaseTaxes)}</span>
                          </div>
                        )}
                      </div>

                      {active ? (
                        <button 
                          className="btn-primary" 
                          disabled 
                          style={{ width: '100%', fontSize: 'var(--fs-body)', padding: '8px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', border: '1px solid var(--success)', boxShadow: 'none', cursor: 'default' }}
                        >
                          Active Strategy
                        </button>
                      ) : (
                        <button 
                          className="btn-outline" 
                          onClick={() => {
                            setInputs(prev => ({
                              ...prev,
                              ...strat.config
                            }));
                          }}
                          style={{ width: '100%', fontSize: 'var(--fs-body)', padding: '8px' }}
                        >
                          Apply Strategy
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* The Retirement Age Finder, Die with Zero and the Target Portfolio
                What-If Solver moved to Retirement Readiness (changelog 285),
                where the cards ask those questions. This page keeps the
                searches over a grid. */}
            {/* Relocated here 2026-08-19 (IA Phase 3, see IA_REVIEW.md).
                Both of these used to live inside Plan Settings > Initial
                Balances — two full optimizers, ~800 lines below the fold,
                on a data-entry page — while the tab actually named
                "Optimizers" had neither. Moved verbatim; no behavior
                change. */}
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                  <Tooltip text="Reruns your full plan at different Pre-Tax/Roth splits, holding each spouse's total contribution fixed, and reports the split that leaves the largest ending balance." more="Contribution Split Optimizer">
                    Pre-Tax vs. Roth Contribution Split Optimizer
                  </Tooltip>
                </h3>
                {(() => {
                  const opt = splitOptimizer;
                  if (!opt.applicable) {
                    return (
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                        {opt.reason}
                      </div>
                    );
                  }
                  const pctLabel = (r) => {
                    const parts = [];
                    if (r.pct1 !== null) parts.push(`${getPossessive(inputs.spouse1Name || 'Primary')} ${r.pct1}% Roth`);
                    if (r.pct2 !== null) parts.push(`${getPossessive(inputs.spouse2Name || 'Spouse')} ${r.pct2}% Roth`);
                    return parts.join(', ');
                  };
                  const improved = opt.improvement > 1;
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Current Mix</div>
                          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginTop: '4px' }}>{pctLabel(opt.current)}</div>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>Net to heirs after every tax: {formatCurrency(opt.current.afterTaxLegacy)}</div>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Ending balance: {formatCurrency(opt.current.endingBalance)}</div>
                        </div>
                        <div style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: improved ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)' }}>
                          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Best Mix Found</div>
                          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '600', marginTop: '4px', color: improved ? 'var(--success)' : 'var(--text-primary)' }}>{pctLabel(opt.best)}</div>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>Net to heirs after every tax: {formatCurrency(opt.best.afterTaxLegacy)}</div>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>Ending balance: {formatCurrency(opt.best.endingBalance)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
                        {improved
                          ? `Switching to the Best Mix above is projected to leave your heirs about ${formatCurrency(opt.improvement)} more after every tax than your current split, holding your total savings amount unchanged.`
                          : 'Your current split is already the best (or tied for best) of the splits tested.'}
                        {' '}Searches a 5-point grid (0/25/50/75/100% Roth) per spouse; the true optimum may fall between these points, but this is enough to show whether your plan clearly favors one end over a mix.
                      </div>
                      {/* Every dollar figure in this section now follows the
                          app-wide Real/Nominal toggle, and says which one it
                          is. It used to always report future dollars while
                          the Plan Status chip beside it reported today's --
                          same plan, same projection, two unlabeled
                          currencies a factor of two apart. */}
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        {opt.realDollars
                          ? "Shown in today's dollars, matching the rest of your plan. Switch the Real/Nominal toggle to see future dollars instead."
                          : 'Shown in future (nominal) dollars, matching the rest of your plan. Switch the Real/Nominal toggle to see them in today\u2019s dollars instead.'}
                      </div>
                      {improved && (
                        <div style={{ marginBottom: '16px' }}>
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={applyBestMix}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: 'var(--fs-body)' }}
                          >
                            <CheckCircle size={16} />
                            Apply Best Mix
                          </button>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Writes the winning split into Plan Settings. Your total contribution doesn&rsquo;t change &mdash; only how it&rsquo;s divided between Pre-Tax and Roth.
                          </div>
                        </div>
                      )}
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Show all {opt.results.length} splits tested</summary>
                        <div className="scroll-region" tabIndex={0} role="region" aria-label="All contribution splits tested" style={{ overflowX: 'auto', marginTop: '10px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
                                <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Split</th>
                                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>Net to Heirs After Tax</th>
                                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>Ending Balance</th>
                                <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>Total Taxes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...opt.results].sort((a, b) => b.afterTaxLegacy - a.afterTaxLegacy).map((r, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--card-border)', backgroundColor: r === opt.best ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                                  <td style={{ padding: '6px 8px' }}>{pctLabel(r)}{!r.isSuccessful && ' (shortfall)'}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(r.afterTaxLegacy)}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(r.endingBalance)}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(r.totalTaxes)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  );
                })()}
              </div>
            {/* The annuity purchase fields moved to Plan -> Income
                (changelog 286): they are plan inputs, and this was their
                only editor. */}
          </div>
        )}

        {strategySubTab === 'ssheatmap' && (
          <div 
            className={maximizedComponent === 'tabSSHeatmap' ? 'maximized-modal' : ''} 
            style={maximizedComponent === 'tabSSHeatmap' ? { 
              position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000, overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)', border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '30px' 
            } : { display: 'flex', flexDirection: 'column', gap: '30px' }}
          >
            
            {/* Header Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ flex: '1', minWidth: '300px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                      <Coins className="text-purple-500" style={{ color: 'var(--accent-text)' }} size={24} />
                      <span>Social Security Claiming Strategy Heatmap</span>
                    </h2>
                  </div>
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.6' }}>
                    This optimizer simulates all possible claiming age combinations (from age 62 to 70) for both spouses.
                    It runs full financial projections for each combination to find the strategy that maximizes your lifetime retirement wealth or Social Security benefits, or that avoids a projected shortfall. Inspect any cell and run a real Monte Carlo simulation on it for a true probability of success.
                  </p>
                  {heatmapStillLoading && (
                    <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <Loader2 className="animate-spin" size={14} /> Calculating claiming-age combinations&hellip;
                    </p>
                  )}
                </div>
                
                {/* Metric Selector Dropdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                  <label htmlFor="field-ssHeatmapMetric" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Optimize Metric</label>
                  <select id="field-ssHeatmapMetric" 
                    className="form-input form-input-select" 
                    value={ssHeatmapMetric} 
                    onChange={(e) => setSsHeatmapMetric(e.target.value)}
                    style={{ margin: 0 }}
                  >
                    <option value="totalSS">Total Lifetime SS Benefits Received</option>
                    <option value="expectedSS">Expected Lifetime SS (weighted by the odds of living)</option>
                    <option value="endingBalance">Ending Portfolio Legacy (Wealth)</option>
                    <option value="isSuccessful">Shortfall Risk (Pass/Fail)</option>
                  </select>
                </div>
              </div>
              {ssHeatmapMetric === 'expectedSS' && (
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '10px 0 0', lineHeight: 1.5, maxWidth: '760px' }}>
                  Each year&rsquo;s benefit weighted by the Social Security life table&rsquo;s odds that you (and, for a couple, either of you) are alive to collect it,
                  using the ages and Sex on the Household page, over every year anyone could still be collecting &mdash; not just to the Life Expectancy you typed.
                  The plain total above rewards delay exactly as far as your planned age happens to reach; this one rewards it as far as the odds do. A healthy, well-off
                  household runs a few years better than the table, which favors waiting a little more than shown.
                </p>
              )}
            </div>

            {/* Split Layout: Heatmap (Left) + Strategy Inspector (Right) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
              
              {/* Heatmap Grid Panel */}
              {(() => {
                const isSsBooleanMetric = ssHeatmapMetric === 'isSuccessful';
                const getSsMetricVal = (cell) => {
                  if (ssHeatmapMetric === 'totalSS') return cell.totalSS;
                  if (ssHeatmapMetric === 'expectedSS') return cell.expectedSS || 0;
                  if (ssHeatmapMetric === 'endingBalance') return cell.endingBalance;
                  return cell.isSuccessful ? 1 : 0;
                };

                // Pre-compute min, max, and optimal cell. "Optimal" isn't a
                // meaningful single cell for the pass/fail metric (many
                // combinations tie at a pass), so that metric skips the
                // star/peak-recommendation UI entirely rather than pick an
                // arbitrary winner.
                let minVal = Infinity;
                let maxVal = -Infinity;
                let optimalCell = null;

                for (const cell of ssClaimingHeatmapData) {
                  const val = getSsMetricVal(cell);
                  if (val < minVal) minVal = val;
                  if (val > maxVal) {
                    maxVal = val;
                    optimalCell = cell;
                  }
                }
                if (isSsBooleanMetric) optimalCell = null;

                return (
                  <div className="glass-panel" style={{ padding: '24px', gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, paddingRight: '12px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
                          Claiming Grid: {ssHeatmapMetric === 'totalSS' ? 'Lifetime Family SS Benefits' : ssHeatmapMetric === 'expectedSS' ? 'Expected Lifetime SS (survival-weighted)' : ssHeatmapMetric === 'endingBalance' ? 'Projected Ending Portfolio Wealth' : 'Shortfall Risk (Deterministic Pass/Fail)'}
                        </h3>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                          {inputs.spouse2Enabled ? (
                            <span>
                              Rows represent <AxisName axis="row">{inputs.spouse1Name || 'Primary'} (Spouse 1)</AxisName> claiming age; columns represent <AxisName axis="column">{inputs.spouse2Name || 'Spouse'} (Spouse 2)</AxisName> claiming age. Click any cell to inspect and apply.
                            </span>
                          ) : (
                            'Click any claiming age cell to inspect and apply.'
                          )}
                        </p>
                        <p className="show-mobile-only" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0, fontStyle: 'italic' }}>
                          This grid is dense — scroll sideways to see every cell, or try a larger screen for easier tapping.
                        </p>
                      </div>
                      <MaximizeButton target="ssHeatmap" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} label="Maximize grid" />
                    </div>

                    {inputs.spouse2Enabled ? (
                      /* 2D Heatmap Grid */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowX: 'auto' }}>
                        {/* Top Column Headers (Spouse 2 ages) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '96px repeat(9, 1fr)', gap: '6px', textAlign: 'center', minWidth: '550px' }}>
                          <ClaimingGridCorner rowName={inputs.spouse1Name || 'S1'} columnName={inputs.spouse2Name || 'S2'} />
                          {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age => (
                            <div key={age} style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', padding: '6px 0', borderBottom: '2.5px solid var(--series-2)', color: 'var(--series-2-text)' }}>
                              Age {age}
                            </div>
                          ))}
                        </div>

                        {/* Grid Rows (Spouse 1 ages) */}
                        {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => (
                          <div key={age1} style={{ display: 'grid', gridTemplateColumns: '96px repeat(9, 1fr)', gap: '6px', minWidth: '550px', alignItems: 'center' }}>
                            {/* Row Header (Spouse 1 age) */}
                            <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', textAlign: 'right', paddingRight: '12px', borderRight: '2.5px solid var(--series-3)', color: 'var(--accent-text)' }}>
                              Age {age1}
                            </div>
                            
                            {/* 9 columns for Spouse 2 */}
                            {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age2 => {
                              const cell = ssClaimingHeatmapData.find(c => c.claimingAge1 === age1 && c.claimingAge2 === age2);
                              if (!cell) return <div key={age2} />;

                              const val = getSsMetricVal(cell);

                              let cellBg;
                              if (isSsBooleanMetric) {
                                cellBg = cell.isSuccessful ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)';
                              } else {
                                const range = maxVal - minVal;
                                const ratio = range > 0 ? (val - minVal) / range : 1.0;
                                const baseColor = (ssHeatmapMetric === 'totalSS' || ssHeatmapMetric === 'expectedSS') ? '168, 85, 247' : '16, 185, 129';
                                cellBg = heatCellBg(baseColor, ratio);
                              }

                              const isCurrent = inputs.claimingAge1 === age1 && inputs.claimingAge2 === age2;
                              const isOptimal = optimalCell && optimalCell.claimingAge1 === age1 && optimalCell.claimingAge2 === age2;

                              let borderStyle = '1px solid var(--card-border)';
                              if (isCurrent) {
                                borderStyle = '2.5px solid var(--text-primary)';
                              } else if (isOptimal) {
                                borderStyle = '1.5px dashed var(--accent-secondary)';
                              }

                              const tooltipText = isSsBooleanMetric
                                ? `Claim: ${age1}/${age2} • ${cell.isSuccessful ? 'Projected Success' : 'Projected Shortfall'}`
                                : `Claim: ${age1}/${age2} • Value: ${formatCurrency(val)}`;

                              return (
                                <HoverTooltip key={age2} text={tooltipText}>
                                  <div
                                    onClick={() => setSelectedHeatmapCell(cell)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedHeatmapCell(cell); } }}
                                    style={{
                                      height: '52px',
                                      backgroundColor: cellBg,
                                      border: borderStyle,
                                      borderRadius: '6px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease',
                                      position: 'relative',
                                      userSelect: 'none'
                                    }}
                                    className="heatmap-cell"
                                  >
                                    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700' }}>
                                      {isSsBooleanMetric ? (cell.isSuccessful ? <CheckCircle2 size={12} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> : <XCircle size={12} style={{ verticalAlign: '-2px', color: 'var(--danger)' }} />) : gridCompactDollars([minVal, maxVal])(val)}
                                    </span>

                                    {isCurrent && (
                                      <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.9 }}>
                                        Active
                                      </span>
                                    )}
                                    {isOptimal && (
                                      <span style={{ position: 'absolute', top: '2px', right: '3px', fontSize: '11px' }}>
                                        <Star size={14} fill="currentColor" style={{ verticalAlign: '-2px', color: '#fff' }} />
                                      </span>
                                    )}
                                  </div>
                                </HoverTooltip>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* 1D Single Row List for Single User */
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                        {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age1 => {
                          const cell = ssClaimingHeatmapData.find(c => c.claimingAge1 === age1);
                          if (!cell) return null;

                          const val = getSsMetricVal(cell);

                          let cellBg;
                          if (isSsBooleanMetric) {
                            cellBg = cell.isSuccessful ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)';
                          } else {
                            const range = maxVal - minVal;
                            const ratio = range > 0 ? (val - minVal) / range : 1.0;
                            const baseColor = (ssHeatmapMetric === 'totalSS' || ssHeatmapMetric === 'expectedSS') ? '168, 85, 247' : '16, 185, 129';
                            cellBg = heatCellBg(baseColor, ratio);
                          }

                          const isCurrent = inputs.claimingAge1 === age1;
                          const isOptimal = optimalCell && optimalCell.claimingAge1 === age1;

                          let borderStyle = '1px solid var(--card-border)';
                          if (isCurrent) {
                            borderStyle = '2.5px solid var(--text-primary)';
                          } else if (isOptimal) {
                            borderStyle = '1.5px dashed var(--accent-secondary)';
                          }

                          return (
                            <div
                              key={age1}
                              onClick={() => setSelectedHeatmapCell(cell)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedHeatmapCell(cell); } }}
                              style={{
                                padding: '16px 8px',
                                backgroundColor: cellBg,
                                border: borderStyle,
                                borderRadius: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                position: 'relative'
                              }}
                              className="heatmap-cell"
                            >
                              <div style={{ fontSize: 'var(--fs-sm)', fontWeight: '700' }}>Age {age1}</div>
                              <div style={{ fontSize: '14px', fontWeight: '800', color: isSsBooleanMetric ? (cell.isSuccessful ? 'var(--success)' : 'var(--error)') : 'var(--text-primary)' }}>
                                {isSsBooleanMetric ? (cell.isSuccessful ? 'Pass' : 'Fail') : formatCurrency(val)}
                              </div>
                              {isCurrent && (
                                <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', opacity: 0.9, backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                  Active
                                </span>
                              )}
                              {isOptimal && (
                                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-text)' }}>
                                  <Star size={14} fill="currentColor" style={{ verticalAlign: '-2px', color: 'var(--accent-primary)' }} /> Optimal
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Heatmap Legend */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-xs)', borderTop: '1px solid var(--card-border)', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '3px', border: '1px solid var(--text-primary)', backgroundColor: 'transparent' }}></div>
                          <span style={{ color: 'var(--text-secondary)' }}>Active Plan Settings</span>
                        </div>
                        {!isSsBooleanMetric && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '4px', backgroundColor: (ssHeatmapMetric === 'totalSS' || ssHeatmapMetric === 'expectedSS') ? 'rgb(168, 85, 247)' : 'rgb(16, 185, 129)' }}><Star size={12} fill="currentColor" style={{ color: '#fff' }} /></span>
                            <span style={{ color: 'var(--text-secondary)' }}>Optimal (Peak Strategy)</span>
                          </div>
                        )}
                      </div>
                      {isSsBooleanMetric ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'rgba(16, 185, 129, 0.6)' }}></div>
                            <span style={{ color: 'var(--text-secondary)' }}><CheckCircle2 size={14} style={{ verticalAlign: '-2px', color: 'var(--success)' }} /> Projected Success</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: 'rgba(239, 68, 68, 0.6)' }}></div>
                            <span style={{ color: 'var(--text-secondary)' }}><XCircle size={14} style={{ verticalAlign: '-2px', color: 'var(--danger)' }} /> Projected Shortfall</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Lower Value</span>
                          <div style={{
                            width: '100px',
                            height: '8px',
                            borderRadius: '4px',
                            // The same hue the cells are drawn in.
                            background: (ssHeatmapMetric === 'totalSS' || ssHeatmapMetric === 'expectedSS')
                              ? 'linear-gradient(to right, rgba(168, 85, 247, 0.08), rgba(168, 85, 247, 0.8))'
                              : 'linear-gradient(to right, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.8))'
                          }}></div>
                          <span style={{ color: 'var(--text-secondary)' }}>Higher Value</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Right Panel: Strategy Inspector Card */}
              {(() => {
                const isSsBooleanMetric = ssHeatmapMetric === 'isSuccessful';
                const getSsMetricVal = (cell) => {
                  if (ssHeatmapMetric === 'totalSS') return cell.totalSS;
                  if (ssHeatmapMetric === 'expectedSS') return cell.expectedSS || 0;
                  if (ssHeatmapMetric === 'endingBalance') return cell.endingBalance;
                  return cell.isSuccessful ? 1 : 0;
                };

                const currentCell = ssClaimingHeatmapData.find(c => c.claimingAge1 === inputs.claimingAge1 && (inputs.spouse2Enabled ? c.claimingAge2 === inputs.claimingAge2 : true));
                const inspectedCell = selectedHeatmapCell || currentCell;

                if (!inspectedCell) return null;

                const age1 = inspectedCell.claimingAge1;
                const age2 = inspectedCell.claimingAge2;

                const valInspected = getSsMetricVal(inspectedCell);
                const valCurrent = currentCell ? getSsMetricVal(currentCell) : valInspected;
                const diff = valInspected - valCurrent;

                // Pre-compute optimal cell again for right panel comparisons.
                // Skipped for the pass/fail metric -- see note on the left panel.
                let maxVal = -Infinity;
                let optimalCell = null;
                if (!isSsBooleanMetric) {
                  for (const cell of ssClaimingHeatmapData) {
                    const val = getSsMetricVal(cell);
                    if (val > maxVal) {
                      maxVal = val;
                      optimalCell = cell;
                    }
                  }
                }

                const isOptimal = optimalCell && optimalCell.claimingAge1 === age1 && (inputs.spouse2Enabled ? optimalCell.claimingAge2 === age2 : true);
                const isCurrent = inputs.claimingAge1 === age1 && (inputs.spouse2Enabled ? inputs.claimingAge2 === age2 : true);

                const optAge1 = optimalCell ? optimalCell.claimingAge1 : 70;
                const optAge2 = optimalCell ? optimalCell.claimingAge2 : 70;
                const optVal = optimalCell ? getSsMetricVal(optimalCell) : valInspected;
                const diffOptimal = optVal - valCurrent;

                const ssMcMatches = ssMcPreview && ssMcPreview.age1 === age1 && ssMcPreview.age2 === age2;
                const ssMcRate = ssMcMatches ? ssMcPreview.successProbability : null;
                const ssMcColor = ssMcRate === null ? 'var(--text-secondary)' : ssMcRate >= 90 ? 'var(--success)' : ssMcRate >= 75 ? 'var(--warning)' : 'var(--error)';

                return (
                  <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Trophy size={18} style={{ color: 'var(--accent-text)' }} />
                        <span>Strategy Inspector</span>
                      </h3>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Analyze claiming at age {age1} {inputs.spouse2Enabled ? `/ ${age2}` : ''}
                      </p>
                    </div>

                    {/* Quick Stats Grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          {ssHeatmapMetric === 'totalSS' ? 'Lifetime SS benefits' : ssHeatmapMetric === 'expectedSS' ? 'Expected lifetime SS' : ssHeatmapMetric === 'endingBalance' ? 'Ending Legacy Wealth' : 'Shortfall Risk (Deterministic)'}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: isSsBooleanMetric ? (inspectedCell.isSuccessful ? 'var(--success)' : 'var(--error)') : 'var(--text-primary)' }}>
                          {isSsBooleanMetric ? (inspectedCell.isSuccessful ? 'Pass' : 'Fail') : formatCurrency(valInspected)}
                        </div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Comparison vs Active Plan</div>
                        {isSsBooleanMetric ? (
                          <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: 'var(--text-primary)' }}>
                            {!currentCell || inspectedCell.isSuccessful === currentCell.isSuccessful ? 'Same Outcome' : (inspectedCell.isSuccessful ? 'Fixes a Shortfall' : 'Introduces a Shortfall')}
                          </div>
                        ) : (
                          <div style={{
                            fontSize: '18px',
                            fontWeight: '700',
                            marginTop: '4px',
                            color: diff > 0 ? 'var(--success)' : (diff === 0 ? 'var(--text-primary)' : 'var(--error)')
                          }}>
                            {diff > 0 ? `+${formatCurrency(diff)}` : (diff === 0 ? 'Active Strategy' : `${formatCurrency(diff)}`)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* On-Demand Monte Carlo Preview -- the heatmap grid only
                        ever runs the cheap deterministic pass/fail check per
                        cell (running a full 1,000-trial Monte Carlo for all
                        81 claiming-age combos up front would be far too slow).
                        This lets you request a real probability-of-success
                        number for just the one strategy you're inspecting. */}
                    <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: '700', fontSize: 'var(--fs-sm)', color: 'var(--accent-text)' }}>Monte Carlo Success Rate</div>
                        {ssMcMatches && !ssMcPreview.loading && ssMcPreview.successProbability !== null && (
                          <span style={{ fontSize: '18px', fontWeight: '800', color: ssMcColor }}>{ssMcPreview.successProbability.toFixed(0)}%</span>
                        )}
                      </div>
                      {ssMcMatches && ssMcPreview.loading ? (
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                          <Loader2 className="animate-spin" size={12} /> Running a 1,000-trial Monte Carlo simulation for this claiming strategy&hellip;
                        </p>
                      ) : ssMcMatches && ssMcPreview.successProbability !== null ? (
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                          Probability that claiming at age {age1}{inputs.spouse2Enabled ? `/${age2}` : ''} avoids running out of money across 1,000 randomized-market-return trials, holding everything else in your plan fixed.
                        </p>
                      ) : (
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                          The grid uses a quick deterministic pass/fail check (average returns, no randomness). Run a real Monte Carlo simulation for this specific strategy to see its actual probability of success.
                        </p>
                      )}
                      <button
                        className="btn-outline"
                        onClick={() => runSsMonteCarloPreview(age1, age2)}
                        disabled={ssMcMatches && ssMcPreview.loading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px 14px', fontSize: 'var(--fs-body)', width: '100%' }}
                      >
                        {ssMcMatches && ssMcPreview.loading ? <Loader2 className="animate-spin" size={14} /> : <Dices size={14} />}
                        <span>{ssMcMatches && ssMcPreview.successProbability !== null ? 'Re-run Monte Carlo' : 'Run Monte Carlo for This Strategy'}</span>
                      </button>
                    </div>

                    {/* Explanatory insights block */}
                    <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-sm)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--accent-text)' }}>Claiming Multipliers:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                        <div>• {inputs.spouse1Name || 'Primary'} (claiming at {age1}): <strong>{Math.round(getSSMultiplier(age1, getFullRetirementAge(inputs.birthYear1)) * 100)}%</strong> of baseline FRA benefit</div>
                        {inputs.spouse2Enabled && (
                          <div>• {inputs.spouse2Name || 'Spouse'} (claiming at {age2}): <strong>{Math.round(getSSMultiplier(age2, getFullRetirementAge(inputs.birthYear2)) * 100)}%</strong> of baseline FRA benefit</div>
                        )}
                      </div>
                    </div>

                    {/* Peak Strategy Advice Block */}
                    {!isOptimal && optimalCell && (
                      <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(42, 127, 122, 0.2)', backgroundColor: 'rgba(42, 127, 122, 0.03)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> <strong>Highest in this grid:</strong> claiming at age <strong>{optAge1}</strong>{inputs.spouse2Enabled ? ` and age ${optAge2}` : ''} yields the absolute highest outcome, providing <strong>{formatCurrency(optVal)}</strong> (+{formatCurrency(diffOptimal)} over your active plan).
                      </div>
                    )}

                    {isOptimal && (
                      <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.03)', fontSize: 'var(--fs-xs)', color: 'var(--success)', lineHeight: '1.4' }}>
                        <strong>Peak Strategy Selected!</strong> You are inspecting the mathematically optimal claiming strategy for your demographics.
                      </div>
                    )}

                    {/* Action Button */}
                    {!isCurrent && (
                      <button
                        className="btn-primary"
                        onClick={() => {
                          updateInput('claimingAge1', age1);
                          if (inputs.spouse2Enabled && age2 !== null) {
                            updateInput('claimingAge2', age2);
                          }
                        }}
                        style={{ width: '100%', padding: '12px 16px', fontSize: 'var(--fs-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <CheckCircle size={16} />
                        <span>Apply Claiming Strategy</span>
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* The plain-words companion (changelog 286): four claiming ages,
                the plan's own marked, can-you-afford-to-wait and break-even. */}
            {maximizedComponent !== 'tabSSHeatmap' && (
              <SsClaimingSummary ssClaiming={ssClaiming} inputs={inputs} formatCurrency={formatCurrency} dollarBasisLabel={useRealDollars ? "today's dollars" : 'future dollars'} />
            )}
          </div>
        )}

        {strategySubTab === 'rothladder' && (() => {
          // Bracket mode grids target-tax-bracket x withdrawal-order (dynamic
          // maxBracket conversions); schedule mode grids a literal fixed
          // annual-amount x duration ladder. Row/column values are derived
          // from whichever dataset is active rather than hardcoded here, so
          // this stays in sync with calculator.js's ROTH_LADDER_* constants
          // automatically.
          const heatmapData = rothLadderMode === 'bracket' ? rothBracketHeatmapData : rothLadderScheduleHeatmapData;
          const rowValues = rothLadderMode === 'bracket'
            ? [...new Set(rothBracketHeatmapData.map(c => c.bracket))].sort((a, b) => a - b)
            : [...new Set(rothLadderScheduleHeatmapData.map(c => c.pct))].sort((a, b) => a - b);
          const colValues = rothLadderMode === 'bracket'
            ? ['TaxableFirst', 'PreTaxFirst', 'RothFirst', 'ProRata']
            : [...new Set(rothLadderScheduleHeatmapData.map(c => c.durationYears))].sort((a, b) => a - b);
          const withdrawalLabels = { TaxableFirst: 'Taxable First', PreTaxFirst: 'Pre-Tax First', RothFirst: 'Roth First', ProRata: 'Pro-Rata' };

          const findCell = (rowVal, colVal) => rothLadderMode === 'bracket'
            ? heatmapData.find(c => c.bracket === rowVal && c.withdrawalStrategy === colVal)
            : heatmapData.find(c => c.pct === rowVal && c.durationYears === colVal);

          const cellValue = (cell) => rothLadderMetric === 'afterTaxLegacy' ? cell.afterTaxLegacy : rothLadderMetric === 'endingBalance' ? cell.endingBalance : cell.totalTaxesPaid;

          const isCellCurrent = (cell) => rothLadderMode === 'bracket'
            ? (inputs.rothConversionStrategy === 'maxBracket' && inputs.rothConversionBracket === cell.bracket && inputs.withdrawalStrategy === cell.withdrawalStrategy)
            : (inputs.rothConversionStrategy === 'fixed' && inputs.rothConversionAmount === cell.annualAmount && inputs.rothConversionDurationYears === cell.durationYears);

          const applyCell = (cell) => {
            if (rothLadderMode === 'bracket') {
              updateInput('rothConversionStrategy', 'maxBracket');
              updateInput('rothConversionBracket', cell.bracket);
              updateInput('withdrawalStrategy', cell.withdrawalStrategy);
              updateInput('rothConversionDurationYears', 0);
            } else {
              updateInput('rothConversionStrategy', 'fixed');
              updateInput('rothConversionAmount', cell.annualAmount);
              updateInput('rothConversionDurationYears', cell.durationYears);
            }
          };

          // Optimal cell depends on metric direction: endingBalance is
          // maximized, totalTaxesPaid is minimized.
          let minVal = Infinity;
          let maxVal = -Infinity;
          let bestForMax = null;
          let bestForMin = null;
          for (const cell of heatmapData) {
            const val = cellValue(cell);
            if (val < minVal) { minVal = val; bestForMin = cell; }
            if (val > maxVal) { maxVal = val; bestForMax = cell; }
          }
          const optimalCell = rothLadderMetricDirection === 'max' ? bestForMax : bestForMin;

          const inspectedCell = selectedRothLadderCell || heatmapData.find(isCellCurrent) || optimalCell;

          return (
            <div
              className={maximizedComponent === 'tabRothLadder' ? 'maximized-modal' : ''}
              style={maximizedComponent === 'tabRothLadder' ? {
                position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000, overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)', border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '30px'
              } : { display: 'flex', flexDirection: 'column', gap: '30px' }}
            >
              {/* Header Card */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <div style={{ flex: '1', minWidth: '300px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                      <Layers className="text-purple-500" style={{ color: 'var(--accent-text)' }} size={24} />
                      <span>Roth Conversion Ladder Optimizer</span>
                    </h2>
                    <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.6' }}>
                      {rothLadderMode === 'bracket'
                        ? 'Simulates every combination of target tax bracket and withdrawal order, converting Pre-Tax to Roth up to each bracket ceiling for as long as funds remain.'
                        : 'Simulates a literal fixed-dollar, fixed-duration conversion ladder — convert a set amount every year for a set number of years, then stop.'}
                    </p>
                    {/* Same currency note pattern as the Split Optimizer
                        (changelog 86): these grids now follow the app-wide
                        Real/Nominal toggle (changelog 111), so their figures
                        match the Tax Optimizer Hub and the Action Plan
                        instead of quoting future dollars beside them. */}
                    <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px' }}>
                      {useRealDollars
                        ? "Shown in today's dollars, matching the rest of your plan. Switch the Real/Nominal toggle to see future dollars instead."
                        : 'Shown in future (nominal) dollars, matching the rest of your plan. Switch the Real/Nominal toggle to see them in today’s dollars instead.'}
                    </p>
                    {rothLadderStillLoading && (
                      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                        <Loader2 className="animate-spin" size={14} /> Calculating ladder combinations&hellip;
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px' }}>
                    <label htmlFor="field-rothLadderMode" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Ladder Type</label>
                    <select id="field-rothLadderMode"
                      className="form-input form-input-select"
                      value={rothLadderMode}
                      onChange={(e) => { setRothLadderMode(e.target.value); setSelectedRothLadderCell(null); }}
                      style={{ margin: 0 }}
                    >
                      <option value="bracket">Bracket x Withdrawal Order</option>
                      <option value="schedule">Fixed Amount x Duration</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px' }}>
                    <label htmlFor="field-rothLadderMetric" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Optimize Metric</label>
                    <select id="field-rothLadderMetric"
                      className="form-input form-input-select"
                      value={rothLadderMetric}
                      onChange={(e) => setRothLadderMetric(e.target.value)}
                      style={{ margin: 0 }}
                    >
                      <option value="afterTaxLegacy">Net to Heirs After Every Tax (maximize)</option>
                      <option value="endingBalance">Ending Portfolio Balance (maximize)</option>
                      <option value="totalTaxesPaid">Lifetime Taxes Paid (minimize)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Split Layout: Heatmap (Left) + Ladder Inspector (Right) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>

                {/* Heatmap Grid Panel */}
                <div className="glass-panel" style={{ padding: '24px', gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, paddingRight: '12px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
                        {rothLadderMode === 'bracket' ? 'Bracket x Withdrawal Order Grid' : 'Fixed Amount x Duration Grid'}
                      </h3>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                        {rothLadderMode === 'bracket'
                          ? 'Rows are the target bracket ceiling to fill each year; columns are the account withdrawal order. Click any cell to inspect and apply.'
                          : "Rows are the annual conversion amount (as a % of your current Pre-Tax balance); columns are how many years the ladder runs. Click any cell to inspect and apply."}
                      </p>
                      <p className="show-mobile-only" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0, fontStyle: 'italic' }}>
                        This grid is dense — scroll sideways to see every cell, or try a larger screen for easier tapping.
                      </p>
                    </div>
                    <MaximizeButton target="tabRothLadder" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} label="Maximize grid" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowX: 'auto' }}>
                    {/* Column Headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${colValues.length}, 1fr)`, gap: '6px', textAlign: 'center', minWidth: `${90 + colValues.length * 90}px` }}>
                      <div />
                      {colValues.map(colVal => (
                        <div key={colVal} style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', padding: '6px 0', borderBottom: '2.5px solid var(--accent-secondary)', color: 'var(--accent-text)' }}>
                          {rothLadderMode === 'bracket' ? withdrawalLabels[colVal] : `${colVal} yrs`}
                        </div>
                      ))}
                    </div>

                    {/* Grid Rows */}
                    {rowValues.map(rowVal => (
                      <div key={rowVal} style={{ display: 'grid', gridTemplateColumns: `90px repeat(${colValues.length}, 1fr)`, gap: '6px', minWidth: `${90 + colValues.length * 90}px`, alignItems: 'center' }}>
                        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', textAlign: 'right', paddingRight: '10px', borderRight: '2.5px solid var(--accent-primary)', color: 'var(--accent-text)' }}>
                          {rothLadderMode === 'bracket' ? `${Math.round(rowVal * 100)}%` : `${Math.round(rowVal * 100)}%/yr`}
                        </div>
                        {colValues.map(colVal => {
                          const cell = findCell(rowVal, colVal);
                          if (!cell) return <div key={colVal} />;

                          const val = cellValue(cell);
                          const range = maxVal - minVal;
                          const ratio = range > 0 ? (val - minVal) / range : 1.0;
                          const cellBg = heatCellBg('16, 185, 129', ratio);

                          const isCurrent = isCellCurrent(cell);
                          const isOptimal = optimalCell && optimalCell === cell;

                          let borderStyle = '1px solid var(--card-border)';
                          if (isCurrent) borderStyle = '2.5px solid var(--text-primary)';
                          else if (isOptimal) borderStyle = '1.5px dashed var(--accent-secondary)';

                          return (
                            <HoverTooltip key={colVal} text={`${formatCurrency(val)}${!cell.isSuccessful ? ' (shortfall)' : ''}`}>
                              <div
                                onClick={() => setSelectedRothLadderCell(cell)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRothLadderCell(cell); } }}
                                style={{
                                  height: '52px', backgroundColor: cellBg, border: borderStyle, borderRadius: '6px',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative', userSelect: 'none',
                                }}
                                className="heatmap-cell"
                              >
                                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: '700', color: cell.isSuccessful ? 'var(--text-primary)' : 'var(--error)' }}>
                                  {gridCompactDollars([minVal, maxVal])(val)}
                                </span>
                                {isCurrent && (
                                  <span style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Active</span>
                                )}
                                {isOptimal && (
                                  <span style={{ position: 'absolute', top: '2px', right: '3px', fontSize: '11px' }}><Star size={14} fill="currentColor" style={{ verticalAlign: '-2px', color: '#fff' }} /></span>
                                )}
                              </div>
                            </HoverTooltip>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--fs-xs)', borderTop: '1px solid var(--card-border)', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', border: '1px solid var(--text-primary)', backgroundColor: 'transparent' }}></div>
                        <span style={{ color: 'var(--text-secondary)' }}>Active Plan Settings</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '4px', backgroundColor: 'rgb(16, 185, 129)' }}><Star size={12} fill="currentColor" style={{ color: '#fff' }} /></span>
                        <span style={{ color: 'var(--text-secondary)' }}>Optimal ({rothLadderMetricDirection === 'max' ? 'highest' : 'lowest'} {rothLadderMetricName})</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Lower Value</span>
                      <div style={{ width: '100px', height: '8px', borderRadius: '4px', background: 'linear-gradient(to right, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.8))' }}></div>
                      <span style={{ color: 'var(--text-secondary)' }}>Higher Value</span>
                    </div>
                  </div>
                </div>

                {/* Ladder Inspector Card */}
                {inspectedCell && (() => {
                  const valInspected = cellValue(inspectedCell);
                  const currentCell = heatmapData.find(isCellCurrent);
                  const valCurrent = currentCell ? cellValue(currentCell) : valInspected;
                  const diff = valInspected - valCurrent;
                  // For a minimized metric (taxes), a "better" outcome is a
                  // negative diff (less tax) -- flip the sign so the success
                  // color (green/positive-framed) always means "better"
                  // regardless of which direction this metric optimizes.
                  const diffIsImprovement = rothLadderMetricDirection === 'max' ? diff > 0 : diff < 0;
                  const isCurrent = currentCell === inspectedCell;
                  const isOptimal = optimalCell === inspectedCell;

                  return (
                    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                          <Trophy size={18} style={{ color: 'var(--accent-text)' }} />
                          <span>Ladder Inspector</span>
                        </h3>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {rothLadderMode === 'bracket'
                            ? `Fill the ${Math.round(inspectedCell.bracket * 100)}% ${rothTargetNoun(inspectedCell.bracket)}, ${withdrawalLabels[inspectedCell.withdrawalStrategy]} withdrawals`
                            : `Convert ${formatCurrency(inspectedCell.annualAmount)}/yr for ${inspectedCell.durationYears} years`}
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {rothLadderMetric === 'afterTaxLegacy' ? 'Net to Heirs After Every Tax' : rothLadderMetric === 'endingBalance' ? 'Projected Ending Balance' : 'Lifetime Taxes Paid'}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: inspectedCell.isSuccessful ? 'var(--text-primary)' : 'var(--error)' }}>
                            {formatCurrency(valInspected)}
                          </div>
                        </div>

                        <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Comparison vs Active Plan</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: diff === 0 ? 'var(--text-primary)' : (diffIsImprovement ? 'var(--success)' : 'var(--error)') }}>
                            {diff === 0 ? 'Active Strategy' : `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`}
                          </div>
                        </div>

                        {inputs.spouse2Enabled && (
                          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                            <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              <Tooltip text="Taxes paid once the household switches from Married Filing Jointly to Single after the first spouse passes — a smaller pre-tax balance left behind means smaller forced RMDs taxed at worse Single-filer rates.">Survivor-Phase Taxes</Tooltip>
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: '700', marginTop: '4px', color: inspectedCell.survivorPhaseTaxes > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                              {formatCurrency(inspectedCell.survivorPhaseTaxes)}
                            </div>
                          </div>
                        )}
                      </div>

                      {!inspectedCell.isSuccessful && (
                        <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.05)', fontSize: 'var(--fs-xs)', color: 'var(--error)', lineHeight: '1.4' }}>
                          <AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> This combination projects a shortfall before the end of the plan horizon.
                        </div>
                      )}

                      {!isOptimal && optimalCell && (
                        <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(42, 127, 122, 0.2)', backgroundColor: 'rgba(42, 127, 122, 0.03)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> <strong>Best result in this grid:</strong> {rothLadderMode === 'bracket'
                            ? `Filling the ${Math.round(optimalCell.bracket * 100)}% ${rothTargetNoun(optimalCell.bracket)} with ${withdrawalLabels[optimalCell.withdrawalStrategy]} withdrawals`
                            : `Converting ${formatCurrency(optimalCell.annualAmount)}/yr for ${optimalCell.durationYears} years`} yields the {rothLadderMetricDirection === 'max' ? 'highest' : 'lowest'} {rothLadderMetric === 'afterTaxLegacy' ? 'net to heirs after every tax' : rothLadderMetric === 'endingBalance' ? 'ending balance' : 'lifetime tax bill'}: <strong>{formatCurrency(cellValue(optimalCell))}</strong>.
                        </div>
                      )}

                      {isOptimal && (
                        <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)', backgroundColor: 'rgba(16,185,129,0.03)', fontSize: 'var(--fs-xs)', color: 'var(--success)', lineHeight: '1.4' }}>
                          <strong>Peak Strategy Selected!</strong> You are inspecting the mathematically optimal combination for this metric.
                        </div>
                      )}

                      {!isCurrent && (
                        <button
                          className="btn-primary"
                          onClick={() => applyCell(inspectedCell)}
                          style={{ width: '100%', padding: '12px 16px', fontSize: 'var(--fs-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                          <CheckCircle size={16} />
                          <span>Apply This Ladder</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
    </>
  );
};

export default StrategyTab;
