import React, { useState } from 'react';
import { CHANGELOG } from '../config/changelog';
import ChangelogEntry from './ChangelogEntry';

// The What's New history. The whole changelog runs to hundreds of entries, so
// the page shows the newest WHATS_NEW_PAGE of them, grouped by month, with a
// search box over every entry (title, summary and details) and a button that
// shows the next page of older ones.
export const WHATS_NEW_PAGE = 15;
const MONTH_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthOf = (date) => {
  const d = new Date(`${String(date || '').slice(0, 7)}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? 'Earlier' : MONTH_FMT.format(d);
};
export default function WhatsNewHistory({ entries = CHANGELOG }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(WHATS_NEW_PAGE);
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? entries.filter((e) => [e.title, e.summary, ...(e.items || [])].join(' ').toLowerCase().includes(needle))
    : entries;
  const shown = matches.slice(0, limit);
  const groups = [];
  for (const e of shown) {
    const m = monthOf(e.date);
    if (!groups.length || groups[groups.length - 1].month !== m) groups.push({ month: m, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="search"
          className="form-input"
          aria-label="Search What's New"
          placeholder="Search every update..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(WHATS_NEW_PAGE); }}
          style={{ flex: '1 1 260px', maxWidth: '420px' }}
        />
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
          {needle ? `${matches.length} matching ${matches.length === 1 ? 'update' : 'updates'}` : `Showing the newest ${shown.length} of ${entries.length}`}
        </span>
      </div>
      {groups.map((g) => (
        <section key={g.month} aria-label={g.month} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: 'var(--fs-lg)', fontWeight: 700, margin: '4px 0 0', color: 'var(--text-primary)' }}>{g.month}</h2>
          {g.items.map((entry) => (
            <div key={entry.id} className="glass-panel" style={{ padding: '20px 24px' }}>
              <ChangelogEntry entry={entry} headingSize="16px" />
            </div>
          ))}
        </section>
      ))}
      {shown.length === 0 && (
        <p style={{ color: 'var(--text-secondary)' }}>No updates match &ldquo;{q.trim()}&rdquo;. Try a shorter word.</p>
      )}
      {matches.length > shown.length && (
        <button type="button" className="btn-outline" onClick={() => setLimit((n) => n + WHATS_NEW_PAGE)} style={{ alignSelf: 'flex-start' }}>
          Show older ({matches.length - shown.length} more)
        </button>
      )}
    </div>
  );
}

