// @vitest-environment jsdom
//
// H4: a full storage used to throw out of a React effect and replace the
// app with a crash screen. H5: two tabs silently overwrote each other.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import StorageBanners from '../../components/StorageBanners';
import { safeSetItem, releaseWrites, isWriteHeld } from '../../utils/safeStorage';
import { writeLifePlan } from '../../config/lifePlan';

function quotaError() {
  const e = new Error('The quota has been exceeded.');
  e.name = 'QuotaExceededError';
  return e;
}

describe('safeSetItem', () => {
  beforeEach(() => { localStorage.clear(); releaseWrites(); });

  it('returns false instead of throwing when storage is full', () => {
    const storage = { setItem: vi.fn(() => { throw quotaError(); }) };
    expect(() => safeSetItem('retire_plan_inputs', '{}', storage)).not.toThrow();
    expect(safeSetItem('retire_plan_inputs', '{}', storage)).toBe(false);
  });

  it('writes normally otherwise', () => {
    expect(safeSetItem('retire_plan_inputs', 'x')).toBe(true);
    expect(localStorage.getItem('retire_plan_inputs')).toBe('x');
  });
});

describe('StorageBanners', () => {
  beforeEach(() => { localStorage.clear(); releaseWrites(); });
  afterEach(() => { vi.restoreAllMocks(); releaseWrites(); });

  it('shows the storage-full banner when a save fails, and clears it when a later save of that key works', () => {
    render(<StorageBanners />);
    expect(screen.queryByTestId('storage-full-banner')).toBeNull();
    const spy = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw quotaError(); });
    act(() => { safeSetItem('retire_plan_inputs', '{"a":1}'); });
    spy.mockRestore();
    expect(screen.getByTestId('storage-full-banner').textContent)
      .toContain("Couldn’t save your latest change: this browser’s storage is full. Download a backup and remove old scenarios.");
    act(() => { safeSetItem('retire_plan_inputs', '{"a":2}'); });
    expect(screen.queryByTestId('storage-full-banner')).toBeNull();
  });

  it('a writer that catches its own errors still reaches the banner (Life Plan)', () => {
    render(<StorageBanners />);
    const storage = { setItem: () => { throw quotaError(); } };
    let ok;
    act(() => { ok = writeLifePlan({ a: 1 }, storage); });
    expect(ok).toBe(false);
    expect(screen.getByTestId('storage-full-banner')).toBeTruthy();
  });

  it('marks the tab stale when another tab changes the plan, and holds this tab’s writes', () => {
    render(<StorageBanners />);
    localStorage.setItem('retire_plan_inputs', 'NEWER-FROM-OTHER-TAB');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'retire_plan_inputs', newValue: 'NEWER-FROM-OTHER-TAB' }));
    });
    expect(screen.getByTestId('stale-tab-banner').textContent).toContain('Your plan was changed in another tab');
    expect(screen.getByRole('button', { name: 'Load the newer version' })).toBeTruthy();
    expect(isWriteHeld('retire_plan_inputs')).toBe(true);
    // This tab's older copy must not overwrite the newer one.
    expect(safeSetItem('retire_plan_inputs', 'OLDER-FROM-THIS-TAB')).toBe(false);
    expect(localStorage.getItem('retire_plan_inputs')).toBe('NEWER-FROM-OTHER-TAB');
    // A held write is not a storage-full failure.
    expect(screen.queryByTestId('storage-full-banner')).toBeNull();
  });

  it('ignores other tabs changing device preferences', () => {
    render(<StorageBanners />);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'retire_plan_theme', newValue: 'dark' }));
    });
    expect(screen.queryByTestId('stale-tab-banner')).toBeNull();
    expect(isWriteHeld('retire_plan_inputs')).toBe(false);
  });

  it('"Load the newer version" reloads', () => {
    const reload = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...orig, reload } });
    try {
      render(<StorageBanners />);
      act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'retire_plan_scenarios' })); });
      fireEvent.click(screen.getByRole('button', { name: 'Load the newer version' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: orig });
    }
  });
});
