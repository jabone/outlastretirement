// Anonymous usage analytics opt-in (changelog 149).
//
// The app is positioned around "your data never leaves this device," so
// its one third-party beacon -- Vercel Web Analytics (page-view counts,
// no plan data) -- is OFF BY DEFAULT and only sent when the user turns it
// on here. Speed Insights was removed entirely: it is a web-vitals beacon
// aimed at high-traffic production tuning, not worth sending from a
// privacy-first personal app.
//
// Interaction with Local-Only Mode: Local-Only always wins. When that
// mode is on, GatedAnalytics renders nothing regardless of this flag, so
// a user can leave analytics opted in and still get true zero-request
// behavior whenever they flip Local-Only on.
//
// Storage: plain localStorage, read synchronously at module load so the
// first render of main.jsx already knows whether to mount the beacon --
// the same shape as localOnlyMode.js. A device preference, NOT plan data;
// it rides in no backup payload. Default OFF means an existing user who
// never opts in never sends a beacon, including the initial page-view.

const STORAGE_KEY = 'cfe_analytics_opt_in';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = read();

export function isAnalyticsEnabled() {
  return enabled;
}

export function setAnalyticsEnabled(on) {
  enabled = !!on;
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private-mode edge cases): the in-memory flag
    // still holds for this session.
  }
  for (const cb of listeners) cb(enabled);
}

export function subscribeAnalyticsEnabled(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
