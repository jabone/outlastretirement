import { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, X } from 'lucide-react';
import { getPWAState, subscribePWA, applyUpdate, dismissOfflineReady } from '../utils/pwa';

// PWA lifecycle toasts (changelog 115), driven by src/utils/pwa.js:
//
// "Ready to work offline" -- fires once, after the first visit finishes
// precaching every asset. Auto-hides; it exists to TELL users the
// airplane-mode test will pass, since a silent capability demonstrates
// nothing.
//
// "A new version is ready" -- a deploy's service worker is installed and
// waiting. It stays up until acted on, because this app ships tax-figure
// corrections and a user quietly pinned to last month's brackets is the
// one real hazard of caching an app this aggressively. Reload applies it
// via applyUpdate() (the worker takes over and the page reloads --
// plan data is untouched, it lives in browser storage, not in the page).
// Dismissing keeps the current version for this session; the waiting
// worker applies on the next full close-and-reopen anyway, and the
// What's New popup then shows what changed.
const OFFLINE_READY_HIDE_MS = 9000;

const UpdateToast = () => {
  const [pwa, setPwa] = useState(getPWAState);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => subscribePWA(setPwa), []);

  useEffect(() => {
    if (!pwa.offlineReady) return undefined;
    const t = setTimeout(dismissOfflineReady, OFFLINE_READY_HIDE_MS);
    return () => clearTimeout(t);
  }, [pwa.offlineReady]);

  const cardStyle = {
    position: 'fixed',
    bottom: 'calc(16px + var(--status-bar-reserve, 0px))',
    right: '16px',
    zIndex: 9999,
    maxWidth: 'min(400px, calc(100vw - 32px))',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-secondary, #111a2e)',
    border: '1px solid var(--card-border, #253352)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  };

  if (pwa.needRefresh && !updateDismissed) {
    return (
      <div role="status" aria-live="polite" style={cardStyle}>
        <RefreshCw size={18} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--fs-sm, 13px)', fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>
            A new version of OutlastRetirement is ready.
          </div>
          <div style={{ fontSize: 'var(--fs-2xs, 11px)', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px', lineHeight: 1.5 }}>
            Reload to get the latest fixes and tax figures. Your plan is stored on this device and is not
            affected by reloading.
          </div>
          <button
            onClick={() => applyUpdate()}
            className="btn-outline"
            style={{ marginTop: '8px', padding: '4px 12px', fontSize: 'var(--fs-sm, 13px)' }}
          >
            Reload now
          </button>
        </div>
        <button
          onClick={() => setUpdateDismissed(true)}
          aria-label="Dismiss update notice"
          style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: 'var(--text-muted, #64748b)' }}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (pwa.offlineReady) {
    return (
      <div role="status" aria-live="polite" style={cardStyle}>
        <ShieldCheck size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--fs-sm, 13px)', fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>
            Ready to work offline.
          </div>
          <div style={{ fontSize: 'var(--fs-2xs, 11px)', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px', lineHeight: 1.5 }}>
            The whole app is now stored on this device. Try it: turn on airplane mode &mdash; your plan,
            every optimizer, and every chart keep working.
          </div>
        </div>
        <button
          onClick={dismissOfflineReady}
          aria-label="Dismiss offline notice"
          style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: 'var(--text-muted, #64748b)' }}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return null;
};

export default UpdateToast;
