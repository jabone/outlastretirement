// Which inputs differ between plans (changelog 270).
//
// The Scenarios page compares outcomes; this says why they differ. Every
// key of the sanitized plans is compared by value (arrays and objects by
// content), and the keys whose values are not all the same come back
// with each plan's value, in DEFAULT_INPUTS order so related fields sit
// together. Labels are derived from the key -- good enough to read, and
// never out of date.
import { DEFAULT_INPUTS, sanitizeInputs } from '../calculator';

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
};

// "rothConversionStrategy" -> "Roth conversion strategy"; a trailing 1 or
// 2 becomes the person; a few tokens are spelled the way the app does.
const WORDS = { ss: 'SS', irmaa: 'IRMAA', aca: 'ACA', ltc: 'LTC', hsa: 'HSA', rmd: 'RMD', nqdc: 'NQDC', rsu: 'RSU', mc: 'Monte Carlo', magi: 'MAGI', cola: 'COLA', pct: '%', init: 'starting', tcja: 'TCJA', nua: 'NUA', qcd: 'QCD', mfs: 'MFS', fra: 'FRA', wr: 'withdrawal-rate', monte: 'Monte', carlo: 'Carlo' };
export function labelForKey(key) {
  const m = String(key).match(/^(.*?)([12])$/);
  const base = m ? m[1] : String(key);
  const who = m ? (m[2] === '1' ? ' (you)' : ' (spouse)') : '';
  const words = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[\s_]+/).filter(Boolean)
    .map((w) => WORDS[w.toLowerCase()] || w.toLowerCase());
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1) + who;
}

// A value as a person would read it in a table cell.
export function formatDiffValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : String(Math.round(v * 1000) / 1000);
  if (Array.isArray(v)) return v.length === 0 ? 'None' : `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return 'Set';
  return String(v);
}

// plans: [{ id, name, inputs }]. Returns [{ key, label, values: { [id]: value } }].
export function diffPlans(plans) {
  if (!Array.isArray(plans) || plans.length < 2) return [];
  const clean = plans.map((p) => ({ id: p.id, inputs: sanitizeInputs({ ...DEFAULT_INPUTS, ...(p.inputs || {}) }) }));
  const keys = Object.keys(DEFAULT_INPUTS);
  for (const c of clean) for (const k of Object.keys(c.inputs)) if (!keys.includes(k)) keys.push(k);
  const out = [];
  for (const key of keys) {
    const first = stable(clean[0].inputs[key]);
    if (clean.every((c) => stable(c.inputs[key]) === first)) continue;
    const values = {};
    for (const c of clean) values[c.id] = c.inputs[key];
    out.push({ key, label: labelForKey(key), values });
  }
  return out;
}

// True when two plans have identical inputs, by the same rule the table
// uses (changelog 328). The Scenarios page uses it to tell a current plan
// that is already saved from one with unsaved changes.
export function samePlan(a, b) {
  if (!a || !b) return false;
  return diffPlans([{ id: 'a', inputs: a }, { id: 'b', inputs: b }]).length === 0;
}

// A row's cells as text (changelog 328). Settings that are whole groups (a
// spending blueprint, say) all read "Set", so a row could show "Set" in
// every column while claiming they differ. When the cells would read the
// same, each distinct value gets a letter: "Set (A)", "Set (B)", "Set (A)"
// -- the same letter means the same setting.
export function diffCells(row, ids) {
  const text = ids.map((id) => formatDiffValue(row.values[id]));
  if (new Set(text).size > 1) return text;
  const letters = new Map();
  return ids.map((id, i) => {
    const k = stable(row.values[id]);
    if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + letters.size));
    return `${text[i]} (${letters.get(k)})`;
  });
}
