// Whether the "What's New" popup could have anything to show, answered
// from localStorage and two small modules -- so the app only downloads the
// popup (which carries the whole changelog) when it will actually open.
// The popup keeps its own, fuller logic; this errs on the side of mounting
// it whenever it might show something.
import { LATEST_CHANGELOG_ID } from '../config/changelogLatest';
import { activeAnnouncements } from '../config/announcements';

export const WHATS_NEW_SEEN_KEY = 'retire_plan_whatsnew_last_seen_id';
export const WHATS_NEW_SHOWN_DATE_KEY = 'retire_plan_whatsnew_last_shown_date';
// Announcements are dismissed by id, tracked as a JSON array (a set, not a
// high-water cursor: announcements can be queued out of order and expire).
export const DISMISSED_ANNOUNCE_KEY = 'retire_plan_announcements_dismissed';

export const whatsNewToday = () => new Date().toISOString().slice(0, 10);

export function readDismissedAnnouncements() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCE_KEY));
    return Array.isArray(raw) ? new Set(raw) : new Set();
  } catch {
    return new Set();
  }
}

// true: mount the popup (it decides). false: nothing to show today.
//
// A first-time visitor is caught up to the latest release silently -- the
// same write the popup makes -- so a first visit with no announcement for
// new visitors never loads the changelog either.
export function whatsNewMayShow(now = new Date()) {
  try {
    const dismissed = readDismissedAnnouncements();
    const seen = localStorage.getItem(WHATS_NEW_SEEN_KEY);
    const isFirstVisit = seen === null;
    const announcements = activeAnnouncements(now)
      .filter((a) => !dismissed.has(a.id))
      .filter((a) => (isFirstVisit ? a.showToNewVisitors !== false : true));
    if (isFirstVisit && announcements.length === 0) {
      localStorage.setItem(WHATS_NEW_SEEN_KEY, String(LATEST_CHANGELOG_ID));
      return false;
    }
    if (localStorage.getItem(WHATS_NEW_SHOWN_DATE_KEY) === now.toISOString().slice(0, 10)) return false;
    if (announcements.length > 0) return true;
    return (parseInt(seen, 10) || 0) < LATEST_CHANGELOG_ID;
  } catch {
    // Storage unavailable: the popup could not remember a dismissal anyway.
    return false;
  }
}
