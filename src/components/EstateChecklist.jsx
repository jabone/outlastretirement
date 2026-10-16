// The estate paperwork tracker.
//
// Why this is a tab and not more prose in Help: the content started life as
// a guide section, and a guide section is something you read once. The
// failure mode it warns about -- a beneficiary form naming someone you
// divorced in 2011 -- is not caused by not knowing. It is caused by never
// going back to check. So the useful artifact is a record of when you last
// looked, which means state, which means it belongs with your plan rather
// than in the manual.
//
// State lives in its own localStorage key, NOT in `inputs`. Same reasoning
// as PreferencesTab: this is a fact about your real-world paperwork, not a
// plan assumption, and switching scenarios must not silently change which
// documents you have signed. It IS included in Backup Everything, because
// losing it would be losing real work.
import React, { useMemo, useState } from 'react';
import { printSection } from '../utils/printSection';
import PrintFrame from './PrintFrame';
import { ClipboardCheck, Printer, RotateCcw } from 'lucide-react';
import {
  CHECKLIST_CATEGORIES, CHECKLIST_ITEM_COUNT,
  readChecklistState, writeChecklistState, toggleChecklistItem, checklistProgress,
} from '../config/estateChecklist';
import { useSimulation } from '../context/useSimulation';

// Shown once: at the end of the page on screen, under the intro on paper.
const ESTATE_ATTORNEY_NOTE = 'Educational checklist only \u2014 not legal or tax advice. Whether you need a trust, how a document should be worded, and what applies in your state are questions for an estate attorney.';

// Local date, not toISOString(). toISOString() converts to UTC first, so
// ticking an item at 8pm on the US west coast would stamp tomorrow's date.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EstateChecklist() {
  const { showConfirm } = useSimulation();
  const [state, setState] = useState(() => readChecklistState());

  const progress = useMemo(() => checklistProgress(state), [state]);

  const toggle = (itemId) => {
    setState(prev => {
      const next = toggleChecklistItem(prev, itemId, todayLocal());
      writeChecklistState(next);
      return next;
    });
  };

  const resetAll = () => {
    const doIt = () => { setState({}); writeChecklistState({}); };
    if (showConfirm) {
      showConfirm('Clear every tick and date on this checklist? Your plan is not affected.', doIt, 'Reset checklist');
    } else {
      doIt();
    }
  };

  return (
    <div className="estate-checklist-root" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PrintFrame inline title="Estate Documents Checklist">

      <div className="glass-panel" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <ClipboardCheck className="no-print" size={22} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: '1 1 340px' }}>
            {/* On paper the page header already carries this title (changelog 327). */}
            <h3 className="no-print" style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 4px' }}>Estate Documents Checklist</h3>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
              The paperwork that decides where your money actually goes &mdash; none of which this app can do for you.
              Tick an item and it records the date, so next year you can see what you have actually reviewed rather
              than what you remember reviewing.
            </p>
            {/* On paper the attorney note sits here, under the intro, instead of
                at the end, where it alone spilled onto a last page (changelog 329). */}
            <p className="print-only" data-testid="estate-print-note" style={{ fontSize: 'var(--fs-2xs)', margin: '6px 0 0', lineHeight: 1.6 }}>
              {ESTATE_ATTORNEY_NOTE}
            </p>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }} onClick={() => printSection('estate')}>
              <Printer size={14} /> Print
            </button>
            {progress.done > 0 && (
              <button className="btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }} onClick={resetAll}>
                <RotateCcw size={14} /> Reset
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>{progress.done} of {CHECKLIST_ITEM_COUNT} reviewed</span>
            <span>{progress.pct.toFixed(0)}%</span>
          </div>
          <div className="checklist-progress-bar" style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ width: `${progress.pct}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.25s ease' }} />
          </div>
        </div>

        <p className="no-print" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: '14px 0 0', lineHeight: 1.6 }}>
          Ticks are stored in this browser and travel with <strong>Backup Everything</strong>. They are not part of a
          saved Scenario &mdash; switching scenarios never changes what you have signed. Nothing here is legal advice;
          it is a list of things to go and confirm, and an estate attorney is who confirms them.
        </p>
      </div>

      {CHECKLIST_CATEGORIES.map(cat => {
        const catDone = cat.items.filter(i => state[i.id]?.done).length;
        return (
          <div key={cat.id} className="glass-panel checklist-category" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>{cat.title}</h4>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {catDone}/{cat.items.length}
              </span>
            </div>
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>{cat.blurb}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cat.items.map(item => {
                const entry = state[item.id];
                const done = Boolean(entry?.done);
                return (
                  <div
                    key={item.id}
                    className="checklist-item"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px',
                      border: `1px solid ${done ? 'rgba(34,197,94,0.25)' : 'var(--card-border)'}`,
                      background: done ? 'rgba(34,197,94,0.06)' : 'var(--bg-secondary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      id={`checklist-${item.id}`}
                      checked={done}
                      onChange={() => toggle(item.id)}
                      style={{ marginTop: '3px', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        htmlFor={`checklist-${item.id}`}
                        style={{ display: 'block', fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer', marginBottom: '3px', color: 'var(--text-primary)' }}
                      >
                        {item.title}
                      </label>
                      <p style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 }}>{item.detail}</p>
                    </div>
                    {/* Fixed-width so the printed column lines up, and so an
                        unticked row still leaves a blank you can write on. */}
                    <span className="checklist-date" style={{ fontSize: 'var(--fs-2xs)', color: done ? 'var(--success)' : 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: '82px', textAlign: 'right' }}>
                      {done ? entry.completedAt : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="no-print" style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
        {ESTATE_ATTORNEY_NOTE}
      </p>
      </PrintFrame>
    </div>
  );
}
