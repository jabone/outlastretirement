// @vitest-environment jsdom
//
// Changelog 202: display switches that remember the last choice. Stored per
// browser, shared live between components using the same key (the Dashboard
// chart and its full-screen zoom), and harmless when storage is blocked.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import usePersistentToggle from '../utils/usePersistentToggle';

const Switch = ({ id, storageKey = 'test_toggle', fallback = false }) => {
  const [on, setOn] = usePersistentToggle(storageKey, fallback);
  return <input aria-label={id} type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />;
};

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('usePersistentToggle', () => {
  it('starts from its default, and from the stored choice after that', () => {
    const first = render(<Switch id="a" fallback />);
    expect(screen.getByLabelText('a').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('a'));
    expect(localStorage.getItem('test_toggle')).toBe('false');
    first.unmount();
    render(<Switch id="a" fallback />);
    expect(screen.getByLabelText('a').checked).toBe(false);
  });

  it('keeps two switches on the same key in step', () => {
    render(<><Switch id="dashboard" /><Switch id="zoom" /></>);
    act(() => { fireEvent.click(screen.getByLabelText('dashboard')); });
    expect(screen.getByLabelText('zoom').checked).toBe(true);
  });

  it('leaves other keys alone', () => {
    render(<><Switch id="x" storageKey="k1" /><Switch id="y" storageKey="k2" /></>);
    fireEvent.click(screen.getByLabelText('x'));
    expect(screen.getByLabelText('y').checked).toBe(false);
  });

  it('still works for the session when storage is blocked', () => {
    vi.spyOn(Object.getPrototypeOf(localStorage), 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<Switch id="b" fallback />);
    expect(screen.getByLabelText('b').checked).toBe(true);
    fireEvent.click(screen.getByLabelText('b'));
    expect(screen.getByLabelText('b').checked).toBe(false);
  });
});
