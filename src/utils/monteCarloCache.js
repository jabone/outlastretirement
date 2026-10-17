// The Monte Carlo result survives a reload (changelog 268).
//
// A run is seeded, so the same plan always gives the same result: there
// is nothing to gain by running it again after a refresh, and 1,000
// projections to lose. The result is kept in this browser under a key
// that is the plan itself -- every input, sanitized, in a fixed order --
// so "is this run still for this plan?" is a string comparison, not an
// object identity that a reload (or an edit-and-undo) breaks. The key is
// also what the banner's stale/fresh state reads.
import { sanitizeInputs } from '../calculator';

export const MC_CACHE_KEY = 'retire_plan_monte_carlo_v1';

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
};

// The plan as a string. Two plans with the same values share a key
// whatever the order their fields were set in.
export function planKey(inputs) {
  if (!inputs) return null;
  let clean;
  try { clean = sanitizeInputs(inputs); } catch { clean = inputs; }
  return stable(clean);
}

export function readMonteCarloCache() {
  try {
    const raw = localStorage.getItem(MC_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.key !== 'string' || !parsed.results) return null;
    return parsed;
  } catch { return null; }
}

export function writeMonteCarloCache(key, results) {
  try {
    if (!key || !results) { localStorage.removeItem(MC_CACHE_KEY); return; }
    localStorage.setItem(MC_CACHE_KEY, JSON.stringify({ key, savedAt: new Date().toISOString(), results }));
  } catch { /* storage unavailable or full: the run simply does not survive */ }
}

export function clearMonteCarloCache() {
  try { localStorage.removeItem(MC_CACHE_KEY); } catch { /* nothing to clear */ }
}

// Auto-run (changelog 269): the browser-level preference and its pacing.
export const MC_AUTO_RUN_KEY = 'retire_plan_mc_auto_run';
export const MC_AUTO_RUN_DELAY_MS = 2500;

// A Capacitor shell (the iOS / Android builds) reports itself on window;
// there the auto-run defaults off to spare the battery.
export function isNativeShell() {
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  } catch { return false; }
}
