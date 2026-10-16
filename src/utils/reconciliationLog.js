// --- "I reconciled this" ------------------------------------------------------
// A record the PERSON makes, per account and period, after checking the
// paper against their statement. Nothing sets it for them: not viewing the
// report, not printing it, not importing a statement.
//   { [periodKey]: { [account]: { at: ISO timestamp } } }
//
// The same record also holds how often each account's statement comes, under
// one reserved field that no period key can collide with (period keys start
// with a year):
//   { statementCadence: { [account]: 'quarter' | 'year' } }
// Monthly is the default and is stored as nothing. Some firms only issue
// calendar-quarter statements (John, 2026-10-05: T. Rowe Price, Vanguard), so
// a monthly review has nothing to check those accounts against.
export const RECONCILIATION_KEY = 'cfe_reconciliations_v1';
export const CADENCE_FIELD = 'statementCadence';
const LONGER_CADENCES = ['quarter', 'year'];
const RANK = { month: 0, quarter: 1, year: 2 };

// How often each account's statement comes: { [account]: 'quarter' | 'year' }.
export function statementCadences(all = readReconciliations()) {
  const v = all && all[CADENCE_FIELD];
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [account, kind] of Object.entries(v)) if (LONGER_CADENCES.includes(kind)) out[account] = kind;
  return out;
}
export const cadenceOf = (cadences, account) => (cadences && LONGER_CADENCES.includes(cadences[account]) ? cadences[account] : 'month');
// Is there a statement for this account covering a period of this kind? A
// quarterly account has none for a single month; it does for a quarter or a year.
export const statementCovers = (cadence, periodKind) => (RANK[periodKind] ?? 0) >= (RANK[cadence] ?? 0);
export function setStatementCadence(account, kind) {
  const all = readReconciliations();
  const next = { ...statementCadences(all) };
  if (LONGER_CADENCES.includes(kind)) next[account] = kind; else delete next[account];
  if (Object.keys(next).length > 0) all[CADENCE_FIELD] = next; else delete all[CADENCE_FIELD];
  return write(all);
}

export function readReconciliations() {
  try {
    const v = JSON.parse(localStorage.getItem(RECONCILIATION_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function write(all) {
  try { localStorage.setItem(RECONCILIATION_KEY, JSON.stringify(all)); } catch { /* storage unavailable: nothing to remember */ }
  return all;
}
export function markReconciled(periodKey, account, now = new Date()) {
  const all = readReconciliations();
  all[periodKey] = { ...(all[periodKey] || {}), [account]: { at: now.toISOString() } };
  return write(all);
}
export function unmarkReconciled(periodKey, account) {
  const all = readReconciliations();
  if (all[periodKey]) {
    const rest = { ...all[periodKey] };
    delete rest[account];
    if (Object.keys(rest).length > 0) all[periodKey] = rest; else delete all[periodKey];
  }
  return write(all);
}
// Keeps only well-formed entries (a restored backup is untrusted input).
export function sanitizeReconciliations(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const cadences = {};
  for (const [account, kind] of Object.entries(statementCadences(v))) {
    if (account !== '__proto__' && account.length <= 200) cadences[account] = kind;
  }
  if (Object.keys(cadences).length > 0) out[CADENCE_FIELD] = cadences;
  for (const [periodKey, accounts] of Object.entries(v)) {
    if (!/^\d{4}(-(0[1-9]|1[0-2]|Q[1-4]))?$/.test(periodKey) || !accounts || typeof accounts !== 'object' || Array.isArray(accounts)) continue;
    const kept = {};
    for (const [account, rec] of Object.entries(accounts)) {
      if (account === '__proto__' || account.length > 200) continue;
      if (rec && typeof rec === 'object' && typeof rec.at === 'string' && !Number.isNaN(Date.parse(rec.at))) kept[account] = { at: rec.at };
    }
    if (Object.keys(kept).length > 0) out[periodKey] = kept;
  }
  return out;
}
