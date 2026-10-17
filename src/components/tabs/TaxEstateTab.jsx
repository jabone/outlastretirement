import React, { useState } from 'react';
import EstateChecklist from '../EstateChecklist';
import EstateHeirsSection from '../plan/sections/EstateHeirsSection';
import { useSimulation } from '../../context/useSimulation';
import { getBracketFilling, STATE_ESTATE_INHERITANCE_TAX_TABLE } from '../../calculator';
import { HEIR_STRATEGY_LABELS } from '../../config/heirStrategyLabels';
import { TAX_INCOME_SERIES } from '../../config/taxIncomeSeries';
import { BarChart2, Heart, Loader2, Calendar, TrendingUp, FileText, AlertTriangle, Lightbulb } from 'lucide-react';
import Tooltip from '../Tooltip';
import HowFiguredLink from '../HowFiguredLink';
import MaximizeButton from '../MaximizeButton';
import ForeignYearsNotice from '../ForeignYearsNoticeLoader';
import ChartFigure from '../ChartFigure';
import { taxBracketSummary, estateSummary } from '../../utils/chartSummaries';

const ChartFallback = () => (
  <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', color: 'var(--accent-text)' }} />
    <span>Loading visualization engine...</span>
  </div>
);

// States whose only death tax is an inheritance tax: their "How is this
// figured?" link opens the inheritance card rather than the estate one.
const STATE_INHERITANCE_ONLY = new Set(['KY', 'NE', 'NJ', 'PA']);
const TaxBracketChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.TaxBracketChart })));
const EstateLegacyChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.EstateLegacyChart })));

// Federal plus the heir's own state's income tax on the inherited pre-tax
// money, HSA and deferred comp (changelog 263).
const heirIncomeTaxOf = (h) => (h.totalHeirTax || 0) + (h.hsaHeirTax || 0) + (h.nqdcHeirTax || 0) + (h.stateIncomeTax || 0);

const TaxEstateTab = () => {
  // heirTaxResults / estateChartData / taxVisualizerData, and the
  // selectedTaxYear/showIrmaa/enabledTaxBrackets UI state that drives it,
  // are all owned by App.jsx (which also needs them to feed the shared
  // "Maximize Chart" modal) and consumed here via context, rather than each
  // place keeping its own copy — two independent copies of this same state
  // is exactly how the panel and the maximized modal drifted apart before:
  // this component used to keep its own local useState/useMemo for all of
  // this, while App.jsx's "Maximize Tax Chart" modal referenced a
  // completely disconnected (and eventually stale/nonexistent) copy, which
  // crashed the app with a ReferenceError the moment that modal was opened.
  const {
    inputs, formatCurrency, maximizedComponent, setMaximizedComponent,
    heirTaxResults, estateChartData, taxVisualizerData,
    selectedTaxYear, setSelectedTaxYear, showIrmaa, setShowIrmaa, enabledTaxBrackets, setEnabledTaxBrackets,
    enabledIrmaaTiers, resetLinePrefsToAuto, userChoseLinePrefs,
    taxestateSubTab, setTaxestateSubTab,
    kpis, useRealDollars,
  } = useSimulation();

  // The state whose estate/inheritance tax the engine actually applied: the
  // one the household lives in at the END of the plan (changelog 195). Read
  // from the result, never re-derived here -- the plan-wide state input is
  // only the starting state once a move is planned.
  // null once the household is abroad at the end with ties to its last
  // state cut (changelog 196) -- so the fallback applies only when there is
  // no result at all, never to a deliberate null.
  const estateState = heirTaxResults && 'estateStateCode' in heirTaxResults
    ? heirTaxResults.estateStateCode
    : inputs.stateOfResidence;
  const estateCountry = heirTaxResults?.estateCountry || null;

  // "Why is Gross Inherited Wealth so different from Ending Balance?" --
  // the question the Transfer Metrics panel invited until changelog 144.
  // Ending Balance is the four portfolio buckets on the final day; gross
  // inherited wealth adds the inherited IRA's growth over the 10-year
  // stretch, life insurance, and every s 2033 asset outside the buckets.
  // Listing the lines is the only honest answer.
  const [showGrossBreakdown, setShowGrossBreakdown] = useState(false);
  // The breakdown is split into two groups (the owner, 2026-09-08): first the four
  // portfolio accounts, which subtotal to the dashboard's Ending Balance, then
  // everything heirs receive ON TOP of the portfolio -- so the tie between the
  // two headline numbers is visible rather than left to the reader to add up.
  const grossGroups = (() => {
    const c = heirTaxResults?.composition;
    if (!c) return null;
    const stretchGrowth = Math.max(0, (c.preTaxWithdrawn || 0) - (c.preTaxAtDeath || 0));
    const portfolio = [
      ['Pre-Tax at death', c.preTaxAtDeath, 'the IRA/401(k) balance on the final day'],
      ['Roth', c.roth],
      ['Taxable brokerage', c.taxable],
      ['HSA', c.hsa],
    ].filter(([, v]) => (v || 0) > 0.5);
    const portfolioSubtotal = (c.preTaxAtDeath || 0) + (c.roth || 0) + (c.taxable || 0) + (c.hsa || 0);
    const added = [
      ['Growth during the 10-year stretch', stretchGrowth, 'the inherited IRA keeps compounding at your post-retirement return while heirs draw it down — it is counted at what they actually withdraw'],
      ['Life insurance death benefit', c.lifeInsurance, 'paid to heirs income-tax-free; never part of the portfolio balance'],
      ['Home equity', c.homeEquity, 'value less any mortgage and reverse-mortgage balance'],
      ['Other estate assets', c.otherAssets, 'real estate beyond the home, business interests, valuables'],
      ['Concentrated stock', c.concentratedStock],
      ['Cash reserve', c.cashReserve],
      ['Deferred compensation (NQDC)', c.nqdc],
    ].filter(([, v]) => (v || 0) > 0.5);
    if (portfolio.length === 0 && added.length === 0) return null;
    return { portfolio, portfolioSubtotal, added };
  })();

  // taxestateSubTab is lifted into SimulationContext (see App.jsx) so cross-tab
  // deep links can target a specific sub-tab, and so the choice survives
  // this component's remount-on-navigation.

  // Multi-heir estate splitting: inputs.heirs is an array of
  // { id, name, filingStatus, income, splitPct }. The editor itself is
  // EstateHeirsSection (shared with the Interview); selectedHeirId is
  // lifted here because it controls which heir's 10-year withdrawal
  // schedule the bottom table shows (the aggregate metrics panel above it
  // always sums across all heirs).
  const heirs = Array.isArray(inputs.heirs) && inputs.heirs.length > 0
    ? inputs.heirs
    : [{ id: 1, name: 'Heir 1', filingStatus: 'Single', income: 100000, splitPct: 100 }];
  const [selectedHeirId, setSelectedHeirId] = useState(heirs[0].id);
  const selectedHeir = heirs.find(h => h.id === selectedHeirId) || heirs[0];
  const selectedHeirResult = (heirTaxResults.perHeir || []).find(h => h.id === selectedHeir.id) || heirTaxResults.perHeir?.[0];
  return (
    <>
          <ForeignYearsNotice inputs={inputs} />
          <div className="sub-tab-container">
            <button className={`sub-tab-button ${taxestateSubTab === 'brackets' ? 'active' : ''}`} onClick={() => setTaxestateSubTab('brackets')}>Tax Brackets Visualizer</button>
            <button className={`sub-tab-button ${taxestateSubTab === 'estate' ? 'active' : ''}`} onClick={() => setTaxestateSubTab('estate')}>Estate Legacy Planner</button>
            <button className={`sub-tab-button ${taxestateSubTab === 'checklist' ? 'active' : ''}`} onClick={() => setTaxestateSubTab('checklist')}>Documents Checklist</button>
          </div>
          {taxestateSubTab === 'brackets' && (
          <div 
            className={maximizedComponent === 'tabTaxBrackets' ? 'maximized-modal' : ''} 
            style={maximizedComponent === 'tabTaxBrackets' ? { 
              position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000, overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)', border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '30px' 
            } : { display: 'flex', flexDirection: 'column', gap: '30px' }}
          >
            {/* Header / Intro */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div className="panel-header" style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: '1 1 0', minWidth: 0 }}>
                  <h2 style={{ fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                    <BarChart2 className="text-purple-500" style={{ color: 'var(--accent-text)' }} size={24} />
                    <span>Interactive Tax Bracket & Filing Visualizer</span>
                  </h2>
                  <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.6' }}>
                    This tool illustrates how your annual ordinary income stack fills the federal tax brackets over time. 
                    Income fills from the bottom: the slice below the standard deduction line (0%) is untaxed, and each labeled dashed line marks where the next bracket starts. 
                    Adjust your scenario settings (e.g. pension COLA, Roth conversions, or retirement age) to see how your income shifts relative to bracket lines.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    <div style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)', fontSize: 'var(--fs-sm)' }}>
                      <span style={{ fontWeight: '600', color: 'var(--accent-text)' }}>Status:</span> {inputs.spouse2Enabled ? 'Married Filing Jointly (MFJ)' : 'Single Filing'}
                    </div>
                    <div style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'var(--bg-secondary)', fontSize: 'var(--fs-sm)' }}>
                      <span style={{ fontWeight: '600', color: 'var(--accent-text)' }}>Bracket inflation:</span> {inputs.taxBracketInflationRate}% / yr
                    </div>
                  </div>
                </div>
                <MaximizeButton target="tabTaxBrackets" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
              </div>
            </div>

            {/* Split Layout: Chart (Left 2/3) + Selected Year Details (Right 1/3) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', alignItems: 'start' }}>
              
              {/* Left Panel: The Stacked ComposedChart */}
              <div className="glass-panel" style={{ padding: '24px', gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>Year-by-Year Income Stack vs Brackets</h3>
                    <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Click on any year's bar in the chart to inspect its progressive tax filing details.
                    </p>
                    <HowFiguredLink rule="federal-brackets" topic="federal income tax brackets" />
                  </div>
                  
                  {/* Bracket Line Checklist Toggles */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>Show Bracket Lines:</span>
                    {Object.keys(enabledTaxBrackets).map(key => {
                      const rateLabel = key.replace('limit', '') + '%';
                      return (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', cursor: 'pointer', userSelect: 'none' }}>
                          <input 
                            type="checkbox" 
                            checked={enabledTaxBrackets[key]} 
                            onChange={(e) => setEnabledTaxBrackets(prev => ({ ...prev, [key]: e.target.checked }))} 
                          />
                          <span>{rateLabel}</span>
                        </label>
                      );
                    })}
                    
                    {/* The way back out of a manual choice.
                        Only shown once you have made one, because until then
                        the lines already ARE automatic and a button offering
                        to make them automatic would be a puzzle. Without
                        this, unticking a box silently opts you out of the
                        auto-defaults forever with no visible way to undo. */}
                    {userChoseLinePrefs?.current && (
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ padding: '2px 10px', fontSize: 'var(--fs-2xs)', whiteSpace: 'nowrap' }}
                        onClick={resetLinePrefsToAuto}
                        title="Go back to showing only the brackets this plan actually reaches"
                      >
                        Auto
                      </button>
                    )}

                    <div style={{ borderLeft: '1px solid var(--card-border)', height: '16px', margin: '0 8px' }}></div>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-sm)', cursor: 'pointer', userSelect: 'none', color: showIrmaa ? 'var(--success)' : 'var(--text-primary)' }}>
                      <input 
                        type="checkbox" 
                        checked={showIrmaa} 
                        onChange={(e) => setShowIrmaa(e.target.checked)} 
                      />
                      <span style={{ fontWeight: '600' }}><Tooltip text="Income Related Monthly Adjustment Amount. An extra surcharge added to your Medicare Part B and Part D premiums if your income exceeds certain thresholds.">Medicare IRMAA Cliffs</Tooltip></span>
                    </label>

                    <MaximizeButton target="taxVisualizer" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} label="Maximize chart" style={{ marginLeft: 'auto' }} />
                  </div>
                </div>

                <ChartFigure summary={taxBracketSummary(taxVisualizerData)} testId="tax-bracket-figure">
                <div style={{ width: '100%', height: '400px' }}>
                  <React.Suspense fallback={<ChartFallback />}>
                    <TaxBracketChart
                      data={taxVisualizerData}
                      enabledBrackets={enabledTaxBrackets}
                      showIrmaa={showIrmaa}
                      enabledIrmaaTiers={enabledIrmaaTiers}
                      formatCurrency={formatCurrency}
                      onYearSelect={(year) => {
                        setSelectedTaxYear(year);
                      }}
                    />
                  </React.Suspense>
                </div>
                </ChartFigure>
                
                {/* Horizontal color block legend -- the same list the bars
                    and the hover card draw from (TAX_INCOME_SERIES). */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: 'var(--fs-xs)', justifyContent: 'center', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
                  {TAX_INCOME_SERIES.map((s) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: s.color, border: '1px solid var(--card-border)' }}></div>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {s.key === 'rmdAmount'
                          ? <Tooltip text="Required Minimum Distributions: the amount you must withdraw from Pre-Tax accounts each year from age 73-75, whether you need it or not, whatever your withdrawal strategy." more="Forced RMDs">{s.name}</Tooltip>
                          : s.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Panel: Tax Bracket Filing Details Card */}
              {(() => {
                const currentSelYear = selectedTaxYear || (taxVisualizerData[0] ? taxVisualizerData[0].year : 2026);
                const yearData = taxVisualizerData.find(y => y.year === currentSelYear) || taxVisualizerData[0];
                
                if (!yearData) return null;

                // getBracketFilling is used ONLY to draw the bracket bars
                // below -- that is a visualization of where income lands, and
                // rebuilding it here is legitimate. What is NOT legitimate is
                // deriving a tax figure or a marginal rate from those bars
                // when the projection already publishes both, which is what
                // this block did until changelog 176. See the stat tiles.
                //
                // The inflation factor now comes from the row that built the
                // limits. It used to be reverse-derived as
                // (limit10 - stdDeduction) / (24800 or 12400) -- hardcoded
                // constants that no longer matched the standard deduction in
                // use, so every bar was drawn against a slightly wrong scale.
                const taxBrackets = getBracketFilling(
                  yearData.ordinaryTaxableIncome,
                  yearData.householdStatus,
                  yearData.bracketScale || yearData.taxBracketInflationFactor || 1
                );

                const filledBrackets = taxBrackets.filter(b => b.filled > 0);
                const highestFilledBracket = filledBrackets.length > 0 ? filledBrackets[filledBrackets.length - 1] : taxBrackets[0];

                // This tile used to read "Effective Fed Rate" and was summed
                // from the ordinary bracket bars -- catching no capital-gains
                // tax, no NIIT and no AMT. Fixing it turned up something
                // bigger: the engine cannot produce a complete federal-only
                // figure, because the marginal tax on the withdrawal the
                // solver sizes (`extraTax`) is never split federal/state, and
                // in a year funded from a taxable account that is the LARGER
                // part. So the honest number here is the total, named as the
                // total. Don't reintroduce a federal-only rate without first
                // splitting extraTax in the solver.
                const totalTax = Number(yearData.totalTaxesPaid) || 0;

                // An effective rate needs the income actually taxed.
                // totalOrdinaryGross is the BAR STACK's total and carries the
                // standard deduction at its base, so it overstates the
                // denominator; it also excludes investment income entirely.
                // Strip the deduction back out, add realized gains and
                // taxable dividends.
                const taxedIncome = Math.max(0,
                  (yearData.totalOrdinaryGross || 0) - (yearData.stdDeduction || 0)
                  + (yearData.realizedGains || 0)
                  + (yearData.taxableDividends || 0)
                );
                const effectiveTaxRate = taxedIncome > 0
                  ? (totalTax / taxedIncome) * 100
                  : 0;

                // The engine's marginal bracket, which follows the TCJA
                // sunset toggle. A walk up the drawn bars cannot see that
                // toggle, so under a modeled sunset the two disagreed.
                const marginalRateText = yearData.ordinaryTaxableIncome > 0
                  ? (yearData.marginalBracket !== undefined && yearData.marginalBracket !== null
                      ? `${Math.round(yearData.marginalBracket * 100)}%`
                      : (highestFilledBracket ? highestFilledBracket.rate : '0%'))
                  : '0%';

                return (
                  <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Calendar size={18} style={{ color: 'var(--accent-text)' }} />
                        <span>Filing Detail: {currentSelYear}</span>
                      </h3>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Age {yearData.age1 || '—'} {yearData.age2 ? `/ ${yearData.age2}` : ''} • {yearData.isRetired ? 'Retired' : 'Working'}
                      </p>
                    </div>

                    {/* Quick Stats Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Ordinary</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px' }}>{formatCurrency(yearData.totalOrdinaryGross)}</div>
                      </div>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Taxable Ordinary</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px', color: 'var(--accent-text)' }}>{formatCurrency(yearData.ordinaryTaxableIncome)}</div>
                      </div>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Marginal Rate</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px', color: 'var(--danger)' }}>
                          {marginalRateText}
                        </div>
                      </div>
                      <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)' }}>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          <Tooltip text="Every tax the projection charges this year, federal and state together, over the income actually taxed. A blended rate, not federal-only." more="Effective Tax Rate">Effective Tax Rate</Tooltip>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px', color: 'var(--success)' }}>
                          {effectiveTaxRate.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {formatCurrency(totalTax)} in tax
                        </div>
                        {/* The federal/state breakdown, available since
                            changelog 182 split the withdrawal solver's tax.
                            The headline stays the blended rate — it is the
                            complete one — and this sits under it rather
                            than replacing it. */}
                        {(Number(yearData.federalTax) > 0 || Number(yearData.stateTax) > 0) && (
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {formatCurrency(Number(yearData.federalTax) || 0)} federal
                            {(Number(yearData.stateTax) || 0) > 0 ? ` \u00b7 ${formatCurrency(Number(yearData.stateTax))} state` : ''}
                            {(Number(yearData.ficaTax) || 0) > 0 ? ` \u00b7 ${formatCurrency(Number(yearData.ficaTax))} FICA` : ''}
                            {/* Years abroad (changelog 196): foreign tax is in the
                                total above, less the US credit for it. */}
                            {(Number(yearData.foreignTax) || 0) > 0 ? ` \u00b7 ${formatCurrency(Number(yearData.foreignTax))} foreign, less ${formatCurrency(Number(yearData.foreignTaxCredit) || 0)} US credit` : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tax Bracket Stack Details */}
                    <div>
                      <h4 style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>Federal Bracket Allocations</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        
                        {/* Standard Deduction Layer */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                            <span style={{ fontWeight: '600' }}>Standard Deduction (0%)</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(yearData.stdDeduction)} (100%)</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <div style={{ width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
                          </div>
                          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                            Filing limit: $0 to {formatCurrency(yearData.stdDeduction)}
                          </div>
                        </div>

                        {/* Progressive Tax Bracket Layers */}
                        {taxBrackets.map((tb, idx) => {
                          const isFilled = tb.filled > 0;
                          const barBgColor = isFilled 
                            ? (tb.percent === 100 ? 'var(--accent-primary)' : 'var(--accent-secondary)') 
                            : 'rgba(255,255,255,0.05)';
                          
                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                                <span style={{ fontWeight: '600', color: isFilled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                  {tb.rate} Bracket
                                </span>
                                <span style={{ color: isFilled ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                  {isFilled ? `${formatCurrency(tb.filled)} filled` : '$0 filled'} 
                                  {tb.tax > 0 && ` • ${formatCurrency(tb.tax)} tax`}
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                <div style={{ width: `${tb.percent}%`, height: '100%', backgroundColor: barBgColor }}></div>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>
                                <span>Range: {tb.rangeText}</span>
                                {tb.filled > 0 && <span>{tb.percent.toFixed(0)}% full</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Medicare IRMAA Surcharge Tracker.
                        Changelog 174 (CFE-IRMAA-01): this panel used to read
                        `yearData.magi`, which was `totalOrdinaryGross` — an
                        ordinary-income stack INCLUDING the standard deduction,
                        for the CURRENT year. Medicare prices a year off the
                        MAGI on the return filed two years earlier, and the
                        engine has done so since changelog 121. So the panel
                        announced a tier the projection never charged. It now
                        prices off `irmaaBasisMagi` — the figure the ledger's
                        Med / IRMAA cell is built from — and shows this year's
                        own MAGI separately, as the number that sets a premium
                        two years out. Nothing here computes a surcharge
                        dollar table of its own; the tier and the premium both
                        come from the projection. */}
                    {yearData.age1 >= 63 && (
                      <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(52, 211, 153, 0.05)', border: '1px solid rgba(52, 211, 153, 0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(() => {
                          const basisSource = yearData.irmaaBasisSource;
                          // A row from a scenario saved before the engine
                          // carried these falls back to the year's own MAGI,
                          // which is exactly what the engine does for the
                          // first two projection years anyway.
                          const basisMagi = Number.isFinite(Number(yearData.irmaaBasisMagi))
                            ? Number(yearData.irmaaBasisMagi)
                            : Number(yearData.magi) || 0;
                          const ownMagi = Number(yearData.magi) || 0;
                          const basisYear = basisSource === 'lookback' ? yearData.year - 2 : yearData.year;

                          const basisLabel = basisSource === 'lookback'
                            ? `${basisYear} MAGI \u2014 the return Medicare reads for ${yearData.year}`
                            : basisSource === 'appeal'
                              ? `${yearData.year} MAGI \u2014 a Form SSA-44 appeal replaced the ${yearData.year - 2} figure`
                              : `${yearData.year} MAGI \u2014 no earlier year in the plan to look back to yet`;

                          // A tier the year's schedule does not have (a
                          // separate return living together has two) is
                          // null: never reached, never the next cliff.
                          const tier = (t) => (Number.isFinite(t) ? t : null);
                          const reached = (t) => tier(t) !== null && basisMagi >= t;
                          const firstAbove = (...ts) => ts.map(tier).find((t) => t !== null) ?? null;
                          let nextCliff = firstAbove(yearData.irmaaTier1, yearData.irmaaTier2, yearData.irmaaTier3, yearData.irmaaTier4, yearData.irmaaTier5);
                          let penaltyWarning = "No surcharge (Base Premium)";
                          let barColor = "var(--success)";

                          if (reached(yearData.irmaaTier5)) { nextCliff = null; penaltyWarning = "Tier 5 (Max Surcharge)"; barColor = "var(--error)"; }
                          else if (reached(yearData.irmaaTier4)) { nextCliff = firstAbove(yearData.irmaaTier5); penaltyWarning = "Tier 4 Surcharge"; barColor = "var(--error)"; }
                          else if (reached(yearData.irmaaTier3)) { nextCliff = firstAbove(yearData.irmaaTier4, yearData.irmaaTier5); penaltyWarning = "Tier 3 Surcharge"; barColor = "#f97316"; }
                          else if (reached(yearData.irmaaTier2)) { nextCliff = firstAbove(yearData.irmaaTier3, yearData.irmaaTier4, yearData.irmaaTier5); penaltyWarning = "Tier 2 Surcharge"; barColor = "#fbbf24"; }
                          else if (reached(yearData.irmaaTier1)) { nextCliff = firstAbove(yearData.irmaaTier2, yearData.irmaaTier3, yearData.irmaaTier4, yearData.irmaaTier5); penaltyWarning = "Tier 1 Surcharge"; barColor = "var(--success)"; }

                          const gapToNext = nextCliff ? nextCliff - basisMagi : 0;
                          const isClose = nextCliff && gapToNext < 15000;
                          const showsOwnMagiSeparately = basisSource === 'lookback' && Math.abs(ownMagi - basisMagi) > 1;

                          return (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h4 style={{ fontSize: 'var(--fs-sm)', fontWeight: '700', textTransform: 'uppercase', color: 'var(--success)', margin: 0 }}><Tooltip text="Income Related Monthly Adjustment Amount. An extra surcharge added to your Medicare Part B and Part D premiums if your income exceeds certain thresholds.">Medicare IRMAA</Tooltip> Status</h4>
                                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Priced for {yearData.year}</span>
                              </div>
                              <div><HowFiguredLink rule="irmaa" topic="Medicare premiums and IRMAA" /></div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body)', alignItems: 'baseline' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  <Tooltip text="Modified Adjusted Gross Income. For Medicare this is adjusted gross income plus tax-exempt interest. Social Security enters at its taxable amount, not the gross benefit.">MAGI</Tooltip> that sets this year&rsquo;s tier:
                                </span>
                                <strong style={{ fontSize: '15px' }}>{formatCurrency(basisMagi)}</strong>
                              </div>
                              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '-4px' }}>{basisLabel}</div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
                                <span style={{ color: barColor, fontWeight: '600' }}>{penaltyWarning}</span>
                                {nextCliff && (
                                  <span style={{ color: isClose ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: isClose ? '600' : 'normal' }}>
                                    {isClose ? '\u26a0\ufe0f ' : ''}{formatCurrency(gapToNext)} to next cliff
                                  </span>
                                )}
                              </div>

                              {showsOwnMagiSeparately && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', paddingTop: '6px', borderTop: '1px solid rgba(52, 211, 153, 0.15)' }}>
                                  <span>This year&rsquo;s own MAGI ({formatCurrency(ownMagi)}) sets the {yearData.year + 2} premium.</span>
                                </div>
                              )}

                              {/* The education, kept to what is true and
                                  checkable. No surcharge dollar table is
                                  reprinted here: the premium this plan is
                                  actually charged is in the Year by Year
                                  ledger's Med / IRMAA column. */}
                              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', lineHeight: '1.5', paddingTop: '6px', borderTop: showsOwnMagiSeparately ? 'none' : '1px solid rgba(52, 211, 153, 0.15)' }}>
                                Medicare works on a <strong>two-year lookback</strong>: the tier for a given year comes from the tax
                                return filed two years earlier, so 2026 premiums generally follow 2024 income (CMS / SSA).
                                MAGI here is adjusted gross income plus tax-exempt interest &mdash; <strong>tax-exempt interest is
                                not modeled in this plan</strong>, so a large municipal-bond holding would read higher to Medicare than
                                it does here. The dollar premium each year is the Medicare line of the Year by Year ledger&rsquo;s Health column.
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      <Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> <strong>Why this matters:</strong> Withdrawals or Roth conversions that push your taxable income above the <strong>{marginalRateText}</strong> line are taxed at the next marginal rate. Keeping income below these lines in the years you can control it is one way to lower the tax you pay over your lifetime.
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
          )}
          {taxestateSubTab === 'estate' && (
          <div 
            className={maximizedComponent === 'tabTaxEstate' ? 'maximized-modal' : ''} 
            style={maximizedComponent === 'tabTaxEstate' ? { 
              position: 'fixed', top: '20px', left: '20px', right: '20px', bottom: '20px', zIndex: 10000, overflowY: 'auto', padding: '30px', backgroundColor: 'rgba(15, 15, 25, 0.98)', border: '1px solid var(--accent-primary)', boxShadow: '0 0 50px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', gap: '16px' 
            } : { display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {/* Header Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flex: '1 1 0', minWidth: 0 }}>
                  <Heart size={28} style={{ color: 'var(--danger)' }} />
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Estate Legacy Planner</h2>
                    <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Project the tax burden on your beneficiaries based on the IRS 10-Year Rule, Roth distributions, and the <Tooltip text="A tax rule that resets the value of an inherited asset (like taxable stocks) to its current market value at the time of death, eliminating taxes on any previous capital gains.">step-up in basis</Tooltip>.
                    </p>
                  </div>
                </div>
                <MaximizeButton target="tabTaxEstate" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} />
              </div>
            </div>

            {/* Top Grid: Config and Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Left Config Panel */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <EstateHeirsSection selectedHeirId={selectedHeirId} onSelectHeir={setSelectedHeirId} />
              </div>

              {/* Right Metrics Panel. NOT justify-content:space-between -- that
                  pushed the expandable Gross Inherited Wealth breakdown to the
                  very bottom of a tall panel, far below the link that opens it,
                  so it looked like clicking did nothing (reported 2026-09-08).
                  Content flows top-down instead, so the breakdown appears
                  directly under the metrics grid. */}
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={16} />
                  <span>Transfer Metrics Summary</span>
                </h3>
                <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '0 0 14px' }}>
                  {useRealDollars
                    ? "In today\u2019s dollars, matching your Ending Balance. The estate tax itself is figured on the future-dollar exemptions at your plan\u2019s final year, then shown here in today\u2019s dollars. Switch the Real/Nominal toggle for future dollars."
                    : 'In future (nominal) dollars at your plan\u2019s final year, matching the Real/Nominal toggle. Switch it for today\u2019s dollars.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
                  {/* Gross Legacy */}
                  <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Gross Inherited Wealth</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '4px' }}>
                      {formatCurrency(heirTaxResults.grossInherited)}
                    </div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Before estate/income taxes</div>
                    {grossGroups && (
                      <button
                        type="button"
                        onClick={() => setShowGrossBreakdown(v => !v)}
                        aria-expanded={showGrossBreakdown}
                        style={{ background: 'none', border: 'none', padding: 0, marginTop: '6px', color: 'var(--accent-text)', fontSize: 'var(--fs-2xs)', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        {showGrossBreakdown ? 'Hide' : "What's in this number?"}
                      </button>
                    )}
                  </div>

                  {/* Heir Income Tax Drag */}
                  <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(239,68,68,0.02)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                      <Tooltip text="Federal income tax on what each heir inherits, from the filing status and income entered. State income tax where an heir lives is in the Income Tax column; state estate tax below depends on where you live." more="Heir Tax Drag">
                        Total Heir Tax Drag
                      </Tooltip>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: heirTaxResults.totalHeirTax > 0 ? 'var(--danger)' : 'var(--text-primary)', marginTop: '4px' }}>
                      {formatCurrency(heirTaxResults.totalHeirTax)}
                    </div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>IRS 10-Year Rule impact, federal only</div>
                  </div>

                  {/* Net Inherited */}
                  <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(16,185,129,0.02)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Net Heir Inheritance</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--success)', marginTop: '4px' }}>
                      {formatCurrency(heirTaxResults.netInherited)}
                    </div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Total net family transfer</div>
                  </div>

                  {/* Efficiency Rate */}
                  <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(59,130,246,0.02)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>Transfer Efficiency</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--blue-text)', marginTop: '4px' }}>
                      {heirTaxResults.grossInherited > 0
                        ? `${((heirTaxResults.netInherited / heirTaxResults.grossInherited) * 100).toFixed(1)}%`
                        : '100%'}
                    </div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>Percentage retained by heirs</div>
                  </div>
                </div>

                {showGrossBreakdown && grossGroups && (() => {
                  const rowLabel = { padding: '6px 8px 6px 0', color: 'var(--text-secondary)' };
                  const rowVal = { padding: '6px 0', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' };
                  const noteStyle = { fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' };
                  const groupHead = { padding: '10px 0 2px', color: 'var(--text-muted)', fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.04em' };
                  const line = (label, value, note) => (
                    <tr key={label} style={{ borderTop: '1px solid var(--card-border)' }}>
                      <td style={rowLabel}>{label}{note && <div style={noteStyle}>{note}</div>}</td>
                      <td style={rowVal}>{formatCurrency(value)}</td>
                    </tr>
                  );
                  return (
                  <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>What Gross Inherited Wealth is made of.</strong>{' '}
                      Every figure below is in {useRealDollars ? 'today’s' : 'future (nominal)'} dollars. The first group is your
                      portfolio on your plan’s final day, which is what your Ending Balance measures. Heirs receive that (less anything you leave to charity) plus everything in the second group:
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
                      <tbody>
                        <tr><td colSpan={2} style={groupHead}>Your portfolio at death</td></tr>
                        {grossGroups.portfolio.map(([label, value, note]) => line(label, value, note))}
                        {(() => {
                          const endingBal = kpis?.ending || 0;
                          const charityGap = endingBal - grossGroups.portfolioSubtotal;
                          const matchesEnding = Math.abs(charityGap) <= 1;
                          return (
                            <tr style={{ borderTop: '2px solid var(--card-border)' }}>
                              <td style={{ padding: '6px 8px 6px 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                                {matchesEnding ? 'Subtotal \u2014 your Ending Balance' : 'Subtotal \u2014 portfolio left to heirs'}
                                {!matchesEnding && charityGap > 1 && (
                                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 400 }}>
                                    your {formatCurrency(endingBal)} Ending Balance, less {formatCurrency(charityGap)} left to charity
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '6px 0', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{formatCurrency(grossGroups.portfolioSubtotal)}</td>
                            </tr>
                          );
                        })()}
                        {grossGroups.added.length > 0 && (
                          <>
                            <tr><td colSpan={2} style={groupHead}>Added for your heirs, on top of the portfolio</td></tr>
                            {grossGroups.added.map(([label, value, note]) => line(label, value, note))}
                          </>
                        )}
                        <tr style={{ borderTop: '2px solid var(--card-border)' }}>
                          <td style={{ padding: '8px 8px 6px 0', color: 'var(--text-primary)', fontWeight: 700 }}>Gross Inherited Wealth</td>
                          <td style={{ padding: '8px 0 6px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(heirTaxResults.grossInherited)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  );
                })()}

                {/* State Estate/Inheritance Tax — only 12 states + DC have an
                    estate tax and 5 have an inheritance tax (Maryland has
                    both); everywhere else this reads $0. */}
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: heirTaxResults.totalStateEstateTax > 0 ? 'rgba(239,68,68,0.02)' : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                    State Estate/Inheritance Tax ({estateState || (estateCountry ? `none \u2014 living in ${estateCountry}` : 'N/A')})
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: heirTaxResults.totalStateEstateTax > 0 ? 'var(--danger)' : 'var(--text-primary)', marginTop: '4px' }}>
                    {formatCurrency(heirTaxResults.totalStateEstateTax)}
                  </div>
                  <HowFiguredLink rule={STATE_INHERITANCE_ONLY.has(estateState) ? 'state-inheritance' : 'state-estate'} topic="state estate and inheritance tax" />
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {(() => {
                      // $0 can mean two very different things: the state
                      // doesn't levy this tax at all, or it does but this
                      // estate falls under that state's exemption threshold
                      // — conflating the two (as an earlier version of this
                      // did, checking only whether the computed tax is
                      // currently $0) told Washington/Oregon/etc. residents
                      // with modest estates that their state "doesn't levy"
                      // the tax, which is false — it just doesn't apply YET
                      // at their current balance. Check the table directly
                      // instead of inferring from the dollar amount.
                      const entry = STATE_ESTATE_INHERITANCE_TAX_TABLE[estateState];
                      const stateHasTax = !!entry;
                      if (heirTaxResults.totalStateEstateTax > 0) {
                        return `${estateState} levies a state-level estate and/or inheritance tax on top of the federal 10-Year Rule income tax above.`;
                      } else if (stateHasTax) {
                        // Two different reasons a levying state can still
                        // read $0, and telling the user the wrong one is
                        // misleading in opposite directions: an estate tax
                        // reads $0 because the estate is under the threshold
                        // (so it appears later if the plan grows), while an
                        // inheritance tax reads $0 because of WHO inherits
                        // (so it appears if a beneficiary changes, at any
                        // size). Say which one applies.
                        if (entry.hasInheritanceTax && entry.estateExemption === undefined) {
                          return `${estateState} levies an inheritance tax, but it depends on who inherits — everyone in this plan is in an exempt class, so $0 is owed. Change a beneficiary's relationship and this can change at any estate size.`;
                        }
                        return `${estateState} levies a state-level estate and/or inheritance tax, but your projected estate falls under that state's exemption threshold, so $0 is owed.`;
                      } else if (!estateState && estateCountry) {
                        return `You live in ${estateCountry} at the end of the plan and have cut ties with your last US state, so no US state taxes the estate.`;
                      } else {
                        return `${estateState || 'Your state'} does not levy a state estate or inheritance tax (only 12 states + DC do).`;
                      }
                    })()}
                  </div>
                </div>

                {/* Foreign inheritance/estate tax (changelogs 196, 200): only when
                    the plan ends abroad — the country's schedule for each
                    heir, or the user's own blended estimate. */}
                {estateCountry && (
                  <div data-testid="foreign-inheritance-card" style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(245,158,11,0.03)' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                      Foreign Inheritance Tax ({estateCountry}{heirTaxResults.foreignEstateMethod === 'rate' ? ', your estimate' : ''})
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: heirTaxResults.totalForeignEstateTax > 0 ? 'var(--danger)' : 'var(--text-primary)', marginTop: '4px' }}>
                      {heirTaxResults.foreignEstateMethod === null ? 'Not included' : formatCurrency(heirTaxResults.totalForeignEstateTax)}
                    </div>
                    <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {heirTaxResults.foreignEstateMethod === null
                        ? `You have not entered an estimate for ${estateCountry}. Many countries charge one, and it can be large \u2014 add it under Plan Settings \u203a Life Events \u203a Where you live.`
                        : heirTaxResults.foreignEstateMethod === 'rate'
                          ? `${heirTaxResults.foreignEstateRatePct}% of the estate, as you entered it, on top of US estate tax. The two are not credited against each other, so this may overstate the total.`
                          : heirTaxResults.foreignEstateNotYet
                            ? `${estateCountry} taxes a US citizen\u2019s worldwide estate only after ${heirTaxResults.foreignEstateNotYet.afterYears} years living there. By the end of the plan you will have lived there ${heirTaxResults.foreignEstateNotYet.yearsThere}, so nothing is charged on your US assets.`
                            : `Each heir\u2019s share, on ${estateCountry}\u2019s rates for their relationship to you (set on each heir above), on top of US estate tax. The two are not credited against each other, so this may overstate the total.`}
                    </div>
                  </div>
                )}

                {/* Federal Estate Tax — OBBBA (2026) sets a $15M/person
                    exemption ($30M for MFJ, assuming a portability election
                    via IRS Form 706), so this reads $0 for the vast majority
                    of plans and only kicks in for very large estates. Flat
                    40% top rate assumed above the exemption as a documented
                    simplification (real brackets ramp from 18% to 40%, but
                    estates this large are almost always taxed at the top
                    marginal rate anyway). */}
                <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: heirTaxResults.totalFederalEstateTax > 0 ? 'rgba(239,68,68,0.02)' : 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                    <Tooltip text="Federal estate tax under 2026 law: a $15,000,000 per-person exemption ($30,000,000 married with portability) and a flat 40% above it. State estate and inheritance tax paid is deducted before the federal tax is figured." more="Federal Estate Tax">
                      Federal Estate Tax
                    </Tooltip>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: heirTaxResults.totalFederalEstateTax > 0 ? 'var(--danger)' : 'var(--text-primary)', marginTop: '4px' }}>
                    {formatCurrency(heirTaxResults.totalFederalEstateTax)}
                  </div>
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {heirTaxResults.totalFederalEstateTax > 0
                      ? `Estate exceeds the ${inputs.filingStatus === 'MFJ' ? '$30M (MFJ)' : '$15M'} federal exemption; 40% flat rate assumed above it.`
                      : `Under the ${inputs.filingStatus === 'MFJ' ? '$30M (MFJ)' : '$15M'} federal exemption, so $0 is owed.`}
                  </div>
                  <HowFiguredLink rule="federal-estate" topic="federal estate tax" />
                </div>

                {/* Life Insurance Proceeds — shown only when at least one
                    spouse has a cash-value policy enabled in Settings.
                    Proceeds always reach heirs income-tax-free; whether a
                    given policy was counted in the State Estate/Inheritance
                    Tax figure above depends on ITS OWN Ownership setting
                    (self/spouse-owned counts, ILIT/trust-owned does not) --
                    each spouse's policy is evaluated independently, so one
                    can be self-owned while the other sits in an ILIT. */}
                {(inputs.lifeInsuranceEnabled1 || inputs.lifeInsuranceEnabled2) && (() => {
                  const totalProceeds = heirTaxResults.totalLifeInsuranceProceeds || 0;
                  const included = heirTaxResults.lifeInsuranceEstateInclusion || 0;
                  const excluded = Math.max(0, totalProceeds - included);
                  let note;
                  if (totalProceeds <= 0) {
                    note = 'No net death benefit at the end of your projection (check the policy loan balance hasn\'t outgrown the cash value).';
                  } else if (excluded <= 0) {
                    note = 'Self/spouse-owned — counted in the taxable estate above (IRC Sec. 2042). Move ownership to an ILIT to exclude it.';
                  } else if (included <= 0) {
                    note = 'Trust-owned (ILIT) — excluded from your taxable estate entirely.';
                  } else {
                    note = `${formatCurrency(included)} is self/spouse-owned and counted in the taxable estate above; ${formatCurrency(excluded)} is trust-owned (ILIT) and excluded entirely.`;
                  }
                  return (
                    <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--card-border)', backgroundColor: 'rgba(16,185,129,0.02)' }}>
                      <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>
                        <Tooltip text="Both spouses' net death benefits at the end of the plan: face amount, plus cash value for increasing-benefit policies, minus any loan. Paid to heirs income-tax-free." more="Life Insurance Proceeds">
                          Life Insurance Proceeds to Heirs
                        </Tooltip>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--success)', marginTop: '4px' }}>
                        {formatCurrency(totalProceeds)}
                      </div>
                      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {note}
                      </div>
                    </div>
                  );
                })()}

                {/* Per-Heir Breakdown — only meaningfully different from the
                    aggregate totals above when there's more than one heir,
                    but shown whenever there are heirs so a single-heir plan
                    still sees where the 100% split is going. */}
                {heirTaxResults.perHeir && heirTaxResults.perHeir.length > 0 && (
                  <div style={{ marginTop: '14px' }}>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>Per-Heir Breakdown</div>
                    {/* Focusable so a keyboard user can scroll the table sideways (WCAG 2.1.1). */}
                    <div className="scroll-region" tabIndex={0} role="region" aria-label="Per-heir breakdown" style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Heir</th>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>Split</th>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>Gross</th>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }} title="Income tax the heir pays on the inherited pre-tax money (and any HSA or deferred comp): federal plus the heir's own state.">Income Tax</th>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }} title="State estate or inheritance tax — follows the estate's state, not the heir's.">State Estate Tax</th>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>Federal Estate Tax</th>
                            <th style={{ padding: '6px 8px', color: 'var(--text-muted)', textAlign: 'right' }}>Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {heirTaxResults.perHeir.map(h => (
                            <tr key={h.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                              <td style={{ padding: '6px 8px', color: 'var(--text-primary)', fontWeight: '600' }}>{h.name}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{h.splitPct.toFixed(0)}%</td>
                              <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', textAlign: 'right' }}>{formatCurrency(h.grossInherited)}</td>
                              <td style={{ padding: '6px 8px', color: heirIncomeTaxOf(h) > 0 ? 'var(--danger)' : 'var(--text-secondary)', textAlign: 'right' }} title={h.stateIncomeTax > 0 ? `Includes ${formatCurrency(h.stateIncomeTax)} of ${h.stateIncomeTaxState} income tax` : undefined}>{formatCurrency(heirIncomeTaxOf(h))}</td>
                              <td style={{ padding: '6px 8px', color: h.stateEstateTax > 0 ? 'var(--danger)' : 'var(--text-secondary)', textAlign: 'right' }}>{formatCurrency(h.stateEstateTax)}</td>
                              <td style={{ padding: '6px 8px', color: h.federalEstateTax > 0 ? 'var(--danger)' : 'var(--text-secondary)', textAlign: 'right' }}>{formatCurrency(h.federalEstateTax)}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--success)', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(h.netInherited)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Educational Tips Alert */}
                <div style={{ 
                  marginTop: '16px', 
                  padding: '10px 12px', 
                  borderRadius: '8px', 
                  backgroundColor: 'rgba(59,130,246,0.06)', 
                  border: '1px solid rgba(59,130,246,0.2)',
                  fontSize: '11.5px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.4'
                }}>
                  <strong style={{ color: 'var(--text-primary)' }}><Lightbulb size={14} style={{ verticalAlign: '-2px', color: 'var(--accent-text)' }} /> Basis Step-Up:</strong> Taxable Brokerage balances inherit with a stepped-up basis, resetting capital gains to $0. Roth IRAs transfer tax-free (withdrawals have 0% rate). Neither leaves your heirs an income-tax bill.
                </div>
              </div>
            </div>

            {/* Middle Grid: Comparative Legacy Chart */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0 }}>
                  Gross Legacy vs. Net Heir Inheritance by Account Type
                </h3>
                <MaximizeButton target="estateLegacy" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} label="Maximize chart" />
              </div>
              <ChartFigure summary={estateSummary(estateChartData)} testId="estate-figure">
              <div style={{ width: '100%', height: '280px' }}>
                <React.Suspense fallback={<ChartFallback />}>
                  <EstateLegacyChart 
                    data={estateChartData}
                    formatCurrency={formatCurrency}
                  />
                </React.Suspense>
              </div>
              </ChartFigure>
            </div>

            {/* Bottom Panel: IRS 10-Year Withdrawal Schedule */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} />
                  <span>IRS 10-Year Beneficiary Tax Schedule Simulation</span>
                </h3>
                {heirs.length > 1 && (
                  <select
                    aria-label="Heir shown in the 10-year schedule"
                    value={selectedHeirId}
                    onChange={(e) => setSelectedHeirId(parseInt(e.target.value, 10))}
                    className="form-input"
                    style={{ width: 'auto', fontSize: 'var(--fs-sm)' }}
                  >
                    {heirs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                )}
              </div>
              {selectedHeirResult && (
                <p style={{ fontSize: 'var(--fs-xs)', color: selectedHeirResult.strategyOverridden ? 'var(--warning)' : 'var(--text-muted)', marginTop: '-8px', marginBottom: '12px', lineHeight: 1.5 }}>
                  Schedule: <strong>{HEIR_STRATEGY_LABELS[selectedHeirResult.distributionStrategy] || selectedHeirResult.distributionStrategy}</strong>
                  {selectedHeirResult.distributionStrategy === 'rmd_10' && (
                    <> &mdash; {selectedHeirResult.decedentPastRbd
                      ? <>the owner is past their RMD age at death, so years 1&ndash;9 carry a required minimum sized from the heir&rsquo;s age the year after (age {selectedHeirResult.heirAgeYearAfterDeath}; set &ldquo;Age today&rdquo; on the heir card to change it).</>
                      : <>the owner dies before their RMD age, so nothing is required until year 10.</>}</>
                  )}
                  {selectedHeirResult.strategyOverridden && (
                    <> A year-10 lump sum was selected, but it is not permitted once the owner was past their required beginning date &mdash; the annual-RMD schedule is applied instead.</>
                  )}
                </p>
              )}

              <div className="scroll-region" tabIndex={0} role="region" aria-label="Inherited account withdrawals by year" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-body)' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Year</th>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Heir Base Income</th>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Inherited IRA Withdrawal</th>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Combined Taxable Income</th>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>Combined Tax Paid</th>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)', textAlign: 'right' }}>Tax Drag (Marginal)</th>
                      <th style={{ padding: '12px 10px', color: 'var(--text-secondary)', textAlign: 'right' }}>Net Kept (Efficiency)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedHeirResult ? selectedHeirResult.annualWithdrawals : heirTaxResults.annualWithdrawals).map((row) => {
                      const netKept = row.withdrawal - row.taxDrag;
                      const efficiency = row.withdrawal > 0 ? (netKept / row.withdrawal) * 100 : 100;
                      return (
                        <tr key={row.year} style={{ borderBottom: '1px solid var(--card-border)' }}>
                          <td style={{ padding: '12px 10px', fontWeight: '600', color: 'var(--text-primary)' }}>Year {row.year}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>{formatCurrency(selectedHeir.income)}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--text-primary)', fontWeight: '500' }}>
                            {row.withdrawal > 0 ? formatCurrency(row.withdrawal) : '$0'}
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>{formatCurrency(row.combinedIncome)}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--text-secondary)' }}>{formatCurrency(row.taxPaid)}</td>
                          <td style={{ padding: '12px 10px', color: 'var(--danger)', textAlign: 'right', fontWeight: '500' }}>
                            {row.taxDrag > 0 ? `-${formatCurrency(row.taxDrag)}` : '$0'}
                          </td>
                          <td style={{ padding: '12px 10px', color: 'var(--success)', textAlign: 'right', fontWeight: '600' }}>
                            {row.withdrawal > 0 ? (
                              <div>
                                {formatCurrency(netKept)}{' '}
                                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                                  ({efficiency.toFixed(0)}%)
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Warning Alert */}
              <div style={{ 
                marginTop: '16px', 
                padding: '12px', 
                borderRadius: '8px', 
                backgroundColor: 'rgba(239,68,68,0.06)', 
                border: '1px solid rgba(239,68,68,0.2)',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5'
              }}>
                <strong style={{ color: 'var(--danger)' }}><AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> IRS SECURE Act 10-Year Rule:</strong> Most non-spouse beneficiaries (e.g. children, grandchildren) are required to empty inherited traditional IRAs within 10 calendar years. Spreading the withdrawals evenly over 10 years prevents your heir from being pushed into higher federal tax brackets (which is illustrated by comparing Flat 10-Year vs. Lump Sum strategy options above).
              </div>

              {/* Growth-during-holding-period note */}
              <div style={{
                marginTop: '10px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.2)',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5'
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Growth while held:</strong> Whatever portion of the inherited IRA hasn't been withdrawn yet keeps growing at your Retirement Growth Rate for as long as it stays in the account — which is why Lump Sum (Year 10)'s single withdrawal is larger than the original inherited amount, and why Flat 10-Year's withdrawal amounts aren't perfectly equal. Once money is actually paid out to an heir, this tool stops tracking it — it doesn't assume anything about what they do with it next.
              </div>
            </div>
          </div>
          )}

          {taxestateSubTab === 'checklist' && (
            <EstateChecklist />
          )}
    </>
  );
};

export default TaxEstateTab;
