// What an opted-in page view is allowed to say (changelog 321).
//
// Sentry's 2026-09-28 test found Vercel Analytics sending the raw address:
// the hash route (#/taxestate/brackets) and any query string in full
// (?utm_source=...&foo=bar). None of that was plan data, but the privacy
// policy promised less than it sent. Every page view now goes through
// analyticsBeforeSend, which rebuilds the address from scratch:
//
//   - origin + /app/ + the top-level tab name, and only a tab name from
//     tabRouting.js's own list -- never a sub-tab, never free text;
//   - no query string and no hash, ever;
//   - a page view that names the same tab as the last one is dropped, so
//     clicking between sub-tabs of one tab is not counted as new views.
//
// Tab switching still uses history.pushState (the Back button walks
// through tabs, App.jsx), so one tab visit is one page view, which is the
// "which tabs get opened" the Preferences switch describes.
import { parseHash } from './tabRouting';

export function sanitizeAnalyticsUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    const route = parseHash(url.hash);
    return `${url.origin}/app/${route ? route.tab : ''}`;
  }
  return `${url.origin}${url.pathname}`;
}

export function makeAnalyticsBeforeSend() {
  let lastPageView = null;
  return (event) => {
    if (!event || typeof event.url !== 'string') return null;
    const url = sanitizeAnalyticsUrl(event.url);
    if (!url) return null;
    if (event.type === 'pageview') {
      if (url === lastPageView) return null;
      lastPageView = url;
    }
    return { ...event, url };
  };
}
