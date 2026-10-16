// @vitest-environment jsdom
//
// LATEST_CHANGELOG_ID lives in its own tiny module so the app shell can
// decide whether to load the What's New popup -- and the ~460 kB changelog
// it imports -- without loading them. The number is typed by hand, so this
// fails the moment a new entry is added without bumping it.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CHANGELOG, LATEST_CHANGELOG_ID as REEXPORTED } from '../config/changelog';
import { LATEST_CHANGELOG_ID } from '../config/changelogLatest';
import { ANNOUNCEMENTS, activeAnnouncements } from '../config/announcements';
import {
  whatsNewMayShow, WHATS_NEW_SEEN_KEY, WHATS_NEW_SHOWN_DATE_KEY, DISMISSED_ANNOUNCE_KEY,
} from '../utils/whatsNewGate';

afterEach(() => localStorage.clear());

describe('LATEST_CHANGELOG_ID', () => {
  it('is the highest id in CHANGELOG', () => {
    expect(LATEST_CHANGELOG_ID).toBe(Math.max(...CHANGELOG.map((e) => e.id)));
  });
  it('changelog.js re-exports the same value', () => {
    expect(REEXPORTED).toBe(LATEST_CHANGELOG_ID);
  });
  it('the tiny module and the gate do not import the changelog', () => {
    const src = path.resolve(__dirname, '..');
    for (const f of ['config/changelogLatest.js', 'utils/whatsNewGate.js', 'config/announcements.js']) {
      expect(fs.readFileSync(path.join(src, f), 'utf8'), f).not.toMatch(/from '[./]*(config\/)?changelog'/);
    }
  });
});

describe('whatsNewMayShow: load the popup only when it has something to show', () => {
  // A far-off day with every announcement dismissed, so only release notes
  // matter. (Dismissing rather than relying on the date: an announcement
  // with no end date, such as the timeless welcome, is active forever.)
  const QUIET = new Date('2099-01-01T12:00:00Z');
  const quietDay = QUIET.toISOString().slice(0, 10);
  const dismissAll = () => localStorage.setItem(DISMISSED_ANNOUNCE_KEY, JSON.stringify(ANNOUNCEMENTS.map((a) => a.id)));
  beforeEach(dismissAll);

  it('the quiet day really has nothing undismissed to announce', () => {
    const dismissed = new Set(JSON.parse(localStorage.getItem(DISMISSED_ANNOUNCE_KEY)));
    expect(activeAnnouncements(QUIET).filter((a) => !dismissed.has(a.id)).length).toBe(0);
  });

  it('a returning visitor who has seen everything: no', () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, String(LATEST_CHANGELOG_ID));
    expect(whatsNewMayShow(QUIET)).toBe(false);
  });

  it('a returning visitor behind by one release: yes', () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, String(LATEST_CHANGELOG_ID - 1));
    expect(whatsNewMayShow(QUIET)).toBe(true);
  });

  it('...but not twice in one day', () => {
    localStorage.setItem(WHATS_NEW_SEEN_KEY, String(LATEST_CHANGELOG_ID - 1));
    localStorage.setItem(WHATS_NEW_SHOWN_DATE_KEY, quietDay);
    expect(whatsNewMayShow(QUIET)).toBe(false);
  });

  it('a first visit with nothing to announce is caught up silently, as the popup would', () => {
    expect(whatsNewMayShow(QUIET)).toBe(false);
    expect(localStorage.getItem(WHATS_NEW_SEEN_KEY)).toBe(String(LATEST_CHANGELOG_ID));
  });

  it('an active, undismissed announcement mounts the popup even with no new release', () => {
    localStorage.removeItem(DISMISSED_ANNOUNCE_KEY);
    const a = ANNOUNCEMENTS.find((x) => x.showFrom);
    expect(a).toBeTruthy();
    const during = new Date(`${a.showFrom}T12:00:00Z`);
    localStorage.setItem(WHATS_NEW_SEEN_KEY, String(LATEST_CHANGELOG_ID));
    expect(whatsNewMayShow(during)).toBe(true);
    localStorage.setItem(DISMISSED_ANNOUNCE_KEY, JSON.stringify(activeAnnouncements(during).map((x) => x.id)));
    expect(whatsNewMayShow(during)).toBe(false);
  });
});
