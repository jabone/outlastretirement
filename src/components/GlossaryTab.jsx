import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { GLOSSARY } from '../config/glossary';
import { useSimulation } from '../context/useSimulation';

// Help → What does this mean? The retirement words in plain English
// (src/config/glossary.js). A term marked on screen opens here, scrolled to
// its entry (openGlossary in App.jsx).
const norm = (s) => String(s || '').toLowerCase();

export default function GlossaryTab() {
  const { glossaryTarget, openDictionary } = useSimulation();
  const [query, setQuery] = useState('');
  const entries = useMemo(() => {
    const q = norm(query).trim();
    const sorted = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));
    if (!q) return sorted;
    return sorted.filter((g) => [g.term, g.plain, ...(g.aliases || [])].some((t) => norm(t).includes(q)));
  }, [query]);

  // Scroll to the entry a term on screen asked for.
  useEffect(() => {
    if (!glossaryTarget || !glossaryTarget.id) return;
    setQuery('');
    const t = setTimeout(() => {
      const el = document.getElementById(`glossary-${glossaryTarget.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus({ preventScroll: true });
      }
    }, 50);
    return () => clearTimeout(t);
  }, [glossaryTarget]);

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }} data-testid="glossary">
      <div>
        <h2 style={{ fontSize: '20px', margin: 0 }}>What does this mean?</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', lineHeight: 1.6, maxWidth: '760px' }}>
          The retirement words this app uses, in plain English. A word with a dotted underline anywhere in the app opens its entry here. For what a particular field or card does, the Input Dictionary has the detail.
        </p>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '420px', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--card-border)', background: 'var(--bg-secondary)' }}>
        <Search size={16} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
        <span className="visually-hidden" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search the glossary</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, for example RMD or Roth"
          data-testid="glossary-search"
          style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text-primary)', font: 'inherit', outline: 'none' }}
        />
      </label>
      {entries.length === 0 && (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Nothing here matches. <button type="button" onClick={() => openDictionary(query)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--accent-text)', textDecoration: 'underline', cursor: 'pointer' }}>Search the Input Dictionary instead</button>
        </p>
      )}
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
        {entries.map((g) => (
          <div
            key={g.id}
            id={`glossary-${g.id}`}
            tabIndex={-1}
            data-testid={`glossary-${g.id}`}
            style={{
              padding: '14px 16px', borderRadius: '10px', background: 'var(--bg-secondary)',
              border: `1px solid ${glossaryTarget && glossaryTarget.id === g.id ? 'var(--accent-text)' : 'var(--card-border)'}`,
            }}
          >
            <dt style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{g.term}</dt>
            <dd style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
              {g.plain}
              {g.where && <span style={{ display: 'block', marginTop: '6px', color: 'var(--text-muted)', fontSize: 'var(--fs-xs)' }}>In the app: {g.where}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
