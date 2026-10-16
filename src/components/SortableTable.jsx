import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export function SortableTh({ label, sortKey, sort, onSort, align = 'left', style = {} }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : (sort.dir === 'asc' ? ArrowUp : ArrowDown);
  return (
    <th style={{ padding: 0, textAlign: align, ...style }} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Sort by ${label}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '8px', font: 'inherit', fontWeight: 600,
          color: active ? 'var(--text-primary)' : 'inherit', display: 'inline-flex', alignItems: 'center', gap: '4px',
          width: '100%', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', whiteSpace: 'nowrap',
        }}
      >
        {label}
        <Icon size={12} style={{ opacity: active ? 1 : 0.45, flexShrink: 0 }} aria-hidden="true" />
      </button>
    </th>
  );
}
