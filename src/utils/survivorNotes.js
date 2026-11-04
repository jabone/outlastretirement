// A note to the survivor (What's New 492): what each spouse would want the
// other to know if they died first -- the intent behind the plan, in their
// own words. Printed only at the top of the Survivor's Guide written for the
// other spouse. What's New 493 adds, for both guides: where the money is
// kept (firms and account names, never numbers), whether to list the
// accounts from Detailed Holdings, and where the backup file is kept.
//
// Stored in its own browser key, not in `inputs`, the same reasoning as the
// Life Plan: changing a retirement age must not touch it, typing it must not
// re-run the engine, and it is not a plan setting, so "Every plan setting"
// never prints it. Plain text, never sent anywhere, carried in Backup
// Everything.
import { safeSetItem } from './safeStorage';

export const SURVIVOR_NOTES_KEY = 'cfe_survivor_notes_v1';
export const SURVIVOR_NOTE_MAX_LENGTH = 4000;
const SLOTS = ['from1', 'from2'];
export const ACCOUNT_KINDS = Object.freeze([
  ['retirement', 'Retirement account (IRA, 401(k), 403(b))'],
  ['roth', 'Roth account'],
  ['brokerage', 'Brokerage or investment account'],
  ['bank', 'Bank or credit union'],
  ['hsa', 'HSA'],
  ['insurance', 'Insurance or annuity'],
  ['pension', 'Pension'],
  ['other', 'Something else'],
]);
const KIND_IDS = new Set(ACCOUNT_KINDS.map(([k]) => k));
const MAX_ACCOUNTS = 40;
const str = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

// One "where the money is kept" row: { id, firm, kind, owner, note }.
function sanitizeAccount(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {
    id: typeof a.id === 'string' ? a.id.slice(0, 40) : `acct-${Math.random().toString(36).slice(2, 9)}`,
    firm: str(a.firm, 120),
    kind: KIND_IDS.has(a.kind) ? a.kind : 'other',
    owner: str(a.owner, 80),
    note: str(a.note, 300),
  };
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Only the two known slots, each { text, updatedAt } with text a string of
// at most SURVIVOR_NOTE_MAX_LENGTH characters (line breaks kept) and
// updatedAt a YYYY-MM-DD date; anything else is dropped.
export function sanitizeSurvivorNotes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const slot of SLOTS) {
    const e = raw[slot];
    if (!e || typeof e !== 'object' || typeof e.text !== 'string') continue;
    const text = e.text.replace(/\r\n?/g, '\n').slice(0, SURVIVOR_NOTE_MAX_LENGTH);
    if (!text.trim()) continue;
    out[slot] = { text, ...(typeof e.updatedAt === 'string' && DATE_RE.test(e.updatedAt) ? { updatedAt: e.updatedAt } : {}) };
  }
  if (Array.isArray(raw.accounts)) {
    const list = raw.accounts.map(sanitizeAccount).filter(Boolean).slice(0, MAX_ACCOUNTS);
    if (list.length) out.accounts = list;
  }
  if (raw.includeHoldings === false) out.includeHoldings = false;
  const app = str(raw.appNotes, 1000);
  if (app.trim()) out.appNotes = app;
  return out;
}

// Whether the guide lists the accounts from Detailed Holdings (on unless
// switched off).
export const includesHoldings = (state) => sanitizeSurvivorNotes(state).includeHoldings !== false;

// A new state with one field replaced (accounts, includeHoldings, appNotes).
export function setSurvivorField(state, key, value) {
  const next = { ...sanitizeSurvivorNotes(state), [key]: value };
  return sanitizeSurvivorNotes(next);
}

export function hasSurvivorNotes(raw) {
  const s = sanitizeSurvivorNotes(raw);
  return Boolean(s.from1 || s.from2 || s.accounts || s.appNotes);
}

export function readSurvivorNotes(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage ? storage.getItem(SURVIVOR_NOTES_KEY) : null;
    return raw ? sanitizeSurvivorNotes(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeSurvivorNotes(state, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return false;
  return safeSetItem(SURVIVOR_NOTES_KEY, JSON.stringify(sanitizeSurvivorNotes(state)), storage);
}

// The note the deceased spouse wrote for the survivor.
export function noteFrom(state, deceased) {
  return sanitizeSurvivorNotes(state)[deceased === 1 ? 'from1' : 'from2'] || null;
}

// A new state with one slot set (cleared when the text is blank), dated
// today when the text changed.
export function setSurvivorNote(state, from, text, today) {
  const slot = from === 1 ? 'from1' : 'from2';
  const cur = sanitizeSurvivorNotes(state);
  const next = { ...cur };
  const t = typeof text === 'string' ? text.replace(/\r\n?/g, '\n').slice(0, SURVIVOR_NOTE_MAX_LENGTH) : '';
  if (!t.trim()) { delete next[slot]; return next; }
  if (cur[slot]?.text === t) return state;
  next[slot] = { text: t, ...(today ? { updatedAt: today } : {}) };
  return next;
}
