// @vitest-environment jsdom
// Changelog 370: Safari erases a site's data after seven days without a
// visit; in a Safari tab the app says so and reminds about backups sooner.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { safariTabPlatform, safariNoticeDue, snoozeSafariNotice, SAFARI_NOTICE_KEY } from '../utils/safariStorage';
import { computeFreshnessStatus, backupSnoozeDays, FRESHNESS_KEY } from '../utils/dataFreshness';
import SafariStorageBanner from '../components/SafariStorageBanner';
import { renderWithSimulation } from './testUtils';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
};
const nav = (ua, extra = {}) => ({ userAgent: ua, maxTouchPoints: 0, ...extra });
const win = (standalone = false) => ({ matchMedia: () => ({ matches: standalone }) });

describe('which pages are a Safari tab', () => {
  it('Safari on iPhone and Mac, iPad asking for the desktop site', () => {
    expect(safariTabPlatform(nav(UA.iphoneSafari), win())).toBe('ios');
    expect(safariTabPlatform(nav(UA.macSafari), win())).toBe('mac');
    expect(safariTabPlatform(nav(UA.macSafari, { maxTouchPoints: 5 }), win())).toBe('ios');
  });
  it('not other browsers, not a Home Screen app, not the App Store app', () => {
    for (const ua of [UA.iphoneChrome, UA.macChrome, UA.android]) expect(safariTabPlatform(nav(ua), win())).toBeNull();
    expect(safariTabPlatform(nav(UA.iphoneSafari, { standalone: true }), win())).toBeNull();
    expect(safariTabPlatform(nav(UA.iphoneSafari), win(true))).toBeNull();
    expect(safariTabPlatform(nav(UA.iphoneSafari), { ...win(), Capacitor: { isNativePlatform: () => true } })).toBeNull();
  });
});

describe('in a Safari tab', () => {
  let uaSpy;
  beforeEach(() => {
    localStorage.clear();
    uaSpy = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA.iphoneSafari);
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => { uaSpy.mockRestore(); });

  it('the backup reminder comes due after 5 days, not 14, and snoozes for 3', () => {
    const day = 86400000; const now = Date.now();
    localStorage.setItem(FRESHNESS_KEY, JSON.stringify({ firstSeenAt: now - 6 * day, lastPlanChangeAt: now - day, lastBackupAt: null }));
    expect(computeFreshnessStatus({ now }).backupOverdue).toBe(true);
    expect(computeFreshnessStatus({ now, backupNudgeDays: 14 }).backupOverdue).toBe(false);
    expect(backupSnoozeDays()).toBe(3);
  });

  it('shows the notice, and hides it for a month when dismissed', () => {
    expect(safariNoticeDue()).toBe(true);
    renderWithSimulation(<SafariStorageBanner />);
    expect(screen.getByTestId('safari-storage-banner').textContent).toMatch(/Add to Home Screen/);
    fireEvent.click(screen.getByRole('button', { name: /Hide this notice/ }));
    expect(screen.queryByTestId('safari-storage-banner')).toBeNull();
    expect(Number(localStorage.getItem(SAFARI_NOTICE_KEY))).toBeGreaterThan(Date.now() + 29 * 86400000);
  });

  it('comes back once the month is up', () => {
    snoozeSafariNotice(Date.now() - 31 * 86400000);
    expect(safariNoticeDue()).toBe(true);
  });
});

describe('outside Safari', () => {
  it('no notice, and the usual 14-day reminder', () => {
    const spy = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(UA.macChrome);
    expect(safariNoticeDue()).toBe(false);
    expect(backupSnoozeDays()).toBe(7);
    spy.mockRestore();
  });
});
