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
const OfflineIndicator = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(16px + var(--status-bar-reserve, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        maxWidth: 'min(440px, calc(100vw - 32px))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 16px',
        borderRadius: '12px',
        backgroundColor: 'var(--bg-secondary, #111a2e)',
        border: '1px solid var(--success)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
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
    </div>
  );
};

export default OfflineIndicator;
