import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { isLocalOnlyMode, setLocalOnlyMode, subscribeLocalOnlyMode } from '../utils/localOnlyMode';

// The Local-Only Mode "nag" (changelog 115, John's design): while the
// mode is on, a pill floats at the top of every tab saying so, with a
// one-click way out. It exists because the mode's whole job is to refuse
// things (analytics, price refreshes), and a refusal months from now
// with no visible cause would read as a bug. Floating rather than a
// layout bar: unlike the demo banner, nothing here is dangerous enough
// to justify pushing the whole app down, and it must coexist below that
// banner when both are up (hence the --demo-banner-offset in `top`).
const LocalOnlyBanner = () => {
  const [on, setOn] = useState(isLocalOnlyMode);

  useEffect(() => subscribeLocalOnlyMode(setOn), []);

  if (!on) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 'calc(var(--demo-banner-offset, 0px) + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        maxWidth: 'min(560px, calc(100vw - 24px))',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 8px 6px 14px',
        borderRadius: '999px',
        backgroundColor: 'var(--bg-secondary, #111a2e)',
        border: '1px solid var(--success)',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.3)',
      }}
    >
      <ShieldCheck size={16} style={{ color: 'var(--success)', flexShrink: 0 }} aria-hidden="true" />
      <span style={{ fontSize: 'var(--fs-2xs, 11px)', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
        <strong style={{ color: 'var(--text-primary, #e2e8f0)' }}>Local-Only Mode is on</strong>
        {' '}&mdash; the app sends none of your data and makes no optional connections. Live Pricing refresh is paused.
      </span>
      <button
        onClick={() => setLocalOnlyMode(false)}
        className="btn-outline"
        style={{ padding: '3px 12px', fontSize: 'var(--fs-2xs, 11px)', borderRadius: '999px', whiteSpace: 'nowrap' }}
      >
        Turn off
      </button>
    </div>
  );
};

export default LocalOnlyBanner;
