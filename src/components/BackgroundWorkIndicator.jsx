// A small "still working" card (DIY-planner review follow-up, 2026-11-03).
// The Monte Carlo, the history checks and the optimizers run in background
// workers and can take several seconds -- longer with risk-based
// guardrails on -- while the screen shows the last results. This says the
// app is working, and how far the Monte Carlo has got, so a pause never
// reads as something broken. It waits a moment before appearing, so a
// quick update does not flash it.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const SHOW_AFTER_MS = 250;

export default function BackgroundWorkIndicator({ mcLoading, mcProgress, trials = 1000, heavyLoading, raised = true }) {
  const busy = !!(mcLoading || heavyLoading);
  const [shown, setShown] = useState(false);
  // Folded to a small spinner by its own button, until the work is done.
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!busy) { setShown(false); setFolded(false); return undefined; }
    const t = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [busy]);
  if (!busy || !shown) return null;
  const pct = mcLoading && Number.isFinite(mcProgress) ? Math.round(mcProgress * 100) : null;
  const label = mcLoading
    ? `Simulated markets: running ${Number(trials).toLocaleString('en-US')}${pct !== null ? `… ${pct}%` : '…'}${heavyLoading ? ' (history checks running too)' : ''}`
    : 'History checks and optimizers: running…';
  if (folded) {
    return (
      <button
        type="button"
        data-testid="background-work"
        onClick={() => setFolded(false)}
        aria-label={`${label} Show details`}
        style={{
          position: 'fixed', right: '24px', bottom: raised ? '96px' : '24px', zIndex: 901,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '999px',
          padding: '8px', lineHeight: 0, cursor: 'pointer', color: 'var(--accent-text)',
        }}
      >
        <Loader2 className="animate-spin" size={18} />
      </button>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="background-work"
      style={{
        position: 'fixed', right: '24px', bottom: raised ? '96px' : '24px', zIndex: 901,
        background: 'var(--card-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--card-border)',
        borderRadius: '12px', padding: '10px 14px', boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
        fontSize: 'var(--fs-sm)', minWidth: '240px', maxWidth: 'calc(100vw - 48px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Loader2 className="animate-spin" size={16} style={{ flexShrink: 0, color: 'var(--accent-text)' }} />
        <span style={{ flex: 1 }}>{label}</span>
        <button type="button" onClick={() => setFolded(true)} aria-label="Make this smaller"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', fontSize: 'var(--fs-sm)', lineHeight: 1 }}>
          &ndash;
        </button>
      </div>
      {pct !== null && (
        <div aria-hidden="true" style={{ height: '4px', borderRadius: '2px', background: 'var(--card-border)', marginTop: '8px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.2s ease' }} />
        </div>
      )}
      <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
        The figures on screen update when each finishes.
      </div>
    </div>
  );
}
