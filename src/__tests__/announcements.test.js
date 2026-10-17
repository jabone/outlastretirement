// Announcement date-window logic (changelog 150): pure, tested directly so a
// broken window check can't hide behind the popup's mocked config.
import { describe, it, expect } from 'vitest';
import { isAnnouncementActiveOn, ANNOUNCEMENTS } from '../config/announcements';
import { PREMIUM_AREAS } from '../config/premiumOffering';

const A = (over) => ({ id: 'x', ...over });

describe('isAnnouncementActiveOn', () => {
  it('no window = always active', () => {
    expect(isAnnouncementActiveOn(A(), '2026-09-08')).toBe(true);
  });
  it('before showFrom = not active (queued future message)', () => {
    expect(isAnnouncementActiveOn(A({ showFrom: '2026-10-01' }), '2026-09-30')).toBe(false);
    expect(isAnnouncementActiveOn(A({ showFrom: '2026-10-01' }), '2026-10-01')).toBe(true); // inclusive
    expect(isAnnouncementActiveOn(A({ showFrom: '2026-10-01' }), '2026-10-02')).toBe(true);
  });
  it('after showUntil = not active (expired message)', () => {
    expect(isAnnouncementActiveOn(A({ showUntil: '2026-10-15' }), '2026-10-16')).toBe(false);
    expect(isAnnouncementActiveOn(A({ showUntil: '2026-10-15' }), '2026-10-15')).toBe(true); // inclusive
    expect(isAnnouncementActiveOn(A({ showUntil: '2026-10-15' }), '2026-10-14')).toBe(true);
  });
  it('within a full window = active, outside = not', () => {
    const a = A({ showFrom: '2026-10-01', showUntil: '2026-10-15' });
    expect(isAnnouncementActiveOn(a, '2026-09-30')).toBe(false);
    expect(isAnnouncementActiveOn(a, '2026-10-08')).toBe(true);
    expect(isAnnouncementActiveOn(a, '2026-10-16')).toBe(false);
  });
  it('an entry missing an id is never active', () => {
    expect(isAnnouncementActiveOn({ title: 'no id' }, '2026-09-08')).toBe(false);
    expect(isAnnouncementActiveOn(null, '2026-09-08')).toBe(false);
  });
});

const VALID_TONES = ['notice', 'action', 'success'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Shape contract for whatever announcements ship -- deliberately does NOT
// assert any headline/summary copy, so marketing text can change freely
// without touching tests. Guards the fields the popup and the window logic
// actually depend on.
describe('ANNOUNCEMENTS shape contract', () => {
  it('is an array', () => {
    expect(Array.isArray(ANNOUNCEMENTS)).toBe(true);
  });

  it('every entry has a string id, title and summary', () => {
    for (const a of ANNOUNCEMENTS) {
      expect(a.id, 'id').toBeTypeOf('string');
      expect(a.id.length, `id "${a.id}" is empty`).toBeGreaterThan(0);
      expect(a.title, `entry ${a.id} title`).toBeTypeOf('string');
      expect(a.title.length, `entry ${a.id} title is empty`).toBeGreaterThan(0);
      expect(a.summary, `entry ${a.id} summary`).toBeTypeOf('string');
      expect(a.summary.length, `entry ${a.id} summary is empty`).toBeGreaterThan(0);
    }
  });

  it('optional fields, when present, are well-formed', () => {
    // Collects problems instead of asserting inside the ifs, and counts the
    // fields it looked at, so the test cannot pass having checked nothing.
    const problems = [];
    let checked = 0;
    const check = (a, field, ok) => {
      if (a[field] === undefined) return;
      checked++;
      if (!ok(a[field])) problems.push(`${a.id}.${field}`);
    };
    for (const a of ANNOUNCEMENTS) {
      check(a, 'tone', (v) => VALID_TONES.includes(v));
      check(a, 'items', (v) => Array.isArray(v) && v.every((it) => typeof it === 'string'));
      check(a, 'showFrom', (v) => typeof v === 'string' && DATE_RE.test(v));
      check(a, 'showUntil', (v) => typeof v === 'string' && DATE_RE.test(v));
      check(a, 'showToNewVisitors', (v) => typeof v === 'boolean');
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });

  it('ids are unique (dismissal is keyed by id, so a dupe would double-dismiss)', () => {
    const ids = ANNOUNCEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the welcome announcement has no end date, names every Premium area, and promises no reply time', () => {
    const welcome = ANNOUNCEMENTS.find((a) => a.id === 'welcome-2026-09-30');
    expect(welcome, "expected a 'welcome-2026-09-30' announcement").toBeTruthy();
    expect(welcome.showUntil).toBeUndefined();
    expect(isAnnouncementActiveOn(welcome, '2026-09-30')).toBe(true);
    expect(isAnnouncementActiveOn(welcome, '2031-01-01')).toBe(true);
    const text = [welcome.title, welcome.summary, ...welcome.items].join(' ');
    for (const area of PREMIUM_AREAS) expect(text).toContain(area.name);
    expect(text).not.toMatch(/hours/i);
  });
});
