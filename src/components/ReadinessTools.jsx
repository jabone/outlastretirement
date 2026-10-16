import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import MaximizeButton from './MaximizeButton';
import ChartFigure from './ChartFigure';
import { ageFinderSummary, dieWithZeroSummary } from '../utils/chartSummaries';
import Tooltip from './Tooltip';
import { spendingSolve, SPENDING_SOLVE_TEXT } from '../utils/retirementReadiness';
import { DIE_WITH_ZERO_CEILING } from '../calculator';

// The three question tools that lived on Optimizers until changelog 285 --
// the Retirement Age Finder, Die with Zero and the Target Portfolio What-If
// Solver -- as pieces of the Retirement Readiness cards that ask the same
// questions. Readiness reads the plan and does not edit it on a click: a
// bar or a figure here changes what the card compares, and the plan
// changes only through an explicit button that says so. All three were
// free on Optimizers and stay free here; the results come from the same
// context values (App.jsx's heavy worker), so nothing is recomputed.
const ChartFallback = () => (
  <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: '8px' }}>
    <Loader2 className="animate-spin" size={20} style={{ color: 'var(--accent-text)' }} /> Loading chart&hellip;
  </div>
);
const AgeFinderChart = React.lazy(() => import('./LazyCharts').then(m => ({ default: m.AgeFinderChart })));
const DieWithZeroChart = React.lazy(() => import('./LazyCharts').then(m => ({ default: m.DieWithZeroChart })));

const sub = { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const hint = { fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.55 };
const tile = { padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)', textAlign: 'center' };
const tileLabel = { fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const tileValue = { fontSize: '18px', fontWeight: 700, marginTop: '4px' };

// Every retirement age from 50 to 75, run through the plan: the ending
// balance of each, the earliest that lasts, and the age the card is
// comparing. Clicking a bar picks the comparison; the button applies.
export function RetirementAgeExplorer({ ageFinderResults, loading, inputs, formatFar, compareAge, onCompare, onApply, setMaximizedComponent }) {
  const sims = ageFinderResults?.simulations || [];
  const earliest = ageFinderResults?.earliestFundedAge ?? null;
  return (
    <div data-testid="retirement-age-explorer" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--card-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h4 style={sub}>Every retirement age, 50 to 75</h4>
          <p style={{ ...hint, margin: 0 }}>
            The plan run once per retirement age, both of you moving together. The bars are the ending balance; a bar
            that reaches the floor is a plan that runs out. Click a bar to compare that age in the table above.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {earliest !== null && (
            <div data-testid="earliest-funded-age" style={{ ...tile, textAlign: 'left', padding: '8px 12px', borderColor: 'rgba(16,185,129,0.4)' }}>
              <div style={tileLabel}>Earliest age that lasts</div>
              <div style={{ ...tileValue, color: 'var(--success)', fontSize: '16px' }}>Age {earliest}</div>
            </div>
          )}
          {setMaximizedComponent && (
            <MaximizeButton target="ageFinder" setMaximizedComponent={setMaximizedComponent} label="Maximize chart" />
          )}
        </div>
      </div>
      {loading && (
        <p style={{ ...hint, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
          <Loader2 className="animate-spin" size={14} /> Running the ages&hellip;
        </p>
      )}
      {sims.length > 0 && (
        <ChartFigure summary={ageFinderSummary(sims, earliest)} testId="agefinder-figure">
        <div style={{ width: '100%', height: '220px', marginTop: '12px' }}>
          <React.Suspense fallback={<ChartFallback />}>
            <AgeFinderChart
              simulations={sims}
              activeAge={compareAge}
              earliestFundedAge={earliest}
              formatCurrency={formatFar}
              onAgeSelect={(age) => onCompare && onCompare(age)}
            />
          </React.Suspense>
        </div>
        </ChartFigure>
      )}
      {earliest !== null && earliest !== Number(inputs.retireAge1) && onApply && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
          <span style={hint}>
            Your plan retires {inputs.spouse1Name || 'you'} at {inputs.retireAge1}. Nothing changes until you press the button
            {inputs.spouse2Enabled ? `; ${inputs.spouse2Name || 'your spouse'}\u2019s age moves with it, keeping your age gap` : ''}.
          </span>
          <button type="button" className="btn-outline" data-testid="apply-earliest-age" style={{ padding: '6px 12px', fontSize: 'var(--fs-sm)' }} onClick={() => onApply(earliest)}>
            Make age {earliest} the plan&rsquo;s retirement age
          </button>
        </div>
      )}
    </div>
  );
}

// The most the plan AS ENTERED could spend and still land at zero at life
// expectancy (Die with Zero), with the same ceiling at three odds of living,
// the two paths side by side, and an explicit button to adopt it.
export function SpendingCeiling({ inputs = null, dieWithZeroResults, dieWithZeroLongevityData, formatCurrency, onApply, setMaximizedComponent }) {
  const [showPaths, setShowPaths] = useState(false);
  if (!dieWithZeroResults) return null;
  // E17: the search's bound, a failed search and an empty projection are not
  // spending levels; each gets its own sentence and no apply button.
  const solve = spendingSolve(dieWithZeroResults.spending, {
    reason: dieWithZeroResults.reason || null,
    rows: dieWithZeroResults.rows === undefined ? 1 : dieWithZeroResults.rows,
  });
  const solved = solve.status === 'ok';
  const extra = solved ? Math.round(dieWithZeroResults.additionalSpend || 0) : 0;
  // U14: the planned row states the ages it plans to, like the rows under it,
  // so a row that shares its end year but keeps a spouse in the plan one year
  // longer is visibly a different horizon rather than a contradiction.
  const plannedAges = inputs
    ? `${Number(inputs.lifeExpectancy1)}${inputs.spouse2Enabled ? ` / ${Number(inputs.lifeExpectancy2)}` : ''}`
    : null;
  const plannedEnd = dieWithZeroLongevityData?.planned?.endYear;
  const sharesEndYear = !!inputs && (dieWithZeroLongevityData?.levels || []).some((lv) => lv.endYear === plannedEnd
    && (lv.age1 !== Number(inputs.lifeExpectancy1) || (inputs.spouse2Enabled && lv.age2 !== Number(inputs.lifeExpectancy2))));
  const levelCell = (level) => {
    const lv = spendingSolve(level?.spending, { reason: level?.reason || null });
    if (lv.status === 'ok') return `${formatCurrency(Math.round(lv.amount))}/yr`;
    if (lv.status === 'aboveCeiling') return `More than ${formatCurrency(DIE_WITH_ZERO_CEILING)}/yr`;
    return lv.status === 'noRows' ? 'No years to plan' : 'None lasts';
  };
  return (
    <div data-testid="spending-ceiling" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--card-border)' }}>
      <h4 style={sub}>And retiring as planned?</h4>
      {!solved ? (
        <p data-testid="spending-ceiling-unsolved" style={{ fontSize: 'var(--fs-body)', margin: '0 0 10px' }}>
          {SPENDING_SOLVE_TEXT[solve.status]}
        </p>
      ) : (
      <p style={{ fontSize: 'var(--fs-body)', margin: '0 0 10px' }}>
        Retiring when your plan says, the most it could spend and still reach{' '}
        <Tooltip text="Spend-to-zero: the largest yearly lifestyle budget for which the portfolio lands at exactly $0 in your last planned year. A ceiling, not a recommendation." more="Die With Zero">exactly $0</Tooltip>
        {' '}at your life expectancy is <strong>{formatCurrency(Math.round(dieWithZeroResults.spending))} a year</strong>
        {extra > 100
          ? <> &mdash; <strong style={{ color: 'var(--success)' }}>{formatCurrency(extra)}</strong> a year more than you are planning to spend.</>
          : extra < -100
            ? <> &mdash; <strong style={{ color: 'var(--danger)' }}>{formatCurrency(Math.abs(extra))}</strong> a year less than your budget.</>
            : <>, about what you are planning to spend.</>}
      </p>
      )}
      {solve.status !== 'noRows' && dieWithZeroLongevityData && dieWithZeroLongevityData.levels && (
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 6px' }}>The same ceiling at the odds of living</h5>
          <table style={{ width: '100%', fontSize: 'var(--fs-sm)', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>If the money has to last as long as&hellip;</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Through</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Spend-to-zero</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '6px 8px' }}>your planned Life Expectancy</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{dieWithZeroLongevityData.planned.endYear}{plannedAges ? ` (age ${plannedAges})` : ''}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{levelCell(dieWithZeroLongevityData.planned)}</td>
              </tr>
              {dieWithZeroLongevityData.levels.map((lv) => (
                <tr key={lv.id}>
                  <td style={{ padding: '6px 8px' }}>{lv.label} (at least {Math.round(lv.prob * 100)}% still here)</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{lv.endYear} (age {lv.age1}{lv.age2 !== null ? ` / ${lv.age2}` : ''})</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{levelCell(lv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
            From the Social Security life table, using the ages and Sex on the Household page; for a couple, the year the chance that at least one of you is
            still here falls to that level (the last year it is at least that).
            {sharesEndYear && ' Each row keeps both of you in the plan to its year, so a row that ends the same year as your plan can still differ from it: your plan has one of you leaving it earlier.'}
            {' '}Spending that is safe to one household in ten is the cautious end; spending that is safe only to half is a coin toss.
          </p>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button type="button" className="btn-outline" style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)' }} onClick={() => setShowPaths((v) => !v)} aria-expanded={showPaths}>
          {showPaths ? 'Hide the two paths' : 'Show the two paths'}
        </button>
        {solved && extra > 100 && onApply && (
          <button type="button" className="btn-outline" data-testid="apply-ceiling" style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)' }} onClick={() => onApply(Math.round(solve.amount))}>
            Make {formatCurrency(Math.round(solve.amount))} the plan&rsquo;s budget
          </button>
        )}
        {setMaximizedComponent && showPaths && (
          <MaximizeButton target="dieWithZero" setMaximizedComponent={setMaximizedComponent} label="Maximize chart" />
        )}
      </div>
      {showPaths && (
        <ChartFigure summary={dieWithZeroSummary(dieWithZeroResults.comparisonData)} testId="diewithzero-figure">
        <div style={{ width: '100%', height: '220px', marginTop: '12px' }}>
          <React.Suspense fallback={<ChartFallback />}>
            <DieWithZeroChart data={dieWithZeroResults.comparisonData} formatCurrency={formatCurrency} />
          </React.Suspense>
        </div>
        </ChartFigure>
      )}
    </div>
  );
}

// Runs the plan backwards: how big would the portfolio have to be today
// for a retirement you have not committed to. A scratchpad -- nothing
// here changes the plan.
export function TargetPortfolioSolver({ inputs, formatCurrency, targetPortfolioResults, whatIfRetireAge, setWhatIfRetireAge, whatIfSpend, setWhatIfSpend, whatIfFundingMethod, setWhatIfFundingMethod }) {
  const [open, setOpen] = useState(false);
  if (!targetPortfolioResults) return null;
  // The solver searches up to a ceiling ($20 million). When nothing up to it
  // lasts, the returned portfolio is that ceiling and its projection fails:
  // a lower bound, never the answer.
  const notFound = targetPortfolioResults.found === false;
  const have = inputs.preTaxInit + inputs.rothInit + inputs.taxableInit;
  const need = targetPortfolioResults.targetPortfolio.total;
  return (
    <div data-testid="target-portfolio-solver" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--card-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h4 style={sub}>What would you need today for a different retirement?</h4>
          <p style={{ ...hint, margin: 0 }}>
            Runs the plan backwards: the smallest portfolio that, starting now, still lasts if you retire earlier or spend more.
            A scratchpad &mdash; nothing here changes your plan.
          </p>
        </div>
        <button type="button" className="btn-outline" style={{ padding: '4px 10px', fontSize: 'var(--fs-xs)' }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Hide' : 'Try a scenario'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: '12px' }}>
          {/* Say which scenario the figures below describe. With both boxes
              empty they describe the plan as entered, which is easy to
              mistake for "nothing happened" — the placeholders read like
              values. */}
          <p data-testid="whatif-scenario" style={{ ...hint, margin: '0 0 10px', color: 'var(--text-secondary)' }}>
            {whatIfRetireAge === '' && whatIfSpend === ''
              ? <>The figures below are for <strong>your plan as entered</strong> (retire at {inputs.retireAge1}, spend {formatCurrency(inputs.lifestyleExpense)} a year). Type a different age or budget to try a scenario; the boxes start empty on purpose.</>
              : <>Scenario: retire at <strong>{whatIfRetireAge !== '' ? whatIfRetireAge : inputs.retireAge1}</strong>{whatIfRetireAge === '' ? ' (your plan)' : ''}, spend <strong>{formatCurrency(whatIfSpend !== '' ? Number(whatIfSpend) : inputs.lifestyleExpense)}</strong>{whatIfSpend === '' ? ' (your plan)' : ''} a year. The figures below update a moment after you stop typing.</>}
          </p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
              <label htmlFor="field-whatIfRetireAge">What-If Retirement Age (You)</label>
              <input id="field-whatIfRetireAge"
                type="number"
                min="18"
                max="100"
                className="form-input"
                value={whatIfRetireAge}
                onChange={(e) => setWhatIfRetireAge(e.target.value)}
                placeholder={`Current: ${inputs.retireAge1}`}
                style={{ width: '100%' }}
              />
              {inputs.spouse2Enabled && (
                <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
                  {inputs.spouse2Name || 'Your spouse'} retires alongside you: their age moves by the same number of
                  years, keeping your current age gap
                  {whatIfRetireAge !== '' && targetPortfolioResults.projection?.spouse2AgeAtRetire !== undefined
                    ? ` (they'd retire at ${targetPortfolioResults.projection.spouse2AgeAtRetire}).`
                    : '. '}
                  {' '}This solver moves both of you together; it can&rsquo;t model one of you retiring early alone.
                </div>
              )}
            </div>
            <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
              <label htmlFor="field-whatIfSpend">What-If Annual Spending</label>
              <input id="field-whatIfSpend"
                type="number"
                min="0"
                className="form-input"
                value={whatIfSpend}
                onChange={(e) => setWhatIfSpend(e.target.value)}
                placeholder={`Current: $${inputs.lifestyleExpense}`}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
                Your lifestyle spending in today&rsquo;s dollars, before taxes and healthcare &mdash; the same figure
                as Plan Settings&rsquo; Annual Lifestyle Expense. It still grows with inflation from there.
              </div>
            </div>
            <div className="form-group" style={{ flex: '1', minWidth: '200px' }}>
              <label htmlFor="field-whatIfFundingMethod">Fund Shortfall Method</label>
              <select id="field-whatIfFundingMethod" 
                className="form-input"
                value={whatIfFundingMethod}
                onChange={(e) => setWhatIfFundingMethod(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="taxable">Taxable Brokerage Only</option>
                <option value="proportional">Scale All Accounts</option>
              </select>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
                Where the extra money is assumed to sit. <strong>Taxable Brokerage Only</strong> leaves your Pre-Tax
                and Roth balances exactly as they are and solves for the brokerage balance alone &mdash; the right
                choice for retiring before 59&frac12;, since that money has no early-withdrawal penalty.
                <strong> Scale All Accounts</strong> grows all three together in the proportions you hold today.
                The two can give very different answers for the same scenario.
              </div>
            </div>
          </div>

          {((whatIfRetireAge !== '' && parseInt(whatIfRetireAge) < 59.5) || (inputs.spouse2Enabled && targetPortfolioResults.projection?.spouse2AgeAtRetire < 59.5)) && (
            <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', borderRadius: '8px', marginBottom: '20px', color: 'var(--text-primary)', fontSize: 'var(--fs-body)' }}>
              <strong>Note on Early Retirement:</strong> taking Pre-Tax money, or Roth earnings, before age 59&frac12; generally carries a 10% IRS penalty, with exceptions such as the Rule of 55 and 72(t) payments. The <strong>Taxable Brokerage Only</strong> withdrawal order shows the plan funded without touching those accounts early.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>What You Have Today</div>
              <div style={{ fontSize: '20px', fontWeight: '700', marginTop: '6px' }}>
                {formatCurrency(inputs.preTaxInit + inputs.rothInit + inputs.taxableInit)}
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                Your Pre-Tax, Roth and Taxable starting balances added together.
              </div>
            </div>
            <div className="glass-panel" style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', textAlign: 'center', borderColor: 'var(--accent-primary)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>What You&rsquo;d Need Today</div>
              <div data-testid="target-portfolio-need" style={{ fontSize: '20px', fontWeight: '700', color: 'var(--accent-text)', marginTop: '6px' }}>
                {notFound ? `More than ${formatCurrency(need)}` : formatCurrency(need)}
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                {notFound
                  ? <>No starting balance up to {formatCurrency(need)} lasts under this scenario, so the search stops there.</>
                  : <>The smallest balance you could start with <em>now</em> and still finish the plan above $0 under this
                    scenario. It is a floor, not a comfortable margin.</>}
              </div>
            </div>
            <div className="glass-panel" style={{ padding: '16px', backgroundColor: 'var(--bg-secondary)', textAlign: 'center', borderColor: targetPortfolioResults.targetPortfolio.total > (inputs.preTaxInit + inputs.rothInit + inputs.taxableInit) ? 'var(--error)' : 'var(--success)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Gap</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: targetPortfolioResults.targetPortfolio.total > (inputs.preTaxInit + inputs.rothInit + inputs.taxableInit) ? 'var(--error)' : 'var(--success)', marginTop: '6px' }}>
                {notFound
                  ? `More than -${formatCurrency(Math.max(0, need - have))}`
                  : `${need > have ? '-' : '+'}${formatCurrency(Math.abs(need - have))}`}
              </div>
              <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                {targetPortfolioResults.targetPortfolio.total > (inputs.preTaxInit + inputs.rothInit + inputs.taxableInit)
                  ? 'How much short you are of affording this scenario starting today. Your remaining years of contributions and growth are what close it.'
                  : 'How much more than the minimum you already hold, so this scenario is affordable from where you stand today.'}
              </div>
            </div>
          </div>
      
          {!notFound && (
          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
             <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Where that target sits, by account:</div>
             <div style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
               Pre-Tax: {formatCurrency(targetPortfolioResults.targetPortfolio.preTax)} <br/>
               Roth: {formatCurrency(targetPortfolioResults.targetPortfolio.roth)} <br/>
               Taxable: {formatCurrency(targetPortfolioResults.targetPortfolio.taxable)}
             </div>
             <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '10px', lineHeight: '1.5' }}>
               {whatIfFundingMethod === 'taxable'
                 ? 'Pre-Tax and Roth are your real balances, held fixed \u2014 only the Taxable figure was solved for.'
                 : 'All three were scaled together, keeping the same proportions your accounts hold today.'}
             </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
