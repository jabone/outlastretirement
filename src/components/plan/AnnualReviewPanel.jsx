import React, { useState, useMemo } from 'react';
import { ClipboardCheck, CheckCircle2, Circle, ArrowRight, Wand2 } from 'lucide-react';
import { useSimulation } from '../../context/useSimulation';
import { annualReviewSteps, readReview, markStep, markReviewComplete } from '../../utils/annualReview';

// The annual review checklist (changelog 256) -- lives under the Plan Year
// page beneath the Advance button. Each step says why it matters, opens
// the page where it is done, and remembers a tick per plan year. The two
// steps the app can do itself are buttons here.
export default function AnnualReviewPanel({ onAdvanceYear, advancing = false }) {
  const {
    inputs, updateInput, projection, setActiveTab, setSettingsSubTab, setRiskSubTab,
    setShowQuickUpdate, handleSaveScenario, showAlert,
  } = useSimulation();
  const realYear = new Date().getFullYear();
  const planYear = Number(inputs.planYear) || realYear;
  const steps = useMemo(() => annualReviewSteps(inputs, projection, { realYear }), [inputs, projection, realYear]);
  const [review, setReview] = useState(() => readReview(planYear));
  // A new plan year gets its own, empty checklist.
  const [reviewYear, setReviewYear] = useState(planYear);
  if (reviewYear !== planYear) { setReviewYear(planYear); setReview(readReview(planYear)); }

  const isDone = (s) => s.autoDone || !!review.done[s.id];
  const doneCount = steps.filter(isDone).length;
  const allDone = doneCount === steps.length;

  const toggle = (s) => {
    if (s.autoDone) return;
    setReview(markStep(planYear, s.id, !review.done[s.id]));
  };
  const goTo = (where) => {
    if (!where) return;
    setActiveTab(where.tab);
    if (where.subTab && where.tab === 'settings') setSettingsSubTab(where.subTab);
    if (where.subTab && where.tab === 'risk' && setRiskSubTab) setRiskSubTab(where.subTab);
  };
  const runAuto = async (s) => {
    if (s.auto === 'advanceYear') { if (onAdvanceYear) onAdvanceYear(); return; }
    if (s.auto === 'quickUpdate') { setShowQuickUpdate(true); return; }
    if (s.auto === 'carryMagi' && s.patch) {
      Object.entries(s.patch).forEach(([k, v]) => updateInput(k, v));
      setReview(markStep(planYear, s.id, true));
      if (showAlert) {
        await showAlert(
          `Two Years Prior MAGI is now ${s.patch.irmaaTwoYearsPriorMagi.toLocaleString()} and Prior Year MAGI ${s.patch.irmaaPriorYearMagi.toLocaleString()} (the plan’s own estimate for ${planYear - 1}). Replace the estimate with the figure from your return when you have it — Plan → Taxes & Roth → Medicare Premiums (IRMAA).`,
          'Medicare lookback carried forward'
        );
      }
      return;
    }
    if (s.auto === 'snapshot') {
      await handleSaveScenario(`Annual review ${planYear}`, { tag: 'annual-review' });
      setReview(markStep(planYear, s.id, true));
    }
  };
  const complete = () => {
    setReview({ ...readReview(planYear), ...markReviewComplete(planYear) });
  };

  return (
    <div className="glass-panel" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardCheck size={18} />
          Annual review for {planYear}
        </h3>
        <span style={{ fontSize: 'var(--fs-sm)', color: review.completedAt ? 'var(--success)' : 'var(--text-secondary)', fontWeight: 600 }}>
          {review.completedAt
            ? `Completed ${new Date(review.completedAt).toLocaleDateString()}`
            : `${doneCount} of ${steps.length} done`}
        </span>
      </div>
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
        Once a year, in order. The app can do two of these itself; the rest need a statement, a pay stub or a letter
        from Social Security, which only you have. Ticks are remembered for this plan year.
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((s, i) => {
          const done = isDone(s);
          return (
            <li key={s.id} data-testid={`review-step-${s.id}`} style={{ display: 'flex', gap: '12px', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--card-border)', background: done ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.02)' }}>
              <button
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={done}
                aria-label={`${done ? 'Un-tick' : 'Tick'}: ${s.title}`}
                disabled={s.autoDone}
                style={{ background: 'none', border: 'none', padding: 0, cursor: s.autoDone ? 'default' : 'pointer', color: done ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }}
              >
                {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, textDecoration: done && !s.autoDone ? 'line-through' : 'none', opacity: done ? 0.8 : 1 }}>
                  {i + 1}. {s.title}
                </div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '2px' }}>{s.why}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {s.auto && !s.autoDone && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => runAuto(s)}
                      disabled={advancing && s.auto === 'advanceYear'}
                      style={{ padding: '5px 10px', fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Wand2 size={12} />
                      {s.auto === 'advanceYear' ? `Advance to ${planYear + 1}` : s.auto === 'quickUpdate' ? 'Open Quick Update' : s.auto === 'carryMagi' ? 'Carry forward' : 'Save snapshot'}
                    </button>
                  )}
                  {s.where && (
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => goTo(s.where)}
                      style={{ padding: '5px 10px', fontSize: 'var(--fs-xs)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      Go there <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-primary"
          onClick={complete}
          disabled={!allDone || !!review.completedAt}
          style={{ opacity: allDone && !review.completedAt ? 1 : 0.5 }}
        >
          Mark the {planYear} review complete
        </button>
        {!allDone && !review.completedAt && (
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Tick every step first.</span>
        )}
      </div>
    </div>
  );
}
