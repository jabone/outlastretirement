import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, BookOpen, CornerDownLeft } from 'lucide-react';
import { useSimulation } from '../context/useSimulation';
import { writeFoldState } from './plan/foldState';
import { revealField } from '../utils/revealField';
import { readPlanMode, tabForMode } from '../utils/planMode';
import { FOCUS_EVENT } from './findSettingEvents';
import { searchIndex, placeOf } from './findSettingSearch';

// "Find a setting" (changelog 290): a search box in the Plan header that
// finds any plan field by its label or key and jumps to it -- the right
// sub-tab or Guided step, the section fold opened, "More options" opened
// when the field is behind it, then scrolled into view and highlighted.
// Pages show up too (typing "roth" offers the Optimizers page as well as
// the Roth fields). Prose stays in the Input Dictionary: the last result is
// always a search there. Ctrl+K / Cmd+K focuses the box from anywhere.
//
// `onPick(entry)` is the host's part: switch the sub-tab (Plan Settings)
// or step (Guided Interview) the entry names. The reveal is done here.
// The event lives in findSettingEvents.js so the app shell need not import this.
export { FOCUS_EVENT };

const FindSetting = ({ onPick, placeholder = 'Find a setting', style }) => {
  const { setActiveTab, openDictionary, inputs } = useSimulation();
  // The index says "(Spouse 1)"; the rest of the app uses the plan's names.
  const named = (label) => String(label)
    .replace('(Spouse 1)', `(${inputs?.spouse1Name || 'you'})`)
    .replace('(Spouse 2)', `(${inputs?.spouse2Name || 'your spouse'})`);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const inputRef = useRef(null);
  // The list closes a beat after the field loses focus, so a click on a
  // result lands first. The timer is cleared if the box goes away before
  // it fires; a stray one used to set state on an unmounted component (and
  // crash a test run whose page had already been torn down).
  const blurTimer = useRef(null);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const results = useMemo(() => searchIndex(query), [query]);
  const rows = query.trim() ? [...results, { dictionary: true, id: 'dictionary', label: `Search the Input Dictionary for "${query.trim()}"` }] : [];

  useEffect(() => {
    const focus = () => { inputRef.current?.focus(); inputRef.current?.select(); };
    window.addEventListener(FOCUS_EVENT, focus);
    return () => window.removeEventListener(FOCUS_EVENT, focus);
  }, []);
  useEffect(() => { setActive(0); }, [query]);

  const pick = async (row) => {
    setOpen(false);
    if (row.dictionary) { openDictionary(query.trim()); return; }
    if (row.page) {
      setActiveTab(row.tab === 'plan' ? tabForMode(readPlanMode()) : row.tab);
      return;
    }
    (row.folds || []).forEach((f) => { if (f.id) writeFoldState(f.id, true); });
    setStatus('');
    onPick(row);
    const found = await revealField(row.id, { folds: row.folds });
    if (!found) setStatus(`"${named(row.label)}" is not shown right now. It appears once its section's switch is on.`);
  };

  const onKeyDown = (e) => {
    if (!rows.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); setOpen(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(rows[active]); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  return (
    <div className="find-setting" style={{ position: 'relative', minWidth: '240px', flex: '1 1 260px', maxWidth: '420px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '6px 10px', background: 'var(--bg-primary)' }}>
        <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          data-testid="find-setting-input"
          type="search"
          role="combobox"
          aria-label="Find a setting"
          aria-expanded={open && rows.length > 0}
          aria-controls="find-setting-results"
          aria-autocomplete="list"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setStatus(''); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { clearTimeout(blurTimer.current); blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          onKeyDown={onKeyDown}
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', outline: 'none' }}
        />
        <kbd className="find-setting-kbd" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', border: '1px solid var(--card-border)', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>Ctrl K</kbd>
      </div>
      {open && rows.length > 0 && (
        <ul
          id="find-setting-results"
          role="listbox"
          data-testid="find-setting-results"
          style={{ position: 'absolute', zIndex: 60, top: 'calc(100% + 4px)', left: 0, right: 0, margin: 0, padding: '4px', listStyle: 'none', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', maxHeight: '360px', overflowY: 'auto' }}
        >
          {rows.map((row, i) => (
            <li
              key={row.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(row); }}
              onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '6px', cursor: 'pointer', background: i === active ? 'var(--bg-secondary)' : 'transparent', fontSize: 'var(--fs-sm)' }}
            >
              {row.dictionary ? <BookOpen size={14} style={{ color: 'var(--accent-text)', flexShrink: 0 }} /> : <CornerDownLeft size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: i === active ? 1 : 0 }} />}
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{named(row.label)}</span>
              {!row.dictionary && <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-2xs)', whiteSpace: 'nowrap' }}>{placeOf(row)}</span>}
            </li>
          ))}
        </ul>
      )}
      {status && <div role="status" style={{ marginTop: '6px', fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)' }}>{status}</div>}
    </div>
  );
};

export default FindSetting;
