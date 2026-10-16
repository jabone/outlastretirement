// Parsing and messages for NumberInput (see NumberInput.jsx for the rules).

// Returns { ok: true, value } | { ok: false, empty: true } | { ok: false }.
export function parseNumberText(text, { allowNegative = false } = {}) {
  if (text === null || text === undefined) return { ok: false, empty: true };
  let s = String(text).trim().replace(/\s+/g, '');
  if (s === '') return { ok: false, empty: true };
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) { negative = true; s = s.slice(1); }
  if (s.startsWith('$')) s = s.slice(1);
  if (!negative && (s.startsWith('-') || s.startsWith('−'))) { negative = true; s = s.slice(1); }
  if (s.endsWith('%')) s = s.slice(0, -1);
  // Plain digits, or digits grouped by commas in threes; then an optional
  // fraction. "12,5" and "48.000,50" are ambiguous between conventions and
  // are refused rather than guessed at.
  if (!/^(\d+|\d{1,3}(,\d{3})+)?(\.\d*)?$/.test(s) || s === '' || s === '.') return { ok: false };
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return { ok: false };
  if (negative && n !== 0 && !allowNegative) return { ok: false, negative: true };
  return { ok: true, value: negative ? -n : n };
}

export const fmt = (n, commas) => {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 1e8) / 1e8;
  return commas ? r.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(r);
};

export function rangeMessage({ min, max, kind }) {
  const noun = kind === 'year' ? 'a year' : kind === 'age' ? 'an age' : 'a number';
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (hasMin && hasMax) return `Enter ${noun} from ${fmt(min, kind === 'number')} to ${fmt(max, kind === 'number')}.`;
  if (hasMin) return `Enter ${noun} of ${fmt(min, kind === 'number')} or more.`;
  if (hasMax) return `Enter ${noun} of ${fmt(max, kind === 'number')} or less.`;
  return `Enter ${noun}.`;
}
