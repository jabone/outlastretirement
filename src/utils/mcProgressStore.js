// How far the Monte Carlo has got (0-1, or null when none is running).
//
// Kept outside React state on purpose (performance audit 2026-11-13): the
// worker reports progress many times a run, and holding it in App state
// re-rendered the whole app, charts and all, on every report. Only the
// small "still working" card reads it, through useMcProgress.
import { useSyncExternalStore } from 'react';

let value = null;
const listeners = new Set();

export function setMcProgress(next) {
  if (next === value) return;
  value = next;
  listeners.forEach((fn) => fn());
}

export function getMcProgress() {
  return value;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMcProgress() {
  return useSyncExternalStore(subscribe, getMcProgress, getMcProgress);
}
