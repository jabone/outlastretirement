// The cashflowengine.app -> outlastretirement.com move.
//
// The reason this needs a loud, deliberate migration rather than a redirect:
// **localStorage is per-origin.** A plan saved on cashflowengine.app does not
// exist on outlastretirement.com, and no redirect, DNS change or cookie can
// carry it across. The only route is Backup Everything on the old host,
// Restore Backup on the new one. A silent redirect would look like it worked
// and leave people staring at an empty form where their plan used to be.
//
// Everything about the move lives here so the app, the landing page and the
// tests cannot disagree about the date or the hosts.

// The origin being retired. Matched exactly -- a substring check would also
// fire on a preview deployment or anything containing the name.
export const LEGACY_HOSTS = ['cashflowengine.app', 'www.cashflowengine.app'];

export const NEW_HOST = 'outlastretirement.com';
export const NEW_ORIGIN = `https://${NEW_HOST}`;

// The date the old host stops serving. A DATE and not "45 days", because
// "45 days" is only true on the day it is written and this banner will be up
// for all of them. Moved up to October 1 on 2026-09-26; no user-facing copy
// may name any other date (the migration test checks).
export const SUNSET_DATE = '2026-10-01';

export function sunsetDateLabel() {
  // Parsed as UTC noon so the label cannot slip a day for a user west of
  // Greenwich -- a date-only string is parsed as UTC midnight, which is the
  // previous evening in every US timezone.
  return new Date(`${SUNSET_DATE}T12:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Whole days left, floored, never negative.
export function daysUntilSunset(now = new Date()) {
  const end = new Date(`${SUNSET_DATE}T12:00:00Z`).getTime();
  return Math.max(0, Math.ceil((end - now.getTime()) / 86400000));
}

// The banner shows ONLY on the host being retired. Not on the new one (there
// is nothing to migrate there), and not on localhost (where it would be
// permanent noise) -- override with ?migration=preview to see it in dev.
export function isLegacyHost(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) return false;
  try {
    if (new URLSearchParams(loc.search).get('migration') === 'preview') return true;
  } catch { /* a malformed query string is not a reason to decide either way */ }
  return LEGACY_HOSTS.includes(loc.hostname);
}
