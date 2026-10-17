// Keep-doing vs one-lever compare (CFE-COMPARE-01, changelog 174).
//
// WHY THIS EXISTS ALONGSIDE THE SCENARIO COMPARISON BELOW IT.
//
// Saved scenarios already overlay on one chart, and that is the right tool
// for "here are the four futures I am weighing". It is the wrong tool for
// the question most people actually arrive with, which is narrower:
//
//     if I changed THIS ONE THING, and nothing else, what happens?
//
// A saved scenario cannot answer that honestly. It is a snapshot of the
// whole plan, so two scenarios saved a week apart may differ in one input
// or in nine, and the comparison chart cannot tell you which -- it just
// draws two lines and leaves you to assume the difference you had in mind
// is the difference you are looking at. That assumption is wrong often
// enough to be worth designing against.
//
// So this panel forks the CURRENT plan in memory, changes exactly one
// named input, and runs the same deterministic `runProjection` over both.
// The baseline is the live plan by construction rather than by discipline,
// nothing is saved, and the delta cannot be contaminated by a second edit
// because there is no second edit to make.
//
// DELIBERATELY NOT HERE:
//   - No Monte Carlo. v1 is a deterministic trajectory overlay; a band
//     around each line would invite reading noise as signal on a
//     one-variable question.
//   - No multi-lever mode, no optimizer, no "best path" score. Two levers
//     is a search problem and a different product.
//   - No winner. The panel reports the difference and stops. Which side of
//     a trade-off is worth taking is not a thing a projection knows: a
//     later claim age is a bigger check and a thinner decade before it,
//     and no ending balance settles that.
//   - No new store. `runProjection` is a pure function of inputs and is
//     already called synchronously from a useMemo in App.jsx, so the fork
//     is one more call on a spread of the same object.
import React, { useState, useMemo } from 'react';
import { useSimulation } from '../context/useSimulation';
import { GitCompareArrows, Loader2 } from 'lucide-react';
import { runProjection } from '../calculator';
import { LEVERS, sanitizeForProjection, deflateProjectionForDisplay } from '../utils/oneLeverCompare';
import Tooltip from './Tooltip';
import ChartFigure from './ChartFigure';
import { scenarioSummary } from '../utils/chartSummaries';

const ChartFallback = () => (
  <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
    <Loader2 className="animate-spin" size={28} style={{ color: 'var(--accent-text)' }} />
  </div>
);

const ScenarioComparisonChart = React.lazy(() => import('./LazyCharts').then(m => ({ default: m.ScenarioComparisonChart })));

// The two series names. They are the chart's legend labels AND the keys the
// chart rows are built under, so they are defined once here rather than
// written out at each use -- ScenarioComparisonChart reads `dataKey` from
// the scenario's `name`, so a typo in one of the two places would silently
// render an empty line rather than an error.
//
// "Keep doing this" rather than "Current" or "Baseline": the comparison is
// between two courses of action, and naming the first one after the act of
// carrying on is what makes the second one legible as a single departure
// from it.
const BASE_SERIES = 'Keep doing this';
const CHANGE_SERIES = 'With one change';

// First year the portfolio is exhausted, or null if it never is. Reported
// rather than scored: "runs out in 2051" is a fact about a trajectory,
// "fails" is a verdict about a life.
function firstEmptyYear(years) {
  if (!Array.isArray(years)) return null;
  const hit = years.find(y => (Number(y.totalPortfolioEnding) || 0) <= 0);
  return hit ? hit.year : null;
}

const OneLeverCompare = () => {
  // useRealDollars is the app-wide Real/Nominal toggle and DEFAULTS TO ON.
  // Without it this panel rendered nominal dollars while every other surface
  // showed today's -- see deflateProjectionForDisplay (changelog 184).
  const { inputs, formatCurrency, useRealDollars } = useSimulation();

  const [leverId, setLeverId] = useState(LEVERS[0].id);
  // null means "not yet touched for this lever" -- the value is then derived
  // from the plan on every render, so switching levers never carries a
  // stale number across from the previous one.
  const [draftValue, setDraftValue] = useState(null);

  const lever = LEVERS.find(l => l.id === leverId) || LEVERS[0];
  const baselineValue = lever.baselineValue(inputs);
  const leverValue = draftValue === null ? lever.suggest(baselineValue) : draftValue;

  const selectLever = (id) => {
    setLeverId(id);
    setDraftValue(null);
  };

  const unchanged = String(leverValue) === String(baselineValue);

  const result = useMemo(() => {
    const base = sanitizeForProjection(inputs);
    const forked = { ...base, ...lever.patch(leverValue) };
    const baseProj = deflateProjectionForDisplay(runProjection(base), useRealDollars);
    const forkProj = deflateProjectionForDisplay(runProjection(forked), useRealDollars);

    const byYear = new Map();
    const add = (years, key) => {
      (years || []).forEach(y => {
        if (!byYear.has(y.year)) byYear.set(y.year, { year: y.year });
        byYear.get(y.year)[key] = Math.round(y.totalPortfolioEnding);
      });
    };
    add(baseProj.years, BASE_SERIES);
    add(forkProj.years, CHANGE_SERIES);

    return {
      baseProj,
      forkProj,
      chartData: [...byYear.values()].sort((a, b) => a.year - b.year),
    };
    // `lever` is derived from leverId, so leverId is the honest dependency.
  }, [inputs, leverId, leverValue, useRealDollars]); // eslint-disable-line react-hooks/exhaustive-deps

  const { baseProj, forkProj, chartData } = result;

  const note = lever.describe(leverValue, inputs);

  // Every row is stated as a pair plus a signed difference. No row is
  // highlighted, ranked, colored green, or marked as better.
  const rows = [
    {
      label: 'Ending portfolio balance',
      base: formatCurrency(baseProj.endingBalance),
      change: formatCurrency(forkProj.endingBalance),
      delta: (forkProj.endingBalance || 0) - (baseProj.endingBalance || 0),
    },
    {
      label: 'Lifetime taxes paid',
      base: formatCurrency(baseProj.totalTaxesPaid),
      change: formatCurrency(forkProj.totalTaxesPaid),
      delta: (forkProj.totalTaxesPaid || 0) - (baseProj.totalTaxesPaid || 0),
    },
    {
      label: 'Lifetime Medicare premiums (incl. IRMAA)',
      base: formatCurrency(baseProj.totalIRMAAPaid),
      change: formatCurrency(forkProj.totalIRMAAPaid),
      delta: (forkProj.totalIRMAAPaid || 0) - (baseProj.totalIRMAAPaid || 0),
    },
  ];

  const baseEmpty = firstEmptyYear(baseProj.years);
  const forkEmpty = firstEmptyYear(forkProj.years);

  const cell = { padding: '10px 12px', fontSize: 'var(--fs-sm)', borderBottom: '1px solid var(--card-border)' };
  const headCell = { ...cell, fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', fontWeight: '700' };

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <GitCompareArrows size={20} style={{ color: 'var(--accent-text)' }} />
          <span>Change one thing</span>
        </h3>
        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Your plan exactly as it stands, against the same plan with a single change. Both sides run the same
          projection over the same starting balances, so the gap between the lines is the change and nothing else.
          Nothing here is saved and your plan is not edited.
        </p>
      </div>

      {/* Lever picker */}
      <div>
        <div style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', fontWeight: '700', marginBottom: '8px' }}>
          The one change
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {LEVERS.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => selectLever(l.id)}
              aria-pressed={l.id === leverId}
              className={l.id === leverId ? 'btn-primary' : 'btn-outline'}
              style={{ padding: '8px 14px', minHeight: 'auto', fontSize: 'var(--fs-sm)' }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Value control for the selected lever */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 auto' }}>
          <label style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Keep doing this
          </label>
          <div style={{ fontSize: '15px', fontWeight: '600', padding: '9px 0' }}>
            {lever.format(baselineValue, formatCurrency, lever)}
          </div>
        </div>

        <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
          <label htmlFor="one-lever-value" style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Instead {lever.unitHint ? `(${lever.unitHint})` : ''}
          </label>
          {lever.kind === 'choice' ? (
            <select
              id="one-lever-value"
              className="form-input"
              style={{ width: '100%' }}
              value={leverValue}
              onChange={(e) => setDraftValue(e.target.value)}
            >
              {lever.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              id="one-lever-value"
              type="number"
              className="form-input"
              style={{ width: '100%' }}
              step={lever.step}
              min={lever.min}
              max={lever.max}
              value={leverValue}
              onChange={(e) => {
                const raw = e.target.value;
                setDraftValue(raw === '' ? 0 : Number(raw));
              }}
            />
          )}
        </div>
      </div>

      {note && (
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', padding: '10px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--card-border)' }}>
          {note}
        </div>
      )}

      {unchanged ? (
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', padding: '24px', textAlign: 'center' }}>
          That is what your plan already does. Change the figure above to see the difference.
        </div>
      ) : (
        <>
          <ChartFigure summary={scenarioSummary(chartData, [BASE_SERIES, CHANGE_SERIES])} testId="one-lever-figure">
          <div style={{ width: '100%', height: 320 }}>
            <React.Suspense fallback={<ChartFallback />}>
              <ScenarioComparisonChart
                data={chartData}
                scenarios={[
                  { id: 'one-lever-base', name: BASE_SERIES },
                  { id: 'one-lever-change', name: CHANGE_SERIES },
                ]}
                formatCurrency={formatCurrency}
              />
            </React.Suspense>
          </div>
          </ChartFigure>

          <div className="scroll-region" tabIndex={0} role="region" aria-label="One-change comparison" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, textAlign: 'left' }}>&nbsp;</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>{BASE_SERIES}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>{lever.format(leverValue, formatCurrency, lever)}</th>
                  <th style={{ ...headCell, textAlign: 'right' }}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.label}>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>{r.label}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{r.base}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{r.change}</td>
                    <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {r.delta === 0 ? 'No change' : `${r.delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(r.delta))}`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cell, color: 'var(--text-secondary)' }}>Portfolio runs out</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{baseEmpty ? `in ${baseEmpty}` : 'Not within the plan'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{forkEmpty ? `in ${forkEmpty}` : 'Not within the plan'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {baseEmpty === forkEmpty
                      ? 'No change'
                      : baseEmpty && forkEmpty
                        ? `${Math.abs(forkEmpty - baseEmpty)} ${Math.abs(forkEmpty - baseEmpty) === 1 ? 'year' : 'years'} ${forkEmpty > baseEmpty ? 'later' : 'earlier'}`
                        : forkEmpty ? `Runs out in ${forkEmpty}` : 'No longer runs out'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* The closing note is the whole posture of this panel. It is not
              a disclaimer bolted on: a one-variable comparison genuinely
              cannot rank two plans, and saying so is more useful than a
              trophy would be. */}
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Both lines are a single deterministic projection at your assumed returns, not a range of outcomes &mdash;
            the <Tooltip text="Monte Carlo runs the plan hundreds of times over varying market sequences. It lives on the Risk tab and answers a different question from this one.">Risk</Tooltip> tab
            handles sequence risk. A difference here is the arithmetic of one change, not a recommendation:
            a bigger ending balance may be bought with years of lower spending, or an earlier check with a smaller one.
          </div>
        </>
      )}
    </div>
  );
};

export default OneLeverCompare;
