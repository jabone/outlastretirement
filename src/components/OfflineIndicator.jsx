import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// The offline badge (changelog 115): the other half of the privacy
// demonstration. When the browser reports the connection is gone
// (navigator.onLine + the online/offline events), instead of the silent
// dread most web apps produce, this pill says the quiet part out loud:
// everything still works, because the plan lives on this device. It
// renders nothing at all while online -- no chrome, no cost.
//
// Copy notes: the Live Pricing exception is stated right here rather than
// buried in the Guide, because a premium user's very next click might be
// Refresh Prices and the badge must not have oversold. The claim is
// deliberately about PLANNING, not "the app never talks to the network"
// (the deployment includes anonymous page-view analytics -- see the
// Guide's privacy section for the full, honest accounting).
// Changelog 461: the full card sat over the page for as long as the
// connection was gone, covering figures with no way to move it. It now
// shows in full when the connection drops, shrinks by itself to a small
// "Offline" pill after COLLAPSE_AFTER_MS (or at once with its Minimize
// button), and the pill opens the card again. Each new loss of connection
// shows the card in full once more.
export const COLLAPSE_AFTER_MS = 8000;

const OfflineIndicator = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => { setOnline(false); setCollapsed(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Shrink by itself a few seconds after the card opens.
  useEffect(() => {
    if (online || collapsed) return undefined;
    const t = setTimeout(() => setCollapsed(true), COLLAPSE_AFTER_MS);
    return () => clearTimeout(t);
  }, [online, collapsed]);

  if (online) return null;

  const base = {
    position: 'fixed',
    bottom: 'calc(16px + var(--status-bar-reserve, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9998,
    backgroundColor: 'var(--bg-secondary, #111a2e)',
    border: '1px solid var(--success)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  };

  if (collapsed) {
    return (
      <div role="status" aria-live="polite" style={{ ...base, borderRadius: '999px' }}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-expanded="false"
          aria-label="Offline. Everything still works. Show details"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
            background: 'none', border: 0, cursor: 'pointer', borderRadius: '999px',
            fontSize: 'var(--fs-xs, 12px)', fontWeight: 600, color: 'var(--text-primary, #e2e8f0)',
          }}
        >
          <WifiOff size={14} style={{ color: 'var(--success)' }} aria-hidden="true" />
          Offline
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        ...base,
        maxWidth: 'min(440px, calc(100vw - 32px))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 8px 10px 16px',
        borderRadius: '12px',
      }}
    >
      <WifiOff size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
      <div>
        <div style={{ fontSize: 'var(--fs-sm, 13px)', fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>
          You&rsquo;re offline &mdash; and everything still works.
        </div>
        <div style={{ fontSize: 'var(--fs-2xs, 11px)', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px', lineHeight: 1.5 }}>
          Your plan lives on this device, not on a server. Every projection, optimizer, and export keeps
          running. Only the optional Live Pricing refresh needs a connection.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="Minimize offline notice"
        title="Minimize"
        style={{
          flexShrink: 0, background: 'none', border: 0, cursor: 'pointer', padding: '2px 6px',
          color: 'var(--text-secondary, #94a3b8)', fontSize: '18px', lineHeight: 1,
        }}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
};

export default OfflineIndicator;
