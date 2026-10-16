import React, { useState } from 'react';
import { CalendarClock, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { useSimulation } from '../../context/useSimulation';
import { TAX_YEAR } from '../../calculator';
import AnnualReviewPanel from '../plan/AnnualReviewPanel';

// The "Advance Year" flow. See the comment on TAX_YEAR near the top of
// calculator.js for the full split this panel is built around:
//   - TAX_YEAR (calculator.js): the vintage year every hardcoded dollar
//     figure (tax brackets, IRMAA thresholds, contribution limits, etc.)
//     was last verified against. Only a code change (see
//     TAX_UPDATE_PROCESS.md) moves this.
//   - inputs.planYear: THIS plan's own "what year is it" anchor. Every age
//     and the projection's Year 1 are computed from this. Only the user,
//     via the button below, moves this.
// The two are independent on purpose -- advancing a plan's year doesn't
// magically re-verify the tax code against a newer year, and vice versa.
// This panel exists so that gap is visible instead of silently drifting.
const PlanYearPanel = () => {
  const { inputs, updateInput, handleSaveScenario, showConfirm, showPrompt, showAlert, setActiveTab } = useSimulation();
  const [busy, setBusy] = useState(false);

  const planYear = inputs.planYear || TAX_YEAR;
  const realYear = new Date().getFullYear();
  const planGap = realYear - planYear;
  const taxGap = realYear - TAX_YEAR;

  const handleAdvanceYear = async () => {
    const nextYear = planYear + 1;

    const proceed = await showConfirm(
      `This moves your plan's current year from ${planYear} to ${nextYear}. ` +
      `Every age and the projection's "Year 1" will shift forward with it. ` +
      `This is a pure calendar bump only — balances, salary, pensions, Social Security estimates, and every other dollar figure stay exactly as they are today. ` +
      `You'll want to review and update those yourself afterward.`,
      { title: `Advance Plan Year to ${nextYear}?`, confirmLabel: 'Continue', cancelLabel: 'Cancel' }
    );
    if (!proceed) return;

    const suggestedName = `Backup — Plan Year ${planYear}`;
    const backupName = await showPrompt(
      `Save a snapshot of your plan exactly as it stands at Plan Year ${planYear} before advancing? ` +
      `This is your rollback — you can restore it any time from Scenarios → Load Plan. ` +
      `Leave this blank (or cancel) to advance without saving one.`,
      { title: 'Save a Rollback Backup', defaultValue: suggestedName, confirmLabel: 'Save & Continue' }
    );

    setBusy(true);
    try {
      if (backupName && backupName.trim()) {
        handleSaveScenario(backupName.trim(), { tag: 'year-advance-backup' });
      }
      updateInput('planYear', nextYear);
      await showAlert(
        `Plan year advanced to ${nextYear}. Balances, salary, and other dollar figures were left exactly as they were — the annual review checklist below walks through bringing them up to date.`,
        'Plan Year Advanced'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px' }}>
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarClock size={18} />
          Plan Year
        </h3>
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Every age and the projection's "Year 1" are computed from this plan's own current year, not from
          today's real calendar date. A plan you built in 2026 will still open thinking it's 2026 five years
          from now, until you advance it yourself.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>This plan thinks it's</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>{planYear}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Tax figures last verified for</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>{TAX_YEAR}</div>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)' }}>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>Today's real calendar year</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-primary)' }}>{realYear}</div>
          </div>
        </div>

        {(planGap > 0 || taxGap > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
            {planGap > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
                <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                  This plan is <strong style={{ color: 'var(--warning)' }}>{planGap} year{planGap === 1 ? '' : 's'}</strong> behind the real calendar.
                  Ages, retirement/claiming milestones, and the projection's starting point are all still anchored to {planYear}.
                </div>
              </div>
            )}
            {taxGap > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <AlertTriangle size={18} color="var(--error)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                  The hardcoded tax brackets, IRMAA thresholds, contribution limits, and other dollar figures this app
                  uses were last verified for {TAX_YEAR} — {taxGap} year{taxGap === 1 ? '' : 's'} out of date. Advancing the
                  plan year does <strong>not</strong> update these; they only change with an app update.
                </div>
              </div>
            )}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleAdvanceYear}
          disabled={busy}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: busy ? 0.6 : 1 }}
        >
          Advance Plan Year to {planYear + 1}
          <ArrowRight size={15} />
        </button>
      </div>

      {/* The annual review checklist (changelog 256): what "bring them up
          to date" actually means, step by step, with the two steps the app
          can do itself as buttons. */}
      <AnnualReviewPanel onAdvanceYear={handleAdvanceYear} advancing={busy} />

      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} />
          What Advancing Does (and Doesn't Do)
        </h3>
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Advancing is a pure calendar bump: the plan&rsquo;s starting year moves forward by one, which shifts every
          age and the projection's starting point along with it. Nothing else changes automatically — your
          balances, salary, pensions, Social Security benefit estimates, and every other dollar figure are left
          exactly as they were, because only you know what actually happened to them over the last year.
        </p>
        <p style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>
          Before advancing, you'll be offered the chance to save a backup of the plan exactly as it stands. That
          backup is a normal saved scenario — find it any time in{' '}
          <button
            onClick={() => setActiveTab('scenarios')}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
          >
            Scenarios
          </button>
          , where "Load Plan" restores it as your active plan — that's your rollback.
        </p>
      </div>
    </div>
  );
};

export default PlanYearPanel;
