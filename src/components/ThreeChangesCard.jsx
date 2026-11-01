import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Loader2, Undo2 } from 'lucide-react';
import { useSimulation } from '../context/useSimulation';
import { runProjection } from '../calculator';
import { threeChanges } from '../utils/threeChanges';
import { sanitizeForProjection } from '../utils/oneLeverCompare';
import { runMonteCarloBatch } from '../utils/monteCarloAsync';
import { verdictPctText, verdictBand, VERDICT_THRESHOLDS } from '../utils/planVerdict';

// The next step, on the Dashboard (first-time user review, 2026-11-01).
// Shown while the plan is not on track: three changes in plain words, what
// each does with average returns at once, the odds in simulated markets on
// request (three Monte Carlo runs, off the main thread), and a Try it that
// changes the plan with an Undo beside it. Nothing changes until Try it.
export default function ThreeChangesCard() {
  const { inputs, setInputs, verdict, mcRange } = useSimulation();
  const [undo, setUndo] = useState(null);
  const [odds, setOdds] = useState(null); // { key, pcts: [..] }
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  // Often no one change is enough on its own, so the last row is all of
  // them at once.
  const changes = useMemo(() => {
    const list = threeChanges(inputs);
    if (list.length < 2) return list;
    const words = ['', '', 'Both', 'All three'];
    return [...list, {
      id: 'all',
      title: `${words[list.length] || 'All'} together`,
      detail: (() => {
        const t = list.map((c, i) => (i === 0 ? c.title : c.title.charAt(0).toLowerCase() + c.title.slice(1)));
        return `${t.slice(0, -1).join(', ')}${t.length > 2 ? ',' : ''} and ${t[t.length - 1]}.`;
      })(),
      patch: Object.assign({}, ...list.map((c) => c.patch)),
      tryable: list.every((c) => c.tryable),
      note: null,
    }];
  }, [inputs]);
  const key = useMemo(() => JSON.stringify(inputs), [inputs]);
  const averages = useMemo(() => changes.map((c) => {
    try { return runProjection(sanitizeForProjection({ ...inputs, ...c.patch })).isSuccessful; } catch { return null; }
  }), [changes, inputs]);

  // Odds belong to the plan they were run for; an edit clears them.
  useEffect(() => { if (odds && odds.key !== key) setOdds(null); }, [key, odds]);

  const needsHelp = verdict && ['risk', 'caution'].includes(verdict.tone);
  if ((!needsHelp && !undo) || (changes.length === 0 && !undo)) return null;

  const basePct = mcRange && mcRange.status === 'fresh' ? mcRange.successProbability : null;

  const showOdds = async () => {
    const id = ++runId.current;
    setRunning(true);
    try {
      const results = await runMonteCarloBatch(changes.map((c) => ({ ...inputs, ...c.patch })));
      if (id === runId.current) setOdds({ key, pcts: results.map((r) => r?.successProbability) });
    } finally {
      if (id === runId.current) setRunning(false);
    }
  };

  const tryIt = (c) => {
    const before = inputs;
    setUndo((u) => u || { before });
    setInputs((prev) => ({ ...prev, ...c.patch }));
  };
  const undoIt = () => {
    if (undo) setInputs(undo.before);
    setUndo(null);
  };

  return (
    <div className="glass-panel" data-testid="three-changes" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lightbulb size={18} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
            {needsHelp ? 'Three changes that would help' : 'Changes you are trying'}
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Each one tried on your plan, then all of them together. Nothing changes until you press Try it, and Undo puts it back.
          </p>
        </div>
        {undo && (
          <button type="button" className="btn-outline" onClick={undoIt} data-testid="three-changes-undo" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}>
            <Undo2 size={14} aria-hidden="true" /> Undo what you tried
          </button>
        )}
      </div>

      {needsHelp && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {changes.map((c, i) => {
            const pct = odds && odds.key === key ? odds.pcts[i] : null;
            const band = pct !== null && pct !== undefined ? verdictBand(pct) : null;
            const avg = averages[i];
            return (
              <li key={c.id} data-testid={`three-changes-${c.id}`} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--bg-secondary)' }}>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.title}</div>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>{c.detail}</div>
                  <div style={{ fontSize: 'var(--fs-sm)', marginTop: '4px', lineHeight: 1.45, color: 'var(--text-secondary)' }}>
                    {avg === false && <span style={{ color: 'var(--warning)' }}>Still runs short with average returns. </span>}
                    {avg === true && pct === null && 'Lasts with average returns. '}
                    {pct !== null && pct !== undefined && (
                      <span data-testid={`three-changes-${c.id}-odds`} style={{ color: band === 'good' ? 'var(--success)' : band === 'caution' ? 'var(--text-primary)' : 'var(--warning)', fontWeight: 600 }}>
                        Lasts in {verdictPctText(pct)}% of simulated markets{basePct !== null ? `, up from ${verdictPctText(basePct)}%` : ''}.
                        {band === 'good' ? ' That would be on track.' : ''}
                      </span>
                    )}
                    {c.note && <span> {c.note}</span>}
                  </div>
                </div>
                {c.tryable && (
                  <button type="button" className="btn-outline" onClick={() => tryIt(c)} style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>
                    Try it
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {needsHelp && !(odds && odds.key === key) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
          <button type="button" className="btn-primary" onClick={showOdds} disabled={running} aria-busy={running} data-testid="three-changes-odds" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}>
            {running && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {running ? 'Testing each change…' : 'Show the odds for each'}
          </button>
          <span>Tests each change, and all of them together, in the same 1,000 simulated markets as your plan. On track means at least {VERDICT_THRESHOLDS.good}%.</span>
        </div>
      )}
    </div>
  );
}
