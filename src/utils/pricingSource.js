// Settings and storage for the per-user live-pricing data source (the
// fetch client itself is part of the Detailed Holdings Premium module --
// the Premium repo, modules/holdings/utils/sheetPricing.js): each user connects
// their own free copy of the cashflowengine pricing Google Sheet (a
// GOOGLEFINANCE-backed Sheet plus a companion Apps Script -- see README.md's
// "Live Pricing" section for the full setup). Replaces the earlier
// api/quote.js Vercel proxy (Massive + EODHD, gated behind the shared
// Premium Access Key) entirely -- see INTEGRATION_STRATEGY.md Section 1 for
// why: that design metered every user's price lookups through one shared
// paid API key (and a hard 20-calls/day EODHD quota for mutual funds
// specifically), which doesn't scale past a handful of users, and it only
// ever returned a price -- dividend amount, payout frequency, and yield
// stayed manual either way. Routing pricing through each user's own free
// Google account removes the shared-quota bottleneck entirely, and the
// Sheet's Apps Script already derives all four fields (price, dividend $,
// yield %, payout frequency) from one ticker lookup, closing a gap the old
// pipeline never addressed.
//
// Same PII boundary as before: only a bare ticker symbol is ever sent
// anywhere (to the user's own Apps Script) -- never holdings, shares,
// accounts, or dollar totals. Nothing here requires the Premium Access Key
// either; live pricing is now independent of that entitlement gate, which
// exists solely to unlock the Detailed Holdings tab itself (see
// EntitlementContext.jsx) -- not to meter a shared data source anymore.

// One localStorage key for both connection URLs, same "one key per concern"
// pattern usePortfolioHoldings.js uses -- this is a separate concern from
// the holdings themselves (a data-source setting, not plan data).
//
// Included in Backup Everything / Restore Backup (see fullBackup.js) as of
// 2026-08-18 -- previously excluded on the theory that a per-browser
// connection setting shouldn't silently overwrite a different browser's
// own Sheet connection on restore, but recovering from total data loss on
// the SAME browser (the actual case that prompted fullBackup.js to exist)
// is exactly the situation where you *do* want this restored automatically
// rather than redoing the whole Google Sheet/Apps Script setup again.
// applyFullBackupToStorage only overwrites this if the backup file actually
// has a value for it, so an older-format backup with no pricingSource
// field still won't blank out a connection already working on this
// browser.
const STORAGE_KEY = 'cfe_premium_pricing_source_v1';

import { safeSetItem } from './safeStorage';

export function loadPricingSource() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { csvUrl: '', scriptUrl: '' };
    const parsed = JSON.parse(saved);
    return {
      csvUrl: typeof parsed?.csvUrl === 'string' ? parsed.csvUrl : '',
      scriptUrl: typeof parsed?.scriptUrl === 'string' ? parsed.scriptUrl : '',
    };
  } catch (e) {
    console.error('Failed to parse saved pricing source settings', e);
    return { csvUrl: '', scriptUrl: '' };
  }
}

// Live Pricing only ever talks to the user's own Google Sheet: a published
// CSV (docs.google.com), an Apps Script Web App (script.google.com), or the
// googleusercontent.com hosts those redirect to. Anything else -- another
// host, plain http, a javascript: URL, credentials in the URL -- is refused
// wherever a URL is saved, restored from a backup, or fetched, so a pasted
// typo or a crafted backup file cannot point the app at someone else's
// server.
export const PRICING_URL_HOSTS_HINT = 'https://docs.google.com/..., https://script.google.com/..., or https://...googleusercontent.com/...';
export function isAllowedPricingUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  let u;
  try { u = new URL(url.trim()); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return host === 'docs.google.com' || host === 'script.google.com' || host.endsWith('.googleusercontent.com');
}
// null when the value is empty (nothing to check) or allowed; otherwise the
// inline message the settings field shows.
export function pricingUrlError(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  return isAllowedPricingUrl(url) ? null : `Use your Google Sheet's own link: it must start with ${PRICING_URL_HOSTS_HINT}`;
}
export function assertPricingUrl(url) {
  if (!isAllowedPricingUrl(url)) throw new Error('that pricing link is not a Google Sheet or Apps Script address');
}

export function savePricingSource(source) {
  return safeSetItem(STORAGE_KEY, JSON.stringify({
    csvUrl: source?.csvUrl || '',
    scriptUrl: source?.scriptUrl || '',
  }));
}

// Version tracking for the companion Apps Script
// (scripts/pricing-sheet-apps-script.gs). Bump PRICING_SHEET_SCRIPT_VERSION
// whenever that script's *behavior* changes (not comment/formatting-only
// edits) and add a matching entry to PRICING_SHEET_SCRIPT_CHANGELOG. The
// copy deployed on each user's own Google Sheet isn't linked to this repo
// by git -- redeploying is always a manual copy/paste -- so a version bump
// plus this changelog is the only way PortfolioTab.jsx can tell a user
// their live deployment has fallen behind the reference script.
export const PRICING_SHEET_SCRIPT_VERSION = 4;
export const PRICING_SHEET_SCRIPT_CHANGELOG = [
  {
    version: 4,
    date: '2026-10-05',
    summary:
      "Fixes for securities Yahoo Finance only partly covers, such as preferred shares. A throttled lookup is retried and, if it still fails, reported as an error instead of “Ticker not found”. When Yahoo has no dividend summary for a security, the dividend and yield now come from what it actually paid over the last 12 months, instead of showing “HTTP Error 404”. Nothing new to run after pasting: redeploy as a new version and the next refresh picks it up.",
  },
  {
    version: 3,
    date: '2026-08-21',
    summary:
      "Four upgrades: (1) a scheduled refresh keeps prices fresh without opening the Sheet — custom-function cells (like mutual fund NAV fallbacks) previously only recalculated when the Sheet was opened; after pasting the new script, run setupRefreshTrigger once from the Apps Script editor to install it. (2) New tickers register in one batched call instead of one call each, and rejected tickers now report why. (3) Yahoo lookups are cached in your own script's storage (never any shared server), cutting repeat traffic ~10x. (4) The app now reads quotes as JSON straight from your Web App, skipping the published-CSV's ~5-minute republish lag; the CSV URL still works as a fallback.",
  },
  {
    version: 2,
    date: '2026-08-19',
    summary:
      "Added a Yahoo-based price fallback for tickers GOOGLEFINANCE can't resolve (fixes stale/missing prices for some mutual funds), made the Type column a live formula so it self-heals from a transient lookup failure, and added a lock around ticker registration to prevent duplicate rows.",
  },
];

const SCRIPT_ACK_STORAGE_KEY = 'cfe_premium_pricing_script_ack_v1';

// Returns null the very first time this has ever run on a browser (so the
// caller can silently start tracking from "up to date" instead of
// retroactively nagging about versions that shipped before this feature
// existed), otherwise the last script version the user acknowledged.
export function loadScriptAckVersion() {
  const saved = localStorage.getItem(SCRIPT_ACK_STORAGE_KEY);
  if (saved === null) return null;
  const parsed = parseInt(saved, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function saveScriptAckVersion(version) {
  localStorage.setItem(SCRIPT_ACK_STORAGE_KEY, String(version));
}
