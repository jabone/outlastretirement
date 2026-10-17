import { isSafariTab, SAFARI_BACKUP_NUDGE_DAYS } from './safariStorage';
// "Keep the data real" -- one small module tracking two dates and one
// preference, so the app can tell the user when its numbers have quietly
// gone stale instead of letting them find out at tax time.
//
// Why this exists (2026-08-23): everything this app knows lives in one
// browser's localStorage. Backup Everything and the cloud-folder linked
// file (see fullBackup.js / cloudFileSync.js) made durable copies
// POSSIBLE, but both are opt-in -- a user who never clicks either is one
// "Clear browsing data" from total loss, and nothing anywhere applied any
// pressure. Separately, a plan is only as good as its inputs: balances and
// holdings reconciled against a January statement drift silently while the
// projection keeps rendering confident-looking numbers. Both problems are
// the same shape -- a date nobody was tracking -- so they share one
// module, one storage key, and one banner.
//
// Two clocks:
//
//   Backup clock -- when did a durable copy last leave this browser?
//     Reset by: Backup Everything (any caller of downloadFullBackup),
//     a successful linked-file Save, and a restored backup file (the
//     payload carries the freshness state of the browser that made it,
//     which is exactly as fresh as the data being restored).
//     Nudges when: plan changes exist that are NEWER than the last backup
//     AND more than BACKUP_NUDGE_DAYS have passed since it. No changes,
//     no nudge -- an untouched plan never nags.
//
//   Portfolio clock -- when were the numbers last reconciled with reality?
//     Reset by: a statement/CSV/PDF import, any deliberate holdings edit
//     (add/edit/remove/liquidate -- NOT Live Pricing refreshes, which
//     update prices automatically and prove nothing about share counts or
//     missed contributions), a Quick Update session (for users who track
//     balances rather than Detailed Holdings), and the banner's own
//     "Mark as current" button.
//     Nudges when: the user's chosen cadence (quarterly by default,
//     monthly or off in Preferences) has elapsed.
//
// Both nudges are snoozable for a week at a time -- pressure, not a
// nag-loop. All state lives under one localStorage key, included in
// Backup Everything (losing "when did I last reconcile" is losing a real
// record, same argument as the estate checklist's dates).
//
// This module never renders anything and never touches React state --
// same design as fullBackup.js, and for the same reason: it must be
// callable from utilities (fullBackup), hooks (usePortfolioHoldings),
// and components (Sidebar, the banner, QuickUpdate) without creating a
// second source of truth.

export const FRESHNESS_KEY = 'cfe_data_freshness_v1';

export const BACKUP_NUDGE_DAYS = 14;
export const SNOOZE_DAYS = 7;

// Days per cadence choice. 'quarterly' uses 91 (13 weeks) rather than a
// calendar-quarter walk -- statement timing is approximate anyway, and a
// fixed window keeps the math trivial and testable.
export const CADENCE_DAYS = { monthly: 30, quarterly: 91 };
export const DEFAULT_CADENCE = 'quarterly';

const DAY_MS = 24 * 60 * 60 * 1000;

function readState() {
  try {
    const raw = localStorage.getItem(FRESHNESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.error('dataFreshness: could not read state', e);
  }
  return null;
}

function writeState(state) {
  try {
    localStorage.setItem(FRESHNESS_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('dataFreshness: could not write state', e);
  }
}

// Lazily seeds firstSeenAt on first touch. Both clocks measure from
// firstSeenAt until their event has happened once, so a brand-new user
// gets a full grace window before either nudge can fire -- nobody is told
// their day-one plan is stale.
export function getFreshnessState(now = Date.now()) {
  const existing = readState();
  if (existing && existing.firstSeenAt) return existing;
  const seeded = {
    firstSeenAt: now,
    lastPlanChangeAt: null,
    lastBackupAt: null,
    lastPortfolioUpdateAt: null,
    portfolioReminderCadence: DEFAULT_CADENCE,
    backupSnoozedUntil: null,
    portfolioSnoozedUntil: null,
    ...(existing || {}),
  };
  writeState(seeded);
  return seeded;
}

function patchState(patch, now = Date.now()) {
  const next = { ...getFreshnessState(now), ...patch };
  writeState(next);
  return next;
}

// Called from App.jsx's inputs/scenarios persistence effects -- i.e. on
// every plan edit. Throttled to one write per minute: the freshness
// question is "are there changes newer than the last backup," which a
// minute of granularity answers exactly as well as a keystroke of it.
export function recordPlanChange(now = Date.now()) {
  const s = getFreshnessState(now);
  if (s.lastPlanChangeAt && now - s.lastPlanChangeAt < 60 * 1000) return s;
  return patchState({ lastPlanChangeAt: now }, now);
}

// A durable copy left the browser (download, linked-file write) -- also
// clears any backup snooze, since the nudge's demand has been met.
export function recordBackup(now = Date.now()) {
  return patchState({ lastBackupAt: now, backupSnoozedUntil: null }, now);
}

// The numbers were reconciled with reality (import, holdings edit, Quick
// Update, or the explicit "Mark as current" button).
export function recordPortfolioUpdate(now = Date.now()) {
  return patchState({ lastPortfolioUpdateAt: now, portfolioSnoozedUntil: null }, now);
}

export function setPortfolioReminderCadence(cadence, now = Date.now()) {
  const valid = cadence === 'off' || Object.prototype.hasOwnProperty.call(CADENCE_DAYS, cadence);
  return patchState({ portfolioReminderCadence: valid ? cadence : DEFAULT_CADENCE }, now);
}

// A Safari tab snoozes for 3 days, not 7: a week's snooze would run past
// Safari's seven-day erase (changelog 370).
export const SAFARI_SNOOZE_DAYS = 3;
export function backupSnoozeDays() {
  return isSafariTab() ? SAFARI_SNOOZE_DAYS : SNOOZE_DAYS;
}
export function snoozeBackupNudge(now = Date.now()) {
  return patchState({ backupSnoozedUntil: now + backupSnoozeDays() * DAY_MS }, now);
}

export function snoozePortfolioNudge(now = Date.now()) {
  return patchState({ portfolioSnoozedUntil: now + SNOOZE_DAYS * DAY_MS }, now);
}

// Restore path (fullBackup.js): adopt the freshness record carried inside
// a backup file, then stamp lastBackupAt = the restore moment -- the data
// on this browser now IS the backup, so the backup clock starts satisfied,
// while the portfolio clock keeps the restored (older) date: restoring a
// stale plan does not make its numbers current.
export function restoreFreshnessState(fromBackup, now = Date.now()) {
  const base = getFreshnessState(now);
  const restored = (fromBackup && typeof fromBackup === 'object') ? fromBackup : {};
  return patchState({
    ...base,
    lastPortfolioUpdateAt: restored.lastPortfolioUpdateAt ?? base.lastPortfolioUpdateAt,
    portfolioReminderCadence: restored.portfolioReminderCadence ?? base.portfolioReminderCadence,
    lastBackupAt: now,
    backupSnoozedUntil: null,
    portfolioSnoozedUntil: null,
  }, now);
}

// Pure status computation -- `now` injectable so tests never need real
// clocks (and per this repo's rule, nothing here runs inside workflows
// where Date.now is unavailable; callers in the app pass nothing).
// In a Safari tab the reminder comes due after 5 days, inside Safari's
// seven-day erase window (utils/safariStorage.js, changelog 370).
export function computeFreshnessStatus({ now = Date.now(), hasHoldings = false, backupNudgeDays = isSafariTab() ? SAFARI_BACKUP_NUDGE_DAYS : BACKUP_NUDGE_DAYS } = {}) {
  const s = getFreshnessState(now);

  const hasUnsavedChanges = !!s.lastPlanChangeAt &&
    (!s.lastBackupAt || s.lastPlanChangeAt > s.lastBackupAt);
  const backupAnchor = s.lastBackupAt ?? s.firstSeenAt;
  const backupAgeDays = Math.floor((now - backupAnchor) / DAY_MS);
  const backupOverdue = hasUnsavedChanges &&
    backupAgeDays > backupNudgeDays &&
    !(s.backupSnoozedUntil && s.backupSnoozedUntil > now);

  const cadence = s.portfolioReminderCadence || DEFAULT_CADENCE;
  const portfolioAnchor = s.lastPortfolioUpdateAt ?? s.firstSeenAt;
  const portfolioAgeDays = Math.floor((now - portfolioAnchor) / DAY_MS);
  const portfolioOverdue = cadence !== 'off' &&
    portfolioAgeDays > (CADENCE_DAYS[cadence] || CADENCE_DAYS[DEFAULT_CADENCE]) &&
    !(s.portfolioSnoozedUntil && s.portfolioSnoozedUntil > now);

  return {
    hasUnsavedChanges,
    backupAgeDays,
    everBackedUp: !!s.lastBackupAt,
    backupOverdue,
    cadence,
    portfolioAgeDays,
    everPortfolioUpdated: !!s.lastPortfolioUpdateAt,
    portfolioOverdue,
    // The banner tailors its ask: statement upload for Detailed Holdings
    // users, Quick Update for balance-only users.
    hasHoldings,
    anyOverdue: backupOverdue || portfolioOverdue,
  };
}

// "12 days ago" / "3 months ago" / "today" -- deliberately coarse.
export function formatAgeDays(days) {
  if (!(days > 0)) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

// Ask the browser to exempt this origin from automatic storage eviction
// (disk pressure, Safari-style inactivity expiry). This does NOT survive a
// deliberate "Clear browsing data" -- nothing can, from inside a page --
// it narrows the accidental-loss surface only, which is why the backup
// nudge above still exists. Fire-and-forget: browsers that don't support
// it (or deny it) change nothing, and we never nag about the result.
export function requestPersistentStorage() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      return navigator.storage.persist().catch(() => false);
    }
  } catch {
    // ignore -- persistence is best-effort by definition
  }
  return Promise.resolve(false);
}
