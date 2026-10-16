import React, { useId, useRef, useState } from 'react';
import { parseNumberText, rangeMessage, fmt } from './numberText';

// One validated number field for the whole Plan form, the Setup Wizard,
// Quick Update and the Life Events form.
//
// It replaces bare <input type="number">, which let a cleared balance store
// '' (and '' + 15000 + 2000000 is a string, not a sum: a cleared Pre-Tax box
// once showed a two-billion-dollar nest egg), accepted "1e9" as a billion,
// ignored min/max entirely, and turned "-5000" into 5000 or "48.000,50" into
// 48.0005 depending on the browser.
//
// Drop-in by design: it takes the same props as the input it replaces
// (value, onChange, min, max, step, id, className, style, disabled) and calls
// onChange with an event-shaped object whose target.value is a clean numeric
// STRING, so every existing handler (parseFloat(e.target.value), the
// `=== '' ? '' :` guards, the /100 percent fields) keeps working unchanged.
// It simply never hands them anything that isn't a finite, in-range number.
//
// Rules:
//  - Accepts digits, thousands commas in the right places, a leading $, a
//    trailing %, a single decimal point, and a leading minus only when the
//    field's min is below zero. Letters and exponent forms ("1e9") are
//    rejected, not reinterpreted.
//  - While typing, a value that parses and is in range is committed at once
//    (the projection updates live, as before); anything else waits.
//  - On blur (or Enter), an unparseable or out-of-range entry is NOT
//    committed: the field goes back to the plan's last valid value and an
//    inline message under it says what is allowed (aria-invalid +
//    aria-describedby).
//  - Emptying a field whose range includes 0 means 0 (a cleared balance is
//    zero dollars). Emptying a field that cannot be 0 (a year, an age) keeps
//    the last value and says so.
//  - ArrowUp / ArrowDown step by `step`, as a native number input does, and
//    the field keeps the spinbutton role for assistive technology.

const toNum = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

const inferKind = (id = '') => {
  if (/Year(\d|$|[A-Z])|(^|[-_])year\b/.test(id) && !/Years/.test(id)) return 'year';
  if (/Age(\d|$|[A-Z])|(^|[-_])age\b/.test(id)) return 'age';
  return 'number';
};

const NumberInput = React.forwardRef(function NumberInput({
  id, value, onChange, min, max, step, integer, kind, commas = false,
  message, className = 'form-input', style, disabled, placeholder, name,
  onBlur, onFocus, onKeyDown, 'aria-describedby': describedBy, ...rest
}, ref) {
  // Anything a caller passes that only made sense on type="number" is
  // dropped here rather than landing on a text input.
  delete rest.type;
  const autoId = useId();
  const errId = `${id || autoId}-error`;
  const lo = toNum(min);
  const hi = toNum(max);
  const k = kind || inferKind(id);
  const wholeOnly = integer ?? k === 'year';
  const allowNegative = Number.isFinite(lo) ? lo < 0 : false;
  const current = toNum(value);

  const [draft, setDraft] = useState(null); // text while editing, else null
  const [error, setError] = useState(null);
  // The plan's value when this edit began. Typing commits each valid
  // prefix as it goes ("1e9" passes through 1, "48.000,50" through 48), so
  // a refused entry must put back this value, not the last prefix.
  const startRef = useRef(null);

  const inRange = (n) => (!Number.isFinite(lo) || n >= lo) && (!Number.isFinite(hi) || n <= hi)
    && (!wholeOnly || Number.isInteger(n));

  const emit = (n) => {
    if (n === current) return;
    const s = String(n);
    const target = { value: s, valueAsNumber: n, id, name, type: 'number' };
    onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} });
  };

  const explain = () => message || rangeMessage({ min: lo, max: hi, kind: k });

  // Final say on the typed text: commit it, or put the last valid value
  // back and explain why.
  const settle = (text) => {
    const p = parseNumberText(text, { allowNegative });
    if (p.ok && inRange(p.value)) {
      emit(p.value);
      setError(null);
      setDraft(null);
      startRef.current = null;
      return;
    }
    if (p.empty && inRange(0)) {
      emit(0); setError(null); setDraft(null); startRef.current = null;
      return;
    }
    const kept = Number.isFinite(startRef.current) ? startRef.current : current;
    if (Number.isFinite(kept)) emit(kept);
    setError(`${explain()}${Number.isFinite(kept) ? ` Kept ${fmt(kept, commas)}.` : ''}`);
    setDraft(null);
    startRef.current = null;
  };

  const shown = draft !== null ? draft : (Number.isFinite(current) ? fmt(current, commas) : '');

  const describedByAll = [describedBy, error ? errId : null].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <input
        ref={ref}
        id={id}
        name={name}
        type="text"
        role="spinbutton"
        inputMode={allowNegative || !wholeOnly ? 'decimal' : 'numeric'}
        autoComplete="off"
        className={className}
        style={style}
        disabled={disabled}
        placeholder={placeholder}
        value={shown}
        aria-valuenow={Number.isFinite(current) ? current : undefined}
        aria-valuemin={Number.isFinite(lo) ? lo : undefined}
        aria-valuemax={Number.isFinite(hi) ? hi : undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedByAll}
        {...rest}
        onFocus={(e) => {
          if (Number.isFinite(current)) setDraft(fmt(current, false));
          startRef.current = current;
          onFocus?.(e);
        }}
        onChange={(e) => {
          const text = e.target.value;
          if (draft === null && startRef.current === null) startRef.current = current;
          setDraft(text);
          const p = parseNumberText(text, { allowNegative });
          if (p.ok && inRange(p.value)) { setError(null); emit(p.value); }
        }}
        onBlur={(e) => {
          if (draft !== null) settle(draft);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft !== null) {
            settle(draft);
          } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !disabled) {
            e.preventDefault();
            const inc = Number(step) > 0 ? Number(step) : 1;
            const base = Number.isFinite(current) ? current : (Number.isFinite(lo) ? lo : 0);
            let n = Math.round((base + (e.key === 'ArrowUp' ? inc : -inc)) * 1e8) / 1e8;
            if (Number.isFinite(lo)) n = Math.max(lo, n);
            if (Number.isFinite(hi)) n = Math.min(hi, n);
            setError(null);
            setDraft(fmt(n, false));
            emit(n);
          }
          onKeyDown?.(e);
        }}
      />
      {error && (
        <span id={errId} className="field-error" role="alert">{error}</span>
      )}
    </>
  );
});

export default NumberInput;
