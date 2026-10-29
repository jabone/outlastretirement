// "Find my best schedule" (changelog 465): the year-by-year Roth schedule
// search, run on demand in its own worker (utils/rothScheduleAsync.js),
// with its result shown before anything is applied. "Use this schedule"
// writes rothConversionSchedule and switches the strategy to 'schedule'.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulation } from '../context/useSimulation';
import { runProjection, ROTH_SCHEDULE_BUDGET, rothTargetNoun } from '../calculator';
import { deflateProjectionForDisplay } from '../utils/displayDollars';
import { startRothScheduleSearch } from '../utils/rothScheduleAsync';

const bracketLabel = (b) => (b === null || b === undefined ? 'None' : `${Math.round(b * 100)}% ${rothTargetNoun(b)}`);

// Runs of the same bracket, for the one-line summary: "2031–2034 22%
// bracket". A trailing run of no conversion is left off.
function scheduleRuns(schedule) {
  const out = [];
  for (const e of schedule) {
    const last = out[out.length - 1];
    if (last && last.bracket === e.bracket && last.to === e.year - 1) last.to = e.year;
    else out.push({ from: e.year, to: e.year, bracket: e.bracket });
  }
  if (out.length > 1 && out[out.length - 1].bracket === null) out.pop();
  return out;
}

function ScheduleTable({ inputs, schedule, useRealDollars, formatCurrency }) {
  const rows = useMemo(() => {
    const proj = deflateProjectionForDisplay(
      runProjection({ ...inputs, rothConversionStrategy: 'schedule', rothConversionSchedule: schedule }),
      useRealDollars,
    );
    const byYear = new Map(proj.years.map((y) => [y.year, y]));
    const all = schedule.map((e) => ({ ...e, row: byYear.get(e.year) })).filter((r) => r.row);
    // Stop the table after the last year anything converts.
    let last = -1;
    all.forEach((r, i) => { if ((r.row.convertAmount || 0) > 0) last = i; });
    return { shown: all.slice(0, last + 1), after: all.length > last + 1 ? all[last + 1].year : null };
  }, [inputs, schedule, useRealDollars]);
  const th = { textAlign: 'left', padding: '4px 8px', fontWeight: 600, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' };
  const td = { padding: '4px 8px', fontSize: 'var(--fs-xs)', fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ marginTop: '10px' }}>
      <div className="scroll-region" tabIndex={0} role="region" aria-label="Roth conversions by year" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th}>Year</th>
            <th style={th}>Age</th>
            <th style={th}>Bracket</th>
            <th style={{ ...th, textAlign: 'right' }}>Converted</th>
            <th style={{ ...th, textAlign: 'right' }}>Tax it caused</th>
            <th style={th}>Held back by</th>
          </tr>
        </thead>
        <tbody>
          {rows.shown.map(({ year, bracket, row }) => {
            const held = [
              (row.irmaaCappedConversion || 0) > 0 ? 'Medicare surcharge limit' : null,
              (row.acaCliffCappedConversion || 0) > 0 ? 'ACA limit' : null,
            ].filter(Boolean).join(', ');
            return (
              <tr key={year} style={{ borderTop: '1px solid var(--card-border)' }}>
                <td style={td}>{year}</td>
                <td style={td}>{row.age1}{inputs.spouse2Enabled && row.age2 != null ? ` / ${row.age2}` : ''}</td>
                <td style={td}>{bracketLabel(bracket)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(row.convertAmount || 0)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{formatCurrency(row.conversionTaxCost || 0)}</td>
                <td style={td}>{held || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {rows.after !== null && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
          {rows.shown.length ? `Nothing converts from ${rows.after} on.` : 'Nothing converts in any year.'}
        </p>
      )}
    </div>
  );
}

export default function RothScheduleFinder() {
  const { inputs, updateInput, formatCurrency, useRealDollars } = useSimulation();
  const [search, setSearch] = useState(null); // { cancel }
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);
  const objective = inputs.rothOptimizerObjective === 'lifetimeSpending' ? 'lifetimeSpending' : 'afterTaxEnding';

  // A search left running when the section closes is stopped.
  useEffect(() => () => { if (searchRef.current) searchRef.current.cancel(); }, []);

  const start = () => {
    if (searchRef.current) searchRef.current.cancel();
    setResult(null);
    setError(null);
    setProgress({ runs: 0, budget: ROTH_SCHEDULE_BUDGET, year: null });
    const job = startRothScheduleSearch(inputs, { objective, onProgress: (p) => setProgress(p) });
    searchRef.current = job;
    setSearch(job);
    job.promise.then((r) => {
      if (searchRef.current !== job) return;
      searchRef.current = null;
      setSearch(null);
      setProgress(null);
      if (r && !r.canceled) setResult({ ...r, forObjective: objective });
    }).catch((e) => {
      if (searchRef.current !== job) return;
      searchRef.current = null;
      setSearch(null);
      setProgress(null);
      setError(e.message);
    });
  };
  const cancel = () => {
    if (searchRef.current) searchRef.current.cancel();
    searchRef.current = null;
    setSearch(null);
    setProgress(null);
  };
  const apply = () => {
    updateInput('rothConversionSchedule', result.schedule);
    updateInput('rothConversionStrategy', 'schedule');
  };

  const valueLabel = (v, goal) => (v === null || v === undefined ? '—' : goal === 'lifetimeSpending' ? `${formatCurrency(v)} a year` : formatCurrency(v));
  const goalWords = (goal) => (goal === 'lifetimeSpending' ? 'you could spend each year for life' : 'left for your heirs after every tax');
  const capsOn = inputs.rothConversionIrmaaCapEnabled || inputs.acaCliffProtectionEnabled;
  const saved = Array.isArray(inputs.rothConversionSchedule) ? inputs.rothConversionSchedule : [];

  return (
    <div className="form-group" style={{ borderLeft: '2.5px solid var(--accent)', paddingLeft: '12px', marginTop: '12px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Find my best schedule</div>
      <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        Tries a different bracket in each conversion year, starting from the best single bracket for your plan, and keeps a change only when it helps the goal you pick.
      </p>
      <div role="radiogroup" aria-label="Goal" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
        {[['afterTaxEnding', 'Leave the most after tax'], ['lifetimeSpending', 'Spend the most while I’m alive']].map(([value, label]) => (
          <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
            <input type="radio" name="rothOptimizerObjective" value={value} checked={objective === value} onChange={() => updateInput('rothOptimizerObjective', value)} />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-primary" onClick={start} disabled={!!search}>Find my best schedule</button>
        {search && <button type="button" className="btn-outline" onClick={cancel}>Stop</button>}
      </div>
      {progress && (
        <p role="status" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
          {progress.year ? `Checking ${progress.year}` : 'Starting'} ({progress.runs} of about {progress.budget} plans)&hellip;
        </p>
      )}
      {error && <p role="alert" style={{ fontSize: 'var(--fs-xs)', color: 'var(--danger)', margin: '8px 0 0' }}>The search stopped: {error}</p>}
      {capsOn && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
          Your Medicare surcharge and ACA limits still apply each year, and the search only chooses among conversions they allow.
        </p>
      )}

      {result && (
        <div style={{ marginTop: '12px', padding: '12px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--bg-tertiary)' }}>
          {result.schedule.length === 0 ? (
            <p style={{ margin: 0, fontSize: '14px' }}>There is no Pre-Tax money to convert in any year this plan could convert, so there is no schedule to find.</p>
          ) : (
            <>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>
                Best schedule: {scheduleRuns(result.schedule).map((r) => `${r.from === r.to ? r.from : `${r.from}–${r.to}`} ${bracketLabel(r.bracket)}`).join('; ')}
              </div>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                {valueLabel(result.value, result.forObjective)} {goalWords(result.forObjective)}, against {valueLabel(result.flatBestValue, result.forObjective)} with the {bracketLabel(result.flatBestBracket)} every year, and {valueLabel(result.baselineValue, result.forObjective)} with no conversions. Today&rsquo;s dollars.
                {result.budgetHit ? ' The search stopped at its limit, so this is the best it found by then.' : ''}
              </p>
              <ScheduleTable inputs={inputs} schedule={result.schedule} useRealDollars={useRealDollars} formatCurrency={formatCurrency} />
              <button type="button" className="btn-primary" style={{ marginTop: '10px' }} onClick={apply}>Use this schedule</button>
            </>
          )}
        </div>
      )}

      {!result && inputs.rothConversionStrategy === 'schedule' && saved.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Your schedule</div>
          <ScheduleTable inputs={inputs} schedule={saved} useRealDollars={useRealDollars} formatCurrency={formatCurrency} />
        </div>
      )}
      {!result && inputs.rothConversionStrategy === 'schedule' && saved.length === 0 && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', margin: '8px 0 0' }}>No schedule yet, so nothing converts. Press Find my best schedule.</p>
      )}

      <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '10px 0 0' }}>This search runs on your device. Your numbers never leave it.</p>
    </div>
  );
}
