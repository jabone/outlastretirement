import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { renderBold } from './renderBold';
import { CHANGELOG_TONES } from './changelogTones';

// Shared rendering for one CHANGELOG entry (config/changelog.js), used by
// both the What's New popup and the Guide's What's New sub-tab.
//
// Design (changelog 106, the owner's call after the "too much for a user"
// discussion): every entry keeps its full detail, but leads with a
// one-sentence plain-English `summary`; the detailed `items` sit behind a
// per-entry "Details" expander. The popup becomes a five-second scan for
// returning users, while nothing is lost for anyone who wants the whole
// story.

const ChangelogEntry = ({ entry, defaultExpanded = false, headingSize = '15px' }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const tone = entry.tone && CHANGELOG_TONES[entry.tone];
  const wrapStyle = tone
    ? { background: tone.background, border: `1px solid ${tone.border}`, borderRadius: '10px', padding: '14px 16px' }
    : undefined;
  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' }}>
        <h3 style={{ fontSize: headingSize, fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>{entry.title}</h3>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', flexShrink: 0 }}>{entry.date}</span>
      </div>
      {entry.summary && (
        <p style={{ margin: '0 0 6px', fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{entry.summary}</p>
      )}
      {Array.isArray(entry.items) && entry.items.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-xs)', fontWeight: '600', color: 'var(--accent-text)' }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{expanded ? 'Hide details' : 'Details'}</span>
        </button>
      )}
      {expanded && Array.isArray(entry.items) && (
        <ul style={{ margin: '8px 0 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {entry.items.map((item, idx) => (
            <li key={idx} style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{renderBold(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChangelogEntry;
