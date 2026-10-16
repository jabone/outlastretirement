import React from 'react';

// One on/off setting: its label, then the app's sliding switch (changelog
// 279). This is the control vocabulary's rule for a single yes/no --
// a bare checkbox is kept only for picking several rows out of a list
// (import rows, scenarios to compare, chart lines to show). The `id` is
// the input's id, so `toggle-<inputKey>` keeps working for tests and for
// the Guide's pointers; the label is tied to it with htmlFor.
export default function SwitchRow({ id, checked, onChange, children, hint, disabled = false, style, labelStyle, size = 'body', stopPropagation = false }) {
  const fs = size === 'xs' ? 'var(--fs-2xs)' : size === 'sm' ? 'var(--fs-sm)' : 'var(--fs-body)';
  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <label htmlFor={id} style={{ fontSize: fs, cursor: disabled ? 'default' : 'pointer', flex: '1 1 auto', ...labelStyle }}>
          {children}
        </label>
        <span className="custom-switch">
          <input
            id={id}
            type="checkbox"
            checked={!!checked}
            disabled={disabled}
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
            onChange={(e) => onChange(e.target.checked, e)}
          />
          <span className="slider-round"></span>
        </span>
      </div>
      {hint && <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}
