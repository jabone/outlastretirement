// The What's New popup downloads only changelogRecent.js (performance audit
// 2026-11-13). These keep that file short and in step with the full list.
import { describe, it, expect } from 'vitest';
import { CHANGELOG_RECENT } from '../config/changelogRecent';
import { CHANGELOG } from '../config/changelog';
import { LATEST_CHANGELOG_ID } from '../config/changelogLatest';
import { DIGEST_SIZE } from '../components/WhatsNewPopup';

describe('recent What\'s New entries', () => {
  it('are the newest entries of the full list, in order, with no gaps in their ids', () => {
    expect(CHANGELOG.slice(0, CHANGELOG_RECENT.length)).toEqual(CHANGELOG_RECENT);
    expect(CHANGELOG_RECENT[0].id).toBe(LATEST_CHANGELOG_ID);
    CHANGELOG_RECENT.forEach((e, i) => { if (i) expect(e.id).toBe(CHANGELOG_RECENT[i - 1].id - 1); });
    // The full list's ids also go up by one, which the popup's count relies on.
    CHANGELOG.forEach((e, i) => { if (i) expect(e.id, `after ${CHANGELOG[i - 1].id}`).toBeLessThan(CHANGELOG[i - 1].id); });
  });
  it('hold enough for the popup and no more than 30 (move the oldest to changelog.js)', () => {
    expect(CHANGELOG_RECENT.length).toBeGreaterThanOrEqual(DIGEST_SIZE + 1);
    expect(CHANGELOG_RECENT.length).toBeLessThanOrEqual(30);
  });
  it('the popup reads only the recent file', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../components/WhatsNewPopup.jsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/config\/changelog'/);
  });
});
