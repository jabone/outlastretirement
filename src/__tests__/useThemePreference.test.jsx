// @vitest-environment jsdom
// Changelog 368: the app follows the device until a theme is chosen.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThemePreference } from '../utils/useThemePreference';

function mockDevice(light) {
  const listeners = [];
  const mq = { matches: light, addEventListener: (_e, f) => listeners.push(f), removeEventListener: vi.fn() };
  window.matchMedia = vi.fn(() => mq);
  return { flip(v) { mq.matches = v; listeners.forEach((f) => f()); } };
}

describe('theme preference', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

  it('follows the device, and saves nothing until someone chooses', () => {
    const device = mockDevice(true);
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    act(() => device.flip(false));
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('retire_plan_theme')).toBeNull();
  });

  it('a choice is saved and then wins over the device', () => {
    const device = mockDevice(true);
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('retire_plan_theme')).toBe('dark');
    act(() => device.flip(true));
    expect(result.current.theme).toBe('dark');
  });

  it('an earlier saved choice is kept', () => {
    mockDevice(true);
    localStorage.setItem('retire_plan_theme', 'dark');
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.theme).toBe('dark');
  });
});
