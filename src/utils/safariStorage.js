// Safari's seven-day storage limit (changelog 370).
//
// Safari deletes everything a site has stored -- localStorage included,
// so the whole plan -- after seven days of Safari use without a visit to
// that site. It does this on iPhone, iPad and Mac, for a site the person
// opened themselves, and navigator.storage.persist() (dataFreshness.js)
// cannot be relied on to stop it. A web app added to the Home Screen (or,
// on a Mac, to the Dock) keeps its storage, and so does the App Store app,
// which is not Safari at all.
//
// So in a Safari TAB the app says so once in a while, and the backup
// reminder comes due inside Safari's window instead of after it.

export const SAFARI_ERASE_DAYS = 7;
// The backup reminder's threshold in a Safari tab (14 elsewhere).
export const SAFARI_BACKUP_NUDGE_DAYS = 5;
export const SAFARI_NOTICE_KEY = 'retire_plan_safari_notice_until';
export const SAFARI_NOTICE_SNOOZE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// 'ios' | 'mac' when this page is a Safari browser tab, else null. Not a
// Home Screen / Dock web app, not the Capacitor app, not another browser
// (Chrome, Firefox and Edge on iOS identify themselves).
export function safariTabPlatform(nav = typeof navigator !== 'undefined' ? navigator : null, win = typeof window !== 'undefined' ? window : null) {
  try {
    if (!nav) return null;
    const ua = String(nav.userAgent || '');
    const isSafari = /Safari\//.test(ua) && /Version\//.test(ua)
      && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|OPiOS|Android|GSA\//.test(ua);
    if (!isSafari) return null;
    if (nav.standalone === true) return null;
    if (win && typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) return null;
    const cap = win ? win.Capacitor : null;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return null;
    const touchMac = /Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1; // iPadOS asks for the desktop site
    if (/iPhone|iPad|iPod/.test(ua) || touchMac) return 'ios';
    if (/Macintosh/.test(ua)) return 'mac';
    return null;
  } catch { return null; }
}

export function isSafariTab() {
  return safariTabPlatform() !== null;
}

export function safariNoticeDue(now = Date.now()) {
  if (!isSafariTab()) return false;
  try {
    const until = Number(localStorage.getItem(SAFARI_NOTICE_KEY));
    return !(Number.isFinite(until) && until > now);
  } catch { return true; }
}

export function snoozeSafariNotice(now = Date.now()) {
  try { localStorage.setItem(SAFARI_NOTICE_KEY, String(now + SAFARI_NOTICE_SNOOZE_DAYS * DAY_MS)); } catch { /* shows again next visit */ }
}
