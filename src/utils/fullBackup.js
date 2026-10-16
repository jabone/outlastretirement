// One-button "everything necessary to get back to a normal state" backup.
//
// Why this exists (2026-08-18): a user lost all of their plan data after
// restarting their browser (to grant a browser-automation extension
// permission) -- the app's only advertised save mechanism was a "Saved to
// Browser Cache" indicator in the Sidebar, which is true right up until
// something clears that cache (a fresh browser profile, "Clear browsing
// data," a private/incognito window, switching machines, etc.), at which
// point there is nothing left to restore from. This app was already
// designed to store everything in localStorage rather than phone anything
// home (see the privacy note on sanitizeImportedHoldings below), which is
// good for privacy but means the ONLY durable copy of a user's plan is
// whatever file they proactively exported -- and the existing "Cloud
// Backup & Sync" export (Ledger & Tools -> Scenario Profile Manager) was
// easy to miss entirely if you never opened that tab.
//
// This module is the single source of truth for what "everything" means,
// used both by that existing Ledger & Tools export/import AND by a new,
// much more prominent Sidebar button (visible from every tab) so there is
// no way to be several clicks deep in a tab you don't normally use before
// discovering a backup button exists.
//
// Deliberately reads/writes localStorage directly rather than going
// through each feature's own React state (App.jsx's inputs/scenarios,
// usePortfolioHoldings.js's holdings/liquidations, InterviewTab.jsx's
// progress) for two reasons: (1) every one of those already mirrors its
// state to localStorage synchronously via its own useEffect on every
// change, so localStorage is always current to within one React commit --
// there's nothing to gain from threading live state through here instead;
// and (2) it lets this same code run from anywhere (the Sidebar is mounted
// alongside whichever tab is active, not just Ledger & Tools) without
// creating a second, independent instance of usePortfolioHoldings's state
// alongside PortfolioTab/LedgerTab's own instance -- two independent React
// state copies backed by the same localStorage key is exactly the kind of
// bug this file exists to avoid introducing.
import { INPUTS_SCHEMA_VERSION, DEFAULT_INPUTS, migrateInputs, migrateScenarios } from '../calculator';
import { sanitizeImportedHoldings, sanitizeImportedLiquidations } from './holdingsCore';
import { loadPricingSource, isAllowedPricingUrl } from './pricingSource';
import { getFreshnessState, recordBackup, restoreFreshnessState, FRESHNESS_KEY } from './dataFreshness';
import { encryptBackupPayload, isEncryptedBackup } from './backupCrypto';
import { LIFE_PLAN_STORAGE_KEY, readLifePlan } from '../config/lifePlan';
import { REVIEW_KEY } from './annualReview';
import { RECONCILIATION_KEY, sanitizeReconciliations } from './reconciliationLog';

// Every localStorage key this backup covers, and why each one does or does
// not belong in "everything necessary to get back to a normal state":
//
//   Included -- this IS the plan, losing it means starting over:
//     retire_plan_inputs             the active plan itself
//     retire_plan_scenarios          every saved "what-if" scenario
//     cfe_premium_holdings_v1        Detailed Holdings (Premium tab)
//     cfe_premium_liquidations_v1    the sale/liquidation audit trail
//     retire_plan_interview_progress Full Interview wizard's current step
//     cfe_premium_pricing_source_v1  Live Pricing's Google Sheet CSV/Script
//                                    URLs -- previously excluded from Cloud
//                                    Backup & Sync on purpose (a per-browser
//                                    connection setting shouldn't silently
//                                    overwrite a different browser's own
//                                    Sheet on restore), but recovering from
//                                    total data loss on the SAME browser is
//                                    exactly the case where you *do* want
//                                    this restored rather than having to
//                                    redo the whole Google Sheet/Apps
//                                    Script setup from the README again.
//
//     cfe_premium_jwt                 Premium Access Key -- a live credential,
//                                    not plan data. Included as of 2026-08-18
//                                    at the user's explicit request, so a
//                                    full restore doesn't also require
//                                    re-pasting the key by hand. This is a
//                                    real security tradeoff (a downloaded
//                                    backup file now carries a working
//                                    access token, so it should be handled
//                                    with the same care as a password file
//                                    -- not emailed or stored somewhere
//                                    shared) -- summarizeBackupPayload()
//                                    always names it explicitly when
//                                    present so it's never silently bundled
//                                    without the user seeing that in the
//                                    pre-download/pre-restore preview.
//                                    Premium is currently a hand-issued
//                                    key (see utils/premiumJwt.js), not
//                                    real billing, so
//                                    today's actual exposure is low -- but
//                                    this same code path will carry the
//                                    real credential once real billing
//                                    exists, so treat the tradeoff as real.
//
//   Also included (2026-08-23), read via dataFreshness.js rather than a
//   KEYS entry:
//     cfe_data_freshness_v1          when the plan was last backed up and
//                                    the portfolio last reconciled, plus
//                                    the reminder cadence -- the dates ARE
//                                    a record, same argument as the estate
//                                    checklist's.
//
//   Also included (Life Plan, annual review): cfe_life_plan_v1 and
//   retire_plan_annual_review_v1 -- real thinking and a dated record, same
//   argument as the estate checklist. They were declared here but never
//   copied until the Oct 2026 move off cashflowengine.app showed that
//   Backup then Restore silently dropped them.
//
//   The authoritative classification of every key is storageKeys.js;
//   storageKeys.test.js fails when a PLAN key there is missing from the
//   payload built below.
//
//   Deliberately still excluded:
//     retire_plan_theme, retire_plan_large_text,
//     retire_plan_sidebar, retire_plan_disclaimer_accepted,
//     retire_plan_onboarding_completed, retire_plan_whatsnew_*,
//     retire_plan_last_quick_update
//                        cosmetic/local-dev preferences with no bearing on
//                        "is my plan intact" -- restoring these would just
//                        as likely fight a setting the user has since
//                        changed on this browser as help them.
const KEYS = {
  inputs: 'retire_plan_inputs',
  scenarios: 'retire_plan_scenarios',
  holdings: 'cfe_premium_holdings_v1',
  liquidations: 'cfe_premium_liquidations_v1',
  interviewProgress: 'retire_plan_interview_progress',
  // Real-world paperwork progress, deliberately NOT part of `inputs` (see
  // EstateChecklist.jsx). Included here because losing it means losing an
  // actual record of when you last checked a beneficiary form -- the whole
  // reason the feature has dates.
  estateChecklist: 'cfe_estate_checklist_v1',
  // The non-financial "what will you do" page. Same reasoning as the
  // estate checklist: real thinking the user did, not a plan assumption.
  lifePlan: LIFE_PLAN_STORAGE_KEY,
  // The annual review's per-plan-year "done" ticks (annualReview.js).
  annualReview: REVIEW_KEY,
  // Which accounts the person marked reconciled, for which periods
  // (reconciliation.js). A record they made by hand: it must travel.
  reconciliations: RECONCILIATION_KEY,
  pricingSource: 'cfe_premium_pricing_source_v1',
  // Raw string, not JSON -- read/written directly with localStorage.get/
  // setItem below, never through readJSON (which would JSON.parse it and
  // throw on a plain token string).
  premiumJwt: 'cfe_premium_jwt',
};

export const FULL_BACKUP_VERSION = 'cfe-full-backup-1';

function readJSON(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    return JSON.parse(saved);
  } catch (e) {
    console.error(`Full backup: failed to read localStorage key "${key}"`, e);
    return fallback;
  }
}

// Builds the full payload as plain data -- kept separate from
// downloadFullBackup so tests (and the file-size/summary UI) can inspect
// the object directly without also triggering a browser download.
//
// `options.projectionSummary` is optional and comes from the caller, not
// localStorage -- it's a computed snapshot (peak/ending balance, success
// flag) that only exists as live React state (App.jsx's `kpis`), which is
// exactly the kind of thing this module otherwise avoids depending on (see
// the module comment above). Callers that already have `kpis` in scope
// (Sidebar, LedgerTab) pass it through; callers that don't (tests, or any
// future caller running outside a mounted simulation) simply omit it and
// the field is left out of the payload rather than guessed at.
export function buildFullBackupPayload(options = {}) {
  const rawInputs = readJSON(KEYS.inputs, null);
  const rawScenarios = readJSON(KEYS.scenarios, null);

  const storedWrapper = rawInputs && typeof rawInputs === 'object' && 'inputs' in rawInputs;
  return {
    version: FULL_BACKUP_VERSION,
    // The version the plan below was SAVED under, not this build's: the
    // file carries the stored inputs as they are, and a restore runs the
    // migrations that version needs. A plan still in an older shape (saved
    // by an older build and not yet reopened) must not be labeled current,
    // or its restore would skip the steps that convert it. A bare
    // (pre-versioning) plan is written with no version at all, which a
    // restore reads as exactly that.
    ...(storedWrapper
      ? { schemaVersion: rawInputs.schemaVersion }
      : rawInputs ? {} : { schemaVersion: INPUTS_SCHEMA_VERSION }),
    timestamp: new Date().toISOString(),
    // Tolerates both the current { schemaVersion, inputs } wrapper and a
    // bare inputs object, same as migrateInputs itself does on load.
    activeInputs: (rawInputs && typeof rawInputs === 'object' && 'inputs' in rawInputs) ? rawInputs.inputs : rawInputs,
    savedScenarios: Array.isArray(rawScenarios) ? rawScenarios : (rawScenarios?.scenarios ?? []),
    portfolioHoldings: readJSON(KEYS.holdings, []),
    liquidations: readJSON(KEYS.liquidations, []),
    interviewProgress: readJSON(KEYS.interviewProgress, null),
    estateChecklist: readJSON(KEYS.estateChecklist, null),
    lifePlan: readJSON(KEYS.lifePlan, null),
    annualReview: readJSON(KEYS.annualReview, null),
    reconciliations: readJSON(KEYS.reconciliations, null),
    pricingSource: loadPricingSource(),
    // Raw string, deliberately not run through readJSON -- see KEYS.premiumJwt.
    premiumJwt: localStorage.getItem(KEYS.premiumJwt) || null,
    // "When was this last reconciled/backed up" record (dataFreshness.js)
    // -- same argument as estateChecklist: the dates ARE the data.
    dataFreshness: getFreshnessState(),
    ...(options.projectionSummary ? { projectionSummary: options.projectionSummary } : {}),
  };
}

// A short, human-readable summary of what a payload contains -- used both
// to describe what's about to download and, on restore, what's about to
// be overwritten, so "one button" doesn't mean "one blind click."
// Every count is of what a restore would actually keep (null and garbage
// entries a restore drops are not counted), and a string is never taken
// from the file without checking it is one.
export function summarizeBackupPayload(payload) {
  const parts = [];
  if (isPlainObject(payload.activeInputs)) parts.push('your active plan');
  const scenarioCount = scenarioList(payload.savedScenarios).filter(isPlainObject).length;
  if (scenarioCount > 0) {
    parts.push(`${scenarioCount} saved scenario${scenarioCount === 1 ? '' : 's'}`);
  }
  if (Array.isArray(payload.portfolioHoldings) && payload.portfolioHoldings.length > 0) {
    const n = payload.portfolioHoldings.filter(isPlainObject).length;
    if (n > 0) parts.push(`${n} Detailed Holdings`);
  }
  if (Array.isArray(payload.liquidations) && payload.liquidations.length > 0) {
    const n = payload.liquidations.filter(isPlainObject).length;
    if (n > 0) parts.push(`${n} liquidation record${n === 1 ? '' : 's'}`);
  }
  if (hasPricingConnection(payload.pricingSource)) parts.push('your Live Pricing Sheet connection');
  const checklistTicks = isPlainObject(payload.estateChecklist) ? Object.values(payload.estateChecklist).filter(v => v?.done === true).length : 0;
  if (checklistTicks > 0) parts.push(`${checklistTicks} estate checklist item${checklistTicks === 1 ? '' : 's'}`);
  const lifePlanAnswers = Object.values(sanitizeLifePlan(payload.lifePlan)).filter((e) => e.text).length;
  if (lifePlanAnswers > 0) parts.push(`${lifePlanAnswers} Life Plan answer${lifePlanAnswers === 1 ? '' : 's'}`);
  if (Object.keys(sanitizeAnnualReview(payload.annualReview)).length > 0) parts.push('your annual review record');
  if (Object.keys(sanitizeReconciliations(payload.reconciliations)).length > 0) parts.push('your statement reconciliation record');
  // Always named explicitly, never folded silently into "your active plan"
  // -- a live credential being included is exactly the kind of thing this
  // preview exists to surface before the user downloads or restores.
  if (looksLikeJwt(payload.premiumJwt)) parts.push('your Premium Access credential');
  return parts.length > 0 ? parts.join(', ') : 'no plan data yet';
}

function triggerJsonDownload(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadFullBackup(options = {}) {
  const payload = buildFullBackupPayload(options);
  triggerJsonDownload(payload, `outlastretirement_full_backup_${new Date().toISOString().slice(0, 10)}.json`);
  // A durable copy just left the browser -- reset the backup-staleness
  // clock (dataFreshness.js). Done here, not in each caller, so every
  // download path (Sidebar, Preferences, Ledger & Tools) counts.
  recordBackup();
  return payload;
}

// Same payload as downloadFullBackup, wrapped in a password-protected
// envelope (backupCrypto.js) before it touches disk. Returns the PLAIN
// payload so the caller can describe what went into the file; the plain
// text is never written anywhere. Async because key derivation is.
export async function downloadEncryptedFullBackup(password, options = {}) {
  const payload = buildFullBackupPayload(options);
  const envelope = await encryptBackupPayload(payload, password);
  triggerJsonDownload(envelope, `outlastretirement_encrypted_backup_${new Date().toISOString().slice(0, 10)}.json`);
  recordBackup();
  return payload;
}

// Accept anything that looks like either backup shape (the full one, or
// the older Ledger & Tools "Export JSON") -- both use the same
// activeInputs/savedScenarios/portfolioHoldings/liquidations field names,
// so a file exported by either button restores fully. Reject anything
// that has none of them -- almost certainly the wrong file (e.g.
// "Download Config," which is export-only and was never meant as a
// restore point). Exported so the restore path can run the same check on
// the contents of an encrypted file once it has been opened.
export function assertBackupShape(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file is not a valid backup (not a JSON object).');
  }
  if (parsed.activeInputs === undefined && parsed.portfolioHoldings === undefined && parsed.savedScenarios === undefined) {
    throw new Error("That file doesn't look like a OutlastRetirement backup — no plan, scenarios, or holdings found in it.");
  }
  return parsed;
}

// Resolves with either a plain backup payload (shape-checked) or, for a
// password-protected file, the untouched encrypted envelope -- check with
// isEncryptedBackup() and decrypt before using it. Asking for the password
// is the caller's job; this module has no UI.
export function parseFullBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.target.result);
      } catch {
        reject(new Error('Invalid file format. Please upload a valid backup JSON file.'));
        return;
      }
      if (isEncryptedBackup(parsed)) {
        resolve(parsed);
        return;
      }
      try {
        resolve(assertBackupShape(parsed));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

// --- Restore -------------------------------------------------------------
//
// A backup file is untrusted input: it may be hand-edited, truncated,
// from an older build, or crafted. Before this was hardened, one holding
// whose symbol was an object replaced every view (Preferences included)
// with the crash screen, a scenario named with an object crashed six
// views, and savedScenarios: [null] threw half-way through a restore whose
// plan had already been written. So a restore now happens in two phases:
//
//   1. STAGE: every section is validated and coerced into the shape the
//      app reads (strings are strings, lists are lists, garbage entries
//      are dropped) and turned into the exact bytes to write. Nothing
//      touches storage. A section that cannot be made safe fails the whole
//      restore with a message, before anything is written.
//   2. COMMIT: every key's current value is remembered, then the staged
//      values are written. If any write fails (storage full), every key
//      touched is put back as it was: a restore is all or nothing.

// Whether a restore should actually overwrite portfolioHoldings/
// liquidations (the premium Detailed Holdings data) with the backup
// file's copy, vs. leave whatever's already on this browser untouched.
// True if this browser is already premium right now, OR if the file
// carries a Premium key that is itself going to be restored (the caller
// verifies the key's signature first and passes the answer as
// fileKeyValid). False otherwise: without premium (before or after this
// restore), there's no tab to view or edit that data on, so overwriting
// it would just silently change any Initial Balances fields currently
// linked to it (see calculator.js's initialBalancesSource comment) with
// no way to see why. Exported so callers can warn about a skip in their
// confirm dialog *before* committing to the restore.
//
// fileKeyValid defaults to a shape check only (three dot-separated
// base64url parts), which is what the synchronous demo path needs; the
// interactive restore passes the result of a real signature check.
export function willRestorePremiumHoldings(parsed, currentIsPremium, fileKeyValid = looksLikeJwt(parsed?.premiumJwt)) {
  return Boolean(currentIsPremium) || Boolean(fileKeyValid);
}

export class BackupRestoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupRestoreError';
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Accepts a bare list or the versioned { scenarios: [...] } wrapper.
function scenarioList(v) {
  if (Array.isArray(v)) return v;
  if (isPlainObject(v) && Array.isArray(v.scenarios)) return v.scenarios;
  return [];
}

export function looksLikeJwt(v) {
  return typeof v === 'string' && v.length < 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
}

function hasPricingConnection(src) {
  return isPlainObject(src) && (
    (typeof src.csvUrl === 'string' && src.csvUrl !== '') ||
    (typeof src.scriptUrl === 'string' && src.scriptUrl !== '')
  );
}

// The pricing links as the restore dialog should show them: strings only,
// and whether each passes the Live Pricing allowlist.
export function describePricingSource(src) {
  const csvUrl = isPlainObject(src) && typeof src.csvUrl === 'string' ? src.csvUrl : '';
  const scriptUrl = isPlainObject(src) && typeof src.scriptUrl === 'string' ? src.scriptUrl : '';
  return {
    csvUrl,
    scriptUrl,
    present: Boolean(csvUrl || scriptUrl),
    allowed: (!csvUrl || isAllowedPricingUrl(csvUrl)) && (!scriptUrl || isAllowedPricingUrl(scriptUrl)) && Boolean(csvUrl || scriptUrl),
  };
}

function finiteOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function textOr(v, fallback) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

// The plan object migrateInputs expects. A backup file always carries the
// bare inputs in activeInputs; the top-level schemaVersion says which
// version they were saved under. A file WITHOUT a top-level schemaVersion
// (hand-built, or from an old export) used to be handed over as
// { schemaVersion: undefined, inputs }, which migrateInputs does not
// unwrap -- so defaults were spread over the wrapper and the file restored
// as the default plan. Unversioned inputs are passed bare, which
// migrateInputs treats as a legacy plan. A file whose activeInputs is
// itself a stored { schemaVersion, inputs } wrapper is passed as is.
function stageInputs(activeInputs, schemaVersion) {
  if (!isPlainObject(activeInputs)) {
    throw new BackupRestoreError("The plan in this file isn't readable, so nothing was restored.");
  }
  // Kinds are checked before the migrations too: they read list entries
  // (heirs) and would throw on a null one.
  let persisted;
  if (activeInputs.schemaVersion !== undefined && isPlainObject(activeInputs.inputs)) {
    persisted = { ...activeInputs, inputs: coerceInputShapes(activeInputs.inputs) };
  } else if (schemaVersion !== undefined) {
    persisted = { schemaVersion, inputs: coerceInputShapes(activeInputs) };
  } else {
    persisted = coerceInputShapes(activeInputs);
  }
  const migrated = coerceInputShapes(migrateInputs(persisted));
  return { schemaVersion: INPUTS_SCHEMA_VERSION, inputs: migrated };
}

// Every plan field keeps the KIND of value its default has, so no view is
// handed an object where it renders a number or a string (React refuses to
// render an object and the whole app went to the crash screen). Only the
// kind is checked, never the value: a numeric string stays (the fields
// hold what was typed), a huge number stays (the engine clamps), and
// migrateInputs has already done every real migration. A value of the
// wrong kind falls back to that field's default. List fields keep only
// their object entries; object fields must be objects.
function coerceInputShapes(inputs) {
  const out = { ...inputs };
  for (const [key, def] of Object.entries(DEFAULT_INPUTS)) {
    const v = out[key];
    if (v === undefined) continue;
    if (typeof def === 'number') {
      if (!((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string' || v === null)) out[key] = def;
    } else if (typeof def === 'string') {
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = String(v);
      else if (typeof v !== 'string') out[key] = def;
    } else if (typeof def === 'boolean') {
      if (typeof v !== 'boolean') out[key] = (v === 'true' || v === 1) ? true : (v === 'false' || v === 0) ? false : def;
    } else if (Array.isArray(def)) {
      if (!Array.isArray(v)) out[key] = def;
      else if (typeof def[0] === 'number') out[key] = v.map((e, i) => ((typeof e === 'number' && Number.isFinite(e)) || typeof e === 'string' ? e : (def[i] ?? 0)));
      else out[key] = v.filter(isPlainObject);
    } else if (isPlainObject(def)) {
      if (!isPlainObject(v)) out[key] = def;
    } else if (def === null) {
      if (!(v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) out[key] = null;
    }
  }
  return out;
}

let mintedScenarioIds = 0;
function coerceScenario(sc) {
  const id = (typeof sc.id === 'string' && sc.id) || (typeof sc.id === 'number' && Number.isFinite(sc.id))
    ? sc.id
    : `restored-${Date.now()}-${(mintedScenarioIds += 1)}`;
  const m = isPlainObject(sc.metrics) ? sc.metrics : null;
  const out = {
    ...sc,
    id,
    name: textOr(sc.name, 'Untitled scenario'),
    inputs: isPlainObject(sc.inputs) ? coerceInputShapes(sc.inputs) : {},
    // Only a numeric endingBalance counts as metrics; anything else is
    // recomputed by migrateScenarios from the scenario's own inputs.
    metrics: m && typeof m.endingBalance === 'number' && Number.isFinite(m.endingBalance)
      ? {
        endingBalance: m.endingBalance,
        isSuccessful: m.isSuccessful === true,
        peakPortfolioWorth: finiteOr(m.peakPortfolioWorth, m.endingBalance),
        successProbability: finiteOr(m.successProbability, null),
      }
      : (m && finiteOr(m.successProbability, null) !== null ? { successProbability: m.successProbability } : undefined),
  };
  if (out.metrics === undefined) delete out.metrics;
  if (sc.tag !== undefined) { if (typeof sc.tag === 'string') out.tag = sc.tag; else delete out.tag; }
  if (sc.planYearAtSave !== undefined) { const y = finiteOr(sc.planYearAtSave, null); if (y === null) delete out.planYearAtSave; else out.planYearAtSave = y; }
  if (sc.savedAt !== undefined && typeof sc.savedAt !== 'string') delete out.savedAt;
  return out;
}

function stageScenarios(saved) {
  if (!Array.isArray(saved) && !(isPlainObject(saved) && Array.isArray(saved.scenarios))) {
    throw new BackupRestoreError("The saved scenarios in this file aren't readable, so nothing was restored.");
  }
  const list = scenarioList(saved).filter(isPlainObject).map(coerceScenario);
  return migrateScenarios(list).map((sc) => ({ ...sc, inputs: coerceInputShapes(sc.inputs) }));
}

// sanitizeImportedHoldings does the real work (and is hardened on its
// own); this only makes sure what it receives is objects whose display
// strings are strings and whose list fields are lists, so no single odd
// holding can take a view down.
const HOLDING_TEXT_FIELDS = ['symbol', 'name', 'account', 'institution', 'notes', 'pricingSymbol', 'researchUrl'];
const HOLDING_NUMBER_FIELDS = ['shares', 'avgBuyPrice', 'currentPrice'];
const HOLDING_LIST_FIELDS = ['lots', 'dividendHistory', 'distributionEvents', 'priceHistory'];
function coerceHolding(h) {
  const out = { ...h };
  if (h.id !== undefined && typeof h.id !== 'string') delete out.id;
  for (const f of HOLDING_TEXT_FIELDS) if (f in h && typeof h[f] !== 'string') out[f] = textOr(h[f], '');
  for (const f of HOLDING_NUMBER_FIELDS) if (f in h) out[f] = finiteOr(typeof h[f] === 'string' ? Number(h[f]) : h[f], 0);
  for (const f of HOLDING_LIST_FIELDS) if (f in h && !Array.isArray(h[f])) delete out[f];
  if ('pricingAnchor' in h && h.pricingAnchor !== null && !isPlainObject(h.pricingAnchor)) out.pricingAnchor = null;
  return out;
}

function stageHoldings(list) {
  return sanitizeImportedHoldings(list.filter(isPlainObject).map(coerceHolding));
}

function stageLiquidations(list) {
  return sanitizeImportedLiquidations(list.filter(isPlainObject).map((l) => {
    const out = { ...l };
    for (const f of ['symbol', 'name', 'date', 'account', 'notes']) if (f in l && typeof l[f] !== 'string') out[f] = textOr(l[f], '');
    for (const f of ['shares', 'proceeds', 'price', 'costBasis', 'gain']) if (f in l && l[f] !== null && !(typeof l[f] === 'number' && Number.isFinite(l[f]))) out[f] = 0;
    return out;
  }));
}

// { [itemId]: { done: boolean, completedAt: string|null } }
function sanitizeChecklist(v) {
  const out = {};
  if (!isPlainObject(v)) return out;
  for (const [id, entry] of Object.entries(v)) {
    if (!isPlainObject(entry) || id === '__proto__') continue;
    out[id] = { done: entry.done === true, completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : null };
  }
  return out;
}

// Same cleaning the Life Plan page applies when it reads its own key.
export function sanitizeLifePlan(v) {
  if (!isPlainObject(v)) return {};
  let raw;
  try { raw = JSON.stringify(v); } catch { return {}; }
  return readLifePlan({ getItem: () => raw });
}

// { [planYear]: { done: { [stepId]: isoDate }, completedAt: isoDate|null } }
function sanitizeAnnualReview(v) {
  const out = {};
  if (!isPlainObject(v)) return out;
  for (const [year, rec] of Object.entries(v)) {
    if (!/^\d{4}$/.test(year) || !isPlainObject(rec)) continue;
    const done = {};
    if (isPlainObject(rec.done)) {
      for (const [step, date] of Object.entries(rec.done)) if (typeof date === 'string' && step !== '__proto__') done[step] = date;
    }
    out[year] = { done, completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : null };
  }
  return out;
}

function sanitizeInterviewProgress(v) {
  if (!isPlainObject(v)) return null;
  return {
    current: typeof v.current === 'string' ? v.current : 'household',
    visited: Array.isArray(v.visited) ? v.visited.filter((x) => typeof x === 'string') : [],
  };
}

function sanitizeFreshness(v) {
  if (!isPlainObject(v)) return undefined;
  const out = {};
  if (Number.isFinite(v.lastPortfolioUpdateAt)) out.lastPortfolioUpdateAt = v.lastPortfolioUpdateAt;
  if (typeof v.portfolioReminderCadence === 'string') out.portfolioReminderCadence = v.portfolioReminderCadence;
  return out;
}

// Phase 1. Returns { writes: [[key, string]], restored: [labels] } and
// throws BackupRestoreError (having written nothing) when the file cannot
// be restored safely.
//
// options.isPremium -- whether THIS browser is premium right now.
// options.premiumKeyValid -- whether the file's Premium key verified
//   (the interactive restore checks the signature; defaults to a shape
//   check). An invalid key is never written: it would replace a working
//   key on this browser with one that does nothing.
// options.restorePricingSource -- the user switched on "Also restore my
//   Live Pricing connection". Off by default: a restore never re-points
//   Live Pricing unless the user saw both links and asked for it.
export function stageFullBackup(parsed, options = {}) {
  if (!isPlainObject(parsed)) throw new BackupRestoreError('That file is not a valid backup (not a JSON object).');
  const { isPremium = false, restorePricingSource = false } = options;
  const premiumKeyValid = options.premiumKeyValid ?? looksLikeJwt(parsed.premiumJwt);
  const restorePremiumData = willRestorePremiumHoldings(parsed, isPremium, premiumKeyValid);
  const writes = [];
  const restored = [];

  try {
    if (parsed.activeInputs !== undefined && parsed.activeInputs !== null) {
      writes.push([KEYS.inputs, JSON.stringify(stageInputs(parsed.activeInputs, parsed.schemaVersion))]);
      restored.push('active plan');
    }

    if (parsed.savedScenarios !== undefined && parsed.savedScenarios !== null) {
      const migrated = stageScenarios(parsed.savedScenarios);
      writes.push([KEYS.scenarios, JSON.stringify({ schemaVersion: INPUTS_SCHEMA_VERSION, scenarios: migrated })]);
      restored.push(`${migrated.length} saved scenario${migrated.length === 1 ? '' : 's'}`);
    }

    if (Array.isArray(parsed.portfolioHoldings)) {
      if (restorePremiumData) {
        const sanitized = stageHoldings(parsed.portfolioHoldings);
        writes.push([KEYS.holdings, JSON.stringify(sanitized)]);
        restored.push(`${sanitized.length} Detailed Holdings`);
      } else if (parsed.portfolioHoldings.length > 0) {
        restored.push(`skipped ${parsed.portfolioHoldings.length} Detailed Holdings (Premium Access required — left this browser's existing holdings, if any, untouched)`);
      }
    }

    if (Array.isArray(parsed.liquidations)) {
      if (restorePremiumData) {
        const sanitized = stageLiquidations(parsed.liquidations);
        writes.push([KEYS.liquidations, JSON.stringify(sanitized)]);
        restored.push(`${sanitized.length} liquidation record${sanitized.length === 1 ? '' : 's'}`);
      } else if (parsed.liquidations.length > 0) {
        restored.push(`skipped ${parsed.liquidations.length} liquidation record${parsed.liquidations.length === 1 ? '' : 's'} (Premium Access required)`);
      }
    }

    if (isPlainObject(parsed.estateChecklist)) {
      writes.push([KEYS.estateChecklist, JSON.stringify(sanitizeChecklist(parsed.estateChecklist))]);
    }
    const progress = sanitizeInterviewProgress(parsed.interviewProgress);
    if (progress) writes.push([KEYS.interviewProgress, JSON.stringify(progress)]);

    if (isPlainObject(parsed.lifePlan)) {
      writes.push([KEYS.lifePlan, JSON.stringify(sanitizeLifePlan(parsed.lifePlan))]);
      restored.push('your Life Plan');
    }
    if (isPlainObject(parsed.annualReview)) {
      writes.push([KEYS.annualReview, JSON.stringify(sanitizeAnnualReview(parsed.annualReview))]);
    }
    if (isPlainObject(parsed.reconciliations)) {
      writes.push([KEYS.reconciliations, JSON.stringify(sanitizeReconciliations(parsed.reconciliations))]);
    }

    // Only when asked (see options above), only when the file actually has
    // a connection (an older file without one must not disconnect a Sheet
    // working here), and only links that pass the same Google-only check
    // the Live Pricing fields apply.
    if (restorePricingSource && hasPricingConnection(parsed.pricingSource)) {
      const src = describePricingSource(parsed.pricingSource);
      if (!src.allowed) {
        throw new BackupRestoreError("The Live Pricing links in this file aren't Google Sheet or Apps Script addresses, so nothing was restored. Restore again with Live Pricing switched off.");
      }
      writes.push([KEYS.pricingSource, JSON.stringify({ csvUrl: src.csvUrl, scriptUrl: src.scriptUrl })]);
      restored.push('Live Pricing Sheet connection');
    }

    // Same "only overwrite if the file actually has one" guard: an older
    // backup won't carry a key, and a key that failed verification must
    // not sign this browser out of a Premium key that still works.
    if (premiumKeyValid && looksLikeJwt(parsed.premiumJwt)) {
      writes.push([KEYS.premiumJwt, parsed.premiumJwt]);
      restored.push('your Premium Access credential');
    }
  } catch (err) {
    if (err instanceof BackupRestoreError) throw err;
    console.error('Restore: a section of the backup could not be read', err);
    throw new BackupRestoreError("Part of this backup file couldn't be read, so nothing was restored. Your current data is unchanged.");
  }

  return { writes, restored, freshness: sanitizeFreshness(parsed.dataFreshness) };
}

// Phase 2. All or nothing: on any failed write, every key touched
// (including the freshness record) goes back to what it was.
export function commitStagedBackup(staged, storage = globalThis.localStorage) {
  const touched = [...staged.writes.map(([k]) => k), FRESHNESS_KEY];
  const previous = new Map();
  for (const key of touched) {
    try { previous.set(key, storage.getItem(key)); } catch { previous.set(key, null); }
  }
  try {
    for (const [key, value] of staged.writes) storage.setItem(key, value);
    // Adopt the backup's freshness record: the portfolio clock keeps the
    // restored date -- restoring a stale plan doesn't make its numbers
    // current -- while the backup clock restarts now, because the data on
    // this browser IS the backup.
    restoreFreshnessState(staged.freshness);
  } catch (err) {
    for (const [key, value] of previous) {
      try {
        if (value === null) storage.removeItem(key); else storage.setItem(key, value);
      } catch { /* best effort: the original value was there a moment ago */ }
    }
    console.error('Restore: a write failed; every key was put back as it was', err);
    throw new BackupRestoreError("This browser's storage couldn't hold the backup (it may be full), so nothing was restored. Your current data is unchanged.");
  }
  return staged.restored;
}

// Validates everything, then writes everything or nothing. Returns the
// summary of what was restored; throws BackupRestoreError with a message
// for the user otherwise. The caller reloads the page right after this
// returns (see the module comment above for why a full reload is the more
// reliable recovery path) so every piece of state re-hydrates from a
// single consistent source instead of being patched in place.
export function applyFullBackupToStorage(parsed, options = {}) {
  return commitStagedBackup(stageFullBackup(parsed, options));
}
