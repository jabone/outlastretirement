import React, { useMemo } from 'react';
import usePersistentToggle, { OVERLAY_TAXES_KEY, OVERLAY_LIFESTYLE_KEY } from '../../utils/usePersistentToggle';
import { useSimulation } from '../../context/useSimulation';
import { Loader2, AlertTriangle, Sparkles, CalendarCheck, Landmark, X } from 'lucide-react';
import HoverTooltip from '../HoverTooltip';
import Tooltip from '../Tooltip';
import MaximizeButton from '../MaximizeButton';
// runProjection was missing entirely -- autoCalibratePlan below calls it
// directly (not through the shared projection in context, since it needs
// to test several what-if variants before committing one), so without this
// import the "Auto-Calibrate Plan (Easy Button)" button would throw a
// ReferenceError and do nothing the instant it was clicked.
import { runProjection } from '../../calculator';
import ActionPlanCard from '../ActionPlanCard';
import { getPlanFeedback } from '../../utils/planFeedback';
import { firstSafeRetirementYear } from '../../utils/retirementReadiness';

const FEEDBACK_PREVIEW = 3;
import ForeignYearsNotice from '../ForeignYearsNoticeLoader';
import { growthRange } from '../../utils/growthRange';
import ChartFigure from '../ChartFigure';
import { growthSummary } from '../../utils/chartSummaries';
const AssetGrowthChart = React.lazy(() => import('../LazyCharts').then(m => ({ default: m.AssetGrowthChart })));
const ChartFallback = () => (
  <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
    <Loader2 className="animate-spin" size={32} style={{ marginBottom: '16px', color: 'var(--accent-text)' }} />
    <span>Loading visualization engine...</span>
  </div>
);

const DashboardTab = () => {
  // All five sub-tab setters are now real shared state on
  // SimulationContext (App.jsx), so a Plan Feedback recommendation can
  // land the user on the exact sub-tab it names rather than just the
  // right top-level tab. Previously only riskSubTab was lifted, so the
  // other four targets were silently dropped -- see the navigation
  // handler further down and App.jsx's sub-tab state block.
  const { inputs, updateInput, formatCurrency, projection, setActiveTab, getRMDAge, maximizedComponent, setMaximizedComponent, mcRange, monteCarlo, setCalibrationResults, calibrationUndo, undoCalibration, rothBracketHeatmapData, guardrailsComparisonData, setRiskSubTab, setSettingsSubTab, setStrategySubTab, setTaxestateSubTab, setLedgerSubTab } = useSimulation();

  // Changelog 363: the Monte Carlo range behind the average path.
  const growthBand = useMemo(() => growthRange(monteCarlo, mcRange, inputs), [monteCarlo, mcRange, inputs]);
  const planFeedback = useMemo(() => {
    // Only a Monte Carlo run for this exact plan counts (mcRange 'fresh');
    // a stale one from before the last edit would describe another plan.
    const mc = mcRange && mcRange.status === 'fresh' ? { successProbability: mcRange.successProbability } : null;
    return getPlanFeedback(inputs, projection, mc, getRMDAge);
  }, [inputs, projection, mcRange, getRMDAge]);
  // The Dashboard shows the top three findings; the rest unfold on request.
  const [showAllFeedback, setShowAllFeedback] = React.useState(false);
  // Can I retire today? One projection per candidate year until one lasts.
  // Up to 25 projections, so it is worked out just after the Dashboard's
  // first paint rather than before it (useDeferredValue's initial null):
  // the card shows "Working it out" for that moment (mobile speed pass).
  const deferredInputs = React.useDeferredValue(inputs, null);
  const firstSafe = useMemo(() => (deferredInputs ? firstSafeRetirementYear(deferredInputs) : null), [deferredInputs]);

  // Maps a recommendation's `action.tab` onto that tab's sub-tab setter,
  // so the Plan Feedback links below can honor `action.subTab` too. Keyed
  // by the same tab ids Sidebar.jsx/App.jsx use. A tab with no sub-tabs
  // (dashboard, interview) simply has no entry and is a no-op.
  const SUB_TAB_SETTERS = useMemo(() => ({
    risk: setRiskSubTab,
    settings: setSettingsSubTab,
    strategy: setStrategySubTab,
    taxestate: setTaxestateSubTab,
    ledger: setLedgerSubTab,
  }), [setRiskSubTab, setSettingsSubTab, setStrategySubTab, setTaxestateSubTab, setLedgerSubTab]);

  // Remembered across reloads, and shared with the full-screen zoom
  // (changelog 202).
  const [taxesOverlay, setTaxesOverlay] = usePersistentToggle(OVERLAY_TAXES_KEY, false);
  const [lifestyleOverlay, setLifestyleOverlay] = usePersistentToggle(OVERLAY_LIFESTYLE_KEY, false);
  // KNOWN_ISSUES.md issue #1 fix: pairs each custom-switch's visible label
  // text with its checkbox via htmlFor/id -- previously two disconnected
  // siblings, so clicking the text did nothing.
  const taxesOverlayId = React.useId();
  const lifestyleOverlayId = React.useId();

    const autoCalibratePlan = () => {
    // 1. Get baseline totals
    const totalSalary = (Number(inputs.salary1) || 0) + (inputs.spouse2Enabled ? (Number(inputs.salary2) || 0) : 0);
    const nestEgg = (Number(inputs.preTaxInit) || 0) + (Number(inputs.rothInit) || 0) + (Number(inputs.taxableInit) || 0);

    // 2. Set realistic lifestyle spending target (75% of working income, minimum floor $24k, max cap)
    let targetSpending = 0;
    if (totalSalary > 0) {
      targetSpending = Math.round(totalSalary * 0.75);
    } else {
      // 4% safe withdrawal rate
      targetSpending = Math.round(Math.max(24000, nestEgg * 0.04));
    }

    // 3. Set realistic annual savings contributions (10% of salary split: 60% pre-tax, 20% roth, 20% taxable).
    // Pre-Tax and Roth are per-spouse fields, so the 60%/20% targets are
    // split evenly across both spouses when spouse 2 is enabled -- this
    // keeps the actual combined household contribution equal to the 10%
    // target (each spouse's own field is summed independently in the
    // projection, so setting the full target on both would silently double
    // it). An even split is a simple, honest starting point; the user can
    // rebalance between spouses afterward on the Initial Balances page.
    let preTaxCont1 = inputs.preTaxContribution1;
    let preTaxCont2 = inputs.preTaxContribution2;
    let rothCont1 = inputs.rothContribution1;
    let rothCont2 = inputs.rothContribution2;
    let taxableCont = inputs.taxableContribution;
    if (totalSalary > 0) {
      const targetSavings = totalSalary * 0.10;
      const spouseCount = inputs.spouse2Enabled ? 2 : 1;
      const preTaxEach = Math.round((targetSavings * 0.6) / spouseCount);
      const rothEach = Math.round((targetSavings * 0.2) / spouseCount);
      preTaxCont1 = preTaxEach;
      rothCont1 = rothEach;
      if (inputs.spouse2Enabled) {
        preTaxCont2 = preTaxEach;
        rothCont2 = rothEach;
      }
      taxableCont = Math.round(targetSavings * 0.2);
    }

    // 4. Create local variables to optimize step-by-step.
    // Each spouse's ages are clamped against their OWN plan values -- a
    // previous version overwrote Spouse 2's claiming age with Spouse 1's
    // and later forced both spouses to retire at the same age, silently
    // erasing any age gap or deliberate claiming choice (and the summary
    // modal never mentioned Spouse 2 at all). See changelog 105.
    const baseRetire1 = Math.max(62, inputs.retireAge1);
    const baseRetire2 = Math.max(62, inputs.retireAge2);
    // Claiming: never earlier than the user's own choice, at least two
    // years past the (possibly delayed) retirement age, capped at 70.
    const claimingFor = (origClaiming, retireAge) => Math.min(70, Math.max(62, origClaiming, retireAge + 2));
    let testInputs = {
      ...inputs,
      lifestyleExpense: targetSpending,
      preTaxContribution1: preTaxCont1,
      preTaxContribution2: preTaxCont2,
      rothContribution1: rothCont1,
      rothContribution2: rothCont2,
      taxableContribution: taxableCont,
      retireAge1: baseRetire1,
      claimingAge1: claimingFor(inputs.claimingAge1, baseRetire1)
    };

    if (inputs.spouse2Enabled) {
      testInputs.retireAge2 = baseRetire2;
      testInputs.claimingAge2 = claimingFor(inputs.claimingAge2, baseRetire2);
    }

    // Run projection check
    let proj = runProjection(testInputs);

    // If failing, delay retirement year by year -- BOTH spouses together in
    // calendar time, each from their own baseline age, so a couple's age
    // gap survives calibration (delaying "to 66" used to mean a 5-years-
    // younger spouse worked 5 extra calendar years compared to the other).
    // Stops once every enabled spouse has reached 70.
    if (!proj.isSuccessful) {
      const maxDelta = Math.max(70 - baseRetire1, inputs.spouse2Enabled ? 70 - baseRetire2 : 0);
      for (let delta = 1; delta <= maxDelta; delta += 1) {
        testInputs.retireAge1 = Math.min(70, baseRetire1 + delta);
        testInputs.claimingAge1 = claimingFor(inputs.claimingAge1, testInputs.retireAge1);
        if (inputs.spouse2Enabled) {
          testInputs.retireAge2 = Math.min(70, baseRetire2 + delta);
          testInputs.claimingAge2 = claimingFor(inputs.claimingAge2, testInputs.retireAge2);
        }
        proj = runProjection(testInputs);
        if (proj.isSuccessful) break;
      }
    }

    // If still failing at retirement age 70, let's incrementally scale down the spending target down to 60% of salary
    if (!proj.isSuccessful && totalSalary > 0) {
      for (let scale = 0.75; scale >= 0.50; scale -= 0.05) {
        testInputs.lifestyleExpense = Math.round(totalSalary * scale);
        proj = runProjection(testInputs);
        if (proj.isSuccessful) break;
      }
    }

    // Nothing is written to the plan here. The proposal goes to the
    // Suggested changes dialog (App.jsx), which lists every field that
    // would change and applies them only when asked -- with an Undo after.
    const name1 = inputs.spouse1Name || 'Spouse 1';
    const name2 = inputs.spouse2Name || 'Spouse 2';
    const who = (n) => (inputs.spouse2Enabled ? ` \u2014 ${n === 1 ? name1 : name2}` : '');
    const FIELDS = [
      ['lifestyleExpense', 'Annual Lifestyle Spending', 'money'],
      ['preTaxContribution1', `Pre-Tax savings${who(1)}`, 'money'],
      ['rothContribution1', `Roth savings${who(1)}`, 'money'],
      ...(inputs.spouse2Enabled ? [
        ['preTaxContribution2', `Pre-Tax savings${who(2)}`, 'money'],
        ['rothContribution2', `Roth savings${who(2)}`, 'money'],
      ] : []),
      ['taxableContribution', 'Taxable savings', 'money'],
      ['retireAge1', `Retirement Age${who(1)}`, 'age'],
      ['claimingAge1', `Social Security Claiming Age${who(1)}`, 'age'],
      ...(inputs.spouse2Enabled ? [
        ['retireAge2', `Retirement Age${who(2)}`, 'age'],
        ['claimingAge2', `Social Security Claiming Age${who(2)}`, 'age'],
      ] : []),
    ];
    const changes = FIELDS
      .filter(([key]) => Number(testInputs[key]) !== Number(inputs[key]))
      .map(([key, label, kind]) => ({ key, label, kind, from: inputs[key], to: testInputs[key] }));
    const patch = Object.fromEntries(changes.map((c) => [c.key, c.to]));

    setCalibrationResults({
      changes,
      patch,
      isSuccessful: proj.isSuccessful,
      totalSalary,
      nestEgg,
    });
  };

  const renderDashboardChart = (isSplit) => (
    <div
      // Maximizing opens App.jsx's chart dialog; this panel stays in place
      // underneath (it used to turn itself into a second, dark-only fixed
      // overlay at the same time).
      className="glass-panel"
      style={{ padding: isSplit ? '16px 20px' : '24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isSplit ? '10px' : '20px', flexWrap: 'wrap', gap: '10px' }}>
        {/* The title block shrinks and wraps its subtitle so the toggles and
            the maximize button keep the top-right corner (the longer
            subtitle of changelog 363 pushed them onto a line of their own). */}
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: isSplit ? '16px' : '18px', fontWeight: '600', margin: 0 }}>Portfolio Projection Horizon</h2>
            {inputs.stressType !== 'none' && (
              <span style={{
                fontSize: 'var(--fs-xs)',
                fontWeight: '700',
                padding: '3px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--danger)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span><AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--warning)' }} /> Crash Test Active: {
                  inputs.stressType === '1929' ? '1929 Great Depression (-60% Crash)' :
                  inputs.stressType === '1966' ? '1966 Lost Decade (Flat + High Inflation)' :
                  inputs.stressType === '1973' ? '1973 Stagflation (Double Drag Drop)' :
                  inputs.stressType === '2000' ? '2000 Dot-Com Bear (Grinding Drop)' :
                  inputs.stressType === '2008' ? '2008 Financial Crisis (Sharp Shock)' :
                  inputs.stressType === 'crashYear' ? `Custom Market Drop (${inputs.stressCrashReturn}%)` :
                  inputs.stressType === 'history' ? `A Real ${inputs.stressHistoryStartYear} Start (Actual Returns and Inflation)` : inputs.stressType
                }</span>
                <HoverTooltip text="Clear stress test and return to normal returns">
                  <button
                    onClick={() => updateInput('stressType', 'none')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: 'var(--fs-sm)'
                    }}
                  >
                    <X size={12} />
                  </button>
                </HoverTooltip>
              </span>
            )}
          </div>
          <p style={{ fontSize: isSplit ? '11px' : '13px', color: 'var(--text-secondary)', margin: 0, marginTop: '2px' }}>Stacked growth of Pre-Tax, Roth, and Taxable Brokerage accounts with average returns{growthBand ? <>; the shaded band is where total savings ended in <Tooltip text="The Monte Carlo's 10th to 90th percentile for each year: eight simulated markets in ten left savings inside the band, one in ten below it and one in ten above. The typical spread, not the odds of success." more="8 of 10 simulated markets">8 of 10 simulated markets</Tooltip></> : ''}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, marginLeft: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor={taxesOverlayId} style={{ fontSize: isSplit ? '11px' : '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Overlay Taxes Paid</label>
            <span className="custom-switch">
              <input id={taxesOverlayId} type="checkbox" checked={taxesOverlay} onChange={(e) => setTaxesOverlay(e.target.checked)} />
              <span className="slider-round"></span>
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor={lifestyleOverlayId} style={{ fontSize: isSplit ? '11px' : '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Overlay Lifestyle Spending</label>
            <span className="custom-switch">
              <input id={lifestyleOverlayId} type="checkbox" checked={lifestyleOverlay} onChange={(e) => setLifestyleOverlay(e.target.checked)} />
              <span className="slider-round"></span>
            </span>
          </div>
          <MaximizeButton target="growthChart" current={maximizedComponent} setMaximizedComponent={setMaximizedComponent} label="Maximize chart" />
        </div>
      </div>

      {/* minHeight, not height -- this wraps AssetGrowthChart, which renders
          its own event-marker legend (up to 7 wrappable items) below the
          actual 400px-tall chart. On a narrow phone that legend wraps to
          3-4 lines instead of 1, and a fixed height here just let it
          overflow past this box's bottom edge into whatever panel came
          next in the page (the Retirement Bridge Fund card), rendering the
          two on top of each other. minHeight keeps the chart itself at a
          sane size while letting the box grow to fit the legend. */}
      <ChartFigure summary={growthSummary(projection.years, growthBand)} testId="growth-figure">
      <div style={{ width: '100%', minHeight: isSplit ? '180px' : '400px', position: 'relative' }}>
        <React.Suspense fallback={<ChartFallback />}>
          <AssetGrowthChart
            data={projection.years}
            inputs={inputs}
            taxesOverlay={taxesOverlay}
            lifestyleOverlay={lifestyleOverlay}
            formatCurrency={formatCurrency}
            range={growthBand}
          />
        </React.Suspense>
      </div>
      </ChartFigure>
    </div>
  );

  return (
    <>
      <ForeignYearsNotice inputs={inputs} />
      {(() => {
          let bridgeYears = 0;
          let bridgeCost = 0;
          projection.years.forEach(yr => {
            const isRetired = (yr.age1 >= inputs.retireAge1) && (!inputs.spouse2Enabled || yr.age2 >= inputs.retireAge2);
            const isClaiming = (yr.age1 >= inputs.claimingAge1) && (!inputs.spouse2Enabled || yr.age2 >= inputs.claimingAge2);
            if (isRetired && !isClaiming) {
              bridgeYears++;
              bridgeCost += yr.lifestyleExpenses + (yr.healthcareBridge || 0);
            }
          });

          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {inputs.survivorStressEnabled && inputs.spouse2Enabled && (
              <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertTriangle size={24} />
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '600' }}>Survivor Stress Test Active</h4>
                  <p style={{ margin: 0, fontSize: 'var(--fs-body)', opacity: 0.9 }}>
                    The plan is simulating the premature passing of {inputs.survivorStressSpouse === 1 ? (inputs.spouse1Name || 'Primary') : (inputs.spouse2Name || 'Spouse')} at age {inputs.survivorStressAge || 75}. Income, taxes, and expenses have been adjusted.
                  </p>
                </div>
              </div>
            )}
            {/* Chart Panel. minHeight (not height) for the same reason as the
                inner chart wrapper above — this panel needs to be able to
                grow taller than 500px when its header toggles wrap to extra
                lines and the marker legend wraps to extra lines on a narrow
                screen, instead of clipping/overlapping the next panel. */}
            <div className="dashboard-content" style={{ minHeight: '500px' }}>
              {renderDashboardChart(false)}
            </div>

            {/* The answers row (changelog 284): can I retire today, and what
                the years before Social Security cost. Small cards, no
                controls — the Dashboard reads the plan, it does not edit it. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
              <div className="glass-panel kpi-card" data-testid="first-safe-year">
                <span className="kpi-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarCheck size={14} /> First safe year to retire</span>
                {!firstSafe ? (
                  <span className="kpi-subtext" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Working it out&hellip;</span>
                ) : (<>
                <span className="kpi-value" style={{ color: firstSafe.found ? (firstSafe.today ? 'var(--success)' : 'var(--text-primary)') : 'var(--warning)' }}>
                  {firstSafe.found ? (firstSafe.today ? (firstSafe.alreadyRetired ? 'Retired' : 'Today') : String(firstSafe.year)) : 'Not found'}
                </span>
                <span className="kpi-subtext" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {firstSafe.found && firstSafe.today && firstSafe.alreadyRetired && 'Your plan already has you retired, and it lasts to the end.'}
                  {firstSafe.found && firstSafe.today && !firstSafe.alreadyRetired && `Stopping work this year still lasts to the end of the plan. Your plan retires in ${firstSafe.plannedYear}.`}
                  {firstSafe.found && !firstSafe.today && (
                    firstSafe.yearsBeforePlan > 0
                      ? `Stopping work in ${firstSafe.year} (age ${firstSafe.age1}${firstSafe.age2 !== null ? ` / ${firstSafe.age2}` : ''}) still lasts to the end: ${firstSafe.yearsBeforePlan} ${firstSafe.yearsBeforePlan === 1 ? 'year' : 'years'} before your plan\u2019s ${firstSafe.plannedYear}.`
                      : firstSafe.yearsBeforePlan === 0
                        ? `Your plan\u2019s own ${firstSafe.plannedYear} (age ${firstSafe.age1}${firstSafe.age2 !== null ? ` / ${firstSafe.age2}` : ''}) is the first year that lasts to the end.`
                        : `Your plan retires in ${firstSafe.plannedYear} and runs out; stopping work in ${firstSafe.year} (age ${firstSafe.age1}${firstSafe.age2 !== null ? ` / ${firstSafe.age2}` : ''}) is the first year that lasts.`
                  )}
                  {!firstSafe.found && `No year up to ${firstSafe.searchedTo} lasts to the end of the plan on these settings.`}
                  {' '}With average returns only; not tested against bad markets.
                </span>
                </>)}
              </div>
              {bridgeYears > 0 && (
                <div className="glass-panel kpi-card" data-testid="bridge-fund">
                  <span className="kpi-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Landmark size={14} /> Retirement bridge fund</span>
                  <span className="kpi-value">{formatCurrency(bridgeCost)}</span>
                  <span className="kpi-subtext" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Lifestyle and health coverage for the {bridgeYears}-year gap between retiring and claiming Social Security.
                  </span>
                </div>
              )}
            </div>

            {/* Plan Feedback: deterministic rule-based checks over the projection */}
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Sparkles size={18} style={{ color: 'var(--accent-text)' }} />
                  <span>Plan Feedback</span>
                </h3>
                <button
                  onClick={autoCalibratePlan}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: 'var(--fs-sm)',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    boxShadow: '0 4px 12px rgba(42, 127, 122, 0.25)',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <Sparkles size={14} />
                  <span>Suggest changes</span>
                </button>
                {calibrationUndo && (
                  <button type="button" className="btn-outline" onClick={undoCalibration} style={{ padding: '6px 14px', borderRadius: '20px', fontSize: 'var(--fs-sm)' }}>
                    Undo suggested changes
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {(showAllFeedback ? planFeedback : planFeedback.slice(0, FEEDBACK_PREVIEW)).map((rec, index) => {
                  const typeColors = {
                    success: { bg: 'rgba(16,185,129,0.06)', border: 'var(--success)', text: 'var(--success)' },
                    warning: { bg: 'rgba(234,179,8,0.06)', border: 'var(--warning)', text: 'var(--warning)' },
                    danger: { bg: 'rgba(239,68,68,0.06)', border: 'var(--danger)', text: 'var(--danger)' },
                    info: { bg: 'rgba(78,130,195,0.10)', border: 'var(--series-3)', text: 'var(--text-primary)' }
                  };
                  const colors = typeColors[rec.type] || typeColors.info;
                  return (
                    <div key={index} style={{
                      padding: '16px',
                      borderRadius: '8px',
                      backgroundColor: colors.bg,
                      borderLeft: `4px solid ${colors.border}`,
                      borderTop: '1px solid var(--card-border)',
                      borderRight: '1px solid var(--card-border)',
                      borderBottom: '1px solid var(--card-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <h4 style={{ fontSize: 'var(--fs-body)', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: colors.border }}></span>
                        {rec.title}
                      </h4>
                      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                        {rec.desc}
                      </p>
                      {rec.action && (
                        <button
                          className="feedback-action-link"
                          onClick={() => {
                            // Every recommendation carries a {tab, subTab}
                            // target, and all five sub-tab states now live
                            // on SimulationContext (App.jsx), so we can
                            // honor both halves. Before that lift, only the
                            // 'risk' case worked: the other four setters
                            // didn't exist in this scope, so those links
                            // dropped their subTab and left the user on
                            // whichever sub-tab that component defaulted to
                            // -- e.g. "Adjust Retirement Allocations ->"
                            // (Plan Settings > Initial Balances) landed on
                            // Basic Parameters instead, ~2,400 lines from
                            // the control it named.
                            setActiveTab(rec.action.tab);
                            if (rec.action.subTab) {
                              const setSubTab = SUB_TAB_SETTERS[rec.action.tab];
                              if (setSubTab) setSubTab(rec.action.subTab);
                            }
                          }}
                          style={{
                            alignSelf: 'flex-start',
                            marginTop: '4px',
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            // colors.border is a MARK color, tuned to 3:1
                            // against the surface. This is an 11px link, so
                            // it takes the row's text color instead.
                            color: colors.text,
                            fontSize: 'var(--fs-xs)',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'opacity 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                        >
                          {rec.action.label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {planFeedback.length > FEEDBACK_PREVIEW && (
                <button type="button" className="btn-outline" data-testid="feedback-show-all" onClick={() => setShowAllFeedback((v) => !v)} style={{ alignSelf: 'flex-start', padding: '4px 12px', fontSize: 'var(--fs-xs)' }}>
                  {showAllFeedback ? 'Show the top three' : `Show all ${planFeedback.length}`}
                </button>
              )}
            </div>

            {/* Action Plan: the roadmap of what the user actually needs to
                do — savings targets, retirement/claiming ages, withdrawal
                order, milestones, legacy — to reach the ending balance
                shown above. Shares its content with the printable report
                (App.jsx's print-report-container) via buildActionPlan, so
                the on-screen card and the printed version never drift. */}
            <ActionPlanCard inputs={inputs} projection={projection} formatCurrency={formatCurrency} rothLadderHeatmap={rothBracketHeatmapData} guardrailsComparison={guardrailsComparisonData} />

          </div>
          );
      })()}
    </>
  );
};

export default DashboardTab;
