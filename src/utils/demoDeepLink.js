// Query-string entry point for the demo plan: /app?demo=1
//
// The landing page (changelog 169) sends every primary CTA -- "Try the
// Demo Plan" -- at the app with this parameter. Before it existed the app
// ignored location.search entirely, so those CTAs dropped visitors onto an
// empty Dashboard: the one outcome the landing page is built to avoid.
//
// Why a query parameter and not a hash route: the hash is already spoken
// for. It names which tab to render (see tabRouting.js), and the demo needs
// to say BOTH "load the demo data" and "then land here", so the two have to
// travel in different halves of the URL. `?demo=1#/scenarios` reads exactly
// as it behaves.
//
// The parameter is consumed once and stripped from the address bar before
// anything else happens. That is not cosmetic. enterDemoMode() finishes
// with location.reload(), which preserves the query string -- so leaving
// `?demo=1` in place would re-enter demo mode on every reload forever, and
// a bookmark of the resulting URL would be a trap. Stripping first makes
// the reload land on a plain /app.
import { canonicalTab } from './tabRouting';
import { DEMO_HOUSEHOLDS, DEMO_HOUSEHOLD_DEFAULT } from './demoHouseholds';

// Where "Try the Demo Plan" lands when the link doesn't say otherwise.
// The Dashboard, where the Carters' answer is: the verdict, the portfolio
// chart and its summary. (It was Scenarios until the outside review of
// 2026-09-28 pointed out the demo landed away from its own answer.)
export const DEMO_DEEP_LINK_DEFAULT_TAB = 'dashboard';

// Pure half, so this is testable without a DOM: given a location.search
// string, does it ask for the demo, and where should it land?
// Returns null when the search string asks for nothing.
export function parseDemoDeepLink(search) {
  if (!search || typeof search !== 'string') return null;
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  const raw = params.get('demo');
  if (raw === null) return null;
  // Accept the spellings a human might type or a link might carry;
  // reject an explicit opt-out rather than treating any value as truthy.
  const value = raw.trim().toLowerCase();
  if (value === '0' || value === 'false' || value === 'no') return null;
  // ?demo=parkers names a household (utils/demoHouseholds.js); the Learn
  // lessons use it. The plain spellings open the default household.
  const named = Object.prototype.hasOwnProperty.call(DEMO_HOUSEHOLDS, value) ? value : null;
  if (!named && value !== '' && value !== '1' && value !== 'true' && value !== 'yes') return null;

  // An explicit ?tab= wins; an unknown one falls back to the default
  // rather than sending someone to a tab that doesn't exist.
  const requested = canonicalTab(params.get('tab'));
  const landOnTab = requested || DEMO_DEEP_LINK_DEFAULT_TAB;
  // `household` is present only for a non-default one, so a plain demo link
  // parses to exactly what it always has.
  return named && named !== DEMO_HOUSEHOLD_DEFAULT ? { landOnTab, household: named } : { landOnTab };
}

// Removes `demo` and `tab` from the address bar without a navigation, so
// the reload that ends enterDemoMode() lands on a clean /app. Everything
// here is guarded: a browser without history.replaceState, or a page on a
// non-http origin (Capacitor's file:// wrapper), must not throw during
// startup -- the worst acceptable outcome is a leftover query parameter.
export function stripDemoParams() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    url.searchParams.delete('tab');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    /* address bar is cosmetic; never block startup over it */
  }
}
