// Service-worker registration + a tiny subscribable store for the two
// PWA moments the UI cares about (changelog 115):
//
//   offlineReady -- the first-visit precache finished: every asset,
//                   including the lazy chart/PDF chunks, is now stored on
//                   this device. The one-time toast this drives is half
//                   of the privacy demonstration ("turn on airplane mode
//                   -- keep planning").
//   needRefresh  -- a new deploy's service worker is installed and
//                   WAITING. With registerType 'prompt' (vite.config.js)
//                   it will NOT take over until applyUpdate() is called
//                   (or every tab closes), so running sessions are never
//                   hot-swapped mid-edit. The UpdateToast turns this into
//                   a "Reload for the latest version" nudge -- essential
//                   here because this app ships tax-figure corrections,
//                   and a cached app that never updated would quietly go
//                   stale on tax law.
//
// Registration uses a DYNAMIC import of the virtual module so that vitest
// (which knows nothing of vite-plugin-pwa's virtual modules) never tries
// to resolve it -- components import only this file, and tests drive the
// store through _setPWAState below. In dev the virtual module resolves to
// a no-op, and any registration error (unsupported scheme in the
// Capacitor webview, private-mode quirks) is swallowed: the app must work
// exactly as before wherever service workers don't.

import { isLocalOnlyMode } from './localOnlyMode';

const state = { offlineReady: false, needRefresh: false };
const listeners = new Set();
let updateFn = null;

// Update polling (changelog 281). The browser checks for a new service
// worker on load and navigation and, on its own, about once a day -- so a
// tab left open for days, or pinned on a phone, never learned a fix had
// shipped until someone reloaded. Once registered, the worker is asked to
// re-check itself every UPDATE_POLL_MS while the tab is visible, and again
// the moment the tab is shown or the machine comes back online. Each check
// is one small request for sw.js. Local-Only Mode promises zero requests,
// so the poll is skipped while it is on; the check then happens only on a
// manual reload, which is the trade that mode makes.
export const UPDATE_POLL_MS = 60 * 60 * 1000;

export function shouldCheckForUpdate({ localOnly = isLocalOnlyMode(), online = typeof navigator === 'undefined' ? true : navigator.onLine !== false, visible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden' } = {}) {
  return !localOnly && online && visible;
}

// Wires the periodic and on-return checks to a registration. Exported so a
// test can drive it with a fake registration; returns the teardown.
export function startUpdatePolling(registration, { intervalMs = UPDATE_POLL_MS, win = typeof window === 'undefined' ? null : window, doc = typeof document === 'undefined' ? null : document } = {}) {
  if (!registration || typeof registration.update !== 'function') return () => {};
  const check = () => {
    if (!shouldCheckForUpdate()) return;
    try {
      const p = registration.update();
      if (p && typeof p.catch === 'function') p.catch(() => { /* offline or blocked: try again next tick */ });
    } catch { /* same */ }
  };
  const timer = setInterval(check, intervalMs);
  const onVisible = () => { if (doc && doc.visibilityState === 'visible') check(); };
  const onOnline = () => check();
  if (doc) doc.addEventListener('visibilitychange', onVisible);
  if (win) win.addEventListener('online', onOnline);
  return () => {
    clearInterval(timer);
    if (doc) doc.removeEventListener('visibilitychange', onVisible);
    if (win) win.removeEventListener('online', onOnline);
  };
}

function emit() {
  for (const cb of listeners) cb({ ...state });
}

export function getPWAState() {
  return { ...state };
}

export function subscribePWA(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Reload into the waiting service worker. The worker is told to take over
// and normally reloads the page itself once it controls it. That handoff
// never comes when the page is not controlled yet (a new version arrived
// during the very first visit), and "Reload now" used to do nothing at all
// there -- so the page reloads itself after a short wait either way, and at
// once when there is no worker to hand over to.
export const UPDATE_RELOAD_FALLBACK_MS = 1500;
export function applyUpdate({ win = typeof window === 'undefined' ? null : window, fallbackMs = UPDATE_RELOAD_FALLBACK_MS } = {}) {
  if (!win) return;
  if (!updateFn) {
    win.location.reload();
    return;
  }
  try {
    updateFn(true);
  } catch {
    // A failed handoff still falls through to the plain reload below.
  }
  win.setTimeout(() => win.location.reload(), fallbackMs);
}

export function dismissOfflineReady() {
  state.offlineReady = false;
  emit();
}

export async function initPWA() {
  try {
    const { registerSW } = await import('virtual:pwa-register');
    updateFn = registerSW({
      onOfflineReady() {
        state.offlineReady = true;
        emit();
      },
      onNeedRefresh() {
        state.needRefresh = true;
        emit();
      },
      onRegisteredSW(_swUrl, registration) {
        startUpdatePolling(registration);
      },
      onRegisterError() {
        // Service workers unavailable (old browser, some private modes,
        // the Capacitor shell). The app runs exactly as it did before
        // this feature existed -- just without offline durability.
      },
    });
  } catch {
    // Virtual module unresolvable (test runners, non-vite consumers).
  }
}

// Test hook: lets jsdom component tests drive the store without a real
// service worker. Not used by app code.
export function _setPWAState(partial, update = null) {
  Object.assign(state, partial);
  if (update !== null) updateFn = update;
  emit();
}
