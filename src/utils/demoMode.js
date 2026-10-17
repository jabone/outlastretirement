// Demo mode: load the Carters (config/demoPlan.js) without ever putting
// the user's own plan at risk.
//
// The contract, in order of importance:
//
//   1. NEVER lose user data. Entering demo mode first snapshots the
//      user's ENTIRE current state through the same buildFullBackupPayload
//      that Backup Everything uses -- if that machinery is trusted to
//      recover from a cleared browser, it is trusted to recover from a
//      demo session. The snapshot rides inside the demo-mode key itself,
//      so demo state and the means of undoing it live or die together.
//   2. Exiting restores the snapshot exactly and discards every change
//      made during the demo -- the banner says so up front. The demo is a
//      showroom, not a scratchpad that leaks into your real plan.
//   3. A demo can never mint an entitlement: the demo payload carries no
//      premiumJwt, and entering/exiting never touches the user's JWT key.
//      The read-only Portfolio preview for non-premium users is granted by
//      App.jsx (portfolioPreview), not by faking isPremium -- mutations
//      stay gated on the REAL entitlement (see usePortfolioHoldings).
//   4. While in demo mode, everything that could push demo data somewhere
//      durable is refused: Backup Everything, the linked-file save, and
//      Restore Backup all check isDemoModeActive() and bounce with an
//      explanation (useFullBackupActions). Nobody gets a cloud file full
//      of the Carters where their own plan used to be.
//
// Both enter and exit end in location.reload() -- the same pattern
// Restore Backup already uses, and for the same reason: every piece of
// state in the app (React state, the holdings hook, the router) seeds
// itself from localStorage on load, so a reload is the one transition
// guaranteed to leave no half-swapped state behind.
//
// The Carters themselves (config/demoPlan.js) and the code that turns them
// into a loadable payload live in demoPayload.js, loaded only when someone
// actually enters the demo -- this module is on the app's startup path
// (the banner, the backup guards, isDemoModeActive) and the plan is not.
import { buildFullBackupPayload, applyFullBackupToStorage } from './fullBackup';
import { runMonteCarloBatch } from './monteCarloAsync';
import { scenarioNeedsOdds } from './scenarioOdds';
import { DEMO_HOUSEHOLDS, DEMO_HOUSEHOLD_DEFAULT, canonicalDemoHousehold } from './demoHouseholds';

export const DEMO_MODE_KEY = 'cfe_demo_mode_v1';

// Which fictional household is loaded (utils/demoHouseholds.js), for the
// banner. A record written before the Parkers existed has no household and
// reads as the Carters, which is what it was.
export function demoHousehold() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_MODE_KEY) || 'null');
    if (!parsed || !parsed.active) return null;
    return DEMO_HOUSEHOLDS[canonicalDemoHousehold(parsed.household)];
  } catch {
    return null;
  }
}

export function isDemoModeActive() {
  try {
    const raw = localStorage.getItem(DEMO_MODE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!(parsed && parsed.active);
  } catch {
    return false;
  }
}

// True when a saved scenario is a demo scenario still waiting for its odds.
export function demoScenarioNeedsOdds(sc) {
  return !!sc && sc.tag === 'demo' && sc.metrics && sc.metrics.successProbability == null;
}

// Runs the waiting demo scenarios' simulations off the main thread and
// returns { id: successProbability } for each. Scenarios that already have
// odds, or are not demo scenarios, are left alone.
export async function fillDemoScenarioOdds(scenarios, { onProgress } = {}) {
  const waiting = (scenarios || []).filter(demoScenarioNeedsOdds);
  if (waiting.length === 0) return {};
  const results = await runMonteCarloBatch(waiting.map((s) => s.inputs), { onProgress });
  const odds = {};
  waiting.forEach((s, i) => {
    const p = results[i] && results[i].successProbability;
    if (Number.isFinite(p)) odds[s.id] = p;
  });
  return odds;
}

// Every saved scenario -- demo or the user's own -- whose odds are missing
// or were computed under an earlier release. Returns { id: successProbability }.
export async function fillScenarioOdds(scenarios, { onProgress } = {}) {
  const waiting = (scenarios || []).filter(scenarioNeedsOdds);
  if (waiting.length === 0) return {};
  const results = await runMonteCarloBatch(waiting.map((s) => s.inputs), { onProgress });
  const odds = {};
  waiting.forEach((s, i) => {
    const p = results[i] && results[i].successProbability;
    if (Number.isFinite(p)) odds[s.id] = p;
  });
  return odds;
}

// Device preferences that belong to this browser, not to a plan. Exit never
// reverts or removes these: a visitor who accepted the disclaimer, picked a
// theme or finished onboarding during the demo keeps that choice.
export const DEMO_EXIT_KEEPS = new Set([
  'retire_plan_theme', 'retire_plan_large_text', 'retire_plan_sidebar',
  'retire_plan_disclaimer_accepted', 'retire_plan_onboarding_completed',
  'retire_plan_whatsnew_last_seen_id', 'retire_plan_whatsnew_last_shown_date',
  'retire_plan_announcements_dismissed', 'retire_plan_status_bar_hidden',
  'retire_plan_kpi_open_mobile', 'retire_plan_nav_more_open', 'retire_plan_ledger_preset', 'retire_plan_safari_notice_until', 'retire_plan_folds_v1',
  'retire_plan_round_far_dollars', 'retire_plan_print_choices',
  'cfe_analytics_opt_in', 'cfe_local_only_mode', 'cfe_premium_jwt',
]);

// Everything in this browser's storage except the demo key itself, as raw
// strings (changelog 324). The full-backup snapshot below restores the
// plan, but only the keys a backup carries: a visitor who went straight
// into the demo came back out with the Carters' Monte Carlo range, estate
// checklist and "backed up today" dates still showing on an empty plan.
export function captureRawStorage() {
  const raw = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key !== DEMO_MODE_KEY) raw[key] = localStorage.getItem(key);
  }
  return raw;
}

// Put storage back exactly as it was on entry, apart from the device
// preferences above: keys the demo added are removed, keys it changed get
// their old values back.
export function restoreRawStorage(raw) {
  const current = [];
  for (let i = 0; i < localStorage.length; i += 1) current.push(localStorage.key(i));
  for (const key of current) {
    if (!key || key === DEMO_MODE_KEY || DEMO_EXIT_KEEPS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(raw, key)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(raw)) {
    if (DEMO_EXIT_KEEPS.has(key) || typeof value !== 'string') continue;
    localStorage.setItem(key, value);
  }
}

// Enter: snapshot -> store -> apply demo -> (optionally aim a tab) -> reload.
// `landOnTab` lets the Premium page's "preview with demo data" button drop
// the user straight onto the Portfolio tab after the reload.
// ASYNC since changelog 129, and the ordering below is deliberate.
//
// Building the payload takes seconds (five Monte Carlo simulations), and it
// used to happen on the main thread between writing the safety snapshot and
// applying the demo -- so the browser froze, and for the length of that
// freeze localStorage claimed demo mode was active while the user's own
// plan was still loaded. Anyone who closed the tab in that window reopened
// it to an Exit Demo banner over their real data.
//
// Now the expensive half happens first and off-thread, and the snapshot is
// written only once the demo payload is in hand, so the inconsistent window
// is the microseconds between two localStorage writes rather than several
// seconds of frozen UI.
let entryInFlight = false;

export async function enterDemoMode({ landOnTab = null, onProgress = null, household = DEMO_HOUSEHOLD_DEFAULT } = {}) {
  if (isDemoModeActive()) return false; // never snapshot a demo over a snapshot
  if (entryInFlight) return false;      // a second click while the first is still simulating
  entryInFlight = true;
  try {
    // Quick payload: no simulations before the reload (see above). onProgress
    // is still reported once so an entry button's progress UI completes.
    const { buildQuickDemoPayload } = await import('./demoPayload');
    const householdId = canonicalDemoHousehold(household);
    const demoPayload = buildQuickDemoPayload(householdId);
    if (onProgress) { try { onProgress(1, 1); } catch { /* progress is cosmetic */ } }
    // Snapshot LAST, and from the user's state as it is right now.
    // The exact copy first: building the backup snapshot can itself write
    // (the freshness record notes when it first saw this browser).
    const rawStorage = captureRawStorage();
    const snapshot = buildFullBackupPayload();
    const record = { active: true, enteredAt: new Date().toISOString(), household: householdId, snapshot };
    try {
      localStorage.setItem(DEMO_MODE_KEY, JSON.stringify({ ...record, rawStorage }));
    } catch {
      // The exact copy doubles what is stored; on a browser near its quota,
      // fall back to the plan snapshot alone (the pre-324 behavior).
      try {
        localStorage.setItem(DEMO_MODE_KEY, JSON.stringify(record));
      } catch (e) {
        // Quota or storage failure: refuse to enter rather than proceed
        // without an escape hatch. Nothing has been modified yet.
        console.error('Demo mode: could not store the safety snapshot; not entering.', e);
        return false;
      }
    }
    // isPremium: true here is NOT an entitlement decision -- it tells
    // applyFullBackupToStorage to write the demo HOLDINGS (which the
    // read-only preview needs on screen). The premium gate itself is
    // untouched: no JWT is written, and mutations still require the real
    // entitlement.
    applyFullBackupToStorage(demoPayload, { isPremium: true });
    if (landOnTab) {
      try { window.location.hash = `#/${landOnTab}`; } catch { /* hash is cosmetic */ }
    }
    window.location.reload();
    return true;
  } finally {
    entryInFlight = false;
  }
}

// Exit: restore the snapshot, clear the key, reload. The snapshot restore
// also passes isPremium: true -- the user's own holdings were already in
// this browser before the demo, so putting them back is not an
// entitlement question either.
export function exitDemoMode() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(DEMO_MODE_KEY) || 'null');
  } catch {
    stored = null;
  }
  if (stored && stored.rawStorage && typeof stored.rawStorage === 'object') {
    restoreRawStorage(stored.rawStorage);
  } else if (stored && stored.snapshot) {
    // restorePricingSource: the snapshot is this browser's own connection.
    applyFullBackupToStorage(stored.snapshot, { isPremium: true, restorePricingSource: true });
    // A backup does not carry the cached Monte Carlo result; left behind it
    // shows the Carters' likely range on the restored plan.
    try { localStorage.removeItem('retire_plan_monte_carlo_v1'); } catch { /* best effort */ }
  }
  // Even with no snapshot (corrupted key), clearing + reload still leaves
  // the app in a consistent state rather than trapped in demo mode.
  localStorage.removeItem(DEMO_MODE_KEY);
  window.location.reload();
  return true;
}
