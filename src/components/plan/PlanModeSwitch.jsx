// The Guided / Advanced switch at the top of both Plan views (IA Phase 3
// step 3, changelog 252). Switching keeps your section: the current
// Interview step maps to the Plan Settings sub-tab that holds the same
// sections, and back.
import React from 'react';
import { ListChecks, LayoutGrid } from 'lucide-react';

export default function PlanModeSwitch({ mode, onSwitch }) {
  const pill = (value, Icon, label, hint) => (
    <button
      type="button"
      className={`sub-tab-button ${mode === value ? 'active' : ''}`}
      aria-pressed={mode === value}
      title={hint}
      onClick={() => { if (mode !== value) onSwitch(value); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      <Icon size={14} /> {label}
    </button>
  );
  return (
    <div className="plan-mode-switch" role="group" aria-label="Plan view" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>View:</span>
      {pill('guided', ListChecks, 'Guided', 'One step at a time, with rarely needed fields folded away')}
      {pill('advanced', LayoutGrid, 'Advanced', 'Everything on one page, grouped by life domain')}
    </div>
  );
}
