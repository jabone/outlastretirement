// Local-Only Mode (changelog 115): a user-facing switch that makes the
// app's zero-upload privacy claim ENFORCED rather than merely true.
//
// While ON, the app makes no optional connections (it still loads its own
// files when you reload, which carry none of your data):
//   - the Vercel Analytics / Speed Insights components are not rendered
//     (main.jsx), so no page-view beacons leave the browser;
//   - every Live Pricing fetch in sheetPricing.js refuses at the choke
//     point (assertNetworkAllowed below) -- fail-closed, same philosophy
//     as usePortfolioHoldings' mutation gate, so no future caller can
//     forget the check;
//   - a banner at the top of the app says the mode is on, with a
//     one-click toggle off (LocalOnlyBanner.jsx) -- John's requested
//     "nag", there so nobody wonders months later why prices won't
//     refresh.
//
// What it deliberately does NOT do: touch the service worker. Offline
// support (the precache that makes airplane mode survivable) is passive
// caching of the app's own files and stays always-on -- it uploads
// nothing and is half of the privacy story itself.
//
// Storage: plain localStorage, read synchronously at module load so the
// very first render of main.jsx can already omit the analytics
// components. Changes broadcast through a listener set so the banner and
// Preferences toggle stay in sync without a reload. The flag is a device
// preference like pricingSource -- it is NOT part of plan data and rides
// in no backup payload.

const STORAGE_KEY = 'cfe_local_only_mode';
const listeners = new Set();

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = read();

export function isLocalOnlyMode() {
  return enabled;
}

export function setLocalOnlyMode(on) {
  enabled = !!on;
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode edge cases): the in-memory flag
    // still works for this session.
  }
  for (const cb of listeners) cb(enabled);
}

export function subscribeLocalOnlyMode(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Thrown by the network choke points; carries a user-ready message.
export class LocalOnlyModeError extends Error {
  constructor() {
    super('Local-Only Mode is on, so the app makes no optional connections, price lookups included. Turn it off in Preferences → Your Data (or the banner at the top) to refresh prices.');
    this.name = 'LocalOnlyModeError';
  }
}

// Call at the top of every function that would touch the network.
export function assertNetworkAllowed() {
  if (enabled) throw new LocalOnlyModeError();
}
