import { useState, useMemo, useCallback } from 'react';
import { sortRows } from './sortRows';

// { sort, toggle, sorted } for one table. `initial` is the default sort;
// clicking the active column flips direction, clicking another column
// starts it ascending (or descending when `descFirst` lists it -- amounts
// and percentages read best largest-first).
export function useColumnSort(rows, accessors, initial, { descFirst = [] } = {}) {
  const [sort, setSort] = useState(initial);
  const toggle = useCallback((key) => setSort((prev) => (
    prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: descFirst.includes(key) ? 'desc' : 'asc' }
  )), [descFirst]);
  const sorted = useMemo(() => sortRows(rows, accessors, sort), [rows, accessors, sort]);
  return { sort, toggle, sorted };
}
