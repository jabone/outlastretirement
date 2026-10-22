// Every browser-storage key the app uses, and what kind of thing it holds.
//
// One list, three kinds, because three features need to agree on it:
//   * Backup Everything / Restore (fullBackup.js) must carry every PLAN key
//     -- a user moving to a new browser or device by Backup then Restore
//     loses whatever this list forgets. The Life Plan and the annual-review
//     record were once declared here in spirit but never copied, and that
//     is exactly the failure storageKeys.test.js now guards: it scans the
//     source for every key literal and fails on one that isn't classified,
//     and fails if a PLAN key is missing from the backup payload.
//   * "Erase everything on this device" removes all of them (and anything
//     else under the app's prefixes).
//   * The crash screen's "Download my data" saves all of them as they are.
//
// PLAN: the user's own data. Losing it means starting over or losing a
//   record they made. Must round-trip through a backup.
// DEVICE: a preference or UI memory of this browser (theme, folds, which
//   popups were seen, privacy switches). Not in a backup: restoring these
//   would fight a choice the user has since made on this browser.
// TRANSIENT: caches and one-time markers the app can rebuild (the Monte
//   Carlo result cache, the demo-mode snapshot, a finished migration flag).
export const PLAN_KEYS = Object.freeze([
  'retire_plan_inputs',
  'retire_plan_scenarios',
  'cfe_premium_holdings_v1',
  'cfe_premium_liquidations_v1',
  'retire_plan_interview_progress',
  'cfe_estate_checklist_v1',
  'cfe_life_plan_v1',
  'retire_plan_answers_v1',
  'retire_plan_annual_review_v1',
  'cfe_reconciliations_v1',
  'cfe_data_freshness_v1',
  // Restored only when the user switches on "Also restore my Live Pricing
  // connection" in the restore dialog (a connection points this browser at
  // a Sheet; it should not change without the user seeing both links).
  'cfe_premium_pricing_source_v1',
  'cfe_premium_jwt',
]);

// The PLAN keys whose change in another tab makes this tab's copy stale
// (StorageBanners.jsx). Not the freshness record (it follows any change)
// nor the Premium key or pricing links (per-browser settings, not the plan).
export const WATCHED_PLAN_KEYS = Object.freeze([
  'retire_plan_inputs',
  'retire_plan_scenarios',
  'cfe_premium_holdings_v1',
  'cfe_premium_liquidations_v1',
  'cfe_estate_checklist_v1',
  'cfe_life_plan_v1',
  'retire_plan_answers_v1',
  'retire_plan_annual_review_v1',
  'cfe_reconciliations_v1',
]);

export const DEVICE_KEYS = Object.freeze([
  'retire_plan_theme',
  'retire_plan_large_text',
  'retire_plan_sidebar',
  'retire_plan_disclaimer_accepted',
  'retire_plan_onboarding_completed',
  'retire_plan_whatsnew_last_seen_id',
  'retire_plan_whatsnew_last_shown_date',
  'retire_plan_announcements_dismissed',
  'retire_plan_status_bar_hidden',
  'retire_plan_kpi_open_mobile',
  'retire_plan_nav_more_open',
  'retire_plan_ledger_preset',
  'retire_plan_safari_notice_until',
  'retire_plan_folds_v1',
  'retire_plan_round_far_dollars',
  'retire_plan_print_choices',
  'retire_plan_mc_auto_run',
  'retire_plan_plan_mode',
  'retire_plan_last_quick_update',
  'cfe_analytics_opt_in',
  'cfe_local_only_mode',
  'cfe_premium_pricing_script_ack_v1',
  'cfe_premium_expiry_dismissed_v1',
  'cfe_last_price_refresh',
  'cfe_retirement_income_basis',
  'cfe_dividends_help_v1',
  'cfe_retirement_planner_v1',
  'cfe_bracket_lines_v1',
  'cfe_growth_overlay_taxes_v1',
  'cfe_growth_overlay_lifestyle_v1',
]);

export const TRANSIENT_KEYS = Object.freeze([
  'retire_plan_monte_carlo_v1',
  'cfe_demo_mode_v1',
  'cfe_lot_source_retraction_v1',
  // sessionStorage: the one-time reload after a deploy removed a chunk
  // (utils/lazyWithRetry.js).
  'retire_plan_chunk_reload',
]);

// Keys an earlier build wrote that nothing reads any more. Removed from this
// browser once at startup (removeRetiredKeys) so they don't linger. The
// localhost-only "fake Premium" switch was taken out of the app entirely.
export const RETIRED_KEYS = Object.freeze([
  'cfe_dev_premium',
]);

export function removeRetiredKeys(storage = globalThis.localStorage) {
  for (const key of RETIRED_KEYS) {
    try { storage.removeItem(key); } catch { /* storage unavailable: nothing to tidy */ }
  }
}

// Any key under these prefixes belongs to this app, including ones a future
// build adds before this list learns about them.
export const APP_KEY_PREFIXES = Object.freeze(['retire_plan_', 'cfe_']);

// The IndexedDB database cloudFileSync.js keeps the linked save file's
// handle in (a pointer to the user's file, not plan data).
export const APP_INDEXED_DB_NAMES = Object.freeze(['cfe-cloud-file']);

export function isAppStorageKey(key) {
  return typeof key === 'string' && APP_KEY_PREFIXES.some((p) => key.startsWith(p));
}

// Every app key currently present in `storage`, known or not.
export function listAppKeys(storage = globalThis.localStorage) {
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (isAppStorageKey(key)) keys.push(key);
    }
  } catch { /* storage unavailable */ }
  return keys;
}

// Raw strings of every app key, for the crash screen's "Download my data".
// Deliberately raw: when the app cannot render, the one thing it must not
// do is try to interpret the data that may be the reason.
export function snapshotAppStorage(storage = globalThis.localStorage) {
  const out = {};
  for (const key of listAppKeys(storage)) {
    try { out[key] = storage.getItem(key); } catch { /* skip unreadable */ }
  }
  return out;
}
