import { useCallback, useEffect, useState } from 'react';

// A boolean display preference that survives reloads (changelog 202):
// stored per browser in localStorage, never in the plan, and shared live
// between every component using the same key -- the Dashboard chart and
// its full-screen zoom always agree. Storage can be unavailable (private
// windows, blocked site data); the toggle then simply works for the
// session, starting from its default.
const EVENT = 'cfe:persistent-toggle';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === 'true' ? true : v === 'false' ? false : fallback;
  } catch {
    return fallback;
  }
}

export default function usePersistentToggle(key, defaultValue) {
  const [value, setValue] = useState(() => read(key, defaultValue));

  useEffect(() => {
    const onChange = (e) => {
      if (e.detail && e.detail.key === key) setValue(e.detail.value);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [key]);

  const set = useCallback((next) => {
    setValue(next);
    try { localStorage.setItem(key, next ? 'true' : 'false'); } catch { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key, value: next } }));
  }, [key]);

  return [value, set];
}

export const OVERLAY_TAXES_KEY = 'cfe_growth_overlay_taxes_v1';
export const OVERLAY_LIFESTYLE_KEY = 'cfe_growth_overlay_lifestyle_v1';
