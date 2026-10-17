// Review 2026-09-30 (H15): the app showed a package.json version that never
// moved (0.3.0 at changelog 336) and no build id, and importing package.json
// shipped the whole manifest (scripts, dependency list) in the bundle.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { versionLabel, APP_VERSION, BUILD_ID } from '../config/buildInfo';
import { LATEST_CHANGELOG_ID } from '../config/changelogLatest';

const SRC = path.resolve(__dirname, '..');

describe('build info', () => {
  it('the version is the changelog version, and the label names the build', () => {
    expect(APP_VERSION).toBe(LATEST_CHANGELOG_ID);
    expect(BUILD_ID).toMatch(/^[0-9a-z]+$/);
    expect(versionLabel()).toBe(`Version ${LATEST_CHANGELOG_ID} · build ${BUILD_ID}`);
  });
  it('Preferences shows it beside the copyright line', () => {
    const prefs = fs.readFileSync(path.join(SRC, 'components/tabs/PreferencesTab.jsx'), 'utf8');
    expect(prefs).toMatch(/data-testid="build-version"[^>]*>\{versionLabel\(\)\}</);
  });
  it('no app source imports package.json', () => {
    const offenders = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(f); } else if (/\.jsx?$/.test(e.name) && /from '[./]*package\.json'/.test(fs.readFileSync(f, 'utf8'))) offenders.push(path.relative(SRC, f));
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
