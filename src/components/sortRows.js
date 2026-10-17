// Column sorting shared by every table in Detailed Holdings (and the
// ledger modal). Accessors return the comparable value for a row; strings
// compare with localeCompare, numbers numerically, and null/undefined
// ("--" cells) always sink to the bottom whichever way the sort runs.
export function sortRows(rows, accessors, { key, dir }) {
  const get = accessors[key];
  if (!get) return rows;
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a); const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return cmp * sign;
  });
}
