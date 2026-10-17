// Anonymous Usage Analytics is described in one sentence everywhere a
// visitor might compare it: Preferences, /premium and /verify. The outside
// review of 2026-10-01 found three wordings of the same facts.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ANALYTICS_SENDS } from '../config/analyticsDisclosure';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const html = (s) => s.replace(/&amp;/g, '&').replace(/&rsquo;/g, '’');

describe('one description of what analytics sends', () => {
  it('names every item the privacy policy lists', () => {
    for (const item of ['tab', 'site you came from', 'country or region', 'device type', 'operating system', 'browser', 'time', 'No cookies']) {
      expect(ANALYTICS_SENDS).toContain(item);
    }
  });

  it('/verify uses it word for word', () => {
    expect(html(read('public', 'verify.html'))).toContain(ANALYTICS_SENDS[0].toUpperCase() + ANALYTICS_SENDS.slice(1));
  });

  it('/premium uses it word for word', () => {
    expect(html(read('public', 'premium.html'))).toContain(ANALYTICS_SENDS);
  });

  it('Preferences reads it from the shared constant', () => {
    expect(read('src', 'components', 'tabs', 'PreferencesTab.jsx')).toContain('{ANALYTICS_SENDS}');
  });
});
