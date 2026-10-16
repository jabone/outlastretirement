import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted app fonts (changelog 148). Previously index.css pulled these
// two families from fonts.googleapis.com on every load -- a request that
// ignored Local-Only Mode (leaking the visitor's IP to Google despite the
// "zero network requests" promise) and left the app on system fonts when
// offline. Bundled as woff2 now, precached by the service worker's woff2
// glob, so the app renders in its real type with nothing leaving the device.
import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
// GatedAnalytics wraps the Vercel Analytics / Speed Insights components
// behind the Local-Only Mode flag (changelog 115) -- while that mode is
// on, no beacon of any kind leaves the browser.
import GatedAnalytics from './components/GatedAnalytics.jsx';
import OfflineIndicator from './components/OfflineIndicator.jsx';
import UpdateToast from './components/UpdateToast.jsx';
import LocalOnlyBanner from './components/LocalOnlyBanner.jsx';
import StorageBanners from './components/StorageBanners.jsx';
import { removeRetiredKeys } from './utils/storageKeys.js';
import { initPWA } from './utils/pwa.js';
// The /app?demo=1 entry point the landing page's "Try the Demo Plan" CTAs
// use (changelog 169). See demoDeepLink.js for why it is a query parameter
// and why it must be stripped before enterDemoMode's reload.
import { parseDemoDeepLink, stripDemoParams } from './utils/demoDeepLink.js';
import { enterDemoMode, isDemoModeActive } from './utils/demoMode.js';
import { hasOwnPlanData, askBeforeDemo } from './utils/demoEntryGuard.js';

// Register the service worker that precaches the whole app for offline use
// (changelog 115). Errors are swallowed inside -- environments without
// service workers behave exactly as before.
//
// After the page's load event, not during it (changelog 323). PageSpeed's
// mobile run showed registration as the longest chain in the first load:
// app bundle -> virtual:pwa-register -> workbox-window, finishing at about
// 1.2 s, none of it needed to draw anything. Offline support is unchanged;
// it just starts a moment later.
if (document.readyState === 'complete') {
  initPWA();
} else {
  window.addEventListener('load', () => { initPWA(); }, { once: true });
}

// Root-level boundary, in addition to the one already wrapping the
// Portfolio tab specifically (see App.jsx) -- a bad showAlert(message,
// { title }) call (real bug, fixed 2026-08-18: showAlert's actual
// signature takes a plain string title, not an options object -- passing
// the object crashed with "Objects are not valid as a React child") turned
// out to render outside the Portfolio tab's own boundary (AppDialog lives
// at the App root, not inside PortfolioTab), so it blanked the entire app
// with nothing to catch it. This outer boundary is the backstop for that
// case and any other future one-off render error anywhere in the tree --
// worst case now is an in-app error message instead of a fully blank page.
function renderApp() {
  removeRetiredKeys();
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary recovery fallbackMessage="Something went wrong and the app stopped rendering. Try Again, or reload the page. Your saved data is still in this browser's storage; if the problem keeps coming back, download a copy of it before resetting.">
        <App />
      </ErrorBoundary>
      <GatedAnalytics />
      <LocalOnlyBanner />
      <StorageBanners />
      <OfflineIndicator />
      <UpdateToast />
    </StrictMode>,
  )
}

// Building the demo payload runs five Monte Carlo simulations, so it takes
// a second or two. Rendering the real app first and yanking it away on
// enterDemoMode's reload would show an arriving visitor an empty Dashboard
// -- their first impression of the product -- so the wait gets a plain
// placeholder instead. Hand-written DOM rather than a React component
// because nothing is mounted yet and this must survive even if the app
// bundle is the thing that's slow.
function showDemoSplash() {
  const host = document.getElementById('root');
  if (!host) return () => {};
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  wrap.style.cssText = 'min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5rem;padding:2rem;text-align:center;font-family:system-ui,sans-serif;';
  const title = document.createElement('p');
  title.textContent = 'Building the demo plan\u2026';
  title.style.cssText = 'margin:0;font-size:1.125rem;font-weight:600;';
  const note = document.createElement('p');
  note.textContent = 'Running the projections now. This takes a moment.';
  note.style.cssText = 'margin:0;opacity:.7;';
  wrap.append(title, note);
  host.appendChild(wrap);
  return () => { host.innerHTML = ''; };
}

// Demo mode is entered BEFORE the app renders, and only when the URL asks
// for it and the browser isn't already in demo mode -- entering over an
// existing demo would snapshot the demo as if it were the user's own plan.
const demoRequest = parseDemoDeepLink(window.location.search);
if (demoRequest) {
  stripDemoParams();
  try { window.location.hash = `#/${demoRequest.landOnTab}`; } catch { /* hash is cosmetic */ }
}
if (demoRequest && !isDemoModeActive()) {
  // A returning user with a plan of their own is asked first (S15): the
  // demo keeps their plan and Exit Demo restores it, but it should not
  // vanish from the screen without a word. "Stay on My Plan" opens the app
  // on their own plan, at the tab the link named.
  const ask = hasOwnPlanData() ? askBeforeDemo() : Promise.resolve(true);
  ask.then((openDemo) => {
    if (!openDemo) { renderApp(); return; }
    const clearSplash = showDemoSplash();
    // enterDemoMode ends in a reload on success, so renderApp only runs when
    // it declined (entry already in flight, or the safety snapshot failed to
    // store). Either way the visitor gets the app rather than a stuck splash.
    enterDemoMode({ landOnTab: demoRequest.landOnTab, household: demoRequest.household })
      .catch((e) => { console.error('Demo deep link: could not enter demo mode.', e); return false; })
      .then((entered) => { if (!entered) { clearSplash(); renderApp(); } });
  });
} else {
  renderApp();
}
