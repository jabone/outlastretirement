// When to warn that a Premium key is running out (changelog 183).
//
// WHY THIS EXISTS NOW. Keys were minted for 180 days, so expiry was a
// twice-a-year event most users would notice on their own. Premium moved to
// email-arranged 30-day keys, which makes expiry a MONTHLY event -- and the
// only place the app said anything about it was a line in Preferences
// reading "Active until <date>", which nobody goes looking for. A user's
// first notice of expiry would be opening Detailed Holdings and finding it
// locked, with nothing on screen explaining why or how to fix it.
//
// The fix is deliberately small: say so a week ahead, say so once it has
// happened, and say where to write. It is not an upsell surface.
//
// Nothing here reads the clock itself -- `now` is always passed in, which is
// what lets the whole thing be tested without mocking time.

// Seven days: long enough to email and get a reply before losing anything,
// short enough that a 30-day key is not warning for a quarter of its life.
export const PREMIUM_EXPIRY_WARNING_DAYS = 7;

// Dismissals are keyed by the expiry instant they were dismissed FOR, not by
// a date or a boolean. Renewing produces a key with a different expiry, so a
// dismissal never carries across a renewal and silences the next cycle --
// the failure mode a plain "don't show again" flag would have.
export const PREMIUM_EXPIRY_DISMISS_KEY = 'cfe_premium_expiry_dismissed_v1';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// `expiresAt` is whatever verifyPremiumJwt returned: a Date, or null when
// there is no key or it could not be verified.
//
// Returns one of:
//   { state: 'none' }          no key, nothing to say
//   { state: 'active' }        more than the warning window left
//   { state: 'expiringSoon' }  inside the window, with daysRemaining
//   { state: 'expired' }       already past, with daysAgo
export function premiumExpiryStatus(expiresAt, now = new Date()) {
  if (!expiresAt) return { state: 'none', daysRemaining: null, daysAgo: null, expiresAt: null };
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const ms = end.getTime();
  if (!Number.isFinite(ms)) return { state: 'none', daysRemaining: null, daysAgo: null, expiresAt: null };

  const remainingMs = ms - now.getTime();
  if (remainingMs <= 0) {
    return {
      state: 'expired',
      daysRemaining: 0,
      // Rounded UP so the first day past expiry reads "1 day ago" rather
      // than "0 days ago", which looks like a bug.
      daysAgo: Math.max(1, Math.ceil(-remainingMs / MS_PER_DAY)),
      expiresAt: end,
    };
  }

  // Rounded UP as well, so a key with six and a half days left says seven.
  // Under-reporting the time someone has is the worse error of the two.
  const daysRemaining = Math.ceil(remainingMs / MS_PER_DAY);
  if (daysRemaining > PREMIUM_EXPIRY_WARNING_DAYS) {
    return { state: 'active', daysRemaining, daysAgo: null, expiresAt: end };
  }
  return { state: 'expiringSoon', daysRemaining, daysAgo: null, expiresAt: end };
}

// True when this exact expiry has already been dismissed. Any storage
// failure reads as "not dismissed": a private window or blocked storage
// should show the warning, never swallow it.
export function isPremiumExpiryDismissed(expiresAt, storage = globalThis.localStorage) {
  if (!expiresAt) return false;
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(end.getTime())) return false;
  try {
    return storage?.getItem(PREMIUM_EXPIRY_DISMISS_KEY) === String(end.getTime());
  } catch {
    return false;
  }
}

export function dismissPremiumExpiry(expiresAt, storage = globalThis.localStorage) {
  if (!expiresAt) return false;
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(end.getTime())) return false;
  try {
    storage?.setItem(PREMIUM_EXPIRY_DISMISS_KEY, String(end.getTime()));
    return true;
  } catch {
    return false;
  }
}

// Should the banner render at all? Kept here rather than in the component so
// the whole decision is one pure function with a test, instead of a chain of
// && in JSX.
export function shouldShowPremiumExpiryBanner(expiresAt, now = new Date(), storage = globalThis.localStorage) {
  const status = premiumExpiryStatus(expiresAt, now);
  if (status.state !== 'expiringSoon' && status.state !== 'expired') return { show: false, status };
  if (isPremiumExpiryDismissed(expiresAt, storage)) return { show: false, status };
  return { show: true, status };
}
