import React, { useState } from 'react';
import { useSimulation } from '../context/useSimulation';
import { useFullBackupActions } from '../context/useFullBackupActions';
import { AlertTriangle, Download, CheckCircle, X } from 'lucide-react';
import {
  computeFreshnessStatus,
  formatAgeDays,
  recordPortfolioUpdate,
  snoozeBackupNudge,
  snoozePortfolioNudge,
  SNOOZE_DAYS,
  backupSnoozeDays,
} from '../utils/dataFreshness';
import HoverTooltip from './HoverTooltip';

// The "keep the data real" banner (see dataFreshness.js for the whole
// design). Renders nothing at all unless one of the two clocks is
// actually overdue -- most sessions never see it. When it does appear it
// names the specific problem with its age, offers the one-click fix, and
// dismissing it snoozes for a week rather than forever: this exists
// because a real user lost a real plan (fullBackup.js), so permanent
// dismissal would just recreate the silence that caused that.
//
// Mounted once in App.jsx alongside the Plan Status bar. Deliberately NOT
// gated behind statusBarHidden -- hiding the KPI readout is a display
// preference; this is a data-safety prompt.
const DataFreshnessBanner = () => {
  const { holdings, setActiveTab, setShowQuickUpdate, showAlert } = useSimulation();
  const { backupEverything } = useFullBackupActions();
  // Freshness state lives in localStorage, not React state; this tick
  // just forces a re-render after an action so the banner disappears the
  // moment its demand is met. Recomputing on every render is fine -- it
  // is one small JSON.parse, and this component renders rarely.
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const status = computeFreshnessStatus({ hasHoldings: (holdings || []).length > 0 });

  if (!status.anyOverdue) return null;

  const messages = [];
  if (status.backupOverdue) {
    messages.push(
      status.everBackedUp
        ? `Your last backup was ${formatAgeDays(status.backupAgeDays)}, and the plan has changed since — those changes exist only in this browser.`
        : `This plan has never been backed up — everything lives only in this browser, one "Clear browsing data" from gone.`
    );
  }
  if (status.portfolioOverdue) {
    const cadenceWord = status.cadence === 'monthly' ? 'month' : 'quarter';
    messages.push(
      status.hasHoldings
        ? `Your holdings were last reconciled ${formatAgeDays(status.portfolioAgeDays)} — if a new statement has arrived this ${cadenceWord}, import it so the numbers stay real.`
        : `Your balances were last refreshed ${formatAgeDays(status.portfolioAgeDays)} — a minute in Quick Update keeps the projection honest.`
    );
  }

  const handleBackup = () => { backupEverything(); bump(); };
  const handleMarkCurrent = () => {
    recordPortfolioUpdate();
    showAlert('Noted — the reminder will return after your next full cycle.', 'Portfolio Marked Current');
    bump();
  };
  const handleGoUpdate = () => {
    // Detailed Holdings users land on the Portfolio tab's import; balance-
    // only users get Quick Update -- the Portfolio tab is premium-gated,
    // so don't send non-holdings users there.
    if (status.hasHoldings) setActiveTab('portfolio');
    else setShowQuickUpdate(true);
    snoozePortfolioNudge(); // don't re-nag while they're mid-update
    bump();
  };
  const handleSnooze = () => {
    if (status.backupOverdue) snoozeBackupNudge();
    if (status.portfolioOverdue) snoozePortfolioNudge();
    bump();
  };

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 950,
        maxWidth: 'min(640px, calc(100vw - 48px))',
        background: 'var(--card-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--warning, #b45309)',
        borderRadius: '16px',
        padding: '14px 18px',
        boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <AlertTriangle size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
      <div style={{ minWidth: 0 }}>
        {messages.map((m, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)', lineHeight: 1.45 }}>{m}</p>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
          {status.backupOverdue && (
            <button type="button" className="btn-primary" onClick={handleBackup}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-xs)', padding: '6px 12px' }}>
              <Download size={13} /> Back up now
            </button>
          )}
          {status.portfolioOverdue && (
            <>
              <button type="button" className="btn-primary" onClick={handleGoUpdate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-xs)', padding: '6px 12px' }}>
                {status.hasHoldings ? 'Import a statement' : 'Open Quick Update'}
              </button>
              <HoverTooltip text="Already up to date? Reset the reminder without importing anything.">
                <button type="button" className="btn-outline" onClick={handleMarkCurrent}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--fs-xs)', padding: '6px 12px' }}>
                  <CheckCircle size={13} /> Mark as current
                </button>
              </HoverTooltip>
            </>
          )}
        </div>
      </div>
      <HoverTooltip text={`Remind me again in ${status.backupOverdue ? backupSnoozeDays() : SNOOZE_DAYS} days`}>
        <button type="button" onClick={handleSnooze} aria-label={`Snooze this reminder for ${status.backupOverdue ? backupSnoozeDays() : SNOOZE_DAYS} days`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0, lineHeight: 0 }}>
          <X size={16} />
        </button>
      </HoverTooltip>
    </div>
  );
};

export default DataFreshnessBanner;
