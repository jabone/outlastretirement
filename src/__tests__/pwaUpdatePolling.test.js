// @vitest-environment jsdom
// The app asks its service worker to re-check for a new deploy while a tab
// stays open (changelog 281): hourly, and again when the tab is shown or
// the machine comes back online -- never while Local-Only Mode is on or
// the browser is offline.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startUpdatePolling, shouldCheckForUpdate, UPDATE_POLL_MS } from '../utils/pwa';
import { setLocalOnlyMode } from '../utils/localOnlyMode';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

beforeEach(() => { vi.useFakeTimers(); setLocalOnlyMode(false); });
afterEach(() => { vi.useRealTimers(); setLocalOnlyMode(false); });

const registration = () => ({ update: vi.fn(() => Promise.resolve()) });

describe('shouldCheckForUpdate', () => {
  it('checks only when online, visible and not Local-Only', () => {
    expect(shouldCheckForUpdate({ localOnly: false, online: true, visible: true })).toBe(true);
    expect(shouldCheckForUpdate({ localOnly: true, online: true, visible: true })).toBe(false);
    expect(shouldCheckForUpdate({ localOnly: false, online: false, visible: true })).toBe(false);
    expect(shouldCheckForUpdate({ localOnly: false, online: true, visible: false })).toBe(false);
  });
  it('reads Local-Only Mode itself when not told', () => {
    setLocalOnlyMode(true);
    expect(shouldCheckForUpdate({ online: true, visible: true })).toBe(false);
    setLocalOnlyMode(false);
    expect(shouldCheckForUpdate({ online: true, visible: true })).toBe(true);
  });
});

describe('startUpdatePolling', () => {
  it('polls once an hour and stops on teardown', () => {
    const reg = registration();
    const stop = startUpdatePolling(reg);
    expect(UPDATE_POLL_MS).toBe(3600000);
    expect(reg.update).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UPDATE_POLL_MS);
    expect(reg.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UPDATE_POLL_MS * 2);
    expect(reg.update).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(UPDATE_POLL_MS * 5);
    expect(reg.update).toHaveBeenCalledTimes(3);
  });

  it('checks when the tab becomes visible and when the browser comes back online', () => {
    const reg = registration();
    const stop = startUpdatePolling(reg, { intervalMs: 10 ** 9 });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reg.update).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('online'));
    expect(reg.update).toHaveBeenCalledTimes(2);
    stop();
  });

  it('never asks while Local-Only Mode is on', () => {
    const reg = registration();
    setLocalOnlyMode(true);
    const stop = startUpdatePolling(reg);
    vi.advanceTimersByTime(UPDATE_POLL_MS * 3);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    expect(reg.update).not.toHaveBeenCalled();
    setLocalOnlyMode(false);
    vi.advanceTimersByTime(UPDATE_POLL_MS);
    expect(reg.update).toHaveBeenCalledTimes(1);
    stop();
  });

  it('survives a registration without update(), and a rejected check', () => {
    expect(typeof startUpdatePolling(null)).toBe('function');
    expect(typeof startUpdatePolling({})).toBe('function');
    const reg = { update: vi.fn(() => Promise.reject(new Error('offline'))) };
    const stop = startUpdatePolling(reg);
    vi.advanceTimersByTime(UPDATE_POLL_MS);
    expect(reg.update).toHaveBeenCalledTimes(1);
    stop();
  });

  it('is wired to the service-worker registration callback', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../utils/pwa.js'), 'utf8');
    expect(src).toMatch(/onRegisteredSW\(_swUrl, registration\) \{\s*startUpdatePolling\(registration\);/);
  });
});
