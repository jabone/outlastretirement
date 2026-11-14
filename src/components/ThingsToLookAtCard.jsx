import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useSimulation } from '../context/useSimulation';
import { runProjection } from '../calculator';
import { thingsToLookAt, NEAR_LINE, NEAR_LINE_BELOW, MIN_SAVING, MIN_CLAIM_GAIN, MIN_BRACKET_ROOM } from '../utils/thingsToLookAt';
import { sanitizeForProjection } from '../utils/oneLeverCompare';

// "Worth a closer look" on the Dashboard: the plan's own years and amounts
// where a small change could matter (utils/thingsToLookAt.js). The checks
// read the engine's own projection (rawProjection), not the display copy,
// which may already be in today's dollars, and follow the same debounced
// inputs, so typing does not re-run them on every key. The checks that read
// the projection alone show at once; the ones that re-run the plan with one
// setting changed run when the browser is idle, in their own task, so they
// do not hold up the rest of the Dashboard. Each line links to the page
// that tests it; the field index those links need loads on the first click.
const TONE = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--accent-text)',
};
const k = (v) => `$${(v / 1000).toLocaleString('en-US')},000`;

export default function ThingsToLookAtCard() {
  const { rawProjection, debouncedInputs, setActiveTab, setRiskSubTab, setSettingsSubTab, setStrategySubTab, setTaxestateSubTab, setYearledgerSubTab } = useSimulation();
  const clean = useMemo(() => sanitizeForProjection(debouncedInputs || {}), [debouncedInputs]);
  const quick = useMemo(() => {
    try {
      return rawProjection ? thingsToLookAt(clean, rawProjection) : [];
    } catch {
      return [];
    }
  }, [clean, rawProjection]);
  const [full, setFull] = useState(null);
  useEffect(() => {
    if (!rawProjection) return undefined;
    let stopped = false;
    const work = () => {
      if (stopped) return;
      let items = null;
      try {
        items = thingsToLookAt(clean, rawProjection, { runProjection });
      } catch {
        items = null;
      }
      if (!stopped) setFull({ for: rawProjection, items });
    };
    const idle = typeof window !== 'undefined' && window.requestIdleCallback;
    const handle = idle ? window.requestIdleCallback(work, { timeout: 2000 }) : setTimeout(work, 50);
    return () => {
      stopped = true;
      if (idle) window.cancelIdleCallback(handle); else clearTimeout(handle);
    };
  }, [clean, rawProjection]);
  // The full list once it belongs to the plan on screen; until then, the quick one.
  const current = !!(full && full.for === rawProjection);
  const items = current ? (full.items || quick) : quick;

  const setters = { risk: setRiskSubTab, settings: setSettingsSubTab, strategy: setStrategySubTab, taxestate: setTaxestateSubTab, yearledger: setYearledgerSubTab };
  // The field index and fold helpers load on the first click, before the
  // tab changes, so the folds are open by the time the page renders.
  const go = async (action) => {
    if (action.scrollTo) {
      const el = document.querySelector(`[data-testid="${action.scrollTo}"]`);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    let reveal = null;
    if (action.field) {
      const [{ FIELD_INDEX }, { writeFoldState }, { revealField }] = await Promise.all([import('../config/fieldIndex'), import('./plan/foldState'), import('../utils/revealField')]);
      const entry = FIELD_INDEX.find((f) => f.id === action.field);
      const folds = entry ? entry.folds : [];
      folds.forEach((f) => { if (f.id) writeFoldState(f.id, true); });
      reveal = () => revealField(action.field, { folds });
    }
    setActiveTab(action.tab);
    if (action.subTab && setters[action.tab]) setters[action.tab](action.subTab);
    if (reveal) reveal();
  };

  if (!items.length && current) return null;

  return (
    <div className="glass-panel" data-testid="things-to-look-at" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Search size={18} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
          <span>Worth a closer look</span>
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          The years and amounts in this plan where a small change could matter, from its own year-by-year projection with average returns every year. Amounts are in today&rsquo;s dollars, meaning what that money would buy now. Each one is something to test, not advice. Nothing in your plan has been changed; a setting you change through one of these links does change it, and you can change it back.
        </p>
      </div>
      {items.length === 0 && (
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>Checking the plan&hellip;</p>
      )}
      {items.map((it) => (
        <div key={it.id} data-testid={`look-${it.id}`} style={{ borderLeft: `3px solid ${TONE[it.tone] || TONE.info}`, paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h4 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: '600' }}>{it.title}</h4>
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{it.text}</p>
          {it.action && (
            <button type="button" onClick={() => go(it.action)} style={{ alignSelf: 'flex-start', padding: 0, border: 'none', background: 'transparent', color: 'var(--accent-text)', fontSize: 'var(--fs-xs)', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
              {it.action.label}
            </button>
          )}
        </div>
      ))}
      {items.length > 0 && !current && (
        <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Checking a few more things on this plan&rsquo;s own numbers: the 12% bracket, other withdrawal orders and Social Security ages&hellip;</p>
      )}
      <details style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
        <summary style={{ cursor: 'pointer' }}>How these are picked</summary>
        <p style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
          A plan that runs short is named first, and ideas for paying less tax wait until it lasts. Medicare and marketplace lines are named when the income that counts is within {k(NEAR_LINE)} over or {k(NEAR_LINE_BELOW)} under one, or when Roth conversions carry it over. Room in the 12% bracket is named when converting to its top would move at least {k(MIN_BRACKET_ROOM)} a year in retired years outside marketplace years. Another withdrawal order is named when it lasts at least two years longer, or saves at least {k(MIN_SAVING)} (and 2% of lifetime taxes and Medicare premiums) without leaving less after tax. Another Social Security age is named when it adds at least {k(MIN_CLAIM_GAIN)} (and 3%) to the ending balance, or makes the plan last. All in today&rsquo;s dollars, with average returns every year and the plan&rsquo;s set lifespans.
        </p>
      </details>
    </div>
  );
}
