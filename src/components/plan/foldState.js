import { useState } from 'react';

// Remembered fold state (changelog 270). A collapsible section opens by
// default when the plan has something inside it; once someone opens or
// closes it by hand, that choice is kept in this browser under the
// section's id, so the Roth section they opened yesterday is open today.
// forceOpen (the Guided Plan) wins and is never written back: collapsing
// a section on the Interview must not hide it on Plan Settings.
export const FOLD_STATE_KEY = 'retire_plan_folds_v1';
export function readFoldState() {
  try { const v = JSON.parse(localStorage.getItem(FOLD_STATE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function writeFoldState(id, open) {
  try {
    const all = readFoldState();
    all[id] = !!open;
    localStorage.setItem(FOLD_STATE_KEY, JSON.stringify(all));
  } catch { /* storage unavailable: the fold just resets next time */ }
}
export function useFoldState(id, computeDefault, forceOpen = false) {
  const [open, setOpen] = useState(() => {
    if (forceOpen) return true;
    const saved = readFoldState()[id];
    if (typeof saved === 'boolean') return saved;
    return !!computeDefault();
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!forceOpen) writeFoldState(id, next);
  };
  return [open, toggle];
}
