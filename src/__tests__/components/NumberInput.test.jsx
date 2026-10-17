// @vitest-environment jsdom
//
// NumberInput is the one validated number field for the Plan form, the
// Setup Wizard, Quick Update and the Life Events form. These pin the rules
// a reviewer broke the old bare <input type="number"> with: a cleared
// balance stored '' (and the nest egg became a string concatenation), "1e9"
// became a billion, "-5000" became 5000, "48.000,50" became 48.0005, and
// min/max were never enforced.
import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NumberInput from '../../components/NumberInput';
import { parseNumberText } from '../../components/numberText';
import CommaNumberInput from '../../components/CommaNumberInput';

// A controlled harness: the parent keeps whatever onChange hands it, like
// updateInput does, so "what the plan stores" is observable.
function Harness({ initial, onStore, ...props }) {
  const [v, setV] = useState(initial);
  return (
    <NumberInput
      id="field-test"
      value={v}
      onChange={(e) => { const n = parseFloat(e.target.value); onStore(e.target.value); setV(n); }}
      {...props}
    />
  );
}

const typeAndBlur = (el, text) => {
  fireEvent.focus(el);
  fireEvent.change(el, { target: { value: text } });
  fireEvent.blur(el);
};

describe('parseNumberText', () => {
  it('accepts digits, grouped commas, a leading $, a trailing % and one decimal point', () => {
    expect(parseNumberText('48000')).toEqual({ ok: true, value: 48000 });
    expect(parseNumberText('$1,234')).toEqual({ ok: true, value: 1234 });
    expect(parseNumberText('1,234,567.5')).toEqual({ ok: true, value: 1234567.5 });
    expect(parseNumberText('7.5%')).toEqual({ ok: true, value: 7.5 });
  });
  it('refuses exponent forms, letters, misplaced commas and a second decimal point', () => {
    for (const bad of ['1e9', '1E9', 'abc', '12abc', '48.000,50', '12,5', '1.2.3', '.', '$']) {
      expect(parseNumberText(bad).ok, bad).toBe(false);
    }
  });
  it('refuses a minus sign unless the field allows negatives', () => {
    expect(parseNumberText('-5000').ok).toBe(false);
    expect(parseNumberText('-5000', { allowNegative: true })).toEqual({ ok: true, value: -5000 });
  });
  it('reports an empty field as empty', () => {
    expect(parseNumberText('   ')).toEqual({ ok: false, empty: true });
  });
});

describe('NumberInput', () => {
  it('commits a valid in-range value while typing, as a numeric string', () => {
    const onStore = vi.fn();
    render(<Harness initial={100} onStore={onStore} min="0" />);
    const el = screen.getByRole('spinbutton');
    fireEvent.change(el, { target: { value: '250' } });
    expect(onStore).toHaveBeenLastCalledWith('250');
  });

  it('an emptied money field settles to 0, never to an empty string', () => {
    const onStore = vi.fn();
    render(<Harness initial={80000} onStore={onStore} min="0" />);
    const el = screen.getByRole('spinbutton');
    typeAndBlur(el, '');
    expect(onStore).toHaveBeenCalledTimes(1);
    expect(onStore).toHaveBeenLastCalledWith('0');
    expect(el).toHaveValue('0');
    expect(el).not.toHaveAttribute('aria-invalid');
  });

  it('an emptied year keeps the last value and says why', () => {
    const onStore = vi.fn();
    render(<Harness initial={1965} onStore={onStore} min="1926" max="2008" id="field-birthYear1" />);
    const el = screen.getByRole('spinbutton');
    typeAndBlur(el, '');
    expect(onStore).not.toHaveBeenCalled();
    expect(el).toHaveValue('1965');
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a year from 1926 to 2008.');
  });

  it('"1e9" is refused, not read as a billion or as 1', () => {
    const onStore = vi.fn();
    render(<Harness initial={75000} onStore={onStore} min="0" />);
    const el = screen.getByRole('spinbutton');
    typeAndBlur(el, '1e9');
    expect(onStore).not.toHaveBeenCalled();
    expect(el).toHaveValue('75000');
    expect(el).toHaveAttribute('aria-invalid', 'true');
  });

  it('typed a key at a time, a refused entry puts back the value from before the edit, not a valid prefix', () => {
    const onStore = vi.fn();
    render(<Harness initial={75000} onStore={onStore} min="0" />);
    const el = screen.getByRole('spinbutton');
    fireEvent.focus(el);
    let text = '';
    for (const ch of '1e9') { text += ch; fireEvent.change(el, { target: { value: text } }); }
    // "1" was a valid prefix and went through while typing...
    expect(onStore).toHaveBeenCalledWith('1');
    fireEvent.blur(el);
    // ...and the refusal restores 75000.
    expect(onStore).toHaveBeenLastCalledWith('75000');
    expect(el).toHaveValue('75000');
    expect(screen.getByRole('alert')).toHaveTextContent('Kept 75000.');
  });

  it('"-5000" in a field that cannot go negative is refused, not turned into 5000', () => {
    const onStore = vi.fn();
    render(<Harness initial={48000} onStore={onStore} min="0" />);
    const el = screen.getByRole('spinbutton');
    typeAndBlur(el, '-5000');
    expect(onStore).not.toHaveBeenCalledWith('5000');
    expect(onStore).not.toHaveBeenCalledWith('-5000');
    expect(el).toHaveValue('48000');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number of 0 or more. Kept 48000.');
  });

  it('a negative is accepted where the range allows it', () => {
    const onStore = vi.fn();
    render(<Harness initial={7} onStore={onStore} min="-20" max="30" />);
    typeAndBlur(screen.getByRole('spinbutton'), '-3.5');
    expect(onStore).toHaveBeenLastCalledWith('-3.5');
  });

  it('"48.000,50" is refused rather than stored as 48.0005', () => {
    const onStore = vi.fn();
    render(<Harness initial={48000} onStore={onStore} min="0" />);
    const el = screen.getByRole('spinbutton');
    typeAndBlur(el, '48.000,50');
    expect(onStore.mock.calls.map((c) => c[0])).not.toContain('48.0005');
    expect(el).toHaveValue('48000');
    expect(el).toHaveAttribute('aria-invalid', 'true');
  });

  it('"$1,234" is read as 1234', () => {
    const onStore = vi.fn();
    render(<Harness initial={0} onStore={onStore} min="0" />);
    typeAndBlur(screen.getByRole('spinbutton'), '$1,234');
    expect(onStore).toHaveBeenLastCalledWith('1234');
  });

  it('out of range is refused with an inline, described message and the last valid value kept', () => {
    const onStore = vi.fn();
    render(<Harness initial={67} onStore={onStore} min="62" max="70" id="field-claimingAge1" />);
    const el = screen.getByRole('spinbutton');
    typeAndBlur(el, '99');
    expect(onStore).not.toHaveBeenCalled();
    expect(el).toHaveValue('67');
    const msg = screen.getByRole('alert');
    expect(msg).toHaveTextContent('Enter an age from 62 to 70. Kept 67.');
    expect(el.getAttribute('aria-describedby')).toContain(msg.id);
    // Fixing it clears the message.
    typeAndBlur(el, '68');
    expect(onStore).toHaveBeenLastCalledWith('68');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(el).not.toHaveAttribute('aria-invalid');
  });

  it('a year must be whole', () => {
    const onStore = vi.fn();
    render(<Harness initial={1965} onStore={onStore} min="1926" max="2008" id="field-birthYear1" />);
    typeAndBlur(screen.getByRole('spinbutton'), '1965.5');
    expect(onStore).not.toHaveBeenCalled();
  });

  it('ArrowUp / ArrowDown step within the range', () => {
    const onStore = vi.fn();
    render(<Harness initial={69} onStore={onStore} min="62" max="70" />);
    const el = screen.getByRole('spinbutton');
    fireEvent.keyDown(el, { key: 'ArrowUp' });
    expect(onStore).toHaveBeenLastCalledWith('70');
    fireEvent.keyDown(el, { key: 'ArrowUp' });
    expect(onStore).toHaveBeenCalledTimes(1);
  });
});

describe('CommaNumberInput (a NumberInput with commas)', () => {
  it('shows commas at rest and plain digits while editing', () => {
    render(<CommaNumberInput value={24500} onChange={() => {}} />);
    const el = screen.getByRole('spinbutton');
    expect(el).toHaveValue('24,500');
    fireEvent.focus(el);
    expect(el).toHaveValue('24500');
    fireEvent.blur(el);
    expect(el).toHaveValue('24,500');
  });

  it('hands its caller a number, and 0 (not an empty string) when cleared', () => {
    const onChange = vi.fn();
    render(<CommaNumberInput value={5000} onChange={onChange} />);
    const el = screen.getByRole('spinbutton');
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '1,234,567' } });
    expect(onChange).toHaveBeenLastCalledWith(1234567);
    fireEvent.change(el, { target: { value: '' } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(onChange.mock.calls.some((c) => c[0] === '')).toBe(false);
  });

  it('forwards id and disabled', () => {
    render(<CommaNumberInput id="field-example" value={100} onChange={() => {}} disabled />);
    const el = screen.getByRole('spinbutton');
    expect(el).toHaveAttribute('id', 'field-example');
    expect(el).toBeDisabled();
  });
});
