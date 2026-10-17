// The app's URL vocabulary: which hash routes exist, and how they map to
// the `activeTab` / `*SubTab` state that actually drives rendering.
//
// Why hash routing and not paths: this same build ships three ways. Vercel
// serves it as a static site (`npm run deploy`), and Capacitor wraps the
// same `dist/` as an iOS and Android app (see capacitor.config.json). Path
// routing needs a server rewrite rule to survive a reload on a deep link,
// and inside Capacitor there is no server at all -- the page loads from a
// file:// or capacitor:// origin where "/settings" isn't a meaningful path.
// A hash is inert to every one of those: the fragment never reaches a
// server, so `#/settings/taxes` reloads correctly in all three targets with
// no host configuration to keep in sync.
//
// Why a table instead of `if (tab === 'settings')` checks at the call
// sites: sub-tab ids are already declared once inside each tab component,
// and a second hand-maintained copy here would drift the moment someone
// adds a sub-tab -- silently, since an unknown id just falls back to the
// default rather than throwing. tabRouting.test.js re-derives the real ids
// from each component's source on every run and fails if this table
// disagrees, the same discipline inputCoverage.js uses for the Interview
// coverage map.

// Each entry: the state key its sub-tab lives under (null if the tab has
// no sub-tabs), the valid sub-tab ids, and which one is the default.
// `premium` marks a tab that renders nothing without an entitlement.
export const ROUTES = {
  dashboard: { subTabKey: null, subTabs: [], defaultSubTab: null },
  settings: {
    subTabKey: 'settingsSubTab',
    subTabs: ['household', 'income', 'savings', 'balances', 'spending', 'taxes', 'assumptions', 'milestones', 'planyear'],
    defaultSubTab: 'household',
  },
  interview: { subTabKey: null, subTabs: [], defaultSubTab: null },
  lifeplan: { subTabKey: null, subTabs: [], defaultSubTab: null },
  portfolio: {
    subTabKey: 'portfolioSubTab',
    subTabs: ['holdings', 'dividends', 'retirement', 'analytics', 'rebalance', 'liquidations'],
    defaultSubTab: 'holdings',
    premium: true,
  },
  // Changelog 214: the Retirement Readiness cards. No sub-tabs -- the six
  // questions are cards on one page, not sections to navigate between.
  readiness: { subTabKey: null, subTabs: [], defaultSubTab: null },
  strategy: {
    subTabKey: 'strategySubTab',
    subTabs: ['optimizer', 'ssheatmap', 'rothladder'],
    defaultSubTab: 'optimizer',
  },
  risk: {
    subTabKey: 'riskSubTab',
    subTabs: ['stress', 'montecarlo', 'sensitivity', 'guardrails'],
    defaultSubTab: 'stress',
  },
  taxestate: {
    subTabKey: 'taxestateSubTab',
    subTabs: ['brackets', 'estate', 'checklist'],
    defaultSubTab: 'brackets',
  },
  scenarios: { subTabKey: null, subTabs: [], defaultSubTab: null },
  yearledger: {
    subTabKey: 'yearledgerSubTab',
    subTabs: ['balances', 'uses', 'cashflow'],
    defaultSubTab: 'balances',
  },
  preferences: { subTabKey: null, subTabs: [], defaultSubTab: null },
  // The Premium explainer. Note this is a tab *named* premium, not a tab
  // *flagged* premium -- it is the one destination that exists for people
  // who do not have an entitlement, so it must never carry `premium: true`
  // or the guard below would redirect away exactly the audience it is for.
  premium: { subTabKey: null, subTabs: [], defaultSubTab: null },
  guide: {
    subTabKey: 'guideSubTab',
    subTabs: ['guide', 'dictionary', 'howfigured', 'whatsnew'],
    defaultSubTab: 'guide',
  },
};

export const DEFAULT_TAB = 'dashboard';

// Tab ids that were renamed but still route, so links written before the
// rename keep working. App.jsx renders these through the same branch as
// their target; the router canonicalizes the URL so the address bar shows
// the current name after the first render.
//
// These are permanent, not a deprecation window. They cost one map entry
// each, and the alternative is a bookmark that silently lands on Dashboard
// -- the exact "every reload returns to Dashboard" problem this file
// exists to fix.
export const TAB_ALIASES = {
  ledger: 'yearledger',   // split into Scenarios + Year by Year, 2026-08-19
  reference: 'guide',     // Input Dictionary folded into Help, 2026-08-19
};

export function canonicalTab(tab) {
  if (!tab) return null;
  const lower = String(tab).toLowerCase();
  const resolved = TAB_ALIASES[lower] || lower;
  return Object.prototype.hasOwnProperty.call(ROUTES, resolved) ? resolved : null;
}

// Parses a location.hash into { tab, subTab }, or null when the hash names
// no tab we know.
//
// Deliberately forgiving in one direction and strict in the other. A
// hash that names a real tab but a junk sub-tab returns that tab with
// subTab: null -- landing on Plan Settings' first section beats bouncing
// someone to Dashboard because a URL got truncated in an email. But a
// hash that names no real tab returns null rather than guessing, so the
// caller falls back to Dashboard instead of rendering an empty panel.
export function parseHash(hash) {
  if (!hash || typeof hash !== 'string') return null;
  // Accept '#/settings/taxes', '#settings/taxes', '/settings/taxes'.
  const cleaned = hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleaned) return null;

  let segments;
  try {
    segments = cleaned
      .split('/')
      .map((s) => decodeURIComponent(s).trim().toLowerCase())
      // Drop empties so a doubled slash ('#//settings//taxes', which is
      // what you get from naive string concatenation of a base and a path)
      // doesn't read as "tab settings, sub-tab ''".
      .filter(Boolean);
  } catch {
    // decodeURIComponent throws on a malformed escape ('%E0%A4%A'). A
    // mangled URL is not a reason to throw during App's first render.
    return null;
  }

  const tab = canonicalTab(segments[0]);
  if (!tab) return null;

  const requested = segments[1];
  const subTab = requested && ROUTES[tab].subTabs.includes(requested) ? requested : null;
  return { tab, subTab };
}

// The inverse. Omits the sub-tab segment when it's the tab's default, so
// the common case stays '#/settings' rather than '#/settings/household' --
// a shorter URL to copy, and it keeps the address bar from appearing to
// change when nothing meaningful did.
export function formatHash(tab, subTab) {
  const resolved = canonicalTab(tab) || DEFAULT_TAB;
  const route = ROUTES[resolved];
  if (!route.subTabKey || !subTab || subTab === route.defaultSubTab) return `#/${resolved}`;
  if (!route.subTabs.includes(subTab)) return `#/${resolved}`;
  return `#/${resolved}/${subTab}`;
}

// Picks the starting value for one sub-tab state from a parsed route.
// Every sub-tab state gets its declared default unless the incoming URL
// named that specific tab AND a valid section within it.
export function initialSubTab(route, tabId, fallback) {
  return route && route.tab === tabId && route.subTab ? route.subTab : fallback;
}

// Reads the browser's current hash. Guarded for non-DOM environments (the
// node-environment unit tests import this module for parseHash/formatHash).
export function readRoute() {
  if (typeof window === 'undefined' || !window.location) return null;
  return parseHash(window.location.hash);
}
