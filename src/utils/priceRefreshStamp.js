// When Live Pricing last finished a refresh on this device, shown next to
// the Refresh Prices & Dividends button. A successful refresh used to be
// silent (only failures raised an alert), so there was no way to tell
// whether prices were from a minute ago or last week.
//
// Device-level, like the pricing source itself: one localStorage key, not
// plan data, not in backups. Every access is guarded -- storage can throw
// in a locked-down browser, and then the line simply doesn't show.

export const PRICE_REFRESH_KEY = 'cfe_last_price_refresh';

function store(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function saveLastPriceRefresh(date = new Date(), storage) {
  try {
    const s = store(storage);
    if (s) s.setItem(PRICE_REFRESH_KEY, date.toISOString());
  } catch { /* storage blocked — nothing to show next time */ }
}

export function loadLastPriceRefresh(storage) {
  try {
    const s = store(storage);
    const raw = s ? s.getItem(PRICE_REFRESH_KEY) : null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "Last refreshed today at 4:41 PM", "... yesterday at ...", "... Sep 27 at
// ..." and, from an earlier year, "... Sep 27, 2025 at ...".
export function formatLastPriceRefresh(date, now = new Date(), locale) {
  if (!date) return '';
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let day;
  if (sameDay(date, now)) day = 'today';
  else if (sameDay(date, yesterday)) day = 'yesterday';
  else if (date.getFullYear() === now.getFullYear()) day = date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  else day = date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return `Last refreshed ${day} at ${time}`;
}
